import { describe, it, expect, vi, beforeEach } from 'vitest';

// These tests run the app's REAL Firestore writers (the code the browser runs), against a strict in-memory
// stand-in for the SDK. The `FinanceBaaSService` twin used by the other service tests is a separate
// implementation, so it cannot catch a mistake in the code that actually talks to Firestore.
vi.mock('../firebaseConfig', () => ({ app: {}, auth: {}, db: {}, appCheck: null }));
vi.mock('firebase/firestore', async () => (await import('../../test-utils/fakeFirestore')).firestoreModule);

import { fakeDb } from '../../test-utils/fakeFirestore';
import {
  addExpenseToFirestore,
  addIncomeToFirestore,
  createEmptySettings,
  deleteFundFromFirestore,
  rolloverToNextMonthInFirestore,
  saveFundToFirestore,
  undoExpenseInFirestore,
  undoIncomeInFirestore,
  updateSettingsInFirestore,
} from '../financeService';
import type { AllocationRecord, AllocationSettings, AuditLogEntry, Fund } from '../../types/finance';
import { auditActionLabel, describeAuditLog } from '../../i18n/auditText';
import { translate, type Language, type TranslationKey } from '../../i18n/LanguageContext';
import { AppError } from '../../types/errors';

const USER = 'u1';
const ACCOUNT = 'acc-1';

const funds = () => fakeDb.list<Fund>(`users/${USER}/funds`);
const fundNamed = (name: string) => funds().find((f) => f.name === name)!;
const settingsDoc = () => fakeDb.read(`users/${USER}/settings/default`) as unknown as AllocationSettings;
const allocations = () => fakeDb.list<AllocationRecord>(`users/${USER}/allocations`);
const auditLogs = () => fakeDb.list<AuditLogEntry>(`users/${USER}/auditLogs`);
const createCard = (input: Parameters<typeof saveFundToFirestore>[1]) =>
  saveFundToFirestore(USER, input, funds());

async function setUpCards() {
  const savings = await createCard({ name: 'Savings', type: 'percentage', percentage: 10, targetAmount: 25000, priority: 1 });
  const fuel = await createCard({ name: 'Fuel for Car', type: 'monthly', monthlyAmount: 1000, targetAmount: 1000, priority: 2 });
  const wife = await createCard({ name: "Wife's Expense", type: 'monthly', monthlyAmount: 1000, targetAmount: 1000, priority: 3 });
  const food = await createCard({ name: 'Food', type: 'monthly', monthlyAmount: 1500, targetAmount: 1500, priority: 4 });
  return { savings, fuel, wife, food };
}

beforeEach(() => {
  fakeDb.reset();
  fakeDb.seed(`users/${USER}/accounts/${ACCOUNT}`, {
    id: ACCOUNT, name: 'Main', type: 'checking', balance: 0, currency: 'TJS', updatedAt: '2026-10-01T00:00:00.000Z',
  });
});

