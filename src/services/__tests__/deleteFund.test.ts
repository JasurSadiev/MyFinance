import { describe, it, expect, vi, beforeEach } from 'vitest';

// The real writer, against the strict in-memory Firestore stand-in (see firestoreWriters.test.ts).
vi.mock('../firebaseConfig', () => ({ app: {}, auth: {}, db: {}, appCheck: null }));
vi.mock('firebase/firestore', async () => (await import('../../test-utils/fakeFirestore')).firestoreModule);

import { fakeDb } from '../../test-utils/fakeFirestore';
import { addIncomeToFirestore, deleteFundFromFirestore, saveFundToFirestore } from '../financeService';
import { describeError } from '../../i18n/errorText';
import { translate, type Language, type TranslationKey } from '../../i18n/LanguageContext';
import { AppError } from '../../types/errors';
import type { AuditLogEntry, Fund } from '../../types/finance';

const USER = 'u1';
const funds = () => fakeDb.list<Fund>(`users/${USER}/funds`);
const fundNamed = (name: string) => funds().find((f) => f.name === name)!;
const audit = () => fakeDb.list<AuditLogEntry>(`users/${USER}/auditLogs`);
const tFor =
  (lang: Language) =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    translate(lang, key, vars);

beforeEach(() => fakeDb.reset());

async function twoCards() {
  const fuel = await saveFundToFirestore(
    USER,
    { name: 'Fuel for Car', type: 'monthly', monthlyAmount: 1000, targetAmount: 1000, priority: 1 },
    []
  );
  await saveFundToFirestore(
    USER,
    { name: 'Meals', type: 'monthly', monthlyAmount: 500, targetAmount: 500, priority: 2 },
    [fuel]
  );
}

describe('deleting a card', () => {
  it('removes an empty card and records it in the audit trail', async () => {
    await twoCards();

    await deleteFundFromFirestore(USER, fundNamed('Meals'));

    expect(funds().map((f) => f.name)).toEqual(['Fuel for Car']);
    expect(audit().some((a) => a.action === 'FUND_DELETED' && a.summary.includes('Meals'))).toBe(true);
  });

  it('refuses a card that still holds money, and says how much, in every language', async () => {
    await twoCards();
    await addIncomeToFirestore(USER, {
      amount: 500,
      date: '2026-10-03',
      source: 'Gift',
      accountId: '',
      manualDeposits: [{ fundId: fundNamed('Fuel for Car').id, amount: 500 }],
    });
    expect(fundNamed('Fuel for Car').reservedAmount).toBe(500);

    const err = await deleteFundFromFirestore(USER, fundNamed('Fuel for Car')).then(
      () => null,
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('FUND_HAS_BALANCE');
    expect((err as AppError).params).toEqual({ name: 'Fuel for Car', amount: '500.00' });
    expect(describeError(err, tFor('en'))).toBe(
      '"Fuel for Car" still holds 500.00 TJS, so the card cannot be deleted. A card can be deleted only when its balance is 0 TJS.'
    );
    expect(describeError(err, tFor('ru'))).toBe(
      'На карте «Fuel for Car» ещё 500.00 TJS, поэтому её нельзя удалить. Карту можно удалить, только когда её баланс равен 0 TJS.'
    );
    expect(describeError(err, tFor('uz'))).toBe(
      '"Fuel for Car" kartasida hali 500.00 TJS bor, shuning uchun kartani o\'chirib bo\'lmaydi. Kartani faqat balansi 0 TJS bo\'lganda o\'chirish mumkin.'
    );

    // nothing was deleted and nothing was logged as deleted
    expect(funds()).toHaveLength(2);
    expect(audit().some((a) => a.action === 'FUND_DELETED')).toBe(false);
  });

  it('a card emptied to 0.00 can be deleted (rounding does not get in the way)', async () => {
    await twoCards();
    const meals = { ...fundNamed('Meals'), reservedAmount: 0.004 }; // sub-cent dust rounds to 0.00

    await deleteFundFromFirestore(USER, meals);

    expect(funds().map((f) => f.name)).toEqual(['Fuel for Car']);
  });
});
