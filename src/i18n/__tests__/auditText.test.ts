import { describe, it, expect } from 'vitest';
import { auditActionLabel, describeAuditLog, formatAuditTimestamp, AUDIT_ACTION_KEYS } from '../auditText';
import { translate, translations, type Language, type TranslationKey } from '../LanguageContext';
import type { AuditActionType, AuditLogEntry } from '../../types/finance';

const tFor =
  (lang: Language) =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    translate(lang, key, vars);

const entry = (over: Partial<AuditLogEntry> & Pick<AuditLogEntry, 'action'>): AuditLogEntry => ({
  id: 'audit-1',
  entityType: 'income',
  entityId: 'inc-1',
  summary: 'stored english summary',
  details: {},
  timestamp: '2026-10-05T10:20:11.000Z',
  ...over,
});

describe('older entries (written before names/amounts were kept in `details`) are still worded in every language', () => {
  it('a card created before `details.name` existed: the name is read from the stored sentence', () => {
    const legacy = entry({
      action: 'FUND_CREATED',
      entityType: 'fund',
      summary: 'Created Account Card "Fuel for Car" (Monthly Required 1000.00 TJS)',
      details: { fundId: 'f1', type: 'monthly', targetAmount: 1000 },
    });
    expect(describeAuditLog(legacy, tFor('en'))).toBe(legacy.summary);
    expect(describeAuditLog(legacy, tFor('ru'))).toBe('Создана карта «Fuel for Car» (нужно в месяц: 1000.00 TJS)');
  });

  it('a name that itself contains quotes is recovered whole', () => {
    const legacy = entry({
      action: 'FUND_UPDATED',
      entityType: 'fund',
      summary: 'Updated Account Card "My "best" card" (Savings 15%)',
      details: { fundId: 'f1', type: 'percentage', percentage: 15, targetAmount: 100 },
    });
    expect(describeAuditLog(legacy, tFor('uz'))).toBe('Karta yangilandi: "My "best" card" (jamg\'arma 15%)');
  });

  it('a sinking card stored with the old "Monthly Required" wording is now described by its goal', () => {
    const legacy = entry({
      action: 'FUND_CREATED',
      entityType: 'fund',
      summary: 'Created Account Card "Insurance" (Monthly Required 3000.00 TJS)',
      details: { fundId: 'f9', type: 'sinking', targetAmount: 3000 },
    });
    expect(describeAuditLog(legacy, tFor('en'))).toBe('Created Account Card "Insurance" (Goal 3000.00 TJS)');
  });

  it('an expense undone before `details.description` existed: the description is read from the stored sentence', () => {
    const legacy = entry({
      action: 'EXPENSE_UNDONE',
      entityType: 'expense',
      summary: 'Undid expense 50.00 TJS ("Lunch") and restored 50.00 TJS to "Food" card',
      details: { expenseId: 'e1', amountRestored: 50, currency: 'TJS', fundId: 'f1', fundName: 'Food' },
    });
    expect(describeAuditLog(legacy, tFor('en'))).toBe(legacy.summary);
    expect(describeAuditLog(legacy, tFor('ru'))).toBe('Отменён расход 50.00 TJS («Lunch») — 50.00 TJS возвращено на карту «Food»');
  });

  it('an income whose undo entry has no allocation list is still worded (without the count)', () => {
    const legacy = entry({
      action: 'INCOME_UNDONE',
      summary: 'Undid income 100.00 TJS ("Salary")',
      details: { incomeId: 'i1', amount: 100 },
    });
    expect(describeAuditLog(legacy, tFor('ru'))).toBe('Отменён доход 100.00 TJS («Salary»)');
  });
});

