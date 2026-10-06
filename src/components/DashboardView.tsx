import React, { useState } from 'react';
import {
  Account,
  AllocationRecord,
  AllocationSettings,
  ExpenseTransaction,
  Fund,
  IncomeTransaction,
} from '../types/finance';
import { calculateFundMonthlyNeed, roundCents } from '../engine/allocationEngine';
import { AccountCard } from './AccountCard';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  PiggyBank,
  CalendarClock,
  TrendingUp,
  Undo2,
  Sparkles,
  Plus,
  CalendarCheck2,
  Receipt,
} from 'lucide-react';
import { NavTab } from './Navbar';
import { useLanguage } from '../i18n/LanguageContext';
import { displayLabel } from '../i18n/labels';

interface DashboardViewProps {
  accounts: Account[];
  funds: Fund[];
  incomes: IncomeTransaction[];
  expenses: ExpenseTransaction[];
  allocations: AllocationRecord[];
  settings: AllocationSettings;
  onNavigate: (tab: NavTab) => void;
  onSpendFromCard: (cardId: string, cardName: string) => void;
  onDeleteFund: (fund: Fund) => Promise<void>;
  onUndoIncome: (incomeId: string) => void;
  onUndoExpense: (expenseId: string) => void;
  onRolloverMonth: () => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  funds,
  incomes,
  expenses,
  allocations,
  settings,
  onNavigate,
  onSpendFromCard,
  onDeleteFund,
  onUndoIncome,
  onUndoExpense,
  onRolloverMonth,
}) => {
  const { t } = useLanguage();
  const [rollingOver, setRollingOver] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthPrefix = settings.currentCycleMonth || todayStr.slice(0, 7);

  const activeFunds = funds.filter((f) => f.isActive);
  const savingsCards = activeFunds.filter((f) => f.type === 'percentage');
  const goalAccountCards = activeFunds.filter((f) => f.type !== 'percentage');

  const workingCapitalBalance = roundCents(settings.workingCapitalBalance ?? 0);
  const totalSavingsReserved = roundCents(
    savingsCards.reduce((sum, f) => sum + f.reservedAmount, 0)
  );
  const totalGoalCardsReserved = roundCents(
    goalAccountCards.reduce((sum, f) => sum + f.reservedAmount, 0)
  );
  const totalAllCardsBalance = roundCents(
    totalSavingsReserved + totalGoalCardsReserved + workingCapitalBalance
  );

  const needDetails = goalAccountCards.map((f) => ({
    fund: f,
    calc: calculateFundMonthlyNeed(f, todayStr),
  }));

  const totalCycleMonthlyRequired = roundCents(
    needDetails.reduce((s, d) => s + d.calc.monthlyRequired, 0)
  );
  const totalCycleRemainingNeed = roundCents(
    needDetails.reduce((s, d) => s + d.calc.remainingNeed, 0)
  );
  const totalCycleSatisfied = Math.max(
    0,
    roundCents(totalCycleMonthlyRequired - totalCycleRemainingNeed)
  );
  const cycleFundedPercent =
    totalCycleMonthlyRequired > 0
      ? Math.min(100, Math.round((totalCycleSatisfied / totalCycleMonthlyRequired) * 100))
      : 0;

  const activeIncomes = incomes.filter((i) => i.status === 'active');
  const activeExpenses = expenses.filter((e) => e.status === 'active');

  const getMonthlySpentForFund = (fund: Fund): number => {
    if (fund.cycleSpent !== undefined && fund.cycleSpent > 0) {
      return roundCents(fund.cycleSpent);
    }
    return roundCents(
      activeExpenses
        .filter((e) => e.fundId === fund.id && e.date.startsWith(currentMonthPrefix))
        .reduce((sum, e) => sum + e.amount, 0)
    );
  };

  const workingCapitalMonthlySpent =
    settings.workingCapitalCycleSpent !== undefined && settings.workingCapitalCycleSpent > 0
      ? roundCents(settings.workingCapitalCycleSpent)
      : roundCents(
          activeExpenses
            .filter(
              (e) => e.fundId === 'working-capital' && e.date.startsWith(currentMonthPrefix)
            )
            .reduce((sum, e) => sum + e.amount, 0)
        );

  const handleRolloverClick = async () => {
    setRollingOver(true);
    try {
      await onRolloverMonth();
    } finally {
      setRollingOver(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#00B956]/8 blur-3xl" />

        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-[#009947] border border-emerald-200/70">
              <Sparkles className="w-3.5 h-3.5 text-[#00B956]" />
              <span>
                {t('dash_billing_cycle')}: {currentMonthPrefix} • {t('dash_national_currency')}
              </span>
            </div>

            <div className="pt-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {t('dash_total_portfolio')}
              </div>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                  {totalAllCardsBalance.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="font-mono text-lg font-bold text-[#00B956]">TJS</span>
              </div>
            </div>

            <p className="max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-500">
              {t('dash_hero_desc')}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onNavigate('income')}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#00B956] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#00B956]/25 hover:bg-[#00A34B] transition"
            >
              <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
              {t('dash_add_income_btn')}
            </button>
            <button
              onClick={() => onNavigate('expenses')}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition"
            >
              <Receipt className="w-4 h-4" />
              {t('dash_pay_spend_btn')}
            </button>
            <button
              onClick={() => onNavigate('funds')}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              <Plus className="w-4 h-4 text-[#00B956]" />
              {t('dash_new_card_btn')}
            </button>
            <button
              onClick={handleRolloverClick}
              disabled={rollingOver}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs font-bold text-[#009947] hover:bg-emerald-100/80 disabled:opacity-50 transition"
            >
              <CalendarCheck2 className="w-4 h-4" />
              {rollingOver ? t('dash_rolling_over') : t('dash_new_month_btn')}
            </button>
          </div>
        </div>
      </div>

      {/* 4 Bento KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('dash_kpi_active_cards')}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono text-2xl font-extrabold text-slate-900">
            {totalAllCardsBalance.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            <span className="text-xs font-bold text-slate-400">TJS</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{t('dash_kpi_cards_count', { count: activeFunds.length })}</span>
            <span className="font-semibold text-slate-700">{t('cur_somoni')}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('dash_kpi_savings_vaults')}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-[#00B956]">
              <PiggyBank className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono text-2xl font-extrabold text-[#009947]">
            {totalSavingsReserved.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            <span className="text-xs font-bold">TJS</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>
              {t('dash_kpi_savings_sub', {
                pct: savingsCards.reduce((s, f) => s + (f.percentage ?? 0), 0),
              })}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('dash_kpi_monthly_cap')}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-extrabold text-slate-900">
              {cycleFundedPercent}%
            </span>
            <span className="font-mono text-xs text-slate-500">
              {t('dash_kpi_left', { amount: totalCycleRemainingNeed.toFixed(0) })}
            </span>
          </div>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#00B956] to-emerald-400 transition-all duration-500"
              style={{ width: `${cycleFundedPercent}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 via-white to-white p-5 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#009947]">
              {t('dash_kpi_working_cap')}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#00B956]/15 text-[#009947]">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono text-2xl font-extrabold text-slate-900">
            {workingCapitalBalance.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            <span className="text-xs font-bold text-[#009947]">TJS</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{t('dash_kpi_working_cap_sub')}</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  {t('dash_my_smart_cards')}
                </h2>
                <p className="text-xs text-slate-500">{t('dash_my_smart_cards_sub')}</p>
              </div>
              <button
                onClick={() => onNavigate('funds')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                <Plus className="w-4 h-4 stroke-[2.5] text-[#00E56B]" />
                {t('dash_create_card_btn')}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <AccountCard
                isWorkingCapital
                workingCapitalBalance={workingCapitalBalance}
                workingCapitalMonthlyDeposit={roundCents(
                  settings.workingCapitalCycleDeposited ?? 0
                )}
                workingCapitalMonthlySpent={workingCapitalMonthlySpent}
                onSpendFromCard={onSpendFromCard}
              />

              {activeFunds.map((fund) => (
                <AccountCard
                  key={fund.id}
                  fund={fund}
                  monthlyExpensesFromLedger={getMonthlySpentForFund(fund)}
                  referenceDate={todayStr}
                  onSpendFromCard={onSpendFromCard}
                  onEditCard={() => onNavigate('funds')}
                  onDeleteCard={onDeleteFund}
                />
              ))}
            </div>

            {activeFunds.length === 0 && (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-xs text-slate-500">
                {t('dash_empty_cards')}{' '}
                <button
                  onClick={() => onNavigate('funds')}
                  className="font-bold text-[#009947] hover:underline"
                >
                  {t('dash_empty_cards_cta')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right 4 Columns */}
        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-[#00B956]">
                <CalendarClock className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-900">
                {t('dash_tracker_title')}
              </h3>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{t('dash_tracker_sub')}</p>

            <div className="mt-4 space-y-3">
              {needDetails.map(({ fund, calc }) => (
                <div
                  key={fund.id}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs"
                >
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>{fund.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                        calc.remainingNeed === 0
                          ? 'bg-emerald-100 text-[#009947]'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {calc.remainingNeed === 0
                        ? t('dash_100_collected')
                        : `${calc.remainingNeed.toFixed(0)} TJS`}
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-xl bg-white p-2.5 border border-slate-200/60 font-mono text-[11px]">
                    <div>
                      <div className="font-sans text-[10px] text-slate-400">
                        {t('dash_req_mo')}
                      </div>
                      <div className="font-bold text-slate-800">
                        {calc.monthlyRequired.toFixed(0)} TJS
                      </div>
                    </div>
                    <div>
                      <div className="font-sans text-[10px] text-slate-400">
                        {t('card_carryover')}
                      </div>
                      <div className="font-bold text-cyan-600">
                        {calc.carryoverFromPrevMonth.toFixed(0)} TJS
                      </div>
                    </div>
                    <div>
                      <div className="font-sans text-[10px] text-slate-400">
                        {t('dash_deposited')}
                      </div>
                      <div className="font-bold text-[#009947]">
                        +{calc.alreadyAllocatedThisCycle.toFixed(0)} TJS
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {needDetails.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center text-xs text-slate-400">
                  {t('dash_tracker_empty')}
                </div>
              )}
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">
                {t('dash_recent_tx')}
              </h3>
              <button
                onClick={() => onNavigate('audit')}
                className="text-xs font-bold text-[#009947] hover:underline"
              >
                {t('dash_see_all')}
              </button>
            </div>

            <div className="space-y-2.5">
              {activeIncomes.slice(0, 3).map((inc) => {
                const incAllocs = allocations.filter((a) => a.incomeId === inc.id);
                return (
                  <div
                    key={inc.id}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-xs transition hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[#009947]">
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-bold text-slate-900">{inc.source}</span>
                      </div>
                      <span className="font-mono font-bold text-[#009947]">
                        +{inc.amount.toFixed(2)} TJS
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        {inc.date} • {t('dash_cards_funded', { count: incAllocs.length })}
                        {inc.unallocatedSurplus > 0
                          ? ` (+${inc.unallocatedSurplus.toFixed(0)} TJS)`
                          : ''}
                      </span>
                      <button
                        onClick={() => onUndoIncome(inc.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 border border-slate-200 transition"
                      >
                        <Undo2 className="w-3 h-3" />
                        {t('dash_undo')}
                      </button>
                    </div>
                  </div>
                );
              })}

              {activeExpenses.slice(0, 3).map((exp) => (
                <div
                  key={exp.id}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-xs transition hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-bold text-slate-900">{displayLabel(exp.description, t)}</span>
                    </div>
                    <span className="font-mono font-bold text-rose-600">
                      -{exp.amount.toFixed(2)} TJS
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {exp.date} • {t('dash_card_label')}:{' '}
                      <strong className="text-slate-700">{displayLabel(exp.fundName || exp.category, t)}</strong>
                    </span>
                    <button
                      onClick={() => onUndoExpense(exp.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 border border-slate-200 transition"
                    >
                      <Undo2 className="w-3 h-3" />
                      {t('dash_undo')}
                    </button>
                  </div>
                </div>
              ))}

              {activeIncomes.length === 0 && activeExpenses.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-xs text-slate-400">
                  {t('dash_no_tx')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
