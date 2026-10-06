// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpensesView } from '../ExpensesView';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { AppError } from '../../types/errors';
import type { Account, AllocationSettings, ExpenseTransaction, Fund } from '../../types/finance';

const settings: AllocationSettings = {
  surplusStrategy: 'unallocated',
  surplusRules: [],
  currentCycleMonth: '2026-10',
  defaultAccountId: 'acc-1',
  workingCapitalBalance: 500,
};
const accounts: Account[] = [
  { id: 'acc-1', name: 'Main', type: 'checking', balance: 0, currency: 'TJS', updatedAt: '2026-10-01' },
];
const fuel: Fund = {
  id: 'fuel', name: 'Fuel for Car', type: 'monthly', category: 'Spending Account', targetAmount: 1000, monthlyAmount: 1000,
  reservedAmount: 800, cycleStartBalance: 0, cycleAllocated: 1000, cycleSpent: 200, priority: 1, isActive: true, color: '#f59e0b',
};

const expense = (o: Partial<ExpenseTransaction> & Pick<ExpenseTransaction, 'id'>): ExpenseTransaction => ({
  amount: 30, date: '2026-10-02', category: 'Fuel', description: 'Gas', accountId: 'acc-1', status: 'active',
  createdAt: '2026-10-02T08:00:00.000Z', ...o,
});

function renderExpenses(lang: 'en' | 'ru' | 'uz', expenses: ExpenseTransaction[] = []) {
  localStorage.setItem('myfinance_lang', lang);
  const onAddExpense = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <LanguageProvider>
      <ExpensesView
        accounts={accounts}
        funds={[fuel]}
        expenses={expenses}
        settings={settings}
        onAddExpense={onAddExpense}
        onUndoExpense={vi.fn().mockResolvedValue(undefined)}
      />
    </LanguageProvider>
  );
  const form = utils.container.querySelector('form') as HTMLFormElement;
  return {
    ...utils,
    onAddExpense,
    form,
    amount: () => form.querySelector('input[type="number"]') as HTMLInputElement,
    categoryInput: () => (form.querySelectorAll('input[type="text"]')[0]) as HTMLInputElement,
    submit: () => form.querySelector('button[type="submit"]') as HTMLButtonElement,
    user: userEvent.setup(),
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Pay — Working Capital and default categories', () => {
  it('selecting Working Capital leaves the category empty; the placeholder names it in the active language', async () => {
    const { user, categoryInput } = renderExpenses('ru');
    expect(categoryInput().placeholder).toBe('Fuel for Car'); // a card is selected first: its own name

    await user.click(screen.getByText('Оборотный капитал'));
    expect(categoryInput().value).toBe('');
    expect(categoryInput().placeholder).toBe('Оборотный капитал');
  });

  it('paying from Working Capital stores the canonical default category and confirms in the active language', async () => {
    const { user, amount, submit, onAddExpense } = renderExpenses('ru');
    await user.click(screen.getByText('Оборотный капитал'));
    await user.type(amount(), '50');
    await user.click(submit());

    expect(onAddExpense).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 50, fundId: 'working-capital', category: 'Working Capital', description: 'Working Capital' })
    );
    expect((await screen.findByRole('status')).textContent).toBe('-50.00 TJS (Оборотный капитал)');
  });

  it('paying from a card still defaults the category to the card name', async () => {
    const { user, amount, submit, onAddExpense } = renderExpenses('uz');
    await user.type(amount(), '25');
    await user.click(submit());
    expect(onAddExpense).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 25, fundId: 'fuel', category: 'Fuel for Car' })
    );
  });

  it('the history list shows app-written defaults in the active language and leaves typed text alone', () => {
    const list = [
      expense({ id: 'e1', category: 'General', description: 'General', fundName: undefined }),
      expense({ id: 'e2', category: 'Working Capital', description: 'Working Capital', fundName: 'Working Capital', amount: 70 }),
      expense({ id: 'e3', category: 'Fuel', description: 'Gas station', fundName: 'Fuel for Car', amount: 40 }),
    ];
    const { container } = renderExpenses('ru', list);
    const text = container.textContent ?? '';
    expect(text).toContain('Общее');
    expect(text).toContain('Оборотный капитал');
    expect(text).toContain('Gas station'); // what the user typed
    expect(text).toContain('Fuel for Car');
    // the stored English defaults are not printed raw
    expect(within(container).queryByText('General')).toBeNull();
    expect(within(container).queryAllByText('Working Capital').length).toBe(0);
  });

  it('English output is unchanged', () => {
    const list = [expense({ id: 'e2', category: 'Working Capital', description: 'Working Capital', fundName: 'Working Capital' })];
    renderExpenses('en', list);
    expect(screen.getAllByText('Working Capital').length).toBeGreaterThan(0);
  });
});

describe('Pay — messages', () => {
  it('a zero amount is explained in the active language, and nothing is sent', async () => {
    const { user, amount, submit, onAddExpense } = renderExpenses('ru');
    await user.type(amount(), '0');
    await user.click(submit());
    expect((await screen.findByRole('alert')).textContent).toBe('Сумма расхода должна быть положительным числом (> 0.00 TJS).');
    expect(onAddExpense).not.toHaveBeenCalled();

    cleanup();
    const uz = renderExpenses('uz');
    await uz.user.type(uz.amount(), '0');
    await uz.user.click(uz.submit());
    expect((await screen.findByRole('alert')).textContent).toBe("Xarajat summasi musbat son bo'lishi kerak (> 0.00 TJS).");
  });

  it('a rejected payment: typed errors are translated, unknown errors get the generic message', async () => {
    const { user, amount, submit, onAddExpense } = renderExpenses('ru');
    await user.type(amount(), '10');

    onAddExpense.mockRejectedValueOnce(new AppError('SPEND_FROM_SAVINGS_DISABLED', 'Spend from Card is disabled for Savings accounts.'));
    await user.click(submit());
    expect((await screen.findByRole('alert')).textContent).toBe('Траты с накопительной карты отключены.');

    onAddExpense.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));
    await user.click(submit());
    expect((await screen.findByRole('alert')).textContent).toBe('Не удалось сохранить расход.');
  });
});
