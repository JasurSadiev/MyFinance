import React, { useState, useEffect } from 'react';
import {
  Account,
  AllocationSettings,
  ExpenseTransaction,
  Fund,
  FundType,
  SurplusRuleItem,
} from '../types/finance';
import {
  calculateMonthsRemaining,
  roundCents,
} from '../engine/allocationEngine';
import { AccountCard } from './AccountCard';
import {
  CreditCard,
  Plus,
  Trash2,
  Sliders,
  CheckCircle2,
  Calendar,
  Sparkles,
  CalendarCheck2,
  AlertCircle,
} from 'lucide-react';
import { useLanguage, type TranslationKey } from '../i18n/LanguageContext';
import { describeError } from '../i18n/errorText';
import { displayLabel } from '../i18n/labels';
import { defaultCategoryForType, isDefaultCategory } from '../engine/canonicalLabels';
import { TEXT_LIMITS } from '../types/limits';

interface FundsViewProps {
  funds: Fund[];
  accounts: Account[];
  expenses: ExpenseTransaction[];
  settings: AllocationSettings;
  onSaveFund: (fund: Partial<Fund> & { name: string; type: FundType }) => Promise<void>;
  onDeleteFund: (fund: Fund) => Promise<void>;
  onUpdateSettings: (settings: Partial<AllocationSettings>) => Promise<void>;
  onSpendFromCard: (cardId: string, cardName: string) => void;
  onRolloverMonth: () => Promise<void>;
}

/**
 * One-tap card presets. Text comes from the dictionary (so a Russian or Uzbek user gets a card named in
 * their language) and `category` is left empty on purpose: empty means "the default for this card type",
 * which is stored in one canonical form and shown translated (see engine/canonicalLabels.ts).
 */
const QUICK_CARD_TEMPLATES: Array<{
  id: string;
  emoji: string;
  nameKey: TranslationKey;
  type: FundType;
  percentage?: string;
  targetAmount: string;
  color: string;
}> = [
  { id: 'savings', emoji: '🏦', nameKey: 'tpl_name_savings', type: 'percentage', percentage: '10', targetAmount: '25000', color: '#10b981' },
  { id: 'fuel', emoji: '⛽', nameKey: 'tpl_name_fuel', type: 'monthly', targetAmount: '1000', color: '#f59e0b' },
  { id: 'wife', emoji: '💝', nameKey: 'tpl_name_wife', type: 'monthly', targetAmount: '1500', color: '#ec4899' },
  { id: 'food', emoji: '🍽️', nameKey: 'tpl_name_food', type: 'monthly', targetAmount: '2500', color: '#06b6d4' },
  { id: 'fun', emoji: '🎬', nameKey: 'tpl_name_fun', type: 'monthly', targetAmount: '600', color: '#8b5cf6' },
  { id: 'insurance', emoji: '🛡️', nameKey: 'tpl_name_insurance', type: 'sinking', targetAmount: '3000', color: '#3b82f6' },
];

const CARD_COLORS: Array<{ hex: string; nameKey: TranslationKey }> = [
  { hex: '#10b981', nameKey: 'color_emerald' },
  { hex: '#f59e0b', nameKey: 'color_amber' },
  { hex: '#ec4899', nameKey: 'color_rose' },
  { hex: '#06b6d4', nameKey: 'color_cyan' },
  { hex: '#8b5cf6', nameKey: 'color_violet' },
  { hex: '#3b82f6', nameKey: 'color_blue' },
];

