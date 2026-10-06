import React, { useState, useMemo, useEffect } from 'react';
import {
  Account,
  AllocationDraftItem,
  AllocationSettings,
  Fund,
  ManualDepositInput,
  ManualRemainderMode,
  NewIncomeInput,
} from '../types/finance';
import {
  FundNeedCalculation,
  applyAllocationsToFunds,
  calculateFundMonthlyNeed,
  previewIncomeAllocation,
  previewIncomeWithManualDeposits,
  roundCents,
} from '../engine/allocationEngine';
import {
  ArrowDownLeft,
  CheckCircle2,
  Sliders,
  Sparkles,
  AlertTriangle,
  Info,
  Terminal,
  Loader2,
  HandCoins,
  Wand2,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { STAGE_LABEL_KEYS } from '../i18n/stageLabels';
import { describeAllocationRule } from '../i18n/ruleText';
import { describeError } from '../i18n/errorText';
import { displayLabel } from '../i18n/labels';
import { TEXT_LIMITS } from '../types/limits';

interface IncomeViewProps {
  accounts: Account[];
  funds: Fund[];
  settings: AllocationSettings;
  onCommitIncome: (payload: NewIncomeInput) => Promise<void>;
}

type SplitMode = 'auto' | 'manual';

export const IncomeView: React.FC<IncomeViewProps> = ({
  accounts,
  funds,
  settings,
  onCommitIncome,
}) => {
  const { t } = useLanguage();
  const [amountStr, setAmountStr] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<string>('');
  const [accountId, setAccountId] = useState<string>(
    settings.defaultAccountId || accounts[0]?.id || ''
  );
  const [notes, setNotes] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customOverrides, setCustomOverrides] = useState<Record<string, number>>({});
  const [splitMode, setSplitMode] = useState<SplitMode>('auto');
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});
  const [remainderMode, setRemainderMode] = useState<ManualRemainderMode>('auto_split');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  const parsedAmount = Number(amountStr);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;

  // ---------------------------------------------------------------------------
  // Auto-split preview (unchanged behaviour)
  // ---------------------------------------------------------------------------
  const preview = useMemo(() => {
    try {
      return previewIncomeAllocation(validAmount, funds, settings, date);
    } catch {
      return null;
    }
  }, [validAmount, funds, settings, date]);

  // ---------------------------------------------------------------------------
  // Manual deposit state: one optional amount per active card
  // ---------------------------------------------------------------------------
  const manualCards = useMemo(
    () =>
      funds
        .filter((f) => f.isActive)
        .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)),
    [funds]
  );

  const manualEntries = useMemo(
    () =>
      manualCards.map((fund) => {
        const raw = manualInputs[fund.id] ?? '';
        const parsed = raw.trim() === '' ? 0 : Number(raw);
        return {
          fund,
          raw,
          amount: Number.isFinite(parsed) ? roundCents(parsed) : NaN,
          calc: calculateFundMonthlyNeed(fund, date),
        };
      }),
    [manualCards, manualInputs, date]
  );

  const manualHasInvalid = manualEntries.some((e) => Number.isNaN(e.amount) || e.amount < 0);

  const manualDeposits: ManualDepositInput[] = useMemo(
    () =>
      manualEntries
        .filter((e) => e.amount > 0)
        .map((e) => ({ fundId: e.fund.id, amount: e.amount })),
    [manualEntries]
  );

  const manualTotal = roundCents(manualDeposits.reduce((s, d) => s + d.amount, 0));
  const manualLeft = roundCents(validAmount - manualTotal);
  const manualOver = validAmount > 0 && manualLeft < 0;

  const manualPreview = useMemo(() => {
    if (splitMode !== 'manual' || validAmount <= 0 || manualHasInvalid || manualOver) return null;
    try {
      return previewIncomeWithManualDeposits(
        validAmount,
        funds,
        manualDeposits,
        settings,
        date,
        remainderMode
      );
    } catch {
      return null;
    }
  }, [splitMode, validAmount, manualHasInvalid, manualOver, funds, manualDeposits, settings, date, remainderMode]);

  const activePreview = splitMode === 'manual' ? manualPreview : preview;

  // Cards that are already fully funded for the month (and so get 0 TJS from the auto-split part).
  // In manual mode this is evaluated AFTER the manual deposits, so a card the user just filled shows up here.
  const fundsForFullCheck = useMemo(
    () =>
      splitMode === 'manual' && manualPreview
        ? applyAllocationsToFunds(funds, manualPreview.manualAllocations)
        : funds,
    [splitMode, manualPreview, funds]
  );

  const alreadyFullSpendingAccounts = useMemo(() => {
    return fundsForFullCheck
      .filter((f) => f.isActive && f.type !== 'percentage')
      .map((f) => ({ fund: f, calc: calculateFundMonthlyNeed(f, date) }))
      .filter((x) => x.calc.remainingNeed === 0 && x.calc.monthlyRequired > 0);
  }, [fundsForFullCheck, date]);

  const effectiveAllocations: AllocationDraftItem[] = useMemo(() => {
    if (!activePreview) return [];
    if (splitMode === 'manual' || !isCustomMode) return activePreview.allocations;

    return activePreview.allocations.map((item, idx) => {
      const key = `${item.fundId}-${item.ruleStage}-${idx}`;
      if (customOverrides[key] !== undefined) {
        const overriddenAmt = roundCents(Math.max(0, customOverrides[key]));
        return {
          ...item,
          amount: overriddenAmt,
          ruleStage: 'manual_override',
          ruleUsed: `User manual adjustment (${overriddenAmt.toFixed(2)} TJS, auto was ${item.amount.toFixed(2)} TJS)`,
          ruleDetails: { autoAmount: item.amount },
        };
      }
      return item;
    });
  }, [activePreview, splitMode, isCustomMode, customOverrides]);

  const totalEffectiveAllocated = roundCents(
    effectiveAllocations.reduce((s, a) => s + a.amount, 0)
  );
  const effectiveWorkingCapital = Math.max(
    0,
    roundCents(validAmount - totalEffectiveAllocated)
  );

  const selectSplitMode = (mode: SplitMode) => {
    setSplitMode(mode);
    setErrorMsg(null);
    setSuccessBanner(null);
    if (mode === 'manual') {
      // Edited auto lines and manual deposits are two different ways of splitting; never mix them.
      setIsCustomMode(false);
      setCustomOverrides({});
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessBanner(null);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg(t('inc_err_amount'));
      return;
    }
    if (!source.trim()) {
      setErrorMsg(t('inc_err_source'));
      return;
    }
    if (splitMode === 'manual') {
      if (manualHasInvalid) {
        setErrorMsg(t('man_err_invalid'));
        return;
      }
      if (manualDeposits.length === 0) {
        setErrorMsg(t('man_err_none'));
        return;
      }
      if (manualOver) {
        setErrorMsg(t('man_err_over_income', { amount: Math.abs(manualLeft).toFixed(2) }));
        return;
      }
    }
    if (totalEffectiveAllocated > roundCents(parsedAmount)) {
      setErrorMsg(
        t('inc_err_adjusted_exceed', {
          total: totalEffectiveAllocated.toFixed(2),
          income: parsedAmount.toFixed(2),
        })
      );
      return;
    }

    setSubmitting(true);
    try {
      await onCommitIncome({
        amount: roundCents(parsedAmount),
        date,
        source: source.trim(),
        accountId,
        notes: notes.trim() || undefined,
        customAllocations: splitMode === 'auto' && isCustomMode ? effectiveAllocations : undefined,
        manualDeposits: splitMode === 'manual' ? manualDeposits : undefined,
        manualRemainderMode: splitMode === 'manual' ? remainderMode : undefined,
      });
      setSuccessBanner(
        splitMode === 'manual'
          ? t('man_success', {
              amount: roundCents(parsedAmount).toFixed(2),
              manual: manualTotal.toFixed(2),
              count: manualDeposits.length,
            })
          : effectiveWorkingCapital > 0
          ? t('inc_success_auto_wc', {
              amount: roundCents(parsedAmount).toFixed(2),
              count: effectiveAllocations.length,
              wc: effectiveWorkingCapital.toFixed(2),
            })
          : t('inc_success_auto', {
              amount: roundCents(parsedAmount).toFixed(2),
              count: effectiveAllocations.length,
            })
      );
      setAmountStr('');
      setSource('');
      setNotes('');
      setIsCustomMode(false);
      setCustomOverrides({});
      setSplitMode('auto');
      setManualInputs({});
      setRemainderMode('auto_split');
    } catch (err: unknown) {
      console.error('[MyFinance] could not commit income', err);
      setErrorMsg(describeError(err, t, 'inc_err_commit_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const manualItems = activePreview?.allocations.filter((a) => a.ruleStage === 'manual_deposit') ?? [];
  const pctItems = activePreview?.allocations.filter((a) => a.ruleStage === 'percentage') ?? [];
  const needItems =
    activePreview?.allocations.filter(
      (a) => a.ruleStage === 'need_full' || a.ruleStage === 'need_proportional'
    ) ?? [];
  const surplusItems = activePreview?.allocations.filter((a) => a.ruleStage === 'surplus') ?? [];

  const cardStatusText = (fund: Fund, calc: FundNeedCalculation): string => {
    if (fund.type === 'percentage') {
      return t('man_status_savings', { pct: fund.percentage ?? 0 });
    }
    const collected = calc.alreadyAllocatedThisCycle.toFixed(2);
    const target = calc.monthlyTarget.toFixed(2);
    if (calc.remainingNeed === 0) {
      return t('man_status_full', { collected, target });
    }
    return t('man_status_progress', { collected, target, need: calc.remainingNeed.toFixed(2) });
  };

  const segmentClass = (active: boolean) =>
    `inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
      active ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80' : 'text-slate-600 hover:text-slate-900'
    }`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left 5 Cols: Income Entry Card */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-[#00B956]">
              <ArrowDownLeft className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">{t('inc_title')}</h2>
              <p className="text-xs text-slate-500">{t('inc_subtitle')}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="income-amount" className="block text-xs font-semibold text-slate-700">
                {t('inc_amount_label')}
              </label>
              <div className="relative mt-1.5">
                <input
                  id="income-amount"
                  type="number"
                  step="0.01"
                  required
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 pl-4 pr-16 py-3 font-mono text-xl font-extrabold text-slate-900 placeholder:text-slate-300 focus:border-[#00B956] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#00B956]/10 transition"
                />
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 font-mono text-xs font-bold text-[#009947]">
                  TJS
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="income-date" className="block text-xs font-semibold text-slate-700">
                {t('inc_date_label')}
              </label>
              <input
                id="income-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#00B956] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#00B956]/10 transition"
              />
            </div>

            <div>
              <label htmlFor="income-source" className="block text-xs font-semibold text-slate-700">
                {t('inc_source_label')}
              </label>
              <input
                id="income-source"
                type="text"
                required
                maxLength={TEXT_LIMITS.incomeSource}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={t('inc_source_placeholder')}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#00B956] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#00B956]/10 transition"
              />
            </div>

            <div>
              <label htmlFor="income-memo" className="block text-xs font-semibold text-slate-700">
                {t('inc_memo_label')}
              </label>
              <input
                id="income-memo"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('inc_memo_placeholder')}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#00B956] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#00B956]/10 transition"
              />
            </div>

            {/* ---------------- How to split: Auto-split | Manual deposit ---------------- */}
            <div className="border-t border-slate-100 pt-4">
              <div className="text-xs font-semibold text-slate-700">{t('inc_mode_title')}</div>
              <div
                role="group"
                aria-label={t('inc_mode_title')}
                className="mt-1.5 grid grid-cols-2 gap-1 rounded-2xl border border-slate-200/80 bg-slate-100 p-1"
              >
                <button
                  type="button"
                  aria-pressed={splitMode === 'auto'}
                  onClick={() => selectSplitMode('auto')}
                  className={segmentClass(splitMode === 'auto')}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  {t('inc_mode_auto')}
                </button>
                <button
                  type="button"
                  aria-pressed={splitMode === 'manual'}
                  onClick={() => selectSplitMode('manual')}
                  className={segmentClass(splitMode === 'manual')}
                >
                  <HandCoins className="h-3.5 w-3.5" />
                  {t('inc_mode_manual')}
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {splitMode === 'auto' ? t('inc_mode_auto_hint') : t('inc_mode_manual_hint')}
              </p>
            </div>

            {/* ---------------- Manual deposit editor ---------------- */}
            {splitMode === 'manual' && (
              <div className="space-y-2.5" data-testid="manual-editor">
                {validAmount <= 0 && (
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50 p-3 text-xs text-slate-600">
                    <Info className="h-4 w-4 shrink-0 text-[#00B956]" />
                    <span>{t('man_hint_enter_amount')}</span>
                  </div>
                )}

                {manualEntries.map(({ fund, raw, amount, calc }) => {
                  const isSavings = fund.type === 'percentage';
                  const isFull = !isSavings && calc.remainingNeed === 0;
                  const aboveNeed =
                    !isSavings && amount > 0 && amount > calc.remainingNeed
                      ? roundCents(amount - calc.remainingNeed)
                      : 0;
                  return (
                    <div
                      key={fund.id}
                      className={`rounded-2xl border p-3 transition ${
                        amount > 0
                          ? 'border-[#00B956]/40 bg-emerald-50/40'
                          : 'border-slate-200/80 bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="break-words text-sm font-bold text-slate-900">
                              {fund.name}
                            </span>
                            {isSavings && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-[#009947]">
                                {t('card_savings_badge')}
                              </span>
                            )}
                          </div>
                          <p
                            className={`mt-0.5 text-[11px] ${
                              isFull ? 'font-semibold text-[#009947]' : 'text-slate-500'
                            }`}
                          >
                            {isFull && '✓ '}
                            {cardStatusText(fund, calc)}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <div className="relative">
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={raw}
                              aria-label={t('man_amount_aria', { card: fund.name })}
                              onChange={(e) =>
                                setManualInputs({ ...manualInputs, [fund.id]: e.target.value })
                              }
                              placeholder="0.00"
                              className="w-28 rounded-xl border border-slate-200 bg-white py-1.5 pl-2.5 pr-10 text-right font-mono text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:border-[#00B956] focus:outline-none focus:ring-4 focus:ring-[#00B956]/10"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 font-mono text-[10px] font-bold text-[#009947]">
                              TJS
                            </span>
                          </div>
                          {!isSavings && calc.remainingNeed > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setManualInputs({
                                  ...manualInputs,
                                  [fund.id]: calc.remainingNeed.toFixed(2),
                                })
                              }
                              className="text-[11px] font-bold text-[#009947] hover:underline"
                            >
                              {t('man_fill_btn', { amount: calc.remainingNeed.toFixed(2) })}
                            </button>
                          )}
                        </div>
                      </div>

                      {aboveNeed > 0 && (
                        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {t('man_over_need', { amount: aboveNeed.toFixed(2) })}
                        </p>
                      )}
                    </div>
                  );
                })}

                {validAmount > 0 && (
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5">
                    <div className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-3 min-[420px]:items-end min-[420px]:gap-2 min-[420px]:text-center">
                      <div className="flex items-baseline justify-between gap-3 min-[420px]:block">
                        <div className="text-[11px] font-semibold leading-tight text-slate-400">
                          {t('man_sum_income')}
                        </div>
                        <div className="mt-0.5 font-mono text-sm font-extrabold text-slate-900">
                          {validAmount.toFixed(2)}
                        </div>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 min-[420px]:block">
                        <div className="text-[11px] font-semibold leading-tight text-slate-400">
                          {t('man_sum_assigned')}
                        </div>
                        <div
                          data-testid="manual-assigned"
                          className="mt-0.5 font-mono text-sm font-extrabold text-violet-700"
                        >
                          {manualTotal.toFixed(2)}
                        </div>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 min-[420px]:block">
                        <div className="text-[11px] font-semibold leading-tight text-slate-400">
                          {t('man_sum_left')}
                        </div>
                        <div
                          data-testid="manual-left"
                          className={`mt-0.5 font-mono text-sm font-extrabold ${
                            manualOver
                              ? 'text-rose-600'
                              : manualLeft === 0
                              ? 'text-[#009947]'
                              : 'text-slate-900'
                          }`}
                        >
                          {manualLeft.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    {manualOver && (
                      <p
                        role="alert"
                        className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-rose-600"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {t('man_err_over_income', { amount: Math.abs(manualLeft).toFixed(2) })}
                      </p>
                    )}
                  </div>
                )}

                {validAmount > 0 && manualLeft > 0 && !manualHasInvalid && (
                  <fieldset className="rounded-2xl border border-slate-200/80 bg-white p-3.5">
                    <legend className="px-1 text-xs font-semibold text-slate-700">
                      {t('man_remainder_title', { amount: manualLeft.toFixed(2) })}
                    </legend>
                    <div className="mt-1 grid grid-cols-1 gap-2">
                      {(['auto_split', 'working_capital'] as ManualRemainderMode[]).map((mode) => {
                        const active = remainderMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setRemainderMode(mode)}
                            className={`rounded-xl border px-3 py-2.5 text-left transition ${
                              active
                                ? 'border-[#00B956] bg-emerald-50/60 ring-2 ring-[#00B956]/15'
                                : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
                            }`}
                          >
                            <span className="block text-xs font-bold text-slate-900">
                              {mode === 'auto_split'
                                ? t('man_remainder_auto')
                                : t('man_remainder_wc')}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-slate-500">
                              {mode === 'auto_split'
                                ? t('man_remainder_auto_desc')
                                : t('man_remainder_wc_desc')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-700"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successBanner && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-[#009947]"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00B956]" />
                <span>{successBanner}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#00B956] px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#00B956]/25 hover:bg-[#00A34B] disabled:opacity-50 transition"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {t('inc_confirm_btn', { amount: validAmount.toFixed(2) })}
                  </span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Right 7 Cols: Live Allocation Preview Engine */}
      <div className="lg:col-span-7 space-y-5">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-[#00B956]">
                <Sparkles className="h-4 w-4" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">
                {t('inc_preview_title')}
              </h3>
            </div>

            {splitMode === 'auto' && effectiveAllocations.length > 0 && (
              <button
                type="button"
                onClick={() => setIsCustomMode(!isCustomMode)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                  isCustomMode
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                {isCustomMode ? t('inc_using_overrides') : t('inc_customize_split')}
              </button>
            )}
          </div>

          {activePreview && validAmount > 0 && (
            <div
              data-testid="distribution-trace"
              className="mt-5 rounded-2xl border border-slate-800 bg-[#0F172A] p-4 font-mono text-xs leading-relaxed text-slate-200 shadow-inner"
            >
              <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-400">
                <Terminal className="w-3.5 h-3.5 text-[#00E56B]" />
                <span>{t('inc_trace_header')}</span>
              </div>
              <div className="text-white font-bold">
                {t('inc_incoming_amount')}: {activePreview.grossIncome.toFixed(2)} TJS ({t('cur_somoni')})
              </div>
              {manualItems.map((m) => (
                <div key={`manual-${m.fundId}`} className="text-violet-300 pl-2">
                  → [{t('stage_manual_deposit')}] {m.fundName}: +{m.amount.toFixed(2)} TJS
                </div>
              ))}
              {pctItems.map((p) => (
                <div key={p.fundId} className="text-[#00E56B] pl-2">
                  → [{t('card_savings_badge')}] {p.fundName}: +{p.amount.toFixed(2)} TJS{' '}
                  <span className="text-slate-400">({describeAllocationRule(p, t)})</span>
                </div>
              ))}
              {needItems.length > 0 && (
                <div className="text-cyan-300 pl-2 mt-1">
                  {activePreview.remainingAfterPercentage.toFixed(2)} TJS →{' '}
                  <span className="font-bold text-amber-300">
                    {(activePreview.needFundingRatio * 100).toFixed(2)}%
                  </span>{' '}
                  ({needItems.map((n) => `${n.fundName}: +${n.amount.toFixed(2)} TJS`).join(', ')})
                </div>
              )}
              {alreadyFullSpendingAccounts.length > 0 && (
                <div className="text-slate-400 pl-2 mt-1">
                  ✓ 100%: {alreadyFullSpendingAccounts.map(({ fund }) => fund.name).join(', ')}
                </div>
              )}
              {activePreview.rawSurplus > 0 && (
                <div className="text-amber-300 pl-2 mt-1 font-semibold">
                  → {t('card_working_capital_badge')}: +{activePreview.unallocatedSurplus.toFixed(2)} TJS{' '}
                  {surplusItems.length > 0 &&
                    `(${surplusItems
                      .map((s) => `${displayLabel(s.fundName, t)}: ${s.amount.toFixed(2)} TJS`)
                      .join(', ')})`}
                </div>
              )}
            </div>
          )}

          {/* Stage-by-Stage Breakdown Pills */}
          {splitMode === 'auto' && preview && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                <div className="text-[11px] font-semibold text-slate-400">
                  {t('inc_stage1_savings')}
                </div>
                <div className="mt-1 font-mono text-base font-extrabold text-[#009947]">
                  {preview.percentageTotal.toFixed(2)} TJS
                </div>
              </div>
              <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                <div className="text-[11px] font-semibold text-slate-400">
                  {t('inc_stage2_spending')}
                </div>
                <div className="mt-1 font-mono text-base font-extrabold text-slate-900">
                  {preview.remainingAfterPercentage.toFixed(2)} TJS
                </div>
              </div>
              <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                <div className="text-[11px] font-semibold text-slate-400">
                  {t('inc_stage3_ratio')}
                </div>
                <div
                  className={`mt-1 font-mono text-base font-extrabold ${
                    preview.isShortfall ? 'text-amber-600' : 'text-cyan-600'
                  }`}
                >
                  {(preview.needFundingRatio * 100).toFixed(1)}%
                </div>
              </div>
              <div className="flex flex-col justify-between rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                <div className="text-[11px] font-semibold text-[#009947]">
                  {t('inc_stage4_wc')}
                </div>
                <div className="mt-1 font-mono text-base font-extrabold text-[#009947]">
                  +{effectiveWorkingCapital.toFixed(2)} TJS
                </div>
              </div>
            </div>
          )}

          {splitMode === 'manual' && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                <div className="text-[11px] font-semibold text-slate-400">
                  {t('man_sum_income')}
                </div>
                <div className="mt-1 font-mono text-base font-extrabold text-slate-900">
                  {validAmount.toFixed(2)} TJS
                </div>
              </div>
              <div className="flex flex-col justify-between rounded-2xl border border-violet-200 bg-violet-50/60 p-3.5">
                <div className="text-[11px] font-semibold text-violet-700">
                  {t('man_pill_manual')}
                </div>
                <div className="mt-1 font-mono text-base font-extrabold text-violet-700">
                  {manualTotal.toFixed(2)} TJS
                </div>
              </div>
              <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                <div className="text-[11px] font-semibold text-slate-400">
                  {t('man_pill_auto')}
                </div>
                <div className="mt-1 font-mono text-base font-extrabold text-cyan-600">
                  {(manualPreview?.autoSplitAmount ?? 0).toFixed(2)} TJS
                </div>
              </div>
              <div className="flex flex-col justify-between rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                <div className="text-[11px] font-semibold text-[#009947]">
                  {t('card_working_capital_badge')}
                </div>
                <div className="mt-1 font-mono text-base font-extrabold text-[#009947]">
                  +{effectiveWorkingCapital.toFixed(2)} TJS
                </div>
              </div>
            </div>
          )}

          {/* Detailed Line-Item Table */}
          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200/80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200/80">
                <tr>
                  <th className="px-4 py-3.5">{t('inc_th_card')}</th>
                  <th className="px-4 py-3.5">{t('inc_th_stage')}</th>
                  <th className="px-4 py-3.5">{t('inc_th_math')}</th>
                  <th className="px-4 py-3.5 text-right">{t('inc_th_deposit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {effectiveAllocations.map((item, idx) => {
                  const overrideKey = `${item.fundId}-${activePreview?.allocations[idx]?.ruleStage}-${idx}`;
                  return (
                    <tr key={overrideKey} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3.5 font-bold text-slate-900">{displayLabel(item.fundName, t)}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                            item.ruleStage === 'percentage'
                              ? 'bg-emerald-100 text-[#009947]'
                              : item.ruleStage === 'need_proportional'
                              ? 'bg-amber-100 text-amber-800'
                              : item.ruleStage === 'need_full'
                              ? 'bg-cyan-100 text-cyan-800'
                              : 'bg-violet-100 text-violet-800'
                          }`}
                        >
                          {t(STAGE_LABEL_KEYS[item.ruleStage])}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">
                        {describeAllocationRule(item, t)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                        {splitMode === 'auto' && isCustomMode ? (
                          <input
                            type="number"
                            step="0.01"
                            value={
                              customOverrides[overrideKey] !== undefined
                                ? customOverrides[overrideKey]
                                : item.amount
                            }
                            onChange={(e) =>
                              setCustomOverrides({
                                ...customOverrides,
                                [overrideKey]: Number(e.target.value),
                              })
                            }
                            className="w-24 rounded-lg border border-amber-400 bg-amber-50/40 px-2 py-1 text-right font-mono text-xs font-bold text-slate-900 focus:outline-none"
                          />
                        ) : (
                          `+${item.amount.toFixed(2)} TJS`
                        )}
                      </td>
                    </tr>
                  );
                })}
                {effectiveAllocations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      —
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t border-slate-200/80 bg-slate-50/80 font-mono text-xs">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-sans font-semibold text-slate-600">
                    {t('inc_total_deposited')}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-[#009947]">
                    +{totalEffectiveAllocated.toFixed(2)} TJS
                  </td>
                </tr>
                <tr className="border-t border-slate-200/60">
                  <td colSpan={3} className="px-4 py-3 font-sans font-bold text-slate-900">
                    {t('inc_remaining_wc')}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    +{effectiveWorkingCapital.toFixed(2)} TJS
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs text-slate-600">
            <Info className="h-4 w-4 shrink-0 text-[#00B956]" />
            <span>{splitMode === 'manual' ? t('man_footer_note') : t('inc_footer_note')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
