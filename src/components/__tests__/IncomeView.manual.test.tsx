// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IncomeView } from '../IncomeView';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { Account, AllocationSettings, Fund, NewIncomeInput } from '../../types/finance';
import { AppError } from '../../types/errors';

const settings: AllocationSettings = {
  surplusStrategy: 'unallocated',
  surplusRules: [],
  currentCycleMonth: '2026-10',
  defaultAccountId: 'acc-1',
};

const accounts: Account[] = [
  { id: 'acc-1', name: 'Main', type: 'checking', balance: 0, currency: 'TJS', updatedAt: '2026-10-01' },
];

function makeFunds(overrides: Record<string, Partial<Fund>> = {}): Fund[] {
  const monthly = (id: string, name: string, amount: number, priority: number): Fund => ({
    id,
    name,
    type: 'monthly',
    category: 'Spending',
    targetAmount: amount,
    monthlyAmount: amount,
    reservedAmount: 0,
    cycleStartBalance: 0,
    cycleAllocated: 0,
    cycleSpent: 0,
    priority,
    isActive: true,
    ...overrides[id],
  });
  return [
    {
      id: 'sav',
      name: 'Savings',
      type: 'percentage',
      category: 'Savings',
      percentage: 10,
      targetAmount: 25000,
      reservedAmount: 0,
      cycleAllocated: 0,
      priority: 1,
      isActive: true,
    },
    monthly('fuel', 'Fuel for Car', 1000, 2),
    monthly('wife', "Wife's Expense", 1000, 3),
    monthly('food', 'Food', 1500, 4),
  ];
}

