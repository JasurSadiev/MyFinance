// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FundsView } from '../FundsView';
import { LanguageProvider, translations } from '../../i18n/LanguageContext';
import { AppError } from '../../types/errors';
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

const card = (o: Partial<Fund> & Pick<Fund, 'id' | 'name' | 'category'>): Fund => ({
  type: 'monthly', targetAmount: 1000, monthlyAmount: 1000, reservedAmount: 0, cycleStartBalance: 0,
  cycleAllocated: 0, cycleSpent: 0, priority: 1, isActive: true, color: '#10b981', ...o,
});

function renderFunds(lang: 'en' | 'ru' | 'uz', funds: Fund[] = []) {
  localStorage.setItem('myfinance_lang', lang);
  const onSaveFund = vi.fn().mockResolvedValue(undefined);
  const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <LanguageProvider>
      <FundsView
        funds={funds}
        accounts={accounts}
        expenses={[]}
        settings={settings}
        onSaveFund={onSaveFund}
        onDeleteFund={vi.fn().mockResolvedValue(undefined)}
        onUpdateSettings={onUpdateSettings}
        onSpendFromCard={vi.fn()}
        onRolloverMonth={vi.fn().mockResolvedValue(undefined)}
      />
    </LanguageProvider>
  );
  const form = utils.container.querySelector('form') as HTMLFormElement;
  const inputs = () => Array.from(form.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
  return {
    ...utils,
    onSaveFund,
    onUpdateSettings,
    form,
    nameInput: () => inputs()[0],
    categoryInput: () => inputs()[1],
    submit: () => form.querySelector('button[type="submit"]') as HTMLButtonElement,
    user: userEvent.setup(),
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('Cards — one-tap templates', () => {
  it('English labels are exactly what they were before translation was added', () => {
    renderFunds('en');
    for (const label of [
      '🏦 Savings (10%)',
      '⛽ Fuel for Car (1,000 TJS)',
      "💝 Wife's Expense (1,500 TJS)",
      '🍽️ Food & Meals (2,500 TJS)',
      '🎬 Entertainment (600 TJS)',
      '🛡️ Annual Bill (Sinking)',
    ]) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
  });

  it('Russian and Uzbek users see templates in their language', () => {
    renderFunds('ru');
    for (const label of [
      '🏦 Накопления (10%)',
      '⛽ Топливо для авто (1,000 TJS)',
      '💝 Расходы жены (1,500 TJS)',
      '🍽️ Питание (2,500 TJS)',
      '🎬 Развлечения (600 TJS)',
      '🛡️ Годовой платёж (цель)',
    ]) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
    expect(screen.queryByText(/Fuel for Car|Savings \(10%\)|Annual Bill/)).toBeNull();

    cleanup();
    renderFunds('uz');
    expect(screen.getByText("⛽ Avto yoqilg'i (1,000 TJS)")).toBeTruthy();
    expect(screen.getByText("🏦 Jamg'arma (10%)")).toBeTruthy();
    expect(screen.queryByText(/Fuel for Car/)).toBeNull();
  });

  it('a template fills the form in the active language; the category stays on its default and is saved in canonical form', async () => {
    const { user, nameInput, categoryInput, submit, onSaveFund } = renderFunds('ru');
    await user.click(screen.getByText('⛽ Топливо для авто (1,000 TJS)'));

    expect(nameInput().value).toBe('Топливо для авто');
    expect(categoryInput().value).toBe(''); // empty = "the default for this card type"
    expect(categoryInput().placeholder).toBe('Расходный счёт'); // ...shown in the active language

    await user.click(submit());
    expect(onSaveFund).toHaveBeenCalledTimes(1);
    expect(onSaveFund).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Топливо для авто',
        type: 'monthly',
        category: 'Spending Account', // stored in the canonical form, translated on screen
        targetAmount: 1000,
      })
    );
    expect((await screen.findByRole('status')).textContent).toBe('Карта «Топливо для авто» выпущена (1000 TJS)!');
  });

  it('a savings template saves a percentage card with the Savings category', async () => {
    const { user, categoryInput, submit, onSaveFund } = renderFunds('ru');
    await user.click(screen.getByText('🏦 Накопления (10%)'));
    expect(categoryInput().placeholder).toBe('Накопления (траты откл.)');

    await user.click(submit());
    expect(onSaveFund).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Накопительный счёт', type: 'percentage', percentage: 10, category: 'Savings (Spend Off)' })
    );
    expect((await screen.findByRole('status')).textContent).toBe('Карта «Накопительный счёт» выпущена (10%)!');
  });

  it('the default category follows the card type, and a category the user types is kept as typed', async () => {
    const { user, form, categoryInput, submit, onSaveFund } = renderFunds('uz');
    await user.click(screen.getByText("⛽ Avto yoqilg'i (1,000 TJS)"));
    expect(categoryInput().placeholder).toBe('Xarajat hisobi');

    await user.selectOptions(form.querySelector('select') as HTMLSelectElement, 'percentage');
    expect(categoryInput().placeholder).toBe("Jamg'arma (xarajat o'chiq)");

    await user.selectOptions(form.querySelector('select') as HTMLSelectElement, 'monthly');
    await user.type(categoryInput(), 'Avto');
    await user.click(submit());
    expect(onSaveFund).toHaveBeenCalledWith(expect.objectContaining({ category: 'Avto' }));
  });

  it('card colours have names in the active language', () => {
    renderFunds('ru');
    for (const name of ['Изумрудный', 'Янтарный', 'Розовый', 'Бирюзовый', 'Фиолетовый', 'Сапфировый']) {
      expect(screen.getByTitle(name), name).toBeTruthy();
    }
    cleanup();
    renderFunds('uz');
    expect(screen.getByTitle('Zumrad')).toBeTruthy();
    cleanup();
    renderFunds('en');
    expect(screen.getByTitle('Emerald')).toBeTruthy();
    expect(screen.getByTitle('Sapphire Blue')).toBeTruthy();
  });
});

