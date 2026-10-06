import React, { useState, useEffect, useMemo, useRef } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { auth } from './services/firebaseConfig';
import {
  addExpenseToFirestore,
  addIncomeToFirestore,
  createEmptyUserHierarchy,
  deleteFundFromFirestore,
  rolloverToNextMonthInFirestore,
  saveFundToFirestore,
  subscribeToUserFirestoreData,
  undoExpenseInFirestore,
  undoIncomeInFirestore,
  updateSettingsInFirestore,
  UserFirestoreHierarchy,
} from './services/financeService';
import {
  AllocationSettings,
  Fund,
  FundType,
  NewIncomeInput,
} from './types/finance';
import { Navbar, NavTab } from './components/Navbar';
import { AuthView } from './components/AuthView';
import { DashboardView } from './components/DashboardView';
import { IncomeView } from './components/IncomeView';
import { FundsView } from './components/FundsView';
import { ExpensesView } from './components/ExpensesView';
import { AuditLedgerView } from './components/AuditLedgerView';
import { NoticeStack } from './components/NoticeStack';
import { Loader2, AlertCircle } from 'lucide-react';
import { LanguageProvider, useLanguage, type TranslationKey } from './i18n/LanguageContext';
import { describeError } from './i18n/errorText';

function AppContent() {
  const { t } = useLanguage();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  // The raw error, worded at render time so the banner follows the language switcher.
  const [firestoreError, setFirestoreError] = useState<{ error: unknown } | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [preselectedCardId, setPreselectedCardId] = useState<string | null>(null);
  const [hierarchy, setHierarchy] = useState<UserFirestoreHierarchy>(() =>
    createEmptyUserHierarchy('', '', '')
  );
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  // A one-click action that failed (Undo, delete a card, start a new month): the raw error plus the sentence to fall
  // back on. It is worded at render time so the notice follows the language switcher.
  const [actionError, setActionError] = useState<{ error: unknown; fallbackKey: TranslationKey } | null>(null);
  const actionErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionsInFlight = useRef<Set<string>>(new Set());

  useEffect(
    () => () => {
      if (actionErrorTimer.current) clearTimeout(actionErrorTimer.current);
    },
    []
  );

  const dismissActionError = () => {
    if (actionErrorTimer.current) clearTimeout(actionErrorTimer.current);
    setActionError(null);
  };

  const reportActionError = (error: unknown, fallbackKey: TranslationKey) => {
    console.error('[MyFinance] action failed', error);
    setActionError({ error, fallbackKey });
    if (actionErrorTimer.current) clearTimeout(actionErrorTimer.current);
    actionErrorTimer.current = setTimeout(() => setActionError(null), 8000);
  };

  /**
   * Runs a one-click action. A second click on the same thing while the first is still running is ignored,
   * and a failure is shown to the person instead of being dropped.
   */
  const runAction = async (key: string, fallbackKey: TranslationKey, action: () => Promise<void>) => {
    if (actionsInFlight.current.has(key)) return;
    actionsInFlight.current.add(key);
    try {
      await action();
    } catch (err) {
      reportActionError(err, fallbackKey);
    } finally {
      actionsInFlight.current.delete(key);
    }
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setHierarchy(createEmptyUserHierarchy('', '', ''));
      return;
    }

    setDataLoading(true);
    setFirestoreError(null);

    const unsubscribeData = subscribeToUserFirestoreData(
      currentUser.uid,
      currentUser.email || '',
      currentUser.displayName || currentUser.email || 'User',
      (liveHierarchy: UserFirestoreHierarchy) => {
        setHierarchy(liveHierarchy);
        setDataLoading(false);
      },
      (err: Error) => {
        setFirestoreError({ error: err });
        setDataLoading(false);
      }
    );

    return () => unsubscribeData();
  }, [currentUser]);

  const accounts = useMemo(
    () => Object.values(hierarchy.accounts),
    [hierarchy.accounts]
  );
  const funds = useMemo(
    () =>
      Object.values(hierarchy.funds).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)),
    [hierarchy.funds]
  );
  const incomes = useMemo(
    () =>
      Object.values(hierarchy.incomes).sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      ),
    [hierarchy.incomes]
  );
  const expenses = useMemo(
    () =>
      Object.values(hierarchy.expenses).sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      ),
    [hierarchy.expenses]
  );
  const allocations = useMemo(
    () =>
      Object.values(hierarchy.allocations).sort((a, b) =>
        (b.timestamp || '').localeCompare(a.timestamp || '')
      ),
    [hierarchy.allocations]
  );
  const auditLogs = useMemo(
    () =>
      Object.values(hierarchy.auditLogs).sort((a, b) =>
        (b.timestamp || '').localeCompare(a.timestamp || '')
      ),
    [hierarchy.auditLogs]
  );

  const activeUndoableCount = useMemo(
    () =>
      incomes.filter((i) => i.status === 'active').length +
      expenses.filter((e) => e.status === 'active').length,
    [incomes, expenses]
  );

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleSpendFromCard = (cardId: string, cardName: string) => {
    setPreselectedCardId(cardId);
    setActiveTab('expenses');
    showToast(`${cardName} (TJS)`);
  };

  const handleCommitIncome = async (payload: NewIncomeInput) => {
    if (!currentUser) return;
    await addIncomeToFirestore(currentUser.uid, payload);
    showToast(`+${payload.amount.toFixed(2)} TJS`);
  };

  const handleUndoIncome = (incomeId: string) =>
    runAction(`undo-income:${incomeId}`, 'err_undo_failed', async () => {
      if (!currentUser) return;
      await undoIncomeInFirestore(currentUser.uid, incomeId);
      showToast('✓');
    });

  const handleAddExpense = async (payload: {
    amount: number;
    date: string;
    category: string;
    description: string;
    fundId?: string;
    accountId: string;
  }) => {
    if (!currentUser) return;
    await addExpenseToFirestore(currentUser.uid, payload);
    showToast(`-${payload.amount.toFixed(2)} TJS`);
  };

  const handleUndoExpense = (expenseId: string) =>
    runAction(`undo-expense:${expenseId}`, 'err_undo_failed', async () => {
      if (!currentUser) return;
      await undoExpenseInFirestore(currentUser.uid, expenseId);
      showToast('✓');
    });

  const handleSaveFund = async (
    fundPayload: Partial<Fund> & { name: string; type: FundType }
  ) => {
    if (!currentUser) return;
    await saveFundToFirestore(currentUser.uid, fundPayload, funds);
    showToast(`${fundPayload.name}`);
  };

  const handleDeleteFund = (fund: Fund) =>
    runAction(`delete-fund:${fund.id}`, 'err_fund_delete_failed', async () => {
      if (!currentUser) return;
      await deleteFundFromFirestore(currentUser.uid, fund);
      showToast(`${fund.name}`);
    });

  const handleUpdateSettings = async (partial: Partial<AllocationSettings>) => {
    if (!currentUser) return;
    await updateSettingsInFirestore(currentUser.uid, partial, hierarchy.settings);
    showToast('✓');
  };

  const rolloverNow = async () => {
    if (!currentUser) return;
    const current =
      hierarchy.settings.currentCycleMonth || new Date().toISOString().slice(0, 7);
    const [yrStr, moStr] = current.split('-');
    let yr = Number(yrStr);
    let mo = Number(moStr) + 1;
    if (mo > 12) {
      mo = 1;
      yr += 1;
    }
    const nextMonth = `${yr}-${String(mo).padStart(2, '0')}`;
    await rolloverToNextMonthInFirestore(currentUser.uid, nextMonth);
    showToast(`${nextMonth}`);
  };

  const handleRolloverMonth = () => runAction('rollover', 'err_rollover_failed', rolloverNow);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center text-slate-700 gap-2.5">
        <Loader2 className="w-5 h-5 animate-spin text-[#00B956]" />
        <span className="text-sm font-semibold">{t('app_loading')}</span>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthView />;
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-slate-900 flex flex-col">
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        currentUserId={currentUser.uid}
        currentUserEmail={currentUser.email || ''}
        currentUserName={currentUser.displayName || currentUser.email || 'User'}
        onSignOut={handleSignOut}
        activeUndoableCount={activeUndoableCount}
      />

      <NoticeStack toast={toast} actionError={actionError} onDismissError={dismissActionError} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {firestoreError && (
          <div role="alert" className="mb-6 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <span>{describeError(firestoreError.error, t, 'err_data_load_failed')}</span>
            </div>
          </div>
        )}

        {dataLoading &&
        funds.length === 0 &&
        incomes.length === 0 &&
        expenses.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-slate-500 gap-2.5">
            <Loader2 className="w-5 h-5 animate-spin text-[#00B956]" />
            <span className="text-sm font-medium">{t('app_syncing')}</span>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView
                accounts={accounts}
                funds={funds}
                incomes={incomes}
                expenses={expenses}
                allocations={allocations}
                settings={hierarchy.settings}
                onNavigate={setActiveTab}
                onSpendFromCard={handleSpendFromCard}
                onDeleteFund={handleDeleteFund}
                onUndoIncome={handleUndoIncome}
                onUndoExpense={handleUndoExpense}
                onRolloverMonth={handleRolloverMonth}
              />
            )}

            {activeTab === 'income' && (
              <IncomeView
                accounts={accounts}
                funds={funds}
                settings={hierarchy.settings}
                onCommitIncome={handleCommitIncome}
              />
            )}

            {activeTab === 'funds' && (
              <FundsView
                funds={funds}
                accounts={accounts}
                expenses={expenses}
                settings={hierarchy.settings}
                onSaveFund={handleSaveFund}
                onDeleteFund={handleDeleteFund}
                onUpdateSettings={handleUpdateSettings}
                onSpendFromCard={handleSpendFromCard}
                onRolloverMonth={handleRolloverMonth}
              />
            )}

            {activeTab === 'expenses' && (
              <ExpensesView
                accounts={accounts}
                funds={funds}
                expenses={expenses}
                settings={hierarchy.settings}
                preselectedCardId={preselectedCardId}
                onAddExpense={handleAddExpense}
                onUndoExpense={handleUndoExpense}
              />
            )}

            {activeTab === 'audit' && (
              <AuditLedgerView
                incomes={incomes}
                expenses={expenses}
                allocations={allocations}
                auditLogs={auditLogs}
                onUndoIncome={handleUndoIncome}
                onUndoExpense={handleUndoExpense}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

export default App;
