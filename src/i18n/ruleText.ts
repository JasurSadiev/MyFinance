import type { AllocationDraftItem, RuleCardContext } from '../types/finance';
import type { TranslationKey } from './LanguageContext';

export type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Anything that carries an allocation's rule: a live preview line or a stored allocation record. */
export type RuleSource = Pick<
  AllocationDraftItem,
  'ruleStage' | 'amount' | 'needBeforeAllocation' | 'fundingRatio' | 'ruleUsed' | 'ruleDetails'
>;

const money = (n: number): string => n.toFixed(2);

/** 0.1 * 100 is 10.000000000000002 in floating point; show it as 10. */
const cleanPct = (ratio: number): number => Number((ratio * 100).toFixed(4));

/** "Monthly required: 1500.00 TJS (200.00 TJS carried over → ...) • Collected this month: 600.00 TJS" */
function describeCard(card: RuleCardContext, t: Translate): string {
  if (card.kind === 'monthly') {
    let text = t('rule_card_monthly', { required: money(card.monthlyRequired) });
    if (card.carryover > 0) {
      text += ` (${t('rule_card_carryover', {
        carry: money(card.carryover),
        target: money(card.monthlyTarget),
      })})`;
    }
    if (card.collected > 0) {
      text += ` • ${t('rule_card_collected', { collected: money(card.collected) })}`;
    }
    return text;
  }

  // Sinking / target cards
  const label = t(card.kind === 'sinking' ? 'rule_label_sinking' : 'rule_label_target');
  const vars = {
    label,
    total: money(card.remainingTotalAtCycleStart ?? 0),
    months: card.monthsRemaining,
    monthly: money(card.monthlyTarget),
  };
  return card.collected > 0
    ? t('rule_card_goal_collected', { ...vars, collected: money(card.collected) })
    : t('rule_card_goal', vars);
}

/**
 * The "rule applied" sentence of an allocation, in the active language.
 *
 * - New allocations carry `ruleDetails` (the numbers behind the sentence), so the text is complete.
 * - Older records don't: they get a shorter sentence built from fields every record has
 *   (stage, amount, needBeforeAllocation, fundingRatio).
 * - Only an unknown stage falls back to the stored (English) `ruleUsed` text.
 *
 * With the English dictionary this reproduces the engine's original English sentences exactly.
 */
export function describeAllocationRule(item: RuleSource, t: Translate): string {
  const details = item.ruleDetails;
  const amount = money(item.amount);

  switch (item.ruleStage) {
    case 'percentage': {
      const pct = details?.pct ?? cleanPct(item.fundingRatio);
      return details?.base !== undefined
        ? t('rule_percentage', { pct, amount, base: money(details.base) })
        : t('rule_percentage_short', { pct, amount });
    }

    case 'need_full': {
      const head = t('rule_need_full', { amount });
      return details?.card ? `${head} — ${describeCard(details.card, t)}` : head;
    }

    case 'need_proportional':
      return t('rule_need_proportional', {
        pct: (details?.pct ?? item.fundingRatio * 100).toFixed(2),
        amount,
        need: money(item.needBeforeAllocation),
      });

    case 'surplus': {
      const pct = details?.pct ?? cleanPct(item.fundingRatio);
      return details?.base !== undefined
        ? t('rule_surplus', { pct, base: money(details.base) })
        : t('rule_surplus_short', { pct });
    }

    case 'manual_override':
      return details?.autoAmount !== undefined
        ? t('rule_override', { amount, auto: money(details.autoAmount) })
        : t('rule_override_short', { amount });

    case 'manual_deposit':
      return item.needBeforeAllocation > 0
        ? t('rule_manual', { amount, need: money(item.needBeforeAllocation) })
        : t('rule_manual_short', { amount });

    default:
      return item.ruleUsed;
  }
}
