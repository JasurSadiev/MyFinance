import React, { useState, useEffect, useMemo } from 'react';
import {
  Account,
  AllocationSettings,
  ExpenseTransaction,
  Fund,
} from '../types/finance';
import {
  CreditCard,
  Undo2,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Loader2,
  Sparkles,
  Lock,
  ArrowUpRight,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { describeError } from '../i18n/errorText';
import { displayLabel } from '../i18n/labels';
import { CANON } from '../engine/canonicalLabels';
import { TEXT_LIMITS } from '../types/limits';

interface ExpensesViewProps {
  accounts: Account[];
  funds: Fund[];
  expenses: ExpenseTransaction[];
  settings: AllocationSettings;
  preselectedCardId?: string | null;
  onAddExpense: (payload: {
    amount: number;
    date: string;
    category: string;
    description: string;
    fundId?: string;
    accountId: string;
  }) => Promise<void>;
  onUndoExpense: (expenseId: string) => Promise<void>;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  accounts,
  funds,
  expenses,
  settings,
  preselectedCardId,
  onAddExpense,
  onUndoExpense,
}) => {
  const { t } = useLanguage();

  const spendableFunds = useMemo(
    () => funds.filter((f) => f.type !== 'percentage'),
    [funds]
  );

  const [amountStr, setAmountStr] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [fundId, setFundId] = useState<string>(
    preselectedCardId || spendableFunds[0]?.id || 'working-capital'
  );
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id || '');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (preselectedCardId) {
      setFundId(preselectedCardId);
      if (preselectedCardId === 'working-capital') {
        setCategory('');
      } else {
        const f = spendableFunds.find((item) => item.id === preselectedCardId);
        if (f) setCategory(f.name);
      }
    }
  }, [preselectedCardId, spendableFunds]);

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  const selectedFund = spendableFunds.find((f) => f.id === fundId);
  const isWorkingCapital = fundId === 'working-capital';
  const workingCapitalBalance = settings.workingCapitalBalance ?? 0;

  const handleSelectCard = (id: string, defaultCategory: string) => {
    setFundId(id);
    if (!category || spendableFunds.some((f) => f.name === category)) {
      setCategory(defaultCategory);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const amt = Number(amountStr);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFeedback({
        type: 'err',
        text: t('err_expense_amount'),
      });
      return;
    }

    // A card name may be longer than a category is allowed to be, so the name-based default is capped.
    const effectiveCategory = (
      category.trim() ||
      (isWorkingCapital ? CANON.workingCapital : selectedFund?.name || CANON.general)
    ).slice(0, TEXT_LIMITS.expenseCategory);

    setSubmitting(true);
    try {
      await onAddExpense({
        amount: amt,
        date,
        category: effectiveCategory,
        description: description.trim() || effectiveCategory,
        fundId: fundId || undefined,
        accountId,
      });
      setFeedback({
        type: 'ok',
        text: `-${amt.toFixed(2)} TJS (${
          isWorkingCapital
            ? t('card_working_capital_badge')
            : selectedFund?.name || displayLabel(effectiveCategory, t)
        })`,
      });
      setAmountStr('');
      setDescription('');
    } catch (err: unknown) {
      console.error('[MyFinance] could not record expense', err);
      setFeedback({ type: 'err', text: describeError(err, t, 'err_expense_failed') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left 6 Cols: Spend from Account Card Form */}
      <div className="lg:col-span-6">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">{t('exp_title')}</h2>
              <p className="text-xs text-slate-500">{t('exp_subtitle')}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  {t('exp_select_card')}
                </label>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-[#009947] border border-emerald-200/70">
                  <Lock className="h-3 w-3" />
                  {t('exp_savings_locked')}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {spendableFunds.map((f) => {
                  const isSelected = fundId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handleSelectCard(f.id, f.name)}
                      className={`flex items-center justify-between rounded-2xl border p-3.5 text-left transition ${
                        isSelected
                          ? 'border-[#00B956] bg-emerald-50/50 shadow-sm ring-2 ring-[#00B956]/20'
                          : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-3.5 w-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: f.color || '#06b6d4' }}
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-900">{f.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {t('exp_spent_this_mo', { amount: (f.cycleSpent ?? 0).toFixed(0) })}
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs font-extrabold text-[#009947]">
                        {f.reservedAmount.toFixed(2)} TJS
                      </div>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => handleSelectCard('working-capital', '')}
                  className={`flex items-center justify-between rounded-2xl border p-3.5 text-left transition ${
                    isWorkingCapital
                      ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                      : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/70 text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles
                      className={`h-4 w-4 shrink-0 ${
                        isWorkingCapital ? 'text-[#00E56B]' : 'text-amber-500'
                      }`}
                    />
                    <div>
                      <div
                        className={`text-xs font-bold ${
                          isWorkingCapital ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        {t('card_working_capital_badge')}
                      </div>
                      <div
                        className={`text-[10px] ${
                          isWorkingCapital ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {t('exp_overflow_card')}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`text-right font-mono text-xs font-extrabold ${
                      isWorkingCapital ? 'text-[#00E56B]' : 'text-slate-900'
                    }`}
                  >
                    {workingCapitalBalance.toFixed(2)} TJS
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                {t('exp_amount_label')}
              </label>
              <div className="relative mt-1.5">
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 pl-4 pr-16 py-3 font-mono text-xl font-extrabold text-slate-900 placeholder:text-slate-300 focus:border-[#00B956] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#00B956]/10 transition"
                />
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 font-mono text-xs font-bold text-rose-600">
                  TJS
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {t('exp_date_label')}
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-900 focus:border-[#00B956] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {t('exp_category_label')}
                </label>
                <input
                  type="text"
                  maxLength={TEXT_LIMITS.expenseCategory}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={
                    isWorkingCapital
                      ? t('card_working_capital_badge')
                      : selectedFund?.name || t('exp_category_placeholder')
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-900 focus:border-[#00B956] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                {t('exp_merchant_label')}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('exp_merchant_placeholder')}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#00B956] focus:bg-white focus:outline-none"
              />
            </div>

            {feedback && (
              <div
                role={feedback.type === 'ok' ? 'status' : 'alert'}
                className={`flex items-start gap-2 rounded-2xl border p-3.5 text-xs font-medium ${
                  feedback.type === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-[#009947]'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {feedback.type === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00B956]" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Receipt className="w-4 h-4 text-[#00E56B]" />
                  <span>
                    {t('exp_pay_btn', {
                      card: isWorkingCapital
                        ? t('card_working_capital_badge')
                        : selectedFund?.name || '',
                    })}
                  </span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Right 6 Cols: Expense Ledger */}
      <div className="lg:col-span-6">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          <h3 className="text-lg font-extrabold text-slate-900">{t('exp_history_title')}</h3>
          <p className="text-xs text-slate-500">{t('exp_history_sub')}</p>

          <div className="mt-5 space-y-3">
            {expenses.map((exp) => (
              <div
                key={exp.id}
                className={`rounded-2xl border p-4 transition ${
                  exp.status === 'undone'
                    ? 'border-slate-200/60 bg-slate-50/40 opacity-55'
                    : 'border-slate-200/80 bg-slate-50/60 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-600 shrink-0">
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-bold ${
                            exp.status === 'undone'
                              ? 'line-through text-slate-400'
                              : 'text-slate-900'
                          }`}
                        >
                          {displayLabel(exp.description, t)}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
                          {displayLabel(exp.category, t)}
                        </span>
                        {exp.status === 'undone' && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-800">
                            {t('audit_status_rolled_back')}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {exp.date} • {t('exp_paid_from')}{' '}
                        <span className="font-semibold text-slate-800">
                          {displayLabel(exp.fundName, t) || t('card_working_capital_badge')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono text-base font-extrabold text-rose-600">
                      -{exp.amount.toFixed(2)} TJS
                    </span>
                    {exp.status === 'active' && (
                      <button
                        onClick={() => onUndoExpense(exp.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        {t('dash_undo')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {expenses.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-xs text-slate-400">
                {t('exp_empty')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
