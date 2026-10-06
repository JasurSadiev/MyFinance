// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditLedgerView } from '../AuditLedgerView';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { AllocationRecord, IncomeTransaction } from '../../types/finance';

const manualIncome: IncomeTransaction = {
  id: 'inc-manual',
  amount: 2000,
  date: '2026-10-03',
  source: 'Freelance project',
  accountId: 'acc-1',
  appliedAllocations: ['a1', 'a2'],
  unallocatedSurplus: 0,
  fundingRatioAchieved: 0,
  status: 'active',
  createdAt: '2026-10-03T08:00:00.000Z',
};

const autoIncome: IncomeTransaction = {
  ...manualIncome,
  id: 'inc-auto',
  source: 'Salary',
  date: '2026-10-20',
  appliedAllocations: ['a3'],
  createdAt: '2026-10-20T08:00:00.000Z',
};

const alloc = (id: string, incomeId: string, fundName: string, stage: AllocationRecord['ruleStage'], amount: number, ruleUsed: string): AllocationRecord => ({
  id,
  incomeId,
  fundId: `fund-${fundName}`,
  fundName,
  amount,
  ruleStage: stage,
  ruleUsed,
  needBeforeAllocation: amount,
  fundingRatio: 1,
  status: 'active',
  timestamp: '2026-10-03T08:00:00.000Z',
});

const allocations: AllocationRecord[] = [
  alloc('a1', 'inc-manual', 'Fuel for Car', 'manual_deposit', 1000, 'Manual deposit chosen by you (1000.00 TJS)'),
  alloc('a2', 'inc-manual', "Wife's Expense", 'manual_deposit', 1000, 'Manual deposit chosen by you (1000.00 TJS)'),
  alloc('a3', 'inc-auto', 'Food', 'need_full', 1500, '100% of remaining monthly need (1500.00 TJS)'),
];

function renderLedger(lang: 'en' | 'ru' | 'uz' = 'en') {
  localStorage.setItem('myfinance_lang', lang);
  const onUndoIncome = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <LanguageProvider>
      <AuditLedgerView
        incomes={[autoIncome, manualIncome]}
        expenses={[]}
        allocations={allocations}
        auditLogs={[]}
        onUndoIncome={onUndoIncome}
        onUndoExpense={vi.fn().mockResolvedValue(undefined)}
      />
    </LanguageProvider>
  );
  return { ...utils, onUndoIncome, user: userEvent.setup() };
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('History — manual deposits', () => {
  it('shows manual deposits with a translated stage label and rule text (not the raw stage code)', () => {
    renderLedger();
    const table = within(screen.getByRole('table'));

    // Manual lines: localized stage pill + localized rule text
    expect(table.getAllByText('Manual')).toHaveLength(2);
    expect(
      table.getAllByText('Manual deposit chosen by you (1000.00 TJS; 1000.00 TJS was still needed this month)')
    ).toHaveLength(2);
    // Automatic lines are labelled in words too, never "need_full"
    expect(table.getByText('100%')).toBeTruthy();
    expect(screen.queryByText(/need_full|manual_deposit/)).toBeNull();
  });

  it('marks only the income that contains manual deposits, and Undo still works on it', async () => {
    const { user, onUndoIncome } = renderLedger();
    await user.click(screen.getByRole('button', { name: /^Incomes/ }));

    expect(screen.getAllByText('Manual deposit')).toHaveLength(1); // the badge, only on "Freelance project"
    const manualRow = screen.getByText('Freelance project').closest('div.rounded-3xl') as HTMLElement;
    const autoRow = screen.getByText('Salary').closest('div.rounded-3xl') as HTMLElement;
    expect(within(manualRow).getByText('Manual deposit')).toBeTruthy();
    expect(within(autoRow).queryByText('Manual deposit')).toBeNull();

    await user.click(within(manualRow).getByRole('button', { name: /Undo & Reverse Splits/ }));
    expect(onUndoIncome).toHaveBeenCalledWith('inc-manual');
  });

  it('the "Rule Applied" column is translated (records saved before rule details existed included)', () => {
    renderLedger('ru');
    const table = within(screen.getByRole('table'));

    expect(
      table.getAllByText('Ручное пополнение, выбранное вами (1000.00 TJS; в этом месяце ещё требовалось 1000.00 TJS)')
    ).toHaveLength(2);
    // An automatic line from an older record (no ruleDetails): translated, not the stored English sentence
    expect(table.getByText('100% оставшейся месячной нормы (1500.00 TJS)')).toBeTruthy();
    expect(screen.queryByText(/remaining monthly need|Manual deposit chosen/)).toBeNull();
  });

  it.each(['ru', 'uz'] as const)('has no raw translation keys in %s', async (lang) => {
    const { user, container } = renderLedger(lang);
    expect(container.textContent).not.toMatch(/\b(stage|man|audit)_[a-z0-9_]+\b/);
    await user.click(screen.getAllByRole('button')[1]); // "Incomes" tab
    expect(container.textContent).not.toMatch(/\b(stage|man|audit)_[a-z0-9_]+\b/);
  });
});
