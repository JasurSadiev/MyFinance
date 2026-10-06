import React, { useState } from 'react';
import {
  AllocationRecord,
  AuditLogEntry,
  ExpenseTransaction,
  IncomeTransaction,
} from '../types/finance';
import {
  History,
  Undo2,
  CheckCircle2,
  RotateCcw,
  FileSpreadsheet,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { STAGE_LABEL_KEYS } from '../i18n/stageLabels';
import { describeAllocationRule } from '../i18n/ruleText';
import { auditActionLabel, describeAuditLog, formatAuditTimestamp } from '../i18n/auditText';
import { displayLabel } from '../i18n/labels';

interface AuditLedgerViewProps {
  incomes: IncomeTransaction[];
  expenses: ExpenseTransaction[];
  allocations: AllocationRecord[];
  auditLogs: AuditLogEntry[];
  onUndoIncome: (incomeId: string) => Promise<void>;
  onUndoExpense: (expenseId: string) => Promise<void>;
}

export const AuditLedgerView: React.FC<AuditLedgerViewProps> = ({
  incomes,
  allocations,
  auditLogs,
  onUndoIncome,
}) => {
  const { t } = useLanguage();
  const [subTab, setSubTab] = useState<'allocations' | 'incomes' | 'audit'>('allocations');

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">
            {t('audit_title')}
          </h2>
          <p className="text-xs text-slate-500">{t('audit_subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200/80 bg-slate-100 p-1.5">
          <button
            onClick={() => setSubTab('allocations')}
            className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              subTab === 'allocations'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('audit_tab_splits')} ({allocations.length})
          </button>
          <button
            onClick={() => setSubTab('incomes')}
            className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              subTab === 'incomes'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('audit_tab_incomes')} ({incomes.length})
          </button>
          <button
            onClick={() => setSubTab('audit')}
            className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              subTab === 'audit'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('audit_tab_trail')} ({auditLogs.length})
          </button>
        </div>
      </div>

      {subTab === 'allocations' && (
        <div className="overflow-x-auto rounded-3xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-4">{t('audit_th_date')}</th>
                <th className="px-5 py-4">{t('audit_th_card')}</th>
                <th className="px-5 py-4">{t('audit_th_stage')}</th>
                <th className="px-5 py-4">{t('audit_th_rule')}</th>
                <th className="px-5 py-4 text-right">{t('audit_th_amount')}</th>
                <th className="px-5 py-4">{t('audit_th_status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allocations.map((alloc) => {
                const parentIncome = incomes.find((i) => i.id === alloc.incomeId);
                const isUndone = parentIncome?.status === 'undone';
                return (
                  <tr
                    key={alloc.id}
                    className={`hover:bg-slate-50/80 ${isUndone ? 'opacity-50' : ''}`}
                  >
                    <td className="px-5 py-3.5 font-mono text-slate-500">
                      {alloc.timestamp ? alloc.timestamp.slice(0, 10) : ''}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">{displayLabel(alloc.fundName, t)}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                          alloc.ruleStage === 'manual_deposit'
                            ? 'bg-violet-100 text-violet-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {STAGE_LABEL_KEYS[alloc.ruleStage]
                          ? t(STAGE_LABEL_KEYS[alloc.ruleStage])
                          : alloc.ruleStage}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {describeAllocationRule(alloc, t)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-extrabold text-[#009947]">
                      +{alloc.amount.toFixed(2)} TJS
                    </td>
                    <td className="px-5 py-3.5">
                      {isUndone ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 font-mono text-[10px] font-bold text-amber-800">
                          <RotateCcw className="w-3 h-3" /> {t('audit_status_rolled_back')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-mono text-[10px] font-bold text-[#009947]">
                          <CheckCircle2 className="w-3 h-3" /> {t('audit_status_committed')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {allocations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                    {t('audit_empty_splits')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'incomes' && (
        <div className="space-y-3">
          {incomes.map((inc) => {
            const childAllocs = allocations.filter((a) => a.incomeId === inc.id);
            return (
              <div
                key={inc.id}
                className={`rounded-3xl border p-5 transition ${
                  inc.status === 'undone'
                    ? 'border-slate-200/60 bg-white/60 opacity-60'
                    : 'border-slate-200/80 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.03)]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-50 text-[#00B956]">
                      <ArrowDownLeft className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-slate-900">
                          {inc.source}
                        </span>
                        <span className="font-mono text-xs text-slate-400">({inc.date})</span>
                        {childAllocs.some((a) => a.ruleStage === 'manual_deposit') && (
                          <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-violet-800">
                            {t('audit_badge_manual')}
                          </span>
                        )}
                        {inc.status === 'undone' && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-800">
                            {t('audit_status_rolled_back')}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {t('dash_cards_funded', { count: childAllocs.length })} •{' '}
                        {t('card_working_capital_badge')}:{' '}
                        <span className="font-mono font-bold text-[#009947]">
                          +{inc.unallocatedSurplus.toFixed(2)} TJS
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-extrabold text-[#009947]">
                      +{inc.amount.toFixed(2)} TJS
                    </span>
                    {inc.status === 'active' && (
                      <button
                        onClick={() => onUndoIncome(inc.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        {t('audit_undo_splits_btn')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {incomes.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-400">
              {t('audit_empty_incomes')}
            </div>
          )}
        </div>
      )}

      {subTab === 'audit' && (
        <div className="space-y-2.5">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="flex flex-col justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.03)] sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 shrink-0 rounded-xl bg-slate-100 p-2.5 text-slate-700">
                  {log.action.includes('INCOME') ? (
                    <ArrowDownLeft className="w-4 h-4 text-[#00B956]" />
                  ) : log.action.includes('EXPENSE') ? (
                    <ArrowUpRight className="w-4 h-4 text-rose-500" />
                  ) : (
                    <History className="w-4 h-4 text-slate-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-[#009947] border border-emerald-200/70">
                      {auditActionLabel(log.action, t)}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {formatAuditTimestamp(log.timestamp)}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs font-medium text-slate-700">
                    {describeAuditLog(log, t)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-slate-400">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>ID: {log.entityId.slice(0, 12)}</span>
              </div>
            </div>
          ))}
          {auditLogs.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-400">
              {t('audit_empty_logs')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
