import type { AuditActionType, AuditLogEntry } from '../types/finance';
import type { TranslationKey } from './LanguageContext';
import type { Translate } from './ruleText';
import { displayLabel } from './labels';

/** Short event name for the badge. A complete Record, so a new AuditActionType must get a label. */
export const AUDIT_ACTION_KEYS: Record<AuditActionType, TranslationKey> = {
  INCOME_ADDED: 'audit_act_income_added',
  INCOME_UNDONE: 'audit_act_income_undone',
  EXPENSE_ADDED: 'audit_act_expense_added',
  EXPENSE_UNDONE: 'audit_act_expense_undone',
  FUND_CREATED: 'audit_act_fund_created',
  FUND_UPDATED: 'audit_act_fund_updated',
  FUND_DELETED: 'audit_act_fund_deleted',
  SETTINGS_UPDATED: 'audit_act_settings_updated',
  CYCLE_RESET: 'audit_act_cycle_reset',
  SCENARIO_LOADED: 'audit_act_scenario_loaded',
};

export function auditActionLabel(action: string, t: Translate): string {
  return Object.prototype.hasOwnProperty.call(AUDIT_ACTION_KEYS, action)
    ? t(AUDIT_ACTION_KEYS[action as AuditActionType])
    : action;
}

const money = (n: number): string => n.toFixed(2);

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

/** Greedy on purpose: a name that itself contains quotes is still captured whole. */
const between = (summary: string, pattern: RegExp): string | undefined => {
  const hit = pattern.exec(summary)?.[1];
  return hit && hit.length > 0 ? hit : undefined;
};

/**
 * A few early entries did not store a name/description in `details`; the English summary always quotes it.
 * Entries written now carry it in `details`, so this is only a fallback for older history.
 */
const LEGACY = {
  fundName: /Account Card "(.*)" \(/,
  quotedInParens: /\("(.*)"\)/,
};

function build(log: AuditLogEntry, t: Translate): string | undefined {
  const d = log.details ?? {};

  switch (log.action) {
    case 'INCOME_ADDED': {
      const amount = num(d.amount);
      const source = str(d.source);
      if (amount === undefined || source === undefined) return undefined;

      const parts: string[] = [];
      const funded = Array.isArray(d.allocations) ? d.allocations.length : num(d.allocationCount);
      if (funded !== undefined) parts.push(t('auditlog_part_cards', { count: funded }));
      const manual = num(d.manualDepositTotal);
      if (manual !== undefined && manual > 0) {
        parts.push(t('auditlog_part_manual', { amount: money(manual) }));
      }
      const wc = num(d.workingCapitalAdded);
      if (wc !== undefined && wc > 0) parts.push(t('auditlog_part_wc', { amount: money(wc) }));

      const base = t('auditlog_income_added', { amount: money(amount), source });
      return parts.length > 0 ? `${base} (${parts.join(', ')})` : base;
    }

    case 'INCOME_UNDONE': {
      const amount = num(d.amount);
      const source = str(d.source) ?? between(log.summary, LEGACY.quotedInParens);
      if (amount === undefined || source === undefined) return undefined;

      const rolledBack = Array.isArray(d.rolledBackAllocations)
        ? d.rolledBackAllocations.length
        : num(d.allocationsRolledBack);
      return rolledBack !== undefined
        ? t('auditlog_income_undone_n', { amount: money(amount), source, count: rolledBack })
        : t('auditlog_income_undone', { amount: money(amount), source });
    }

    case 'EXPENSE_ADDED': {
      const amount = num(d.amount);
      const category = str(d.category);
      if (amount === undefined || category === undefined) return undefined;

      const vars = { amount: money(amount), category: displayLabel(category, t) };
      const card = str(d.fundName);
      return card
        ? t('auditlog_expense_added_card', { ...vars, card: displayLabel(card, t) })
        : t('auditlog_expense_added', vars);
    }

    case 'EXPENSE_UNDONE': {
      const amount = num(d.amount) ?? num(d.amountRestored);
      const description = str(d.description) ?? between(log.summary, LEGACY.quotedInParens);
      if (amount === undefined || description === undefined) return undefined;

      const vars = { amount: money(amount), description: displayLabel(description, t) };
      const card = str(d.fundName);
      return card
        ? t('auditlog_expense_undone_card', { ...vars, card: displayLabel(card, t) })
        : t('auditlog_expense_undone', vars);
    }

    case 'FUND_CREATED':
    case 'FUND_UPDATED': {
      const name = str(d.name) ?? between(log.summary, LEGACY.fundName);
      const type = str(d.type);
      if (name === undefined || type === undefined) return undefined;

      let detail: string;
      if (type === 'percentage') {
        const pct = num(d.percentage);
        if (pct === undefined) return undefined;
        detail = t('auditlog_fund_pct', { pct });
      } else {
        const target = num(d.targetAmount);
        if (target === undefined) return undefined;
        detail = t(type === 'monthly' ? 'auditlog_fund_monthly' : 'auditlog_fund_goal', {
          amount: money(target),
        });
      }
      return t(log.action === 'FUND_CREATED' ? 'auditlog_fund_created' : 'auditlog_fund_updated', {
        name,
        detail,
      });
    }

    case 'FUND_DELETED': {
      const name = str(d.name);
      return name === undefined ? undefined : t('auditlog_fund_deleted', { name });
    }

    case 'CYCLE_RESET': {
      const month = str(d.newCycleMonth) ?? str(log.entityId);
      return month === undefined ? undefined : t('auditlog_cycle_reset', { month });
    }

    case 'SETTINGS_UPDATED':
      return log.entityType === 'settings' ? t('auditlog_settings') : undefined;

    default:
      return undefined;
  }
}

/**
 * The sentence for one audit-trail entry, in the active language.
 *
 * It is rebuilt from the entry's structured `details` (amounts, names, counts), so switching the language
 * re-words history that was written in any language. With the English dictionary it reproduces the stored
 * English `summary` exactly. Only an entry that is missing the data needed to rebuild it (or an event type
 * with no template) falls back to the stored summary.
 */
export function describeAuditLog(log: AuditLogEntry, t: Translate): string {
  return build(log, t) ?? log.summary;
}

/** "2026-10-05 15:20" in the viewer's local time: unambiguous, and the same form every other date uses. */
export function formatAuditTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}
