// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditLedgerView } from '../AuditLedgerView';
import { LanguageProvider, LanguageSwitcher } from '../../i18n/LanguageContext';
import type { AuditLogEntry } from '../../types/finance';

const LOCAL_TIME = new Date(2026, 9, 5, 15, 20, 11).toISOString(); // 5 Oct 2026 15:20 local

const log = (o: Partial<AuditLogEntry> & Pick<AuditLogEntry, 'id' | 'action' | 'summary'>): AuditLogEntry => ({
  entityType: 'income',
  entityId: 'inc-1759650000000-ab12',
  details: {},
  timestamp: LOCAL_TIME,
  ...o,
});

const auditLogs: AuditLogEntry[] = [
  log({
    id: 'l1',
    action: 'INCOME_ADDED',
    summary: 'Added income 2000.00 TJS from "Freelance project" (cards funded: 2, deposited manually: 2000.00 TJS)',
    details: { amount: 2000, source: 'Freelance project', manualDepositTotal: 2000, workingCapitalAdded: 0, allocations: [{}, {}] },
  }),
  log({
    id: 'l2',
    action: 'EXPENSE_ADDED',
    entityType: 'expense',
    entityId: 'exp-1',
    summary: 'Spent 50.00 TJS (Working Capital) from "Working Capital" card',
    details: { amount: 50, category: 'Working Capital', fundName: 'Working Capital' },
  }),
  log({
    id: 'l3',
    action: 'CYCLE_RESET',
    entityType: 'system',
    entityId: '2026-11',
    summary: 'Rolled over to new month (2026-11): carried over remaining account balances; only remaining needed amounts will be topped up',
    details: { newCycleMonth: '2026-11' },
  }),
  log({ id: 'l4', action: 'SOMETHING_NEW' as never, entityType: 'system', summary: 'A future kind of event', details: {} }),
];

function renderTrail(lang: 'en' | 'ru' | 'uz', logs: AuditLogEntry[] = auditLogs) {
  localStorage.setItem('myfinance_lang', lang);
  const utils = render(
    <LanguageProvider>
      <LanguageSwitcher />
      <AuditLedgerView
        incomes={[]}
        expenses={[]}
        allocations={[]}
        auditLogs={logs}
        onUndoIncome={vi.fn().mockResolvedValue(undefined)}
        onUndoExpense={vi.fn().mockResolvedValue(undefined)}
      />
    </LanguageProvider>
  );
  return { ...utils, user: userEvent.setup() };
}

const openTrail = async (user: ReturnType<typeof userEvent.setup>, label: RegExp) =>
  user.click(screen.getByText(label));

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('History → Audit Trail tab', () => {
  it('Russian: translated event names and sentences, never raw codes or English templates', async () => {
    const { user, container } = renderTrail('ru');
    await openTrail(user, /Журнал событий \(4\)/);

    expect(screen.getByText('Доход добавлен')).toBeTruthy();
    expect(
      screen.getByText('Добавлен доход 2000.00 TJS от «Freelance project» (пополнено карт: 2, внесено вручную: 2000.00 TJS)')
    ).toBeTruthy();
    expect(screen.getByText('Расход 50.00 TJS (Оборотный капитал) с карты «Оборотный капитал»')).toBeTruthy();
    expect(
      screen.getByText('Начался новый месяц (2026-11): остатки на картах перенесены, пополняться будут только недостающие суммы')
    ).toBeTruthy();

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/INCOME_ADDED|EXPENSE_ADDED|CYCLE_RESET/);
    expect(text).not.toMatch(/Added income|Spent 50|Rolled over/);
  });

  it('Uzbek: translated event names and sentences', async () => {
    const { user, container } = renderTrail('uz');
    await openTrail(user, /Tizim tarixi \(4\)/);

    expect(screen.getByText("Daromad qo'shildi")).toBeTruthy();
    expect(
      screen.getByText('Daromad qo\'shildi: 2000.00 TJS, manba: "Freelance project" (to\'ldirilgan kartalar: 2, qo\'lda kiritilgan: 2000.00 TJS)')
    ).toBeTruthy();
    expect(screen.getByText("Xarajat: 50.00 TJS (Aylanma mablag‘), \"Aylanma mablag‘\" kartasidan")).toBeTruthy();
    expect(container.textContent).not.toMatch(/INCOME_ADDED|Added income|Spent 50/);
  });

  it('English: friendly event names and the English sentence', async () => {
    const { user, container } = renderTrail('en');
    await openTrail(user, /Audit Trail \(4\)/);

    expect(screen.getByText('Income added')).toBeTruthy();
    expect(screen.getByText(auditLogs[0].summary)).toBeTruthy();
    expect(container.textContent).not.toMatch(/INCOME_ADDED/);
  });

  it('an event type it has no wording for still shows, using its stored sentence and code', async () => {
    const { user } = renderTrail('ru');
    await openTrail(user, /Журнал событий \(4\)/);
    expect(screen.getByText('A future kind of event')).toBeTruthy();
    expect(screen.getByText('SOMETHING_NEW')).toBeTruthy();
  });

  it('switching language while the tab is open re-words the whole history, including old entries', async () => {
    const { user } = renderTrail('ru');
    await openTrail(user, /Журнал событий \(4\)/);
    expect(screen.getByText('Доход добавлен')).toBeTruthy();

    await user.click(screen.getByText('UZ'));
    expect(screen.getByText("Daromad qo'shildi")).toBeTruthy();
    expect(screen.queryByText('Доход добавлен')).toBeNull();

    await user.click(screen.getByText('EN'));
    expect(screen.getByText('Income added')).toBeTruthy();
  });

  it('shows the time as YYYY-MM-DD HH:mm in every language (not a locale-dependent format)', async () => {
    for (const [lang, label] of [['ru', /Журнал событий \(4\)/], ['uz', /Tizim tarixi \(4\)/], ['en', /Audit Trail \(4\)/]] as const) {
      cleanup();
      const { user } = renderTrail(lang);
      await openTrail(user, label);
      expect(screen.getAllByText('2026-10-05 15:20').length).toBe(4);
    }
  });

  it('shows the translated empty state', async () => {
    const { user } = renderTrail('ru', []);
    await openTrail(user, /Журнал событий \(0\)/);
    expect(screen.getByText('Событий в журнале пока нет.')).toBeTruthy();
  });
});
