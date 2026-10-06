import React from 'react';
import { Fund } from '../types/finance';
import { calculateFundMonthlyNeed, roundCents } from '../engine/allocationEngine';
import {
  CreditCard,
  Wifi,
  ArrowUpRight,
  ArrowDownLeft,
  Edit3,
  Trash2,
  CheckCircle2,
  Sparkles,
  Calendar,
  Lock,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { displayLabel } from '../i18n/labels';

interface AccountCardProps {
  fund?: Fund;
  isWorkingCapital?: boolean;
  workingCapitalBalance?: number;
  workingCapitalMonthlyDeposit?: number;
  workingCapitalMonthlySpent?: number;
  monthlyExpensesFromLedger?: number;
  referenceDate?: string;
  onSpendFromCard: (cardId: string, cardName: string) => void;
  onEditCard?: (fund: Fund) => void;
  onDeleteCard?: (fund: Fund) => void;
}

const CARD_THEMES: Record<string, { bg: string; glow: string; bar: string }> = {
  '#10b981': {
    bg: 'from-[#052E1C] via-[#063F26] to-[#021C11] border-emerald-500/30',
    glow: '#00E56B',
    bar: 'bg-[#00E56B]',
  },
  '#f59e0b': {
    bg: 'from-[#2E1B05] via-[#3D2508] to-[#170E02] border-amber-500/30',
    glow: '#F59E0B',
    bar: 'bg-amber-400',
  },
  '#ec4899': {
    bg: 'from-[#330A21] via-[#4A1131] to-[#1C0512] border-pink-500/30',
    glow: '#F472B6',
    bar: 'bg-pink-400',
  },
  '#06b6d4': {
    bg: 'from-[#082A38] via-[#0C3B4E] to-[#041821] border-cyan-500/30',
    glow: '#22D3EE',
    bar: 'bg-cyan-400',
  },
  '#8b5cf6': {
    bg: 'from-[#1E103D] via-[#2C1857] to-[#0F0721] border-violet-500/30',
    glow: '#A78BFA',
    bar: 'bg-violet-400',
  },
  '#3b82f6': {
    bg: 'from-[#0B1D3D] via-[#122B59] to-[#061024] border-blue-500/30',
    glow: '#60A5FA',
    bar: 'bg-blue-400',
  },
};

export const AccountCard: React.FC<AccountCardProps> = ({
  fund,
  isWorkingCapital = false,
  workingCapitalBalance = 0,
  workingCapitalMonthlyDeposit = 0,
  workingCapitalMonthlySpent = 0,
  monthlyExpensesFromLedger,
  referenceDate,
  onSpendFromCard,
  onEditCard,
  onDeleteCard,
}) => {
  const { t } = useLanguage();

  // Render Working Capital Special Card
  if (isWorkingCapital) {
    return (
      <div className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#090D16] p-6 text-white shadow-[0_16px_36px_-10px_rgba(15,23,42,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-12px_rgba(15,23,42,0.45)]">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#00B956]/25 blur-3xl transition-opacity group-hover:opacity-100" />
        <div className="pointer-events-none absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-amber-400/15 blur-3xl" />

        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-10 items-center justify-center rounded-md border border-amber-200/40 bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600 shadow-inner">
                <div className="h-4 w-6 rounded-[2px] border border-amber-950/30" />
              </div>
              <Wifi className="h-4 w-4 rotate-90 text-slate-300/70" />
              <span className="font-extrabold tracking-tight text-sm text-white/90">
                My<span className="text-[#00E56B]">Finance</span>
              </span>
            </div>

            <span className="inline-flex items-center gap-1 rounded-2xl text-center leading-snug bg-amber-400/15 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300 border border-amber-400/30">
              <Sparkles className="h-3 w-3" />
              {t('card_working_capital_badge')}
            </span>
          </div>

          <div className="mt-5">
            <div className="text-[11px] font-medium uppercase tracking-widest text-slate-400">
              {t('card_overflow_subtitle')}
            </div>
            <h3 className="mt-0.5 text-lg font-bold tracking-tight text-white">
              {t('card_working_capital_title')}
            </h3>

            <div className="mt-3.5 flex items-baseline justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  {t('card_available_balance')}
                </div>
                <div className="mt-0.5 font-mono text-2xl font-extrabold tracking-tight text-white">
                  {workingCapitalBalance.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  <span className="text-sm font-bold text-[#00E56B]">TJS</span>
                </div>
              </div>
              <div className="text-right font-mono text-xs tracking-widest text-slate-400">
                •••• WORK
              </div>
            </div>
          </div>

          {/* Monthly Deposit & Monthly Expenses Telemetry Box */}
          <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] p-3 backdrop-blur-md font-mono text-xs">
            <div>
              <div className="flex items-center gap-1 text-[10px] font-sans font-medium uppercase tracking-wider text-slate-300">
                <ArrowDownLeft className="h-3 w-3 text-[#00E56B]" />
                {t('card_monthly_deposit')}
              </div>
              <div className="mt-1 font-bold text-[#00E56B]">
                +{workingCapitalMonthlyDeposit.toFixed(2)} TJS
              </div>
            </div>
            <div className="border-l border-white/10 pl-3">
              <div className="flex items-center gap-1 text-[10px] font-sans font-medium uppercase tracking-wider text-slate-300">
                <ArrowUpRight className="h-3 w-3 text-rose-400" />
                {t('card_monthly_expenses')}
              </div>
              <div className="mt-1 font-bold text-rose-300">
                -{workingCapitalMonthlySpent.toFixed(2)} TJS
              </div>
            </div>
          </div>
        </div>

        {/* Rule Description & Footer */}
        <div className="mt-4 border-t border-white/10 pt-3.5">
          <p className="text-[11px] leading-relaxed text-slate-300/90">
            {t('card_wc_desc')}
          </p>

          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              SOMONI • TJS
            </span>
            <button
              type="button"
              onClick={() => onSpendFromCard('working-capital', t('card_working_capital_badge'))}
              className="ml-auto inline-flex max-w-full items-center gap-1.5 rounded-xl bg-[#00B956] px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-[#00B956]/30 hover:bg-[#00CE60] transition"
            >
              <ArrowUpRight className="h-3.5 w-3.5 stroke-[2.5]" />
              {t('card_spend_btn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!fund) return null;

  const todayStr = referenceDate || new Date().toISOString().slice(0, 10);
  const calc = calculateFundMonthlyNeed(fund, todayStr);
  const theme = CARD_THEMES[fund.color || '#06b6d4'] || CARD_THEMES['#06b6d4'];

  const isSavings = fund.type === 'percentage';
  const monthlyDeposit = roundCents(fund.cycleAllocated ?? 0);
  const monthlyExpenses = roundCents(
    monthlyExpensesFromLedger !== undefined
      ? monthlyExpensesFromLedger
      : fund.cycleSpent ?? 0
  );

  const totalCollectedPlusCarryover = roundCents(
    calc.carryoverFromPrevMonth + calc.alreadyAllocatedThisCycle
  );
  const targetForBar = isSavings ? fund.targetAmount : calc.monthlyRequired;
  const progressForBar = isSavings ? fund.reservedAmount : totalCollectedPlusCarryover;
  const fundedPct =
    targetForBar > 0
      ? Math.min(100, Math.round((progressForBar / targetForBar) * 100))
      : 100;

  const isMonthlyRequirementMet =
    !isSavings && calc.remainingNeed === 0 && calc.monthlyRequired > 0;
  const shortCardCode = fund.id.slice(-4).toUpperCase();

  return (
    <div
      className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-gradient-to-br p-6 text-white shadow-[0_16px_36px_-10px_rgba(15,23,42,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-12px_rgba(15,23,42,0.4)] ${theme.bg}`}
    >
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-25 blur-3xl transition-opacity group-hover:opacity-40"
        style={{ backgroundColor: theme.glow }}
      />

      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-10 items-center justify-center rounded-md border border-white/30 bg-gradient-to-br from-slate-100 via-slate-300 to-slate-400 shadow-inner">
              <div className="h-4 w-6 rounded-[2px] border border-slate-700/30" />
            </div>
            <Wifi className="h-4 w-4 rotate-90 text-white/60" />
            <span className="font-extrabold tracking-tight text-sm text-white/90">
              My<span className="text-[#00E56B]">Finance</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isSavings ? (
              <span className="rounded-2xl text-center leading-snug bg-[#00E56B]/20 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#00E56B] border border-[#00E56B]/30">
                {t('card_savings_badge')} • {fund.percentage}% {t('card_every_income')}
              </span>
            ) : isMonthlyRequirementMet ? (
              <span className="inline-flex items-center gap-1 rounded-2xl text-center leading-snug bg-[#00E56B]/20 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#00E56B] border border-[#00E56B]/30">
                <CheckCircle2 className="h-3 w-3" />
                {t('card_month_cap_collected')}
              </span>
            ) : (
              <span className="rounded-2xl text-center leading-snug bg-white/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-white/90 border border-white/15">
                {fund.type === 'sinking' ? t('card_sinking_card') : t('card_spending_card')}
              </span>
            )}
          </div>
        </div>

        {/* Account Name & Balance */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-widest text-white/60">
              {displayLabel(fund.category, t)}
            </span>
            {fund.targetDate && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-amber-200">
                <Calendar className="h-3 w-3" />
                {t('card_due')} {fund.targetDate} ({calc.monthsRemaining}m)
              </span>
            )}
          </div>
          <h3 className="mt-0.5 text-lg font-bold tracking-tight text-white">
            {fund.name}
          </h3>

          <div className="mt-3.5 flex items-baseline justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/60">
                {isSavings ? t('card_total_savings_balance') : t('card_available_card_balance')}
              </div>
              <div className="mt-0.5 font-mono text-2xl font-extrabold tracking-tight text-white">
                {fund.reservedAmount.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                <span className="text-sm font-bold text-white/80">TJS</span>
              </div>
            </div>
            <div className="text-right font-mono text-xs tracking-widest text-white/60">
              •••• {shortCardCode}
            </div>
          </div>
        </div>

        {/* Monthly Deposit & Monthly Expenses Telemetry Box */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl border border-white/10 bg-black/25 p-3 backdrop-blur-md font-mono text-xs">
          <div>
            <div className="flex items-center gap-1 text-[10px] font-sans font-medium uppercase tracking-wider text-white/70">
              <ArrowDownLeft className="h-3 w-3 text-[#00E56B]" />
              {t('card_monthly_deposit')}
            </div>
            <div className="mt-1 font-bold text-[#00E56B]">
              +{monthlyDeposit.toFixed(2)} TJS
            </div>
          </div>
          <div className="border-l border-white/10 pl-3">
            <div className="flex items-center gap-1 text-[10px] font-sans font-medium uppercase tracking-wider text-white/70">
              <ArrowUpRight className="h-3 w-3 text-rose-400" />
              {t('card_monthly_expenses')}
            </div>
            <div className="mt-1 font-bold text-rose-300">
              {isSavings
                ? `0.00 TJS (${t('card_off')})`
                : `-${monthlyExpenses.toFixed(2)} TJS`}
            </div>
          </div>
        </div>

        {/* Monthly Requirement & Carryover Progress Bar */}
        <div className="mt-4">
          {isSavings ? (
            <div>
              <div className="mb-1.5 flex justify-between text-[11px] text-white/80">
                <span>
                  {t('card_charged_pct_every_income', { pct: fund.percentage ?? 0 })}
                </span>
                {fund.targetAmount > 0 && (
                  <span className="font-mono">
                    {t('card_goal')}: {fund.targetAmount.toLocaleString()} TJS ({fundedPct}%)
                  </span>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-[#00E56B] transition-all duration-500"
                  style={{ width: `${fund.targetAmount > 0 ? fundedPct : 100}%` }}
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-1.5 flex flex-wrap justify-between gap-1 text-[11px] text-white/85">
                <span>
                  {t('card_monthly_req')}: <strong>{calc.monthlyRequired.toFixed(0)} TJS</strong>
                  {calc.carryoverFromPrevMonth > 0 && (
                    <span className="text-[#00E56B]">
                      {' '}
                      • {t('card_carryover')}: {calc.carryoverFromPrevMonth.toFixed(0)} TJS
                    </span>
                  )}
                </span>
                <span className="font-mono text-amber-300">
                  {calc.remainingNeed > 0
                    ? t('card_left_to_collect', { amount: calc.remainingNeed.toFixed(2) })
                    : t('card_full_zero_next')}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${theme.bar}`}
                  style={{ width: `${fundedPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/10 pt-3.5">
        <div className="flex items-center gap-1.5">
          {onEditCard && (
            <button
              type="button"
              onClick={() => onEditCard(fund)}
              className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20 transition"
            >
              <Edit3 className="h-3 w-3" />
              {t('card_edit')}
            </button>
          )}
          {onDeleteCard && (
            <button
              type="button"
              onClick={() => onDeleteCard(fund)}
              aria-label={t('card_delete')}
              title={t('card_delete')}
              className="inline-flex items-center rounded-xl bg-white/10 p-1.5 text-white/70 hover:bg-rose-500/30 hover:text-rose-200 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {isSavings ? (
          <span className="ml-auto inline-flex max-w-full items-center gap-1.5 rounded-xl border border-[#00E56B]/30 bg-black/30 px-3 py-1.5 text-[11px] font-semibold text-[#00E56B]">
            <Lock className="h-3 w-3" />
            {t('card_spend_off_savings')}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onSpendFromCard(fund.id, fund.name)}
            className="ml-auto inline-flex max-w-full items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-slate-900 shadow-sm hover:bg-slate-100 transition"
          >
            <CreditCard className="h-3.5 w-3.5 text-slate-900" />
            {t('card_spend_btn')}
          </button>
        )}
      </div>
    </div>
  );
};
