// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IncomeView } from '../IncomeView';
import { ExpensesView } from '../ExpensesView';
import { FundsView } from '../FundsView';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { TEXT_LIMITS } from '../../types/limits';
import type { Account, AllocationSettings, Fund } from '../../types/finance';

const settings: AllocationSettings = {
  surplusStrategy: 'unallocated',
  surplusRules: [],
  currentCycleMonth: '2026-10',
  defaultAccountId: 'acc-1',
};
const accounts: Account[] = [
  { id: 'acc-1', name: 'Main', type: 'checking', balance: 0, currency: 'TJS', updatedAt: '2026-10-01' },
];
const monthly = (id: string, name: string): Fund => ({
  id, name, type: 'monthly', category: 'Spending Account', targetAmount: 1000, monthlyAmount: 1000, reservedAmount: 800,
  cycleStartBalance: 0, cycleAllocated: 1000, cycleSpent: 200, priority: 1, isActive: true, color: '#f59e0b',
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('text fields stop at the length the database accepts', () => {
  it('Add Income: the source field takes at most 120 characters', () => {
    const { container } = render(
      <LanguageProvider>
        <IncomeView accounts={accounts} funds={[monthly('fuel', 'Fuel')]} settings={settings} onCommitIncome={vi.fn()} />
      </LanguageProvider>
    );
    const source = container.querySelector('#income-source') as HTMLInputElement;
    expect(source.maxLength).toBe(TEXT_LIMITS.incomeSource);
    expect(source.maxLength).toBe(120);
  });

  it('Cards: the card name takes at most 100 characters', () => {
    const { container } = render(
      <LanguageProvider>
        <FundsView
          funds={[]}
          accounts={accounts}
          expenses={[]}
          settings={settings}
          onSaveFund={vi.fn()}
          onDeleteFund={vi.fn()}
          onUpdateSettings={vi.fn()}
          onSpendFromCard={vi.fn()}
          onRolloverMonth={vi.fn()}
        />
      </LanguageProvider>
    );
    const form = container.querySelector('form') as HTMLFormElement;
    const nameInput = form.querySelector('input[type="text"]') as HTMLInputElement;
    expect(nameInput.maxLength).toBe(TEXT_LIMITS.cardName);
    expect(nameInput.maxLength).toBe(100);
  });

  it('Pay: the category field takes at most 80 characters', () => {
    const { container } = render(
      <LanguageProvider>
        <ExpensesView
          accounts={accounts}
          funds={[monthly('fuel', 'Fuel for Car')]}
          expenses={[]}
          settings={settings}
          onAddExpense={vi.fn()}
          onUndoExpense={vi.fn()}
        />
      </LanguageProvider>
    );
    const form = container.querySelector('form') as HTMLFormElement;
    const category = form.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
    expect(category.maxLength).toBe(TEXT_LIMITS.expenseCategory);
    expect(category.maxLength).toBe(80);
  });

  it('Pay: a card with a very long name (allowed up to 100) still produces a category of at most 80', async () => {
    const longName = 'Long-named card '.repeat(6).trim(); // 95 characters
    expect(longName.length).toBeGreaterThan(TEXT_LIMITS.expenseCategory);
    expect(longName.length).toBeLessThanOrEqual(TEXT_LIMITS.cardName);

    const onAddExpense = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <LanguageProvider>
        <ExpensesView
          accounts={accounts}
          funds={[monthly('long', longName)]}
          expenses={[]}
          settings={settings}
          onAddExpense={onAddExpense}
          onUndoExpense={vi.fn()}
        />
      </LanguageProvider>
    );
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.change(form.querySelector('input[type="number"]') as HTMLInputElement, { target: { value: '25' } });
    await userEvent.setup().click(form.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => expect(onAddExpense).toHaveBeenCalledTimes(1));
    const sent = onAddExpense.mock.calls[0][0] as { category: string; fundId: string };
    expect(sent.fundId).toBe('long');
    expect(sent.category).toBe(longName.slice(0, TEXT_LIMITS.expenseCategory));
    expect(sent.category.length).toBe(80);
  });
});