describe('entries written by the Cloud Functions use the same renderer', () => {
  it('income added: allocation count and Working Capital come from allocationCount / workingCapitalAdded', () => {
    const fn = entry({
      action: 'INCOME_ADDED',
      summary: 'x',
      details: { incomeId: 'i', amount: 500, source: 'Salary', allocationCount: 3, workingCapitalAdded: 120.5, manualDepositTotal: 0 },
    });
    expect(describeAuditLog(fn, tFor('en'))).toBe(
      'Added income 500.00 TJS from "Salary" (cards funded: 3, to Working Capital: +120.50 TJS)'
    );
  });

  it('income undone: the count is a number (allocationsRolledBack), and the source is recorded', () => {
    const fn = entry({
      action: 'INCOME_UNDONE',
      summary: 'x',
      details: { incomeId: 'i', amount: 500, source: 'Salary', allocationsRolledBack: 3 },
    });
    expect(describeAuditLog(fn, tFor('uz'))).toBe(
      'Daromad bekor qilindi: 500.00 TJS ("Salary") — qaytarilgan karta kirimlari: 3'
    );
  });

  it('expense without a card (null fundName) reads as a plain expense', () => {
    const fn = entry({
      action: 'EXPENSE_ADDED',
      entityType: 'expense',
      summary: 'x',
      details: { amount: 20, category: 'General', fundId: null, fundName: null },
    });
    expect(describeAuditLog(fn, tFor('en'))).toBe('Spent 20.00 TJS (General)');
    expect(describeAuditLog(fn, tFor('ru'))).toBe('Расход 20.00 TJS (Общее)');
  });
});

describe('falls back to the stored English sentence only when it must', () => {
  it('an entry missing the data its sentence needs', () => {
    const noSource = entry({ action: 'INCOME_ADDED', summary: 'Added income 5.00 TJS from "x"', details: { incomeId: 'i', amount: 5 } });
    expect(describeAuditLog(noSource, tFor('ru'))).toBe('Added income 5.00 TJS from "x"');

    const noAmount = entry({ action: 'EXPENSE_ADDED', summary: 'Spent ? TJS', details: { category: 'Food' } });
    expect(describeAuditLog(noAmount, tFor('ru'))).toBe('Spent ? TJS');

    const badNumbers = entry({ action: 'INCOME_ADDED', summary: 'S', details: { amount: Number.NaN, source: 'x' } });
    expect(describeAuditLog(badNumbers, tFor('ru'))).toBe('S');

    const noDetails = entry({ action: 'FUND_DELETED', summary: 'Deleted Account Card "A"', details: undefined as never });
    expect(describeAuditLog(noDetails, tFor('ru'))).toBe('Deleted Account Card "A"');
  });

  it('events that have no template: scenario loads, an account being saved, and unknown future events', () => {
    for (const e of [
      entry({ action: 'SCENARIO_LOADED', summary: 'Loaded scenario' }),
      entry({ action: 'SETTINGS_UPDATED', entityType: 'system', summary: 'Created checking account "Main" (0.00 TJS)', details: { name: 'Main' } }),
      entry({ action: 'SOMETHING_NEW' as AuditActionType, summary: 'A future event' }),
    ]) {
      expect(describeAuditLog(e, tFor('ru'))).toBe(e.summary);
    }
  });

  it('event names: translated for every known action; an unknown action is shown as it is', () => {
    for (const action of Object.keys(AUDIT_ACTION_KEYS)) {
      for (const lang of ['en', 'ru', 'uz'] as const) {
        const label = auditActionLabel(action, tFor(lang));
        expect(label, `${action}/${lang}`).not.toBe(action);
        expect(label.length).toBeGreaterThan(2);
      }
    }
    expect(auditActionLabel('SOMETHING_NEW', tFor('ru'))).toBe('SOMETHING_NEW');
    expect(auditActionLabel('constructor', tFor('ru'))).toBe('constructor'); // prototype keys are not event names
  });

  it('every event name key exists in all three dictionaries', () => {
    for (const key of Object.values(AUDIT_ACTION_KEYS)) {
      for (const lang of ['en', 'ru', 'uz'] as const) {
        expect(translations[lang][key], `${lang}.${key}`).toBeTruthy();
      }
    }
  });
});

describe('formatAuditTimestamp', () => {
  it('shows local date and time as YYYY-MM-DD HH:mm, the same ISO-style date the rest of the app uses', () => {
    const local = new Date(2026, 9, 5, 15, 20, 11); // 5 Oct 2026, 15:20 in whatever zone the test runs in
    expect(formatAuditTimestamp(local.toISOString())).toBe('2026-10-05 15:20');
    expect(formatAuditTimestamp(new Date(2026, 0, 2, 3, 4).toISOString())).toBe('2026-01-02 03:04');
  });

  it('returns text it cannot read unchanged instead of "Invalid Date"', () => {
    expect(formatAuditTimestamp('not a date')).toBe('not a date');
    expect(formatAuditTimestamp('')).toBe('');
  });
});
