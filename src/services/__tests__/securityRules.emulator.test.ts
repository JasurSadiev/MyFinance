// @vitest-environment node
/**
 * Security-rules conformance test.
 *
 * Runs the app's REAL Firestore writers and listeners against the Cloud Firestore emulator, which enforces the
 * project's REAL `firestore.rules`. The in-memory stand-in used by the other tests cannot do this: it has no rules,
 * so a writer that the rules refuse (or a rule that refuses a read) looks fine there and fails for a real user.
 * That is exactly how a rule that denied every read of the settings document went unnoticed.
 *
 * It needs the emulator, so it is skipped in a plain `npm test`. Run it with:
 *
 *     npm run test:rules
 *
 * (that starts the emulator, runs this file against it and stops it again; it needs Java 21+ for the emulator).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  setLogLevel,
  terminate,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';

// The writers import `db` from firebaseConfig; give them the emulator client of the current test's user.
const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../firebaseConfig', () => ({
  get db() {
    return holder.db;
  },
  auth: {},
  app: {},
  appCheck: null,
  firebaseConfig: {},
}));

import {
  addExpenseToFirestore,
  addIncomeToFirestore,
  createEmptySettings,
  deleteFundFromFirestore,
  rolloverToNextMonthInFirestore,
  saveAccountToFirestore,
  saveFundToFirestore,
  subscribeToUserFirestoreData,
  undoExpenseInFirestore,
  undoIncomeInFirestore,
  updateSettingsInFirestore,
} from '../financeService';
import { AppError } from '../../types/errors';
import { TEXT_LIMITS } from '../../types/limits';
import type { Fund, NewIncomeInput } from '../../types/finance';

// A cold emulator (JVM warm-up) or a busy machine can need longer than vitest's 5 s default for one test.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST; // "127.0.0.1:8080", set by `firebase emulators:exec`
const PROJECT = 'demo-myfinance';
const [HOST, PORT] = (EMULATOR ?? '127.0.0.1:8080').split(':');
const emulatorUrl = (suffix: string) => `http://${HOST}:${PORT}/emulator/v1/projects/${PROJECT}${suffix}`;

const apps: Array<{ app: FirebaseApp; db: Firestore }> = [];
let counter = 0;

/** A Firestore client that the emulator treats as signed in as `uid` (or signed out, without one). */
function clientFor(uid?: string): Firestore {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'not-a-real-key' }, `rules-test-${++counter}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, Number(PORT), uid ? { mockUserToken: { sub: uid, user_id: uid, email: `${uid}@example.com` } } : {});
  apps.push({ app, db });
  return db;
}

// Each test gets its own person, so tests never see each other's data.
let uid = '';
let me: Firestore;
beforeEach(() => {
  uid = `person-${++counter}`;
  me = clientFor(uid);
  holder.db = me;
});

const raw = <T = Record<string, unknown>>(snap: { data(): unknown }) => snap.data() as T;
async function all<T = Record<string, unknown>>(sub: string): Promise<Array<T & { id: string }>> {
  const snap = await getDocs(collection(me, `users/${uid}/${sub}`));
  return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
}
async function fundsByName(): Promise<Record<string, Fund>> {
  return Object.fromEntries((await all<Fund>('funds')).map((f) => [f.name, f]));
}
const settingsNow = async () => raw<Record<string, number | string>>(await getDoc(doc(me, `users/${uid}/settings/default`)));
const denied = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: 'permission-denied' });

// "no bank account" is accountId ''
type IncomeInput = Omit<NewIncomeInput, 'accountId'> & { accountId?: string };
const addIncome = (input: IncomeInput) => addIncomeToFirestore(uid, { accountId: '', ...input });

async function setUpCards() {
  const savings = await saveFundToFirestore(uid, { name: 'Savings', type: 'percentage', percentage: 10, targetAmount: 25000, priority: 1 }, []);
  const fuel = await saveFundToFirestore(uid, { name: 'Fuel for Car', type: 'monthly', monthlyAmount: 1000, targetAmount: 1000, priority: 2 }, [savings]);
  const wife = await saveFundToFirestore(uid, { name: "Wife's Expense", type: 'monthly', monthlyAmount: 1000, targetAmount: 1000, priority: 3 }, [savings, fuel]);
  const food = await saveFundToFirestore(uid, { name: 'Food', type: 'monthly', monthlyAmount: 1500, targetAmount: 1500, priority: 4 }, [savings, fuel, wife]);
  return { savings, fuel, wife, food };
}

// minimal documents the rules accept; the negative tests change one thing at a time
const validIncome = (over: Record<string, unknown> = {}) => ({ amount: 10, date: '2026-10-05', source: 'Salary', status: 'active', appliedAllocations: [], ...over });
const validExpense = (over: Record<string, unknown> = {}) => ({ amount: 10, date: '2026-10-05', category: 'Food', status: 'active', ...over });
const validFund = (over: Record<string, unknown> = {}) => ({ name: 'Test', type: 'monthly', reservedAmount: 0, cycleAllocated: 0, ...over });

describe.skipIf(!EMULATOR)('against the real security rules (Firestore emulator)', () => {
  beforeAll(async () => {
    setLogLevel('silent'); // the refusals below are expected; the SDK would otherwise log each one as an error
    const rules = readFileSync(path.resolve(__dirname, '../../../firestore.rules'), 'utf8');
    const res = await fetch(emulatorUrl(':securityRules'), {
      method: 'PUT',
      body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }),
    });
    if (!res.ok) throw new Error(`The emulator did not accept firestore.rules: ${await res.text()}`);
    await fetch(emulatorUrl('/databases/(default)/documents'), { method: 'DELETE' });
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    setLogLevel('error');
    for (const { app, db } of apps) {
      await terminate(db).catch(() => {});
      await deleteApp(app).catch(() => {});
    }
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('everything the app does is accepted', () => {
    it('signing in: the live listener reads every collection (including settings) without an error, and the profile is saved', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const errors: string[] = [];
      let snapshots = 0;
      const stop = subscribeToUserFirestoreData(
        uid, `${uid}@example.com`, 'Tester', () => { snapshots++; }, (e) => errors.push(`${(e as { code?: string }).code}: ${e.message}`)
      );

      // one snapshot per listener: accounts, funds, incomes, expenses, allocations, auditLogs, settings. Wait for them (or for the first error).
      const deadline = Date.now() + 30_000;
      while (snapshots < 7 && errors.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
      await new Promise((r) => setTimeout(r, 300)); // let a late error arrive
      stop();

      expect(errors).toEqual([]);
      expect(snapshots).toBeGreaterThanOrEqual(7);
      expect(raw<{ email: string }>(await getDoc(doc(me, `users/${uid}`))).email).toBe(`${uid}@example.com`);
    });

    it('settings can be read before they exist, saved, and read back', async () => {
      expect((await getDoc(doc(me, `users/${uid}/settings/default`))).exists()).toBe(false);

      await updateSettingsInFirestore(uid, { surplusStrategy: 'proportional_rules' }, createEmptySettings());

      expect((await settingsNow()).surplusStrategy).toBe('proportional_rules');
    });

    it('the 2,000 TJS manual deposit, the next salary that counts it, and the undo of both', async () => {
      const { fuel, wife } = await setUpCards();

      // 2,000 TJS -> 1,000 Fuel + 1,000 Wife's Expense, exactly as typed
      const manual = await addIncome({
        amount: 2000, date: '2026-10-03', source: 'Freelance project',
        manualDeposits: [{ fundId: fuel.id, amount: 1000 }, { fundId: wife.id, amount: 1000 }],
      });
      let cards = await fundsByName();
      expect([cards['Savings'].reservedAmount, cards['Fuel for Car'].reservedAmount, cards["Wife's Expense"].reservedAmount, cards['Food'].reservedAmount])
        .toEqual([0, 1000, 1000, 0]);

      // 6,000 TJS salary, split automatically: Fuel and Wife are already full, so they get nothing
      const salary = await addIncome({ amount: 6000, date: '2026-10-10', source: 'Salary' });
      cards = await fundsByName();
      expect([cards['Savings'].reservedAmount, cards['Fuel for Car'].reservedAmount, cards["Wife's Expense"].reservedAmount, cards['Food'].reservedAmount])
        .toEqual([600, 1000, 1000, 1500]);
      expect((await settingsNow()).workingCapitalBalance).toBe(3900);
      expect((await all('allocations')).length).toBe(2 + 2); // manual: 2 cards; salary: Savings + Food

      // the history shows both, and Undo takes everything back, newest first
      await undoIncomeInFirestore(uid, salary.income.id);
      await undoIncomeInFirestore(uid, manual.income.id);
      cards = await fundsByName();
      expect(Object.values(cards).map((c) => c.reservedAmount)).toEqual([0, 0, 0, 0]);
      expect(Object.values(cards).map((c) => c.cycleAllocated)).toEqual([0, 0, 0, 0]);
      expect((await settingsNow()).workingCapitalBalance).toBe(0);
      expect((await all<{ status: string }>('incomes')).map((i) => i.status)).toEqual(['undone', 'undone']);
    });

    it('spending from a card and from Working Capital, and undoing both', async () => {
      await setUpCards();
      await addIncome({ amount: 6000, date: '2026-10-03', source: 'Salary' });
      // 6,000: Savings 600, every card full (1,000 + 1,000 + 1,500), the other 1,900 to Working Capital
      expect((await settingsNow()).workingCapitalBalance).toBe(1900);
      const fuelId = (await fundsByName())['Fuel for Car'].id;

      const cardExpense = await addExpenseToFirestore(uid, {
        amount: 300, date: '2026-10-04', category: 'Fuel for Car', description: 'Gas', fundId: fuelId, accountId: '',
      });
      const wcExpense = await addExpenseToFirestore(uid, {
        amount: 50, date: '2026-10-04', category: 'Working Capital', description: 'Coffee', fundId: 'working-capital', accountId: '',
      });
      expect((await fundsByName())['Fuel for Car']).toMatchObject({ reservedAmount: 700, cycleSpent: 300 });
      expect(await settingsNow()).toMatchObject({ workingCapitalBalance: 1850, workingCapitalCycleSpent: 50 });

      await undoExpenseInFirestore(uid, cardExpense.id);
      await undoExpenseInFirestore(uid, wcExpense.id);
      expect((await fundsByName())['Fuel for Car']).toMatchObject({ reservedAmount: 1000, cycleSpent: 0 });
      expect(await settingsNow()).toMatchObject({ workingCapitalBalance: 1900, workingCapitalCycleSpent: 0 });
    });

    it('a card can be edited after it was created', async () => {
      const { fuel } = await setUpCards();
      const current = Object.values(await fundsByName());

      await saveFundToFirestore(uid, { id: fuel.id, name: 'Fuel & Taxi', type: 'monthly', monthlyAmount: 1200, targetAmount: 1200 }, current);

      const stored = (await fundsByName())['Fuel & Taxi'];
      expect(stored).toMatchObject({ id: fuel.id, targetAmount: 1200, monthlyAmount: 1200 });
      expect(stored.createdAt).toBe(fuel.createdAt); // an edit keeps the card's history
    });

    it('the first income of a new month rolls the cards over by itself', async () => {
      await setUpCards();
      await addIncome({ amount: 6000, date: '2026-10-03', source: 'Salary' });

      await addIncome({ amount: 1000, date: '2026-11-02', source: 'Salary' });

      // October's balances are carried over, so November's cards are already full: Savings takes its 10 %, the rest goes to Working Capital
      const cards = await fundsByName();
      expect([cards['Savings'].reservedAmount, cards['Fuel for Car'].reservedAmount, cards['Food'].reservedAmount]).toEqual([700, 1000, 1500]);
      expect(cards['Fuel for Car']).toMatchObject({ cycleStartBalance: 1000, cycleAllocated: 0 });
      expect(await settingsNow()).toMatchObject({ currentCycleMonth: '2026-11', workingCapitalBalance: 2800, workingCapitalCycleDeposited: 900 });
    });

    it('starting a new month carries balances over', async () => {
      await setUpCards();
      await addIncome({ amount: 6000, date: '2026-10-03', source: 'Salary' });

      await rolloverToNextMonthInFirestore(uid, '2026-11');

      const cards = await fundsByName();
      expect(cards['Fuel for Car'].cycleStartBalance).toBe(1000); // carried over
      expect(cards['Fuel for Car'].cycleAllocated).toBe(0); // this month's deposit starts again
      expect((await settingsNow()).currentCycleMonth).toBe('2026-11');
    });

    it('a bank account is credited by an income and debited by an expense, and Undo reverses both', async () => {
      await setUpCards();
      const account = await saveAccountToFirestore(uid, { name: 'Main', type: 'checking', balance: 100 });
      const balance = async () => raw<{ balance: number }>(await getDoc(doc(me, `users/${uid}/accounts/${account.id}`))).balance;

      const income = await addIncome({ amount: 1000, date: '2026-10-03', source: 'Salary', accountId: account.id });
      expect(await balance()).toBe(1100);
      const expense = await addExpenseToFirestore(uid, { amount: 40, date: '2026-10-04', category: 'Food', description: 'Lunch', fundId: (await fundsByName())['Food'].id, accountId: account.id });
      expect(await balance()).toBe(1060);

      await undoExpenseInFirestore(uid, expense.id);
      await undoIncomeInFirestore(uid, income.income.id);
      expect(await balance()).toBe(100);
    });

    it('an empty card can be deleted; a card holding money cannot (the app says why, and the rules agree)', async () => {
      const { fuel } = await setUpCards();
      await addIncome({ amount: 500, date: '2026-10-03', source: 'Gift', manualDeposits: [{ fundId: fuel.id, amount: 500 }] });
      const cards = await fundsByName();

      await deleteFundFromFirestore(uid, cards['Food']); // empty
      expect(Object.keys(await fundsByName())).not.toContain('Food');

      const refusal = await deleteFundFromFirestore(uid, cards['Fuel for Car']).then(() => null, (e: unknown) => e);
      expect(refusal).toBeInstanceOf(AppError);
      expect((refusal as AppError).code).toBe('FUND_HAS_BALANCE');

      // even a client that skipped that check is stopped by the rules
      await denied(deleteDoc(doc(me, `users/${uid}/funds/${fuel.id}`)));
      expect(Object.keys(await fundsByName())).toContain('Fuel for Car');
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('the rules still refuse what they are meant to (so the tests above prove something)', () => {
    it("nobody can read or write another person's data, and a signed-out visitor cannot read anything", async () => {
      await saveFundToFirestore(uid, { name: 'Mine', type: 'monthly', monthlyAmount: 100, targetAmount: 100 }, []);
      await addIncome({ amount: 10, date: '2026-10-03', source: 'Mine' }); // also creates settings

      const intruder = clientFor(`intruder-${counter}`);
      await denied(getDocs(collection(intruder, `users/${uid}/funds`)));
      await denied(getDoc(doc(intruder, `users/${uid}/settings/default`)));
      await denied(setDoc(doc(intruder, `users/${uid}/funds/theirs`), validFund()));
      await denied(setDoc(doc(intruder, `users/${uid}/incomes/theirs`), validIncome()));

      const visitor = clientFor();
      await denied(getDocs(collection(visitor, `users/${uid}/incomes`)));
      await denied(getDoc(doc(visitor, `users/${uid}`)));
    });

    it('text limits: exactly as long as the screens allow is accepted, one more character is refused', async () => {
      const text = (n: number) => 'x'.repeat(n);

      await setDoc(doc(me, `users/${uid}/incomes/ok`), validIncome({ source: text(TEXT_LIMITS.incomeSource) }));
      await denied(setDoc(doc(me, `users/${uid}/incomes/long`), validIncome({ source: text(TEXT_LIMITS.incomeSource + 1) })));

      await setDoc(doc(me, `users/${uid}/expenses/ok`), validExpense({ category: text(TEXT_LIMITS.expenseCategory) }));
      await denied(setDoc(doc(me, `users/${uid}/expenses/long`), validExpense({ category: text(TEXT_LIMITS.expenseCategory + 1) })));

      await setDoc(doc(me, `users/${uid}/funds/ok`), validFund({ name: text(TEXT_LIMITS.cardName) }));
      await denied(setDoc(doc(me, `users/${uid}/funds/long`), validFund({ name: text(TEXT_LIMITS.cardName + 1) })));
    });

    it('invalid entries are refused: empty category, negative balance, unknown strategy, non-positive amount', async () => {
      await denied(setDoc(doc(me, `users/${uid}/expenses/e1`), validExpense({ category: '' })));
      await denied(setDoc(doc(me, `users/${uid}/expenses/e2`), validExpense({ amount: 0 })));
      await denied(setDoc(doc(me, `users/${uid}/funds/f1`), validFund({ reservedAmount: -1 })));
      await denied(setDoc(doc(me, `users/${uid}/funds/f2`), validFund({ type: 'mystery' })));
      await denied(setDoc(doc(me, `users/${uid}/incomes/i1`), validIncome({ amount: -5 })));
      await denied(setDoc(doc(me, `users/${uid}/settings/default`), { surplusStrategy: 'whatever' }));
    });

    it('history cannot be rewritten: incomes only flip to "undone", audit entries are append-only', async () => {
      await setDoc(doc(me, `users/${uid}/incomes/i1`), validIncome());
      await setDoc(doc(me, `users/${uid}/auditLogs/a1`), { action: 'TEST', timestamp: '2026-10-05T00:00:00.000Z' });

      await denied(updateDoc(doc(me, `users/${uid}/incomes/i1`), { amount: 999 }));
      await denied(deleteDoc(doc(me, `users/${uid}/incomes/i1`)));
      await updateDoc(doc(me, `users/${uid}/incomes/i1`), { status: 'undone' });

      await denied(updateDoc(doc(me, `users/${uid}/auditLogs/a1`), { action: 'EDITED' }));
      await denied(deleteDoc(doc(me, `users/${uid}/auditLogs/a1`)));
    });
  });
});