function renderIncomeView(opts: { funds?: Fund[]; lang?: 'en' | 'ru' | 'uz' } = {}) {
  localStorage.setItem('myfinance_lang', opts.lang ?? 'en');
  const onCommitIncome = vi.fn<(payload: NewIncomeInput) => Promise<void>>().mockResolvedValue(undefined);
  const utils = render(
    <LanguageProvider>
      <IncomeView
        accounts={accounts}
        funds={opts.funds ?? makeFunds()}
        settings={settings}
        onCommitIncome={onCommitIncome}
      />
    </LanguageProvider>
  );
  return { ...utils, onCommitIncome, user: userEvent.setup() };
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('Add Income — Manual deposit mode', () => {
  it("the user's scenario: 2,000 TJS -> 1,000 Fuel + 1,000 Wife's Expense is committed exactly as typed", async () => {
    const { user, onCommitIncome } = renderIncomeView();

    await user.type(screen.getByLabelText(/Gross Income Amount/i), '2000');
    await user.type(screen.getByLabelText(/Income Source/i), 'Freelance project');
    await user.click(screen.getByRole('button', { name: 'Manual deposit' }));

    await user.type(screen.getByLabelText('Manual deposit amount for Fuel for Car'), '1000');
    await user.type(screen.getByLabelText("Manual deposit amount for Wife's Expense"), '1000');

    // Live summary: everything is assigned, nothing left to split.
    expect(screen.getByTestId('manual-assigned').textContent).toBe('2000.00');
    expect(screen.getByTestId('manual-left').textContent).toBe('0.00');
    expect(screen.queryByText(/What should happen to the remaining/i)).toBeNull();

    // Live preview shows the manual lines and takes nothing for Savings.
    const trace = within(screen.getByTestId('distribution-trace'));
    expect(trace.getByText(/\[Manual\] Fuel for Car: \+1000\.00 TJS/)).toBeTruthy();
    expect(trace.getByText(/\[Manual\] Wife's Expense: \+1000\.00 TJS/)).toBeTruthy();
    expect(trace.queryByText(/\[Savings\]/)).toBeNull();

    await user.click(screen.getByRole('button', { name: /Confirm & Distribute/ }));

    await waitFor(() => expect(onCommitIncome).toHaveBeenCalledTimes(1));
    const payload = onCommitIncome.mock.calls[0][0];
    expect(payload).toMatchObject({
      amount: 2000,
      source: 'Freelance project',
      accountId: 'acc-1',
      manualDeposits: [
        { fundId: 'fuel', amount: 1000 },
        { fundId: 'wife', amount: 1000 },
      ],
      manualRemainderMode: 'auto_split',
    });
    expect(payload.customAllocations).toBeUndefined();

    // Success feedback, and the form returns to Auto-split ready for the next (auto) salary.
    expect((await screen.findByRole('status')).textContent).toMatch(/2000\.00 TJS deposited manually/);
    expect(screen.getByRole('button', { name: 'Auto-split' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('blocks manual deposits that exceed the income and explains by how much', async () => {
    const { user, onCommitIncome } = renderIncomeView();

    await user.type(screen.getByLabelText(/Gross Income Amount/i), '1000');
    await user.type(screen.getByLabelText(/Income Source/i), 'Bonus');
    await user.click(screen.getByRole('button', { name: 'Manual deposit' }));
    await user.type(screen.getByLabelText('Manual deposit amount for Fuel for Car'), '700');
    await user.type(screen.getByLabelText("Manual deposit amount for Wife's Expense"), '700');

    expect(screen.getByTestId('manual-left').textContent).toBe('-400.00');
    expect(screen.getAllByRole('alert')[0].textContent).toMatch(
      /Manual deposits exceed the income by 400\.00 TJS\./
    );

    await user.click(screen.getByRole('button', { name: /Confirm & Distribute/ }));
    expect(onCommitIncome).not.toHaveBeenCalled();
  });

  it('requires at least one manual amount in manual mode', async () => {
    const { user, onCommitIncome } = renderIncomeView();

    await user.type(screen.getByLabelText(/Gross Income Amount/i), '500');
    await user.type(screen.getByLabelText(/Income Source/i), 'Gift');
    await user.click(screen.getByRole('button', { name: 'Manual deposit' }));
    await user.click(screen.getByRole('button', { name: /Confirm & Distribute/ }));

    expect((await screen.findAllByRole('alert'))[0].textContent).toMatch(
      /Enter an amount next to at least one card/
    );
    expect(onCommitIncome).not.toHaveBeenCalled();
  });

  it("shows what each card already collected this month and 'Fill' enters exactly the missing amount", async () => {
    const funds = makeFunds({ fuel: { cycleAllocated: 400, reservedAmount: 400 } });
    const { user } = renderIncomeView({ funds });

    await user.type(screen.getByLabelText(/Gross Income Amount/i), '2000');
    await user.click(screen.getByRole('button', { name: 'Manual deposit' }));

    expect(screen.getByText('Collected 400.00 / 1000.00 TJS · needs 600.00')).toBeTruthy();
    expect(screen.getByText('Collected 0.00 / 1000.00 TJS · needs 1000.00')).toBeTruthy(); // Wife's Expense
    expect(screen.getByText('Auto-charged 10% of every income')).toBeTruthy(); // Savings

    await user.click(screen.getByRole('button', { name: 'Fill 600.00' }));
    expect(
      (screen.getByLabelText('Manual deposit amount for Fuel for Car') as HTMLInputElement).value
    ).toBe('600.00');

    // Only the three spending cards that still need money have a "Fill" shortcut (Fuel 600, Wife 1000, Food 1500).
    // Savings has none: it is charged a % automatically, not a monthly amount.
    expect(
      screen.getAllByRole('button', { name: /^Fill / }).map((b) => b.textContent)
    ).toEqual(['Fill 600.00', 'Fill 1000.00', 'Fill 1500.00']);
  });

  it('warns (without blocking) when a deposit is above the card\'s monthly need, and marks full cards', async () => {
    const funds = makeFunds({ wife: { cycleAllocated: 1000, reservedAmount: 1000 } });
    const { user } = renderIncomeView({ funds });

    await user.click(screen.getByRole('button', { name: 'Manual deposit' }));
    await user.type(screen.getByLabelText(/Gross Income Amount/i), '3000');
    expect(screen.getByText(/✓ Monthly need met \(1000\.00 \/ 1000\.00 TJS\)/)).toBeTruthy();

    await user.type(screen.getByLabelText('Manual deposit amount for Fuel for Car'), '1500');
    expect(screen.getByText('500.00 TJS above this month\'s need')).toBeTruthy();
    expect(screen.getByTestId('manual-left').textContent).toBe('1500.00'); // still valid
  });

  it('lets the user choose what happens to the part that is not assigned', async () => {
    const { user, onCommitIncome } = renderIncomeView();

    await user.type(screen.getByLabelText(/Gross Income Amount/i), '3000');
    await user.type(screen.getByLabelText(/Income Source/i), 'Bonus');
    await user.click(screen.getByRole('button', { name: 'Manual deposit' }));
    await user.type(screen.getByLabelText('Manual deposit amount for Fuel for Car'), '1000');

    expect(screen.getByText('What should happen to the remaining 2000.00 TJS?')).toBeTruthy();
    // Default: the rest is auto-split (Savings % of the remainder is charged).
    expect(
      within(screen.getByTestId('distribution-trace')).getByText(/\[Savings\] Savings: \+200\.00 TJS/)
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Rest to Working Capital/ }));
    const trace = within(screen.getByTestId('distribution-trace'));
    expect(trace.queryByText(/\[Savings\]/)).toBeNull();
    expect(trace.getByText(/Working Capital: \+2000\.00 TJS/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Confirm & Distribute/ }));
    await waitFor(() => expect(onCommitIncome).toHaveBeenCalledTimes(1));
    expect(onCommitIncome.mock.calls[0][0]).toMatchObject({
      manualDeposits: [{ fundId: 'fuel', amount: 1000 }],
      manualRemainderMode: 'working_capital',
    });
  });

  it('a card filled by a manual deposit is shown as already 100% in the auto-split part of the same income', async () => {
    const { user } = renderIncomeView();

    await user.type(screen.getByLabelText(/Gross Income Amount/i), '5000');
    await user.click(screen.getByRole('button', { name: 'Manual deposit' }));
    await user.type(screen.getByLabelText('Manual deposit amount for Fuel for Car'), '1000');

    const trace = within(screen.getByTestId('distribution-trace'));
    expect(trace.getByText(/✓ 100%: Fuel for Car/)).toBeTruthy();
    // Fuel gets exactly one line in the table (the manual one), never a second automatic one.
    const table = within(screen.getByRole('table'));
    expect(table.getAllByText('Fuel for Car')).toHaveLength(1);
  });

  it('Auto-split mode still commits exactly as before (no manual fields)', async () => {
    const { user, onCommitIncome } = renderIncomeView();

    await user.type(screen.getByLabelText(/Gross Income Amount/i), '3000');
    await user.type(screen.getByLabelText(/Income Source/i), 'Salary');
    await user.click(screen.getByRole('button', { name: /Confirm & Distribute/ }));

    await waitFor(() => expect(onCommitIncome).toHaveBeenCalledTimes(1));
    const payload = onCommitIncome.mock.calls[0][0];
    expect(payload.manualDeposits).toBeUndefined();
    expect(payload.manualRemainderMode).toBeUndefined();
    expect(payload.customAllocations).toBeUndefined();
    expect(payload.amount).toBe(3000);
  });

  it.each([
    ['ru', 'Ручное пополнение', 'Распределено вручную'],
    ['uz', "Qo'lda to'ldirish", "Qo'lda taqsimlangan"],
  ] as const)('renders fully translated in %s with no raw translation keys', async (lang, modeLabel, assignedLabel) => {
    const { user, container } = renderIncomeView({ lang });

    await user.type(screen.getByRole('spinbutton', { name: /TJS/ }), '2000');
    await user.click(screen.getByRole('button', { name: modeLabel }));

    expect(screen.getByText(assignedLabel)).toBeTruthy();
    // Every visible string came from the dictionary (a missing key would render as e.g. "man_sum_left").
    expect(container.textContent).not.toMatch(/\b(man|inc|stage|audit|card)_[a-z0-9_]+\b/);
    // Placeholders are always substituted.
    expect(container.textContent).not.toMatch(/\{[a-z]+\}/);
  });
});

describe('Add Income — rule explanations and messages are translated', () => {
  const ENGLISH_LEAK =
    /savings rule|equal-ratio|remaining|Monthly required|carried over|Collected|Surplus rule|Manual deposit|adjustment|top-up|Somoni\)|Working Cap\b|cards\)/i;

  it.each([
    ['ru', 'Правило накоплений 10% (500.00 TJS из 5000.00 TJS)', 'Месячная норма: 1000.00 TJS', 'TJS (Сомони)'],
    ['uz', "Jamg'arma qoidasi 10% (5000.00 TJS dan 500.00 TJS)", 'Oylik norma: 1000.00 TJS', 'TJS (Somoniy)'],
  ] as const)('%s: the split explanation (trace box and table) has no English left', async (lang, savingsText, cardText, currencyText) => {
    const { user } = renderIncomeView({ lang });
    await user.type(screen.getByRole('spinbutton', { name: /TJS/ }), '5000');

    const trace = screen.getByTestId('distribution-trace');
    const table = screen.getByRole('table');

    expect(trace.textContent).toContain(savingsText);
    expect(trace.textContent).toContain(currencyText);
    expect(table.textContent).toContain(savingsText);
    expect(table.textContent).toContain(cardText); // the card explanation: required / carried over / collected
    expect(trace.textContent).not.toMatch(ENGLISH_LEAK);
    expect(table.textContent).not.toMatch(ENGLISH_LEAK);
  });

  it('English is unchanged: the same sentences as before, including the card explanation', async () => {
    const { user } = renderIncomeView({ lang: 'en' });
    await user.type(screen.getByLabelText(/Gross Income Amount/i), '5000');

    const table = within(screen.getByRole('table'));
    expect(table.getByText('10% savings rule (500.00 TJS of 5000.00 TJS)')).toBeTruthy();
    expect(
      table.getAllByText(/^100% of remaining monthly need \(1000\.00 TJS\) — Monthly required: 1000\.00 TJS$/)
    ).toHaveLength(2); // Fuel for Car and Wife's Expense
  });

  it('the success banner after an automatic split is translated', async () => {
    const { user, onCommitIncome } = renderIncomeView({ lang: 'ru' });
    await user.type(screen.getByRole('spinbutton', { name: /TJS/ }), '5000');
    await user.type(screen.getByRole('textbox', { name: /Источник дохода/ }), 'Зарплата');
    await user.click(screen.getByRole('button', { name: /Подтвердить и распределить/ }));

    await waitFor(() => expect(onCommitIncome).toHaveBeenCalledTimes(1));
    const banner = (await screen.findByRole('status')).textContent;
    expect(banner).toBe('+5000.00 TJS (карт: 4, +1000.00 TJS в оборотный капитал)');
  });

  it('a failed save shows a translated message (not the English fallback)', async () => {
    const { user, onCommitIncome } = renderIncomeView({ lang: 'ru' });
    onCommitIncome.mockRejectedValueOnce('network down'); // not an Error object -> generic message
    await user.type(screen.getByRole('spinbutton', { name: /TJS/ }), '1000');
    await user.type(screen.getByRole('textbox', { name: /Источник дохода/ }), 'Бонус');
    await user.click(screen.getByRole('button', { name: /Подтвердить и распределить/ }));

    expect((await screen.findAllByRole('alert'))[0].textContent).toBe('Не удалось сохранить доход.');
  });

  it('a typed error from the service is worded in the active language, with its numbers', async () => {
    const { user, onCommitIncome } = renderIncomeView({ lang: 'ru' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    onCommitIncome.mockRejectedValueOnce(
      new AppError('MANUAL_EXCEEDS_INCOME', 'Manual deposits (800.00 TJS) exceed the income amount (500.00 TJS).', {
        manual: '800.00',
        income: '500.00',
      })
    );
    await user.type(screen.getByRole('spinbutton', { name: /TJS/ }), '500');
    await user.type(screen.getByRole('textbox', { name: /Источник дохода/ }), 'Бонус');
    await user.click(screen.getByRole('button', { name: /Подтвердить и распределить/ }));

    expect((await screen.findAllByRole('alert'))[0].textContent).toBe(
      'Ручные суммы (800.00 TJS) больше суммы дохода (500.00 TJS).'
    );
    vi.restoreAllMocks();
  });

  it('an unknown error shows the generic message, not the raw English text', async () => {
    const { user, onCommitIncome } = renderIncomeView({ lang: 'uz' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    onCommitIncome.mockRejectedValueOnce(new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.'));
    await user.type(screen.getByRole('spinbutton', { name: /TJS/ }), '500');
    await user.type(screen.getByRole('textbox', { name: /Daromad manbai|manba/i }), 'Bonus');
    await user.click(screen.getByRole('button', { name: /taqsimla|tasdiqla/i }));

    const alert = (await screen.findAllByRole('alert'))[0].textContent;
    expect(alert).toBe("Daromadni saqlab bo'lmadi.");
    expect(alert).not.toContain('PERMISSION_DENIED');
    vi.restoreAllMocks();
  });
});
