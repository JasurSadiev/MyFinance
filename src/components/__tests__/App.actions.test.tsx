// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirebaseError } from 'firebase/app';

// The whole app, signed in, with the data layer replaced so each one-click action can be made to fail.
// (The real writers are covered by firestoreWriters.test.ts and the emulator test.)
const mocks = vi.hoisted(() => ({
  deleteFund: vi.fn(),
  realDeleteFund: null as unknown as (...args: unknown[]) => Promise<void>,
  undoIncome: vi.fn(),
  undoExpense: vi.fn(),
  rollover: vi.fn(),
  hierarchy: null as unknown,
}));

vi.mock('../../services/firebaseConfig', () => ({ app: {}, auth: {}, db: {}, appCheck: null }));
vi.mock('firebase/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/auth')>()),
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    cb({ uid: 'u1', email: 'tester@example.com', displayName: 'Tester' });
    return () => {};
  },
  signOut: vi.fn(),
}));
vi.mock('../../services/financeService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/financeService')>();
  mocks.realDeleteFund = actual.deleteFundFromFirestore as unknown as typeof mocks.realDeleteFund;
  return {
    ...actual,
    subscribeToUserFirestoreData: (_u: string, _e: string, _n: string, onUpdate: (h: unknown) => void) => {
      onUpdate(mocks.hierarchy);
      return () => {};
    },
    deleteFundFromFirestore: mocks.deleteFund,
    undoIncomeInFirestore: mocks.undoIncome,
    undoExpenseInFirestore: mocks.undoExpense,
    rolloverToNextMonthInFirestore: mocks.rollover,
  };
});

import { App } from '../../App';
import { createEmptySettings, createEmptyUserHierarchy } from '../../services/financeService';
import type { UserFirestoreHierarchy } from '../../services/financeService';
import { translations } from '../../i18n/LanguageContext';
import { AppError } from '../../types/errors';
import type { Fund } from '../../types/finance';

const card = (o: Partial<Fund> & Pick<Fund, 'id' | 'name'>): Fund => ({
  type: 'monthly', category: 'Spending Account', targetAmount: 1000, monthlyAmount: 1000, reservedAmount: 0,
  cycleStartBalance: 0, cycleAllocated: 0, cycleSpent: 0, priority: 1, isActive: true, color: '#f59e0b', ...o,
});

function buildHierarchy(): UserFirestoreHierarchy {
  const base = createEmptyUserHierarchy('u1', 'tester@example.com', 'Tester');
  return {
    ...base,
    funds: {
      fuel: card({ id: 'fuel', name: 'Fuel for Car', reservedAmount: 500, cycleAllocated: 500, priority: 1 }),
      meals: card({ id: 'meals', name: 'Meals', targetAmount: 500, monthlyAmount: 500, priority: 2 }),
    },
    incomes: {
      inc1: {
        id: 'inc1', amount: 500, date: '2026-10-05', source: 'Salary', accountId: '', appliedAllocations: [],
        unallocatedSurplus: 0, fundingRatioAchieved: 1, status: 'active', createdAt: '2026-10-05T08:00:00.000Z',
      },
    },
    expenses: {
      exp1: {
        id: 'exp1', amount: 30, date: '2026-10-06', category: 'Fuel', description: 'Gas', fundId: 'fuel',
        fundName: 'Fuel for Car', accountId: '', status: 'active', createdAt: '2026-10-06T08:00:00.000Z',
      },
    },
    settings: { ...createEmptySettings(), currentCycleMonth: '2026-10' },
  };
}

