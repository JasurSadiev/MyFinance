// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DashboardView } from '../DashboardView';
import { LanguageProvider } from '../../i18n/LanguageContext';
import type { AllocationSettings, ExpenseTransaction, Fund } from '../../types/finance';

const settings: AllocationSettings = {
  surplusStrategy: 'unallocated',
  surplusRules: [],
  currentCycleMonth: '2026-10',
  defaultAccountId: 'acc-1',
  workingCapitalBalance: 500,
};

const cards: Fund[] = [
  {
    id: 'fuel', name: 'Fuel for Car', type: 'monthly', category: 'Spending Account', targetAmount: 1000, monthlyAmount: 1000,
    reservedAmount: 800, cycleStartBalance: 0, cycleAllocated: 1000, cycleSpent: 200, priority: 1, isActive: true, color: '#f59e0b',
  },
  {
    id: 'sav', name: 'Savings', type: 'percentage', category: 'Savings (Spend Off)', percentage: 10, targetAmount: 25000,
    reservedAmount: 600, cycleAllocated: 600, priority: 2, isActive: true, color: '#10b981',
  },
];

const spent = (o: Partial<ExpenseTransaction> & Pick<ExpenseTransaction, 'id'>): ExpenseTransaction => ({
  amount: 30, date: '2026-10-02', category: 'General', description: 'General', accountId: 'acc-1', status: 'active',
  createdAt: '2026-10-02T08:00:00.000Z', ...o,
});

function renderDashboard(lang: 'en' | 'ru' | 'uz', expenses: ExpenseTransaction[] = []) {
  localStorage.setItem('myfinance_lang', lang);
  return render(
    <LanguageProvider>
      <DashboardView
        accounts={[]}
        funds={cards}
        incomes={[]}
        expenses={expenses}
        allocations={[]}
        settings={settings}
        onNavigate={vi.fn()}
        onSpendFromCard={vi.fn()}
        onDeleteFund={vi.fn().mockResolvedValue(undefined)}
        onUndoIncome={vi.fn()}
        onUndoExpense={vi.fn()}
        onRolloverMonth={vi.fn().mockResolvedValue(undefined)}
      />
    </LanguageProvider>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('Overview — language', () => {
  it('the currency name and the card categories are in the active language', () => {
    const ru = renderDashboard('ru').container.textContent ?? '';
    expect(ru).toContain('Сомони');
    expect(ru).toContain('Расходный счёт');
    expect(ru).not.toMatch(/\bSomoni\b/);
    expect(ru).not.toContain('Spending Account');
    cleanup();

    const uz = renderDashboard('uz').container.textContent ?? '';
    expect(uz).toContain('Somoniy');
    expect(uz).toContain('Xarajat hisobi');
    cleanup();

    const en = renderDashboard('en').container.textContent ?? '';
    expect(en).toContain('Somoni');
    expect(en).toContain('Spending Account');
  });

  it('recent activity shows the app-written default labels translated, and typed text unchanged', () => {
    const { container } = renderDashboard('ru', [
      spent({ id: 'e1', category: 'Working Capital', description: 'Working Capital', fundName: 'Working Capital', amount: 70 }),
      spent({ id: 'e2', category: 'General', description: 'General', amount: 20 }),
      spent({ id: 'e3', category: 'Fuel', description: 'Gas station', fundName: 'Fuel for Car', amount: 40 }),
    ]);
    const text = container.textContent ?? '';
    expect(text).toContain('Оборотный капитал');
    expect(text).toContain('Общее');
    expect(text).toContain('Gas station');
    expect(text).not.toContain('Working Capital');
    expect(text).not.toMatch(/\bGeneral\b/);
  });
});
