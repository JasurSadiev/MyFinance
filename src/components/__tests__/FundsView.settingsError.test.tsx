// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FundsView } from '../FundsView';
import { LanguageProvider, translations } from '../../i18n/LanguageContext';
import type { AllocationSettings } from '../../types/finance';

const settings: AllocationSettings = {
  surplusStrategy: 'unallocated',
  surplusRules: [],
  currentCycleMonth: '2026-10',
  defaultAccountId: '',
};

function renderFunds(lang: 'en' | 'ru' | 'uz', onUpdateSettings: () => Promise<void>) {
  localStorage.setItem('myfinance_lang', lang);
  return render(
    <LanguageProvider>
      <FundsView
        funds={[]}
        accounts={[]}
        expenses={[]}
        settings={settings}
        onSaveFund={vi.fn()}
        onDeleteFund={vi.fn()}
        onUpdateSettings={onUpdateSettings}
        onSpendFromCard={vi.fn()}
        onRolloverMonth={vi.fn()}
      />
    </LanguageProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Cards — saving the Working Capital rule', () => {
  it.each(['en', 'ru', 'uz'] as const)('%s: a failed save is reported in that language, not swallowed', async (lang) => {
    const failing = vi.fn().mockRejectedValue(new Error('RAW: socket hang up'));
    renderFunds(lang, failing);

    await userEvent.setup().click(screen.getByRole('button', { name: translations[lang].funds_save_overflow_btn }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(translations[lang].err_settings_save_failed);
    expect(alert.textContent).not.toContain('RAW');
    // and the success message is not shown for a save that did not happen
    expect(screen.queryByText(translations[lang].funds_msg_wc_saved)).toBeNull();
  });

  it('a successful save shows the confirmation and no error', async () => {
    renderFunds('en', vi.fn().mockResolvedValue(undefined));

    await userEvent.setup().click(screen.getByRole('button', { name: translations.en.funds_save_overflow_btn }));

    expect(await screen.findByText(translations.en.funds_msg_wc_saved)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('after a failure, a retry that works clears the error', async () => {
    const onUpdateSettings = vi.fn().mockRejectedValueOnce(new Error('flaky')).mockResolvedValueOnce(undefined);
    renderFunds('en', onUpdateSettings);
    const user = userEvent.setup();
    const save = () => screen.getByRole('button', { name: translations.en.funds_save_overflow_btn });

    await user.click(save());
    expect(await screen.findByRole('alert')).toBeTruthy();

    await user.click(save());
    expect(await screen.findByText(translations.en.funds_msg_wc_saved)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