const undoButtons = () => screen.getAllByRole('button', { name: translations.en.dash_undo });
const langButton = (short: 'EN' | 'RU' | 'UZ') => screen.getAllByRole('button', { name: short })[0];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('myfinance_lang', 'en');
  mocks.hierarchy = buildHierarchy();
  mocks.deleteFund.mockReset().mockImplementation((...args: unknown[]) => mocks.realDeleteFund(...args));
  mocks.undoIncome.mockReset().mockResolvedValue(undefined);
  mocks.undoExpense.mockReset().mockResolvedValue(undefined);
  mocks.rollover.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a one-click action that fails tells the person, in their language', () => {
  it('deleting a card that still holds money explains why, and the notice follows the language switcher', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole('button', { name: 'Delete card' }))[0]); // Fuel for Car: 500.00 TJS

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('"Fuel for Car" still holds 500.00 TJS, so the card cannot be deleted.');

    await user.click(langButton('RU'));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('На карте «Fuel for Car» ещё 500.00 TJS, поэтому её нельзя удалить.')
    );

    await user.click(langButton('UZ'));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('"Fuel for Car" kartasida hali 500.00 TJS bor')
    );
  });

  it('an unexpected failure shows the generic sentence, never the raw library text', async () => {
    mocks.deleteFund.mockRejectedValueOnce(new Error('RAW: grpc stream exploded'));
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole('button', { name: 'Delete card' }))[1]); // Meals (empty)

    expect((await screen.findByRole('alert')).textContent).toContain(translations.en.err_fund_delete_failed);
    expect(screen.getByRole('alert').textContent).not.toContain('RAW');
  });

  it('a failed Undo says so; known problems get their own sentence in every language', async () => {
    mocks.undoIncome.mockRejectedValueOnce(new Error('RAW: boom'));
    const user = userEvent.setup();
    render(<App />);

    await user.click(undoButtons()[0]); // the income
    expect(mocks.undoIncome).toHaveBeenCalledWith('u1', 'inc1');
    expect((await screen.findByRole('alert')).textContent).toContain(translations.en.err_undo_failed);
    expect(screen.getByRole('alert').textContent).not.toContain('RAW');

    // expenses: an AppError carries its own message; a Firestore "permission-denied" gets the access sentence
    mocks.undoExpense.mockRejectedValueOnce(new AppError('EXPENSE_ALREADY_UNDONE', 'already undone'));
    await user.click(undoButtons()[1]); // the expense
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(translations.en.err_expense_already_undone));
    await user.click(langButton('RU'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(translations.ru.err_expense_already_undone));

    mocks.undoExpense.mockRejectedValueOnce(new FirebaseError('permission-denied', 'Missing or insufficient permissions.'));
    await user.click(screen.getAllByRole('button', { name: translations.ru.dash_undo })[1]);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(translations.ru.err_permission));
  });

  it('starting a new month that fails is reported too', async () => {
    mocks.rollover.mockRejectedValueOnce(new Error('RAW: offline'));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: translations.en.dash_new_month_btn }));

    expect((await screen.findByRole('alert')).textContent).toContain(translations.en.err_rollover_failed);
  });

  it('the notice can be dismissed', async () => {
    mocks.undoIncome.mockRejectedValueOnce(new Error('x'));
    const user = userEvent.setup();
    render(<App />);

    await user.click(undoButtons()[0]);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: translations.en.common_dismiss }));

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('double clicks and timing', () => {
  it('a second click on Undo while the first is still running is ignored; afterwards it works again', async () => {
    let finish!: () => void;
    mocks.undoIncome.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<App />);

    const undo = undoButtons()[0];
    await user.dblClick(undo);
    expect(mocks.undoIncome).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish();
    });
    expect(screen.queryByRole('alert')).toBeNull(); // the first one succeeded: no error from the second click

    await user.click(undoButtons()[0]);
    expect(mocks.undoIncome).toHaveBeenCalledTimes(2);
  });

  it('a notice disappears by itself after 8 seconds, and a newer failure restarts the clock', async () => {
    vi.useFakeTimers();
    mocks.undoIncome.mockRejectedValue(new Error('x'));
    render(<App />);
    const flush = () =>
      act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

    fireEvent.click(undoButtons()[0]);
    await flush();
    expect(screen.getByRole('alert')).toBeTruthy();

    act(() => void vi.advanceTimersByTime(7000));
    expect(screen.getByRole('alert')).toBeTruthy();

    fireEvent.click(undoButtons()[0]); // fails again 7 s after the first
    await flush();
    act(() => void vi.advanceTimersByTime(7000)); // 14 s after the first failure, 7 s after the second
    expect(screen.getByRole('alert')).toBeTruthy();

    act(() => void vi.advanceTimersByTime(1500));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