describe('the real Firestore writers: manual deposits end to end', () => {
  it("2,000 TJS -> 1,000 Fuel + 1,000 Wife's Expense; the next salary then tops up only what is missing; undo restores everything", async () => {
    const { fuel, wife } = await setUpCards();

    // 1) 2,000 TJS received and directed by hand.
    const first = await addIncomeToFirestore(USER, {
      amount: 2000,
      date: '2026-10-03',
      source: 'Freelance project',
      accountId: ACCOUNT,
      manualDeposits: [
        { fundId: fuel.id, amount: 1000 },
        { fundId: wife.id, amount: 1000 },
      ],
    });

    expect(first.allocations.map((a) => [a.fundName, a.amount, a.ruleStage])).toEqual([
      ['Fuel for Car', 1000, 'manual_deposit'],
      ["Wife's Expense", 1000, 'manual_deposit'],
    ]);
    expect(fundNamed('Fuel for Car')).toMatchObject({ cycleAllocated: 1000, reservedAmount: 1000 });
    expect(fundNamed("Wife's Expense")).toMatchObject({ cycleAllocated: 1000, reservedAmount: 1000 });
    expect(fundNamed('Savings').reservedAmount).toBe(0); // no Savings % is taken from a manual deposit
    expect(settingsDoc().workingCapitalBalance ?? 0).toBe(0);
    expect(fakeDb.read(`users/${USER}/accounts/${ACCOUNT}`)?.balance).toBe(2000);

    // 2) A 6,000 TJS salary arrives later and is split automatically.
    const second = await addIncomeToFirestore(USER, {
      amount: 6000,
      date: '2026-10-20',
      source: 'Salary',
      accountId: ACCOUNT,
    });

    const byName = Object.fromEntries(second.allocations.map((a) => [a.fundName, a.amount]));
    expect(byName).toEqual({ Savings: 600, Food: 1500 }); // Fuel + Wife are already full: 0 TJS each
    expect(settingsDoc().workingCapitalBalance).toBe(3900); // 6000 - 600 - 1500
    expect(fundNamed('Fuel for Car').cycleAllocated).toBe(1000);
    expect(fundNamed("Wife's Expense").cycleAllocated).toBe(1000);

    // 3) Undo the salary, then the manual deposit: back to zero everywhere.
    await undoIncomeInFirestore(USER, second.income.id);
    expect(fundNamed('Savings').reservedAmount).toBe(0);
    expect(fundNamed('Food').reservedAmount).toBe(0);
    expect(settingsDoc().workingCapitalBalance).toBe(0);
    expect(fundNamed('Fuel for Car').cycleAllocated).toBe(1000); // the manual deposit is still there

    await undoIncomeInFirestore(USER, first.income.id);
    for (const f of funds()) {
      expect(f.reservedAmount, f.name).toBe(0);
      expect(f.cycleAllocated ?? 0, f.name).toBe(0);
    }
    expect(fakeDb.read(`users/${USER}/accounts/${ACCOUNT}`)?.balance).toBe(0);
    expect(allocations().every((a) => a.status === 'undone')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Audit Trail: the sentences are rebuilt from what the real writers store.
// ---------------------------------------------------------------------------------------------------------
const tFor =
  (lang: Language) =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    translate(lang, key, vars);

/** Drives every kind of event through the real writers; returns the audit entries they stored. */
async function runEveryKindOfEvent(): Promise<AuditLogEntry[]> {
  const { fuel, wife } = await setUpCards();
  await createCard({ name: 'Annual Car Insurance', type: 'sinking', targetAmount: 3000, monthsRemaining: 6, priority: 5 });
  const temp = await createCard({ name: 'Temp "quoted" card', type: 'monthly', monthlyAmount: 10, targetAmount: 10, priority: 6 });
  await deleteFundFromFirestore(USER, temp);

  await addIncomeToFirestore(USER, {
    amount: 2000, date: '2026-10-03', source: 'Freelance project', accountId: ACCOUNT,
    manualDeposits: [{ fundId: fuel.id, amount: 1000 }, { fundId: wife.id, amount: 1000 }],
  });
  await addIncomeToFirestore(USER, { amount: 6000, date: '2026-10-20', source: 'Salary', accountId: ACCOUNT });
  const mixed = await addIncomeToFirestore(USER, {
    amount: 1000, date: '2026-10-21', source: 'Bonus $$ "Q4" & more', accountId: ACCOUNT,
    manualDeposits: [{ fundId: wife.id, amount: 300 }], manualRemainderMode: 'working_capital',
  });

  const cardExpense = await addExpenseToFirestore(USER, {
    amount: 200, date: '2026-10-22', category: 'Fuel', description: 'Gas', fundId: fuel.id, accountId: ACCOUNT,
  });
  const wcExpense = await addExpenseToFirestore(USER, {
    amount: 100, date: '2026-10-22', category: 'Working Capital', description: 'Working Capital',
    fundId: 'working-capital', accountId: ACCOUNT,
  });
  await undoExpenseInFirestore(USER, cardExpense.id);
  await undoExpenseInFirestore(USER, wcExpense.id);
  await undoIncomeInFirestore(USER, mixed.income.id);

  await saveFundToFirestore(USER, { ...fundNamed('Fuel for Car'), monthlyAmount: 1200, targetAmount: 1200 }, funds());
  await updateSettingsInFirestore(USER, { surplusStrategy: 'unallocated' }, settingsDoc() ?? createEmptySettings());
  await rolloverToNextMonthInFirestore(USER, '2026-11');

  return auditLogs().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

describe('Audit Trail text for entries written by the real writers', () => {
  let logs: AuditLogEntry[];
  beforeEach(async () => {
    logs = await runEveryKindOfEvent();
  });

  it('covers every kind of event the app writes', () => {
    const counts: Record<string, number> = {};
    for (const l of logs) counts[l.action] = (counts[l.action] ?? 0) + 1;
    expect(counts).toEqual({
      FUND_CREATED: 6, // 4 cards + a sinking card + a throw-away card
      FUND_UPDATED: 1,
      FUND_DELETED: 1,
      INCOME_ADDED: 3, // manual only, auto split with Working Capital, manual + Working Capital remainder
      INCOME_UNDONE: 1,
      EXPENSE_ADDED: 2, // from a card, from Working Capital
      EXPENSE_UNDONE: 2,
      SETTINGS_UPDATED: 1,
      CYCLE_RESET: 1,
    });
  });

  it('English text equals the stored English summary for every entry (so the writers and the renderer cannot drift apart)', () => {
    const en = tFor('en');
    for (const log of logs) {
      expect(describeAuditLog(log, en), `${log.action}: ${log.summary}`).toBe(log.summary);
    }
  });

  it.each(['ru', 'uz'] as const)('%s: every entry is worded in that language, with nothing left unfilled', (lang) => {
    const t = tFor(lang);
    const englishTemplates =
      /Added income|Undid |Spent |Created Account|Updated Account|Deleted Account|Rolled over|cards funded|deposited manually|Monthly Required|surplus \/ Working/;
    for (const log of logs) {
      const text = describeAuditLog(log, t);
      expect(text, log.action).not.toBe(log.summary);
      expect(text, text).not.toMatch(englishTemplates);
      expect(text, text).not.toMatch(/\{\w+\}/);
      expect(text, text).not.toMatch(/undefined|NaN|null/);

      const badge = auditActionLabel(log.action, t);
      expect(badge).not.toBe(log.action); // never the raw code like INCOME_ADDED
      expect(badge).not.toBe(auditActionLabel(log.action, tFor('en')));
    }
  });

  it('pins the exact Russian and Uzbek sentences for a manual-deposit income and its parts', () => {
    const manualIncome = logs.find((l) => l.action === 'INCOME_ADDED' && l.summary.includes('Freelance'))!;
    expect(describeAuditLog(manualIncome, tFor('ru'))).toBe(
      'Добавлен доход 2000.00 TJS от «Freelance project» (пополнено карт: 2, внесено вручную: 2000.00 TJS)'
    );
    expect(describeAuditLog(manualIncome, tFor('uz'))).toBe(
      'Daromad qo\'shildi: 2000.00 TJS, manba: "Freelance project" (to\'ldirilgan kartalar: 2, qo\'lda kiritilgan: 2000.00 TJS)'
    );

    const salary = logs.find((l) => l.action === 'INCOME_ADDED' && l.summary.includes('Salary'))!;
    expect(describeAuditLog(salary, tFor('ru'))).toBe(
      'Добавлен доход 6000.00 TJS от «Salary» (пополнено карт: 3, в оборотный капитал: +3400.00 TJS)'
    );

    const reset = logs.find((l) => l.action === 'CYCLE_RESET')!;
    expect(describeAuditLog(reset, tFor('ru'))).toBe(
      'Начался новый месяц (2026-11): остатки на картах перенесены, пополняться будут только недостающие суммы'
    );
  });

  it('shows the default labels the app wrote (Working Capital) in the active language', () => {
    const wcSpend = logs.find((l) => l.action === 'EXPENSE_ADDED' && l.summary.includes('Working Capital'))!;
    expect(describeAuditLog(wcSpend, tFor('ru'))).toBe('Расход 100.00 TJS (Оборотный капитал) с карты «Оборотный капитал»');
    const wcUndo = logs.find((l) => l.action === 'EXPENSE_UNDONE' && l.summary.includes('Working Capital'))!;
    expect(describeAuditLog(wcUndo, tFor('ru'))).toBe(
      'Отменён расход 100.00 TJS («Оборотный капитал») — 100.00 TJS возвращено на карту «Оборотный капитал»'
    );
  });

  it('keeps text the user typed exactly as typed (quotes, "$$", "&")', () => {
    const bonus = logs.find((l) => l.action === 'INCOME_ADDED' && l.summary.includes('Bonus'))!;
    for (const lang of ['en', 'ru', 'uz'] as const) {
      expect(describeAuditLog(bonus, tFor(lang))).toContain('Bonus $$ "Q4" & more');
    }
    const tempCard = logs.find((l) => l.action === 'FUND_DELETED')!;
    expect(describeAuditLog(tempCard, tFor('ru'))).toBe('Удалена карта «Temp "quoted" card»');
  });

  it('a sinking card is described by its goal, not a "monthly" amount', () => {
    const sinking = logs.find((l) => l.action === 'FUND_CREATED' && l.summary.includes('Annual Car Insurance'))!;
    expect(sinking.summary).toBe('Created Account Card "Annual Car Insurance" (Goal 3000.00 TJS)');
    expect(describeAuditLog(sinking, tFor('ru'))).toBe('Создана карта «Annual Car Insurance» (цель: 3000.00 TJS)');
  });

  it('every stored entry is storable and complete (no undefined fields reach Firestore)', () => {
    for (const log of logs) {
      expect(log.id).toMatch(/^audit-/);
      expect(typeof log.timestamp).toBe('string');
      expect(log.summary.length).toBeGreaterThan(0);
      expect(JSON.stringify(log)).not.toContain('undefined');
    }
  });
});

describe('the real writers raise typed errors the UI can translate', () => {
  it('rejects bad input with a code and the numbers/names the message needs', async () => {
    const { fuel, savings } = await setUpCards();

    const failure = async (run: () => Promise<unknown>): Promise<AppError> => {
      try {
        await run();
      } catch (e) {
        return e as AppError;
      }
      throw new Error('expected the call to fail');
    };

    const noSource = await failure(() => addIncomeToFirestore(USER, { amount: 100, date: '2026-10-03', source: '  ', accountId: ACCOUNT }));
    expect(noSource).toBeInstanceOf(AppError);
    expect(noSource.code).toBe('INCOME_SOURCE_REQUIRED');

    const badDate = await failure(() => addIncomeToFirestore(USER, { amount: 100, date: 'yesterday', source: 'x', accountId: ACCOUNT }));
    expect(badDate.code).toBe('INCOME_DATE_INVALID');

    const tooMuch = await failure(() =>
      addIncomeToFirestore(USER, {
        amount: 500, date: '2026-10-03', source: 'x', accountId: ACCOUNT,
        manualDeposits: [{ fundId: fuel.id, amount: 800 }],
      })
    );
    expect(tooMuch.code).toBe('MANUAL_EXCEEDS_INCOME');
    expect(tooMuch.params).toEqual({ manual: '800.00', income: '500.00' });
    expect(tooMuch.message).toBe('Manual deposits (800.00 TJS) exceed the income amount (500.00 TJS).');

    const spendSavings = await failure(() =>
      addExpenseToFirestore(USER, { amount: 10, date: '2026-10-03', category: 'x', description: 'x', fundId: savings.id, accountId: ACCOUNT })
    );
    expect(spendSavings.code).toBe('SPEND_FROM_SAVINGS_DISABLED');

    const noExpense = await failure(() => undoExpenseInFirestore(USER, 'exp-missing'));
    expect(noExpense.code).toBe('EXPENSE_NOT_FOUND');
    const noIncome = await failure(() => undoIncomeInFirestore(USER, 'inc-missing'));
    expect(noIncome.code).toBe('INCOME_NOT_FOUND');

    const signedOut = await failure(() => addIncomeToFirestore('', { amount: 1, date: '2026-10-03', source: 'x', accountId: ACCOUNT }));
    expect(signedOut.code).toBe('AUTH_REQUIRED');

    const overHundred = await failure(() => createCard({ name: 'Extra savings', type: 'percentage', percentage: 95, targetAmount: 1 }));
    expect(overHundred.code).toBe('SAVINGS_TOTAL_EXCEEDS');
    expect(overHundred.params).toEqual({ total: 105 });
  });

  it('refuses to undo the same income or expense twice', async () => {
    const { fuel } = await setUpCards();
    const income = await addIncomeToFirestore(USER, { amount: 1000, date: '2026-10-03', source: 'Salary', accountId: ACCOUNT });
    await undoIncomeInFirestore(USER, income.income.id);
    await expect(undoIncomeInFirestore(USER, income.income.id)).rejects.toMatchObject({ code: 'INCOME_ALREADY_UNDONE' });

    await addIncomeToFirestore(USER, { amount: 1000, date: '2026-10-04', source: 'Salary', accountId: ACCOUNT, manualDeposits: [{ fundId: fuel.id, amount: 1000 }] });
    const spent = await addExpenseToFirestore(USER, { amount: 50, date: '2026-10-05', category: 'Fuel', description: 'Gas', fundId: fuel.id, accountId: ACCOUNT });
    await undoExpenseInFirestore(USER, spent.id);
    await expect(undoExpenseInFirestore(USER, spent.id)).rejects.toMatchObject({ code: 'EXPENSE_ALREADY_UNDONE' });
  });
});