export const FundsView: React.FC<FundsViewProps> = ({
  funds,
  accounts,
  expenses,
  settings,
  onSaveFund,
  onDeleteFund,
  onUpdateSettings,
  onSpendFromCard,
  onRolloverMonth,
}) => {
  const { t } = useLanguage();
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthPrefix = settings.currentCycleMonth || todayStr.slice(0, 7);

  const [editingFundId, setEditingFundId] = useState<string | null>(null);
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<FundType>('monthly');
  // '' means "the default for this card type"; the placeholder shows that default in the active language.
  const [category, setCategory] = useState<string>('');
  const [percentage, setPercentage] = useState<string>('10');
  const [targetAmount, setTargetAmount] = useState<string>('');
  const [reservedAmount, setReservedAmount] = useState<string>('0');
  const [targetDate, setTargetDate] = useState<string>('');
  const [color, setColor] = useState<string>('#10b981');
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id || '');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [rollingOver, setRollingOver] = useState<boolean>(false);
  const [formMsg, setFormMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [surplusStrategy, setSurplusStrategy] = useState<'unallocated' | 'proportional_rules'>(
    settings.surplusStrategy
  );
  const [surplusRules, setSurplusRules] = useState<SurplusRuleItem[]>(settings.surplusRules);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);
  const [settingsErrMsg, setSettingsErrMsg] = useState<string | null>(null);

  useEffect(() => {
    setSurplusStrategy(settings.surplusStrategy);
    setSurplusRules(settings.surplusRules || []);
  }, [settings]);

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

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

  const startEdit = (f: Fund) => {
    setEditingFundId(f.id);
    setName(f.name);
    setType(f.type);
    setCategory(isDefaultCategory(f.category) ? '' : f.category);
    setPercentage(String(f.percentage ?? 10));
    setTargetAmount(String(f.targetAmount));
    setReservedAmount(String(f.reservedAmount));
    setTargetDate(f.targetDate || '');
    setColor(f.color || '#10b981');
    setAccountId(f.accountId || '');
    setFormMsg(null);
  };

  const resetForm = () => {
    setEditingFundId(null);
    setName('');
    setType('monthly');
    setCategory('');
    setPercentage('10');
    setTargetAmount('');
    setReservedAmount('0');
    setTargetDate('');
    setColor('#10b981');
    setFormMsg(null);
  };

  const templateLabel = (tpl: (typeof QUICK_CARD_TEMPLATES)[number]): string => {
    if (tpl.id === 'savings') return `${tpl.emoji} ${t('tpl_label_savings', { pct: tpl.percentage ?? '' })}`;
    if (tpl.id === 'insurance') return `${tpl.emoji} ${t('tpl_label_annual')}`;
    return `${tpl.emoji} ${t(tpl.nameKey)} (${Number(tpl.targetAmount).toLocaleString('en-US')} TJS)`;
  };

  const applyTemplate = (tpl: (typeof QUICK_CARD_TEMPLATES)[number]) => {
    setEditingFundId(null);
    setName(t(tpl.nameKey));
    setType(tpl.type);
    setCategory('');
    if (tpl.percentage) setPercentage(tpl.percentage);
    setTargetAmount(tpl.targetAmount);
    setReservedAmount('0');
    setColor(tpl.color);
    if (tpl.type === 'sinking') {
      const sixMonthsLater = new Date();
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
      setTargetDate(sixMonthsLater.toISOString().slice(0, 10));
    } else {
      setTargetDate('');
    }
    setFormMsg(null);
  };

  const previewMonthsLeft = calculateMonthsRemaining(todayStr, targetDate || undefined);
  const previewRemainingAmt = Math.max(
    0,
    roundCents(Number(targetAmount || 0) - Number(reservedAmount || 0))
  );
  const previewMonthlyReq = roundCents(previewRemainingAmt / previewMonthsLeft);

  const handleSaveFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);
    setSubmitting(true);
    try {
      const existing = editingFundId ? funds.find((f) => f.id === editingFundId) : undefined;
      await onSaveFund({
        id: editingFundId || undefined,
        name,
        type,
        category: category.trim() || defaultCategoryForType(type),
        percentage: type === 'percentage' ? Number(percentage) : undefined,
        targetAmount: Number(targetAmount || 0),
        monthlyAmount: type === 'monthly' ? Number(targetAmount || 0) : undefined,
        targetDate:
          (type === 'sinking' || type === 'target') && targetDate ? targetDate : undefined,
        monthsRemaining:
          type === 'sinking' || type === 'target' ? previewMonthsLeft : undefined,
        reservedAmount: Number(reservedAmount || 0),
        cycleStartBalance: existing
          ? existing.cycleStartBalance
          : type === 'percentage'
          ? 0
          : Number(reservedAmount || 0),
        cycleAllocated: existing ? existing.cycleAllocated : 0,
        cycleSpent: existing ? existing.cycleSpent : 0,
        color,
        accountId,
      });
      setFormMsg({
        type: 'ok',
        text: editingFundId
          ? t('funds_msg_updated', { name })
          : type === 'percentage'
          ? t('funds_msg_issued_pct', { name, pct: percentage })
          : t('funds_msg_issued_amt', { name, amount: targetAmount }),
      });
      if (!editingFundId) {
        setName('');
        setTargetAmount('');
        setReservedAmount('0');
      }
    } catch (err: unknown) {
      console.error('[MyFinance] could not save card', err);
      setFormMsg({ type: 'err', text: describeError(err, t, 'err_fund_save_failed') });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSurplusSettings = async () => {
    setSettingsErrMsg(null);
    try {
      await onUpdateSettings({
        surplusStrategy,
        surplusRules,
      });
      setSettingsSavedMsg(t('funds_msg_wc_saved'));
      setTimeout(() => setSettingsSavedMsg(null), 3500);
    } catch (err: unknown) {
      console.error('[MyFinance] could not save Working Capital settings', err);
      setSettingsSavedMsg(null);
      setSettingsErrMsg(describeError(err, t, 'err_settings_save_failed'));
    }
  };

  const addSurplusRuleRow = () => {
    if (funds.length === 0) return;
    setSurplusRules([
      ...surplusRules,
      { fundId: funds[0].id, fundName: funds[0].name, percentage: 100 },
    ]);
  };

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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 5 Cols: Issue / Edit Account Card Studio */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-[#00B956]">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {editingFundId ? t('funds_edit_card') : t('funds_issue_card')}
                  </h2>
                  <p className="text-xs text-slate-500">{t('funds_studio_sub')}</p>
                </div>
              </div>
              {editingFundId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                >
                  {t('funds_new_btn')}
                </button>
              )}
            </div>

            {/* Quick-Fill Templates */}
            <div className="mt-5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t('funds_templates_label')}
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_CARD_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#00B956] hover:bg-emerald-50/50 hover:text-[#009947] transition"
                  >
                    {templateLabel(tpl)}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSaveFundSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {t('funds_card_title')}
                </label>
                <input
                  type="text"
                  required
                  maxLength={TEXT_LIMITS.cardName}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('funds_card_title_placeholder')}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#00B956] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#00B956]/10 transition"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    {t('funds_card_rule_type')}
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as FundType)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-900 focus:border-[#00B956] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#00B956]/10 transition"
                  >
                    <option value="monthly">{t('funds_type_monthly')}</option>
                    <option value="percentage">{t('funds_type_percentage')}</option>
                    <option value="sinking">{t('funds_type_sinking')}</option>
                    <option value="target">{t('funds_type_target')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    {t('funds_category_tag')}
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder={displayLabel(defaultCategoryForType(type), t)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-900 focus:border-[#00B956] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#00B956]/10 transition"
                  />
                </div>
              </div>

              {type === 'percentage' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#009947]">
                      {t('funds_savings_pct')}
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      required
                      value={percentage}
                      onChange={(e) => setPercentage(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-emerald-300 bg-emerald-50/40 px-3.5 py-2.5 font-mono text-sm font-bold text-[#009947] focus:border-[#00B956] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {t('funds_savings_goal')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={targetAmount}
                      onChange={(e) => setTargetAmount(e.target.value)}
                      placeholder={t('funds_optional_goal')}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-[#00B956] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {type === 'monthly'
                        ? t('funds_monthly_cap_label')
                        : t('funds_sinking_target_label')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={targetAmount}
                      onChange={(e) => setTargetAmount(e.target.value)}
                      placeholder="1000.00"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 font-mono text-sm font-bold text-slate-900 focus:border-[#00B956] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {t('funds_carryover_current')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={reservedAmount}
                      onChange={(e) => setReservedAmount(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 font-mono text-sm font-semibold text-[#009947] focus:border-[#00B956] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {(type === 'sinking' || type === 'target') && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-violet-900">
                      <Calendar className="w-3.5 h-3.5 text-violet-600" />
                      {t('funds_target_due_date')}
                    </label>
                    <input
                      type="date"
                      required
                      value={targetDate}
                      onChange={(e) => setTargetDate(e.target.value)}
                      className="rounded-lg border border-violet-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-900"
                    />
                  </div>
                  <div className="font-mono text-[11px] text-violet-800">
                    ({Number(targetAmount || 0).toFixed(2)} TJS -{' '}
                    {Number(reservedAmount || 0).toFixed(2)} TJS) ÷ {previewMonthsLeft} ={' '}
                    <span className="font-bold text-violet-950">
                      {previewMonthlyReq.toFixed(2)} {t('unit_tjs_per_month')}
                    </span>
                  </div>
                </div>
              )}

              {/* Card Color Theme Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {t('funds_card_color')}
                </label>
                <div className="mt-2 flex items-center gap-2.5">
                  {CARD_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setColor(c.hex)}
                      title={t(c.nameKey)}
                      className={`h-8 w-8 rounded-full border-2 transition ${
                        color === c.hex
                          ? 'border-slate-900 scale-110 ring-2 ring-slate-900/15'
                          : 'border-transparent opacity-75 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>

              {formMsg && (
                <div
                  role={formMsg.type === 'ok' ? 'status' : 'alert'}
                  className={`rounded-2xl border p-3.5 text-xs font-medium ${
                    formMsg.type === 'ok'
                      ? 'border-emerald-200 bg-emerald-50 text-[#009947]'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                  }`}
                >
                  {formMsg.text}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#00B956] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[#00B956]/25 hover:bg-[#00A34B] disabled:opacity-50 transition"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                {submitting
                  ? t('funds_saving_btn')
                  : editingFundId
                  ? t('funds_save_changes_btn')
                  : t('funds_issue_btn')}
              </button>
            </form>
          </div>

          {/* Overflow / Working Capital Rule Configuration */}
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Sliders className="w-4 h-4" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                {t('funds_overflow_title')}
              </h3>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{t('funds_overflow_sub')}</p>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setSurplusStrategy('unallocated')}
                  className={`rounded-2xl border p-3.5 text-left text-xs transition ${
                    surplusStrategy === 'unallocated'
                      ? 'border-[#00B956] bg-emerald-50/60 text-slate-900 ring-1 ring-[#00B956]/30'
                      : 'border-slate-200 bg-slate-50/70 text-slate-500'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1 text-slate-900">
                    <Sparkles className="w-3.5 h-3.5 text-[#00B956]" />
                    {t('card_working_capital_badge')}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {t('funds_wc_option_desc')}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSurplusStrategy('proportional_rules')}
                  className={`rounded-2xl border p-3.5 text-left text-xs transition ${
                    surplusStrategy === 'proportional_rules'
                      ? 'border-[#00B956] bg-emerald-50/60 text-slate-900 ring-1 ring-[#00B956]/30'
                      : 'border-slate-200 bg-slate-50/70 text-slate-500'
                  }`}
                >
                  <div className="font-bold text-slate-900">{t('funds_custom_split')}</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {t('funds_custom_split_desc')}
                  </div>
                </button>
              </div>

              {surplusStrategy === 'proportional_rules' && (
                <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                  {surplusRules.map((rule, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                      <select
                        value={rule.fundId}
                        onChange={(e) => {
                          const target = funds.find((f) => f.id === e.target.value);
                          const copy = [...surplusRules];
                          copy[idx] = {
                            ...copy[idx],
                            fundId: e.target.value,
                            fundName: target?.name,
                          };
                          setSurplusRules(copy);
                        }}
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-slate-900"
                      >
                        {funds.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={rule.percentage}
                          onChange={(e) => {
                            const copy = [...surplusRules];
                            copy[idx] = { ...copy[idx], percentage: Number(e.target.value) };
                            setSurplusRules(copy);
                          }}
                          className="w-16 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-right font-mono text-slate-900"
                        />
                        <span className="text-slate-500">%</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSurplusRules(surplusRules.filter((_, i) => i !== idx))
                          }
                          className="ml-1 text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {funds.length > 0 && (
                    <button
                      type="button"
                      onClick={addSurplusRuleRow}
                      className="text-xs font-bold text-[#009947] hover:underline"
                    >
                      {t('funds_add_overflow_target')}
                    </button>
                  )}
                </div>
              )}

              {settingsSavedMsg && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#009947]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{settingsSavedMsg}</span>
                </div>
              )}

              {settingsErrMsg && (
                <div role="alert" className="flex items-start gap-1.5 text-xs font-semibold text-rose-600">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 break-words">{settingsErrMsg}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveSurplusSettings}
                className="w-full rounded-2xl border border-slate-200 bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                {t('funds_save_overflow_btn')}
              </button>
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Visual Account Cards Gallery */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {t('funds_issued_title', { count: funds.length })}
                </h3>
                <p className="text-xs text-slate-500">
                  {t('funds_cycle_month_sub', { month: currentMonthPrefix })}
                </p>
              </div>

              <button
                type="button"
                onClick={handleRolloverClick}
                disabled={rollingOver}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-[#009947] hover:bg-emerald-100 disabled:opacity-50 transition"
              >
                <CalendarCheck2 className="w-3.5 h-3.5" />
                {rollingOver ? t('dash_rolling_over') : t('funds_start_next_month')}
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <AccountCard
                isWorkingCapital
                workingCapitalBalance={settings.workingCapitalBalance ?? 0}
                workingCapitalMonthlyDeposit={roundCents(
                  settings.workingCapitalCycleDeposited ?? 0
                )}
                workingCapitalMonthlySpent={workingCapitalMonthlySpent}
                onSpendFromCard={onSpendFromCard}
              />

              {funds.map((fund) => (
                <AccountCard
                  key={fund.id}
                  fund={fund}
                  monthlyExpensesFromLedger={getMonthlySpentForFund(fund)}
                  referenceDate={todayStr}
                  onSpendFromCard={onSpendFromCard}
                  onEditCard={startEdit}
                  onDeleteCard={onDeleteFund}
                />
              ))}
            </div>

            {funds.length === 0 && (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-xs text-slate-500">
                {t('funds_empty_hint')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