describe('Cards — existing cards', () => {
  const fuel = card({ id: 'fuel', name: 'Fuel for Car', category: 'Spending Account' });
  const gym = card({ id: 'gym', name: 'Gym', category: 'Health', priority: 2 });

  it('shows the card category in the active language; text the user typed is left alone', () => {
    renderFunds('ru', [fuel, gym]);
    expect(screen.getByText('Расходный счёт')).toBeTruthy();
    expect(screen.getByText('Health')).toBeTruthy();
    expect(screen.queryByText('Spending Account')).toBeNull();
  });

  it('editing: a default category opens as "default" (empty), a typed one opens as typed; saving keeps both', async () => {
    const { user, nameInput, categoryInput, submit, onSaveFund } = renderFunds('ru', [fuel, gym]);
    const editButtons = screen.getAllByText(translations.ru.card_edit);

    await user.click(editButtons[0]);
    expect(nameInput().value).toBe('Fuel for Car');
    expect(categoryInput().value).toBe('');
    expect(categoryInput().placeholder).toBe('Расходный счёт');
    await user.click(submit());
    expect(onSaveFund).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'fuel', category: 'Spending Account' }));
    expect((await screen.findByRole('status')).textContent).toBe('Карта «Fuel for Car» обновлена.');

    await user.click(editButtons[1]);
    expect(nameInput().value).toBe('Gym');
    expect(categoryInput().value).toBe('Health');
    await user.click(submit());
    expect(onSaveFund).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'gym', category: 'Health' }));
  });
});

describe('Cards — messages', () => {
  it('a rejected save explains itself in the active language (typed errors), never with raw library text', async () => {
    const { user, submit, onSaveFund } = renderFunds('ru');
    await user.click(screen.getByText('🏦 Накопления (10%)'));

    vi.spyOn(console, 'error').mockImplementation(() => {});
    onSaveFund.mockRejectedValueOnce(new AppError('FUND_PERCENT_RANGE', 'Savings percentage must be between 0.01 and 100.'));
    await user.click(submit());
    expect((await screen.findByRole('alert')).textContent).toBe('Процент накоплений должен быть от 0.01 до 100.');

    onSaveFund.mockRejectedValueOnce(new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.'));
    await user.click(submit());
    expect((await screen.findByRole('alert')).textContent).toBe('Не удалось сохранить карту.');
    vi.restoreAllMocks();
  });

  it('saving the Working Capital rules confirms in the active language', async () => {
    const { user, onUpdateSettings } = renderFunds('ru');
    await user.click(screen.getByText(translations.ru.funds_save_overflow_btn));
    expect(onUpdateSettings).toHaveBeenCalled();
    expect(await screen.findByText('Правила оборотного капитала и излишка сохранены!')).toBeTruthy();
  });
});
