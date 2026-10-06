import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
  deleteDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import {
  Account,
  AccountType,
  AllocationPreviewResult,
  AllocationRecord,
  AllocationSettings,
  AuditLogEntry,
  ExpenseTransaction,
  Fund,
  IncomeTransaction,
  NewIncomeInput,
} from '../types/finance';
import {
  applyAllocationsToFunds,
  computeIncomeDistribution,
  rollbackAllocationsFromFunds,
  rolloverFundsToNextMonth,
  roundCents,
  validateFundInput,
} from '../engine/allocationEngine';
import { CANON } from '../engine/canonicalLabels';
import { AppError } from '../types/errors';

export interface UserFirestoreHierarchy {
  userId: string;
  email: string;
  displayName: string;
  accounts: Record<string, Account>;
  funds: Record<string, Fund>;
  incomes: Record<string, IncomeTransaction>;
  expenses: Record<string, ExpenseTransaction>;
  allocations: Record<string, AllocationRecord>;
  auditLogs: Record<string, AuditLogEntry>;
  settings: AllocationSettings;
}

export function createEmptySettings(): AllocationSettings {
  const now = new Date().toISOString();
  return {
    id: 'default',
    surplusStrategy: 'unallocated',
    surplusRules: [],
    defaultAccountId: '',
    currentCycleMonth: now.slice(0, 7),
    workingCapitalBalance: 0,
    workingCapitalCycleDeposited: 0,
    workingCapitalCycleSpent: 0,
    updatedAt: now,
  };
}

export function createEmptyUserHierarchy(
  userId: string,
  email: string,
  displayName: string
): UserFirestoreHierarchy {
  return {
    userId,
    email,
    displayName,
    accounts: {},
    funds: {},
    incomes: {},
    expenses: {},
    allocations: {},
    auditLogs: {},
    settings: createEmptySettings(),
  };
}

function sanitizeForFirestore<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Real-time Cloud Firestore listener for all subcollections under `/users/{uid}`.
 */
export function subscribeToUserFirestoreData(
  userId: string,
  email: string,
  displayName: string,
  onUpdate: (snapshot: UserFirestoreHierarchy) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const state: UserFirestoreHierarchy = createEmptyUserHierarchy(userId, email, displayName);

  const emit = () => {
    onUpdate({
      ...state,
      accounts: { ...state.accounts },
      funds: { ...state.funds },
      incomes: { ...state.incomes },
      expenses: { ...state.expenses },
      allocations: { ...state.allocations },
      auditLogs: { ...state.auditLogs },
      settings: { ...state.settings },
    });
  };

  const handleErr = (err: Error) => {
    console.error('Firestore subscription error:', err);
    if (onError) onError(err);
  };

  const unsubs: Unsubscribe[] = [];

  const userDocRef = doc(db, 'users', userId);
  setDoc(
    userDocRef,
    sanitizeForFirestore({
      email,
      displayName,
      updatedAt: new Date().toISOString(),
    }),
    { merge: true }
  ).catch(() => {});

  unsubs.push(
    onSnapshot(
      collection(db, 'users', userId, 'accounts'),
      (snap) => {
        const next: Record<string, Account> = {};
        snap.forEach((d) => {
          next[d.id] = { ...(d.data() as Account), id: d.id };
        });
        state.accounts = next;
        emit();
      },
      handleErr
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'users', userId, 'funds'),
      (snap) => {
        const next: Record<string, Fund> = {};
        snap.forEach((d) => {
          next[d.id] = { ...(d.data() as Fund), id: d.id };
        });
        state.funds = next;
        emit();
      },
      handleErr
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'users', userId, 'incomes'),
      (snap) => {
        const next: Record<string, IncomeTransaction> = {};
        snap.forEach((d) => {
          next[d.id] = { ...(d.data() as IncomeTransaction), id: d.id };
        });
        state.incomes = next;
        emit();
      },
      handleErr
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'users', userId, 'expenses'),
      (snap) => {
        const next: Record<string, ExpenseTransaction> = {};
        snap.forEach((d) => {
          next[d.id] = { ...(d.data() as ExpenseTransaction), id: d.id };
        });
        state.expenses = next;
        emit();
      },
      handleErr
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'users', userId, 'allocations'),
      (snap) => {
        const next: Record<string, AllocationRecord> = {};
        snap.forEach((d) => {
          next[d.id] = { ...(d.data() as AllocationRecord), id: d.id };
        });
        state.allocations = next;
        emit();
      },
      handleErr
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'users', userId, 'auditLogs'),
      (snap) => {
        const next: Record<string, AuditLogEntry> = {};
        snap.forEach((d) => {
          next[d.id] = { ...(d.data() as AuditLogEntry), id: d.id };
        });
        state.auditLogs = next;
        emit();
      },
      handleErr
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'users', userId, 'settings', 'default'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as AllocationSettings;
          state.settings = {
            ...createEmptySettings(),
            ...data,
            workingCapitalBalance: roundCents(data.workingCapitalBalance ?? 0),
            workingCapitalCycleDeposited: roundCents(data.workingCapitalCycleDeposited ?? 0),
            workingCapitalCycleSpent: roundCents(data.workingCapitalCycleSpent ?? 0),
            id: 'default',
          };
        } else {
          state.settings = createEmptySettings();
        }
        emit();
      },
      handleErr
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

// =============================================================================
// CLOUD FIRESTORE ATOMIC OPERATIONS (/users/{userId}/...)
// =============================================================================

export async function saveAccountToFirestore(
  userId: string,
  input: {
    id?: string;
    name: string;
    type: AccountType;
    balance: number;
    currency?: string;
  }
): Promise<Account> {
  if (!userId) throw new AppError('AUTH_REQUIRED', 'User must be authenticated.');
  if (!input.name || !input.name.trim()) throw new AppError('ACCOUNT_NAME_REQUIRED', 'Account name is required.');
  if (!Number.isFinite(input.balance)) throw new AppError('ACCOUNT_BALANCE_INVALID', 'Account balance must be a valid number.');

  const now = new Date().toISOString();
  const accountId = input.id || `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const accountDoc: Account = {
    id: accountId,
    name: input.name.trim(),
    type: input.type,
    balance: roundCents(input.balance),
    currency: input.currency || 'TJS',
    updatedAt: now,
  };

  await setDoc(
    doc(db, 'users', userId, 'accounts', accountId),
    sanitizeForFirestore(accountDoc)
  );

  const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const auditEntry: AuditLogEntry = {
    id: logId,
    action: 'SETTINGS_UPDATED',
    entityType: 'system',
    entityId: accountId,
    summary: `${input.id ? 'Updated' : 'Created'} ${accountDoc.type} account "${accountDoc.name}" (${accountDoc.balance.toFixed(2)} TJS)`,
    details: { accountId, name: accountDoc.name, type: accountDoc.type, balance: accountDoc.balance },
    timestamp: now,
  };
  await setDoc(doc(db, 'users', userId, 'auditLogs', logId), sanitizeForFirestore(auditEntry));

  return accountDoc;
}

export async function deleteAccountFromFirestore(
  userId: string,
  accountId: string
): Promise<void> {
  if (!userId) throw new AppError('AUTH_REQUIRED', 'User must be authenticated.');
  await deleteDoc(doc(db, 'users', userId, 'accounts', accountId));
}

/**
 * Creates or updates an Account Card (Fund / Goal) under `/users/{userId}/funds/{fundId}`.
 * When creating a new spending account with an initial balance > 0, treats that initial balance
 * as carried over (`cycleStartBalance`) so only the remaining difference is topped up this month.
 */
export async function saveFundToFirestore(
  userId: string,
  fundInput: Partial<Fund> & { name: string; type: Fund['type'] },
  currentFunds: Fund[]
): Promise<Fund> {
  if (!userId) throw new AppError('AUTH_REQUIRED', 'User must be authenticated.');
  validateFundInput(fundInput);

  const now = new Date().toISOString();
  const isExisting = Boolean(fundInput.id && currentFunds.some((f) => f.id === fundInput.id));
  const fundId = fundInput.id || `fund-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const existing = currentFunds.find((f) => f.id === fundId);

  if (fundInput.type === 'percentage' && (fundInput.isActive ?? true)) {
    const otherPctSum = currentFunds
      .filter((f) => f.id !== fundId && f.isActive && f.type === 'percentage')
      .reduce((sum, f) => sum + (f.percentage ?? 0), 0);
    if (otherPctSum + (fundInput.percentage ?? 0) > 100) {
      throw new AppError(
        'SAVINGS_TOTAL_EXCEEDS',
        `Total Savings percentage rules (${otherPctSum + (fundInput.percentage ?? 0)}%) cannot exceed 100%.`,
        { total: otherPctSum + (fundInput.percentage ?? 0) }
      );
    }
  }

  const nextReserved = roundCents(fundInput.reservedAmount ?? existing?.reservedAmount ?? 0);
  const nextCycleAllocated = isExisting
    ? roundCents(fundInput.cycleAllocated ?? existing?.cycleAllocated ?? 0)
    : 0;
  const nextCycleSpent = isExisting
    ? roundCents(fundInput.cycleSpent ?? existing?.cycleSpent ?? 0)
    : 0;
  const nextCycleStartBalance =
    fundInput.cycleStartBalance !== undefined
      ? roundCents(fundInput.cycleStartBalance)
      : isExisting
      ? roundCents(existing?.cycleStartBalance ?? 0)
      : fundInput.type === 'percentage'
      ? 0
      : nextReserved;

  const savedFund: Fund = {
    id: fundId,
    name: fundInput.name.trim(),
    type: fundInput.type,
    category: fundInput.category?.trim() || existing?.category || CANON.accountCard,
    percentage: fundInput.type === 'percentage' ? Number(fundInput.percentage ?? 0) : undefined,
    targetAmount: roundCents(
      fundInput.targetAmount ?? fundInput.monthlyAmount ?? existing?.targetAmount ?? 0
    ),
    monthlyAmount:
      fundInput.type === 'monthly'
        ? roundCents(fundInput.monthlyAmount ?? fundInput.targetAmount ?? 0)
        : undefined,
    targetDate: fundInput.targetDate ?? existing?.targetDate,
    monthsRemaining: fundInput.monthsRemaining ?? existing?.monthsRemaining,
    reservedAmount: nextReserved,
    cycleStartBalance: nextCycleStartBalance,
    cycleAllocated: nextCycleAllocated,
    cycleSpent: nextCycleSpent,
    accountId: fundInput.accountId ?? existing?.accountId ?? '',
    priority: fundInput.priority ?? existing?.priority ?? currentFunds.length + 1,
    isActive: fundInput.isActive ?? existing?.isActive ?? true,
    color: fundInput.color ?? existing?.color ?? '#10b981',
    icon: fundInput.icon ?? existing?.icon ?? 'card',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'users', userId, 'funds', fundId), sanitizeForFirestore(savedFund));

  const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const logDoc: AuditLogEntry = {
    id: logId,
    action: isExisting ? 'FUND_UPDATED' : 'FUND_CREATED',
    entityType: 'fund',
    entityId: fundId,
    summary: `${isExisting ? 'Updated' : 'Created'} Account Card "${savedFund.name}" (${
      savedFund.type === 'percentage'
        ? `Savings ${savedFund.percentage}%`
        : savedFund.type === 'monthly'
        ? `Monthly Required ${savedFund.targetAmount.toFixed(2)} TJS`
        : `Goal ${savedFund.targetAmount.toFixed(2)} TJS`
    })`,
    details: {
      fundId,
      name: savedFund.name,
      type: savedFund.type,
      targetAmount: savedFund.targetAmount,
      percentage: savedFund.percentage ?? null,
      reservedAmount: savedFund.reservedAmount,
      cycleStartBalance: savedFund.cycleStartBalance ?? 0,
      targetDate: savedFund.targetDate ?? null,
    },
    timestamp: now,
  };
  await setDoc(doc(db, 'users', userId, 'auditLogs', logId), sanitizeForFirestore(logDoc));

  return savedFund;
}

export async function deleteFundFromFirestore(
  userId: string,
  fund: Fund
): Promise<void> {
  if (!userId) throw new AppError('AUTH_REQUIRED', 'User must be authenticated.');
  // The security rules let a card go only once it is empty (otherwise its money would vanish from the books).
  // Say so plainly here instead of letting the request fail with a generic "access denied".
  const balance = roundCents(fund.reservedAmount ?? 0);
  if (balance > 0) {
    throw new AppError(
      'FUND_HAS_BALANCE',
      `"${fund.name}" still holds ${balance.toFixed(2)} TJS, so the card cannot be deleted.`,
      { name: fund.name, amount: balance.toFixed(2) }
    );
  }
  await deleteDoc(doc(db, 'users', userId, 'funds', fund.id));

  const now = new Date().toISOString();
  const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await setDoc(
    doc(db, 'users', userId, 'auditLogs', logId),
    sanitizeForFirestore({
      id: logId,
      action: 'FUND_DELETED',
      entityType: 'fund',
      entityId: fund.id,
      summary: `Deleted Account Card "${fund.name}"`,
      details: { fundId: fund.id, name: fund.name },
      timestamp: now,
    })
  );
}

/**
 * Rolls over all Account Cards in Cloud Firestore to a new month:
 * Remaining balances on spending accounts are carried over (`cycleStartBalance = reservedAmount`),
 * and `cycleAllocated` (monthly deposit) and `cycleSpent` (monthly expenses) reset to 0 so that
 * only the remaining needed amount (`monthlyRequired - cycleStartBalance`) is topped up in the new month.
 */
export async function rolloverToNextMonthInFirestore(
  userId: string,
  nextMonthLabel?: string
): Promise<void> {
  if (!userId) throw new AppError('AUTH_REQUIRED', 'User must be authenticated.');

  const fundsQuerySnap = await getDocs(collection(db, 'users', userId, 'funds'));
  const fundDocIds = fundsQuerySnap.docs.map((d) => d.id);

  await runTransaction(db, async (tx) => {
    const fundSnaps = await Promise.all(
      fundDocIds.map((fid) => tx.get(doc(db, 'users', userId, 'funds', fid)))
    );
    const settingsRef = doc(db, 'users', userId, 'settings', 'default');
    const settingsSnap = await tx.get(settingsRef);

    const now = new Date().toISOString();
    const currentFunds: Fund[] = fundSnaps
      .filter((s) => s.exists())
      .map((s) => ({ ...(s.data() as Fund), id: s.id }));

    const rolledFunds = rolloverFundsToNextMonth(currentFunds, now);

    const settings: AllocationSettings = settingsSnap.exists()
      ? { ...createEmptySettings(), ...(settingsSnap.data() as AllocationSettings) }
      : createEmptySettings();

    // Advance month label (e.g., '2026-09' -> '2026-10')
    let targetMonth = nextMonthLabel;
    if (!targetMonth) {
      const [y, m] = (settings.currentCycleMonth || now.slice(0, 7)).split('-').map(Number);
      const nextDate = new Date(Date.UTC(y || 2026, (m || 9), 1));
      targetMonth = nextDate.toISOString().slice(0, 7);
    }

    for (const rf of rolledFunds) {
      tx.set(doc(db, 'users', userId, 'funds', rf.id), sanitizeForFirestore(rf));
    }

    tx.set(
      settingsRef,
      sanitizeForFirestore({
        ...settings,
        currentCycleMonth: targetMonth,
        workingCapitalCycleDeposited: 0,
        workingCapitalCycleSpent: 0,
        updatedAt: now,
      })
    );

    const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    tx.set(
      doc(db, 'users', userId, 'auditLogs', logId),
      sanitizeForFirestore({
        id: logId,
        action: 'CYCLE_RESET',
        entityType: 'system',
        entityId: targetMonth,
        summary: `Rolled over to new month (${targetMonth}): carried over remaining account balances; only remaining needed amounts will be topped up`,
        details: {
          newCycleMonth: targetMonth,
          carriedOverAccounts: rolledFunds
            .filter((f) => f.type !== 'percentage')
            .map((f) => ({
              name: f.name,
              carriedOverBalance: f.cycleStartBalance ?? 0,
              monthlyRequired: f.targetAmount,
              newTopUpTarget: Math.max(0, roundCents(f.targetAmount - (f.cycleStartBalance ?? 0))),
            })),
        },
        timestamp: now,
      })
    );
  });
}

/**
 * Adds an Income transaction and atomically:
 * 1. Charges Savings accounts (percentage-first from every income)
 * 2. Splits remaining income in equal percentage regarding remaining needed amount across Spending Account Cards
 *    until each account collects its required monthly amount (skipping accounts already 100% collected this month)
 * 3. Credits any leftover surplus to Working Capital (`settings.workingCapitalBalance`)
 */
export async function addIncomeToFirestore(
  userId: string,
  input: NewIncomeInput
): Promise<{
  income: IncomeTransaction;
  allocations: AllocationRecord[];
  preview: AllocationPreviewResult;
}> {
  if (!userId) throw new AppError('AUTH_REQUIRED', 'User must be authenticated.');
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0) {
    throw new AppError('INCOME_AMOUNT_INVALID', 'Income amount must be a positive number (> 0 TJS).');
  }
  if (!input.date || !/^\d{4}-\d{2}-\d{2}/.test(input.date)) {
    throw new AppError('INCOME_DATE_INVALID', 'Income date must be a valid YYYY-MM-DD date.');
  }
  if (!input.source || input.source.trim().length === 0) {
    throw new AppError('INCOME_SOURCE_REQUIRED', 'Income source is required.');
  }

  const fundsQuerySnap = await getDocs(collection(db, 'users', userId, 'funds'));
  const fundDocIds = fundsQuerySnap.docs.map((d) => d.id);

  return await runTransaction(db, async (tx) => {
    // 1. ALL READS FIRST
    const fundSnaps = await Promise.all(
      fundDocIds.map((fid) => tx.get(doc(db, 'users', userId, 'funds', fid)))
    );
    const settingsRef = doc(db, 'users', userId, 'settings', 'default');
    const settingsSnap = await tx.get(settingsRef);
    const accountRef = input.accountId
      ? doc(db, 'users', userId, 'accounts', input.accountId)
      : null;
    const accountSnap = accountRef ? await tx.get(accountRef) : null;

    const now = new Date().toISOString();
    let fundsList: Fund[] = fundSnaps
      .filter((s) => s.exists())
      .map((s) => ({ ...(s.data() as Fund), id: s.id }))
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

    const settings: AllocationSettings = settingsSnap.exists()
      ? { ...createEmptySettings(), ...(settingsSnap.data() as AllocationSettings) }
      : createEmptySettings();

    // If income date is in a new month compared to settings.currentCycleMonth and any fund had activity,
    // automatically roll over remaining balances into the new month!
    const incomeMonth = input.date.slice(0, 7);
    const hadPriorActivity = fundsList.some(
      (f) => (f.cycleAllocated ?? 0) > 0 || (f.cycleSpent ?? 0) > 0
    );
    if (
      settings.currentCycleMonth &&
      incomeMonth > settings.currentCycleMonth &&
      hadPriorActivity
    ) {
      fundsList = rolloverFundsToNextMonth(fundsList, now);
      settings.currentCycleMonth = incomeMonth;
      settings.workingCapitalCycleDeposited = 0;
      settings.workingCapitalCycleSpent = 0;
    } else if (!settingsSnap.exists()) {
      settings.currentCycleMonth = incomeMonth;
    }

    // 2. COMPUTE ALLOCATIONS
    // Automatic split, a customized split, or manual deposits to specific cards (+ the rest per the chosen
    // remainder mode). This runs against the cards as they are AFTER any month rollover above, so manual
    // deposits count toward this month's deposit exactly like automatic ones.
    const distribution = computeIncomeDistribution(input.amount, fundsList, settings, input.date, {
      customAllocations: input.customAllocations,
      manualDeposits: input.manualDeposits,
      manualRemainderMode: input.manualRemainderMode,
    });
    const preview = distribution.preview;
    const finalDrafts = distribution.drafts;
    const workingCapitalAdded = distribution.workingCapitalAdded;
    const manualDepositTotal = distribution.manualDepositTotal;

    const totalAllocated = roundCents(finalDrafts.reduce((s, d) => s + d.amount, 0));
    if (totalAllocated > roundCents(input.amount)) {
      throw new AppError(
        'ALLOCATIONS_EXCEED_INCOME',
        `Total allocations (${totalAllocated.toFixed(2)} TJS) cannot exceed income (${input.amount.toFixed(2)} TJS).`,
        { total: totalAllocated.toFixed(2), income: input.amount.toFixed(2) }
      );
    }

    const incomeId = `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const createdAllocations: AllocationRecord[] = [];
    const allocationIds: string[] = [];

    // 3. ALL WRITES
    for (let i = 0; i < finalDrafts.length; i++) {
      const d = finalDrafts[i];
      if (d.amount <= 0) continue;
      const allocId = `alloc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`;
      allocationIds.push(allocId);

      const record: AllocationRecord = {
        id: allocId,
        incomeId,
        fundId: d.fundId,
        fundName: d.fundName,
        amount: roundCents(d.amount),
        ruleStage: d.ruleStage,
        ruleUsed: d.ruleUsed,
        ...(d.ruleDetails ? { ruleDetails: d.ruleDetails } : {}),
        needBeforeAllocation: d.needBeforeAllocation,
        fundingRatio: d.fundingRatio,
        status: 'active',
        timestamp: now,
      };
      createdAllocations.push(record);
      tx.set(
        doc(db, 'users', userId, 'allocations', allocId),
        sanitizeForFirestore(record)
      );
    }

    const updatedFunds = applyAllocationsToFunds(fundsList, finalDrafts, now);
    for (const uf of updatedFunds) {
      tx.set(doc(db, 'users', userId, 'funds', uf.id), sanitizeForFirestore(uf));
    }

    if (accountRef && accountSnap && accountSnap.exists()) {
      const currentBal = (accountSnap.data() as Account).balance ?? 0;
      tx.update(accountRef, {
        balance: roundCents(currentBal + input.amount),
        updatedAt: now,
      });
    }

    const nextWorkingCapital = roundCents(
      (settings.workingCapitalBalance ?? 0) + workingCapitalAdded
    );
    const nextWorkingCapitalDeposited = roundCents(
      (settings.workingCapitalCycleDeposited ?? 0) + workingCapitalAdded
    );

    tx.set(
      settingsRef,
      sanitizeForFirestore({
        ...settings,
        workingCapitalBalance: nextWorkingCapital,
        workingCapitalCycleDeposited: nextWorkingCapitalDeposited,
        updatedAt: now,
      })
    );

    const incomeDoc: IncomeTransaction = {
      id: incomeId,
      amount: roundCents(input.amount),
      date: input.date,
      source: input.source.trim(),
      accountId: input.accountId || '',
      notes: input.notes,
      appliedAllocations: allocationIds,
      unallocatedSurplus: workingCapitalAdded,
      fundingRatioAchieved: preview.needFundingRatio,
      status: 'active',
      createdAt: now,
    };
    tx.set(doc(db, 'users', userId, 'incomes', incomeId), sanitizeForFirestore(incomeDoc));

    const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const auditDoc: AuditLogEntry = {
      id: logId,
      action: 'INCOME_ADDED',
      entityType: 'income',
      entityId: incomeId,
      summary: `Added income ${incomeDoc.amount.toFixed(2)} TJS from "${incomeDoc.source}" (cards funded: ${createdAllocations.length}${
        manualDepositTotal > 0 ? `, deposited manually: ${manualDepositTotal.toFixed(2)} TJS` : ''
      }${workingCapitalAdded > 0 ? `, to Working Capital: +${workingCapitalAdded.toFixed(2)} TJS` : ''})`,
      details: {
        incomeId,
        amount: incomeDoc.amount,
        currency: 'TJS',
        date: incomeDoc.date,
        source: incomeDoc.source,
        manualDepositTotal,
        manualRemainderMode: input.manualDeposits ? (input.manualRemainderMode ?? 'auto_split') : null,
        savingsChargedTotal: preview.percentageTotal,
        allocatedToAccountsTotal: preview.allocatedToNeedsTotal,
        workingCapitalAdded,
        needFundingRatio: preview.needFundingRatio,
        allocations: createdAllocations.map((a) => ({
          accountCard: a.fundName,
          amount: a.amount,
          ruleUsed: a.ruleUsed,
        })),
      },
      timestamp: now,
    };
    tx.set(doc(db, 'users', userId, 'auditLogs', logId), sanitizeForFirestore(auditDoc));

    return { income: incomeDoc, allocations: createdAllocations, preview };
  });
}

/**
 * Atomically undoes (soft-deletes) an Income transaction in Cloud Firestore,
 * rolling back all Account Card balances and Working Capital additions.
 */
export async function undoIncomeInFirestore(
  userId: string,
  incomeId: string
): Promise<{ undoneIncome: IncomeTransaction; rolledBackAllocations: AllocationRecord[] }> {
  if (!userId) throw new AppError('AUTH_REQUIRED', 'User must be authenticated.');

  const fundsQuerySnap = await getDocs(collection(db, 'users', userId, 'funds'));
  const fundDocIds = fundsQuerySnap.docs.map((d) => d.id);

  return await runTransaction(db, async (tx) => {
    // 1. READS FIRST
    const incomeRef = doc(db, 'users', userId, 'incomes', incomeId);
    const incomeSnap = await tx.get(incomeRef);
    if (!incomeSnap.exists()) {
      throw new AppError('INCOME_NOT_FOUND', `Income transaction '${incomeId}' not found.`);
    }
    const income = { ...(incomeSnap.data() as IncomeTransaction), id: incomeSnap.id };
    if (income.status === 'undone') {
      throw new AppError(
        'INCOME_ALREADY_UNDONE',
        `Income transaction '${incomeId}' has already been undone.`
      );
    }

    const allocRefs = (income.appliedAllocations || []).map((aid) =>
      doc(db, 'users', userId, 'allocations', aid)
    );
    const allocSnaps = await Promise.all(allocRefs.map((r) => tx.get(r)));
    const fundSnaps = await Promise.all(
      fundDocIds.map((fid) => tx.get(doc(db, 'users', userId, 'funds', fid)))
    );

    const settingsRef = doc(db, 'users', userId, 'settings', 'default');
    const settingsSnap = await tx.get(settingsRef);

    const accountRef = income.accountId
      ? doc(db, 'users', userId, 'accounts', income.accountId)
      : null;
    const accountSnap = accountRef ? await tx.get(accountRef) : null;

    // 2. COMPUTE ROLLBACK
    const now = new Date().toISOString();
    const allocationsToUndo: AllocationRecord[] = [];
    for (const aSnap of allocSnaps) {
      if (aSnap.exists()) {
        const rec = { ...(aSnap.data() as AllocationRecord), id: aSnap.id };
        if (rec.status === 'active') {
          allocationsToUndo.push(rec);
        }
      }
    }

    const currentFunds: Fund[] = fundSnaps
      .filter((s) => s.exists())
      .map((s) => ({ ...(s.data() as Fund), id: s.id }));

    const rolledBackFunds = rollbackAllocationsFromFunds(currentFunds, allocationsToUndo, now);

    // 3. WRITES
    for (const rf of rolledBackFunds) {
      tx.set(doc(db, 'users', userId, 'funds', rf.id), sanitizeForFirestore(rf));
    }

    for (const rec of allocationsToUndo) {
      tx.update(doc(db, 'users', userId, 'allocations', rec.id), {
        status: 'undone',
      });
    }

    if (settingsSnap.exists() && (income.unallocatedSurplus ?? 0) > 0) {
      const sData = settingsSnap.data() as AllocationSettings;
      tx.update(settingsRef, {
        workingCapitalBalance: Math.max(
          0,
          roundCents((sData.workingCapitalBalance ?? 0) - income.unallocatedSurplus)
        ),
        workingCapitalCycleDeposited: Math.max(
          0,
          roundCents((sData.workingCapitalCycleDeposited ?? 0) - income.unallocatedSurplus)
        ),
        updatedAt: now,
      });
    }

    if (accountRef && accountSnap && accountSnap.exists()) {
      const currentBal = (accountSnap.data() as Account).balance ?? 0;
      tx.update(accountRef, {
        balance: roundCents(currentBal - income.amount),
        updatedAt: now,
      });
    }

    tx.update(incomeRef, {
      status: 'undone',
      undoneAt: now,
    });

    const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const auditDoc: AuditLogEntry = {
      id: logId,
      action: 'INCOME_UNDONE',
      entityType: 'income',
      entityId: incomeId,
      summary: `Undid income ${income.amount.toFixed(2)} TJS ("${income.source}") — card allocations rolled back: ${allocationsToUndo.length}`,
      details: {
        incomeId,
        amount: income.amount,
        currency: 'TJS',
        source: income.source,
        workingCapitalRolledBack: income.unallocatedSurplus ?? 0,
        rolledBackAllocations: allocationsToUndo.map((a) => ({
          fundId: a.fundId,
          fundName: a.fundName,
          amountRestored: a.amount,
        })),
      },
      timestamp: now,
    };
    tx.set(doc(db, 'users', userId, 'auditLogs', logId), sanitizeForFirestore(auditDoc));

    return {
      undoneIncome: { ...income, status: 'undone', undoneAt: now },
      rolledBackAllocations: allocationsToUndo,
    };
  });
}

/**
 * Atomically records an Expense transaction in Cloud Firestore, deducting from
 * the selected Spending Account Card (e.g., Fuel, Wife's Expenses, Meals, Entertainment)
 * OR from Working Capital (`fundId === 'working-capital'`).
 * Spending from Savings (`type === 'percentage'`) accounts is blocked.
 */
export async function addExpenseToFirestore(
  userId: string,
  input: {
    amount: number;
    date: string;
    category: string;
    description: string;
    fundId?: string;
    accountId: string;
  }
): Promise<ExpenseTransaction> {
  if (!userId) throw new AppError('AUTH_REQUIRED', 'User must be authenticated.');
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0) {
    throw new AppError('EXPENSE_AMOUNT_INVALID', 'Expense amount must be a positive number (> 0 TJS).');
  }
  if (!input.date || !/^\d{4}-\d{2}-\d{2}/.test(input.date)) {
    throw new AppError('EXPENSE_DATE_INVALID', 'Expense date must be a valid YYYY-MM-DD date.');
  }
  if (!input.category || input.category.trim().length === 0) {
    throw new AppError('EXPENSE_CATEGORY_REQUIRED', 'Expense category is required.');
  }

  return await runTransaction(db, async (tx) => {
    const isWorkingCapital = input.fundId === 'working-capital';

    // 1. READS FIRST
    const fundRef =
      input.fundId && !isWorkingCapital
        ? doc(db, 'users', userId, 'funds', input.fundId)
        : null;
    const fundSnap = fundRef ? await tx.get(fundRef) : null;

    const settingsRef = doc(db, 'users', userId, 'settings', 'default');
    const settingsSnap = isWorkingCapital ? await tx.get(settingsRef) : null;

    const accRef = input.accountId ? doc(db, 'users', userId, 'accounts', input.accountId) : null;
    const accSnap = accRef ? await tx.get(accRef) : null;

    const now = new Date().toISOString();
    let fundName: string | undefined;
    let previousFundReserved: number | undefined;
    let newFundReserved: number | undefined;

    // 2. WRITES
    if (isWorkingCapital) {
      fundName = CANON.workingCapital;
      const sData = settingsSnap?.exists()
        ? (settingsSnap.data() as AllocationSettings)
        : createEmptySettings();
      previousFundReserved = sData.workingCapitalBalance ?? 0;
      newFundReserved = Math.max(0, roundCents(previousFundReserved - input.amount));
      const nextWcSpent = roundCents((sData.workingCapitalCycleSpent ?? 0) + input.amount);
      tx.set(
        settingsRef,
        sanitizeForFirestore({
          ...sData,
          workingCapitalBalance: newFundReserved,
          workingCapitalCycleSpent: nextWcSpent,
          updatedAt: now,
        })
      );
    } else if (fundRef && fundSnap && fundSnap.exists()) {
      const fData = fundSnap.data() as Fund;
      if (fData.type === 'percentage') {
        throw new AppError(
          'SPEND_FROM_SAVINGS_DISABLED',
          'Spend from Card is disabled for Savings accounts.'
        );
      }
      fundName = fData.name;
      previousFundReserved = fData.reservedAmount;
      newFundReserved = Math.max(0, roundCents(fData.reservedAmount - input.amount));
      const nextCycleSpent = roundCents((fData.cycleSpent ?? 0) + input.amount);
      tx.update(fundRef, {
        reservedAmount: newFundReserved,
        cycleSpent: nextCycleSpent,
        updatedAt: now,
      });
    }

    if (accRef && accSnap && accSnap.exists()) {
      const aData = accSnap.data() as Account;
      tx.update(accRef, {
        balance: roundCents((aData.balance ?? 0) - input.amount),
        updatedAt: now,
      });
    }

    const expenseId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const expenseDoc: ExpenseTransaction = {
      id: expenseId,
      amount: roundCents(input.amount),
      date: input.date,
      category: input.category.trim(),
      description: input.description?.trim() || input.category.trim(),
      fundId: input.fundId || undefined,
      fundName,
      accountId: input.accountId || '',
      status: 'active',
      createdAt: now,
    };
    tx.set(doc(db, 'users', userId, 'expenses', expenseId), sanitizeForFirestore(expenseDoc));

    const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const auditDoc: AuditLogEntry = {
      id: logId,
      action: 'EXPENSE_ADDED',
      entityType: 'expense',
      entityId: expenseId,
      summary: `Spent ${expenseDoc.amount.toFixed(2)} TJS (${expenseDoc.category})${
        fundName ? ` from "${fundName}" card` : ''
      }`,
      details: {
        expenseId,
        amount: expenseDoc.amount,
        currency: 'TJS',
        category: expenseDoc.category,
        description: expenseDoc.description,
        fundId: input.fundId ?? null,
        fundName: fundName ?? null,
        previousFundReserved: previousFundReserved ?? null,
        newFundReserved: newFundReserved ?? null,
      },
      timestamp: now,
    };
    tx.set(doc(db, 'users', userId, 'auditLogs', logId), sanitizeForFirestore(auditDoc));

    return expenseDoc;
  });
}

/**
 * Atomically undoes (soft-deletes) an Expense transaction in Cloud Firestore,
 * restoring the deducted amount to the linked Account Card or Working Capital.
 */
export async function undoExpenseInFirestore(
  userId: string,
  expenseId: string
): Promise<ExpenseTransaction> {
  if (!userId) throw new AppError('AUTH_REQUIRED', 'User must be authenticated.');

  return await runTransaction(db, async (tx) => {
    // 1. READS FIRST
    const expRef = doc(db, 'users', userId, 'expenses', expenseId);
    const expSnap = await tx.get(expRef);
    if (!expSnap.exists()) {
      throw new AppError('EXPENSE_NOT_FOUND', `Expense transaction '${expenseId}' not found.`);
    }
    const expense = { ...(expSnap.data() as ExpenseTransaction), id: expSnap.id };
    if (expense.status === 'undone') {
      throw new AppError(
        'EXPENSE_ALREADY_UNDONE',
        `Expense transaction '${expenseId}' is already undone.`
      );
    }

    const isWorkingCapital = expense.fundId === 'working-capital';
    const fundRef =
      expense.fundId && !isWorkingCapital
        ? doc(db, 'users', userId, 'funds', expense.fundId)
        : null;
    const fundSnap = fundRef ? await tx.get(fundRef) : null;

    const settingsRef = doc(db, 'users', userId, 'settings', 'default');
    const settingsSnap = isWorkingCapital ? await tx.get(settingsRef) : null;

    const accRef = expense.accountId ? doc(db, 'users', userId, 'accounts', expense.accountId) : null;
    const accSnap = accRef ? await tx.get(accRef) : null;

    const now = new Date().toISOString();

    // 2. WRITES
    if (isWorkingCapital && settingsSnap && settingsSnap.exists()) {
      const sData = settingsSnap.data() as AllocationSettings;
      tx.update(settingsRef, {
        workingCapitalBalance: roundCents((sData.workingCapitalBalance ?? 0) + expense.amount),
        workingCapitalCycleSpent: Math.max(
          0,
          roundCents((sData.workingCapitalCycleSpent ?? 0) - expense.amount)
        ),
        updatedAt: now,
      });
    } else if (fundRef && fundSnap && fundSnap.exists()) {
      const fData = fundSnap.data() as Fund;
      tx.update(fundRef, {
        reservedAmount: roundCents((fData.reservedAmount ?? 0) + expense.amount),
        cycleSpent: Math.max(0, roundCents((fData.cycleSpent ?? 0) - expense.amount)),
        updatedAt: now,
      });
    }

    if (accRef && accSnap && accSnap.exists()) {
      const aData = accSnap.data() as Account;
      tx.update(accRef, {
        balance: roundCents((aData.balance ?? 0) + expense.amount),
        updatedAt: now,
      });
    }

    tx.update(expRef, {
      status: 'undone',
      undoneAt: now,
    });

    const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const auditDoc: AuditLogEntry = {
      id: logId,
      action: 'EXPENSE_UNDONE',
      entityType: 'expense',
      entityId: expenseId,
      summary: `Undid expense ${expense.amount.toFixed(2)} TJS ("${expense.description}")${
        expense.fundName ? ` and restored ${expense.amount.toFixed(2)} TJS to "${expense.fundName}" card` : ''
      }`,
      details: {
        expenseId,
        amount: expense.amount,
        amountRestored: expense.amount,
        currency: 'TJS',
        description: expense.description,
        fundId: expense.fundId ?? null,
        fundName: expense.fundName ?? null,
      },
      timestamp: now,
    };
    tx.set(doc(db, 'users', userId, 'auditLogs', logId), sanitizeForFirestore(auditDoc));

    return { ...expense, status: 'undone', undoneAt: now };
  });
}

export async function updateSettingsInFirestore(
  userId: string,
  settingsUpdate: Partial<AllocationSettings>,
  currentSettings: AllocationSettings
): Promise<AllocationSettings> {
  if (!userId) throw new AppError('AUTH_REQUIRED', 'User must be authenticated.');
  const now = new Date().toISOString();
  const nextSettings: AllocationSettings = {
    ...currentSettings,
    ...settingsUpdate,
    id: 'default',
    updatedAt: now,
  };

  await setDoc(
    doc(db, 'users', userId, 'settings', 'default'),
    sanitizeForFirestore(nextSettings)
  );

  const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await setDoc(
    doc(db, 'users', userId, 'auditLogs', logId),
    sanitizeForFirestore({
      id: logId,
      action: 'SETTINGS_UPDATED',
      entityType: 'settings',
      entityId: 'default',
      summary: `Updated surplus / Working Capital settings`,
      details: {
        surplusStrategy: nextSettings.surplusStrategy,
        surplusRules: nextSettings.surplusRules,
        workingCapitalBalance: nextSettings.workingCapitalBalance ?? 0,
      },
      timestamp: now,
    })
  );

  return nextSettings;
}

// =============================================================================
// IN-MEMORY TRANSACTION ENGINE FOR ISOLATED UNIT/INTEGRATION TESTS (NO MOCK SEED)
// =============================================================================
export function assertSecurityRule(
  authenticatedUid: string | null,
  targetUserId: string,
  operation: string
): void {
  if (!authenticatedUid) {
    throw new Error(`FirebaseError: [permission-denied] Unauthenticated request blocked on ${operation}.`);
  }
  if (authenticatedUid !== targetUserId) {
    throw new Error(
      `FirebaseError: [permission-denied] User '${authenticatedUid}' cannot access '/users/${targetUserId}' during ${operation}.`
    );
  }
}

export class FinanceBaaSService {
  private store: Map<string, UserFirestoreHierarchy> = new Map();
  private currentUserId: string;

  constructor(initialUserId: string, email: string, displayName: string) {
    this.currentUserId = initialUserId;
    this.store.set(initialUserId, createEmptyUserHierarchy(initialUserId, email, displayName));
  }

  private runAtomicTransaction<T>(
    targetUserId: string,
    operationName: string,
    mutationFn: (draft: UserFirestoreHierarchy) => T
  ): T {
    assertSecurityRule(this.currentUserId, targetUserId, operationName);
    const current = this.store.get(targetUserId);
    if (!current) {
      throw new Error(`User document '/users/${targetUserId}' does not exist.`);
    }
    const draft: UserFirestoreHierarchy = JSON.parse(JSON.stringify(current));
    const result = mutationFn(draft);
    this.store.set(targetUserId, draft);
    return result;
  }

  public getUserSnapshot(targetUserId: string = this.currentUserId): UserFirestoreHierarchy {
    assertSecurityRule(this.currentUserId, targetUserId, 'getUserSnapshot');
    return JSON.parse(JSON.stringify(this.store.get(targetUserId)!));
  }

  public getFunds(targetUserId: string = this.currentUserId): Fund[] {
    return Object.values(this.getUserSnapshot(targetUserId).funds).sort(
      (a, b) => a.priority - b.priority
    );
  }

  public getAccounts(targetUserId: string = this.currentUserId): Account[] {
    return Object.values(this.getUserSnapshot(targetUserId).accounts);
  }

  public getAllocationsForIncome(
    incomeId: string,
    targetUserId: string = this.currentUserId
  ): AllocationRecord[] {
    return Object.values(this.getUserSnapshot(targetUserId).allocations).filter(
      (a) => a.incomeId === incomeId
    );
  }

  public getAuditLogs(targetUserId: string = this.currentUserId): AuditLogEntry[] {
    return Object.values(this.getUserSnapshot(targetUserId).auditLogs).sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    );
  }

  public saveAccount(
    input: { id?: string; name: string; type: AccountType; balance: number },
    targetUserId: string = this.currentUserId
  ): Account {
    return this.runAtomicTransaction(targetUserId, 'saveAccount', (draft) => {
      const id = input.id || `acc-${Date.now()}`;
      const acc: Account = {
        id,
        name: input.name,
        type: input.type,
        balance: roundCents(input.balance),
        currency: 'TJS',
        updatedAt: new Date().toISOString(),
      };
      draft.accounts[id] = acc;
      return acc;
    });
  }

  public saveFund(
    fundInput: Partial<Fund> & { name: string; type: Fund['type'] },
    targetUserId: string = this.currentUserId
  ): Fund {
    validateFundInput(fundInput);
    return this.runAtomicTransaction(targetUserId, 'saveFund', (draft) => {
      const now = new Date().toISOString();
      const fundId = fundInput.id || `fund-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const existing = draft.funds[fundId];
      const savedFund: Fund = {
        id: fundId,
        name: fundInput.name.trim(),
        type: fundInput.type,
        category: fundInput.category || existing?.category || CANON.general,
        percentage: fundInput.type === 'percentage' ? Number(fundInput.percentage ?? 0) : undefined,
        targetAmount: roundCents(
          fundInput.targetAmount ?? fundInput.monthlyAmount ?? existing?.targetAmount ?? 0
        ),
        monthlyAmount:
          fundInput.type === 'monthly'
            ? roundCents(fundInput.monthlyAmount ?? fundInput.targetAmount ?? 0)
            : undefined,
        targetDate: fundInput.targetDate ?? existing?.targetDate,
        monthsRemaining: fundInput.monthsRemaining ?? existing?.monthsRemaining,
        reservedAmount: roundCents(fundInput.reservedAmount ?? existing?.reservedAmount ?? 0),
        cycleStartBalance: roundCents(fundInput.cycleStartBalance ?? existing?.cycleStartBalance ?? 0),
        cycleAllocated: roundCents(fundInput.cycleAllocated ?? existing?.cycleAllocated ?? 0),
        cycleSpent: roundCents(fundInput.cycleSpent ?? existing?.cycleSpent ?? 0),
        accountId: fundInput.accountId ?? existing?.accountId ?? '',
        priority: fundInput.priority ?? existing?.priority ?? Object.keys(draft.funds).length + 1,
        isActive: fundInput.isActive ?? existing?.isActive ?? true,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      draft.funds[fundId] = savedFund;
      return savedFund;
    });
  }

  public rolloverToNextMonth(targetUserId: string = this.currentUserId): void {
    this.runAtomicTransaction(targetUserId, 'rolloverToNextMonth', (draft) => {
      const rolled = rolloverFundsToNextMonth(Object.values(draft.funds));
      for (const rf of rolled) {
        draft.funds[rf.id] = rf;
      }
    });
  }

  public addIncome(
    input: Omit<NewIncomeInput, 'accountId' | 'notes'> & { accountId?: string; notes?: string },
    targetUserId: string = this.currentUserId
  ): { income: IncomeTransaction; allocations: AllocationRecord[]; preview: AllocationPreviewResult } {
    if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0) {
      throw new AppError('INCOME_AMOUNT_INVALID', 'Income amount must be a positive number (> 0 TJS).');
    }
    return this.runAtomicTransaction(targetUserId, 'addIncome', (draft) => {
      const now = new Date().toISOString();
      const fundsList = Object.values(draft.funds).sort((a, b) => a.priority - b.priority);
      // Same shared logic as the Cloud Firestore transaction: automatic split, customized split,
      // or manual deposits to specific cards (+ the rest per the chosen remainder mode).
      const distribution = computeIncomeDistribution(input.amount, fundsList, draft.settings, input.date, {
        customAllocations: input.customAllocations,
        manualDeposits: input.manualDeposits,
        manualRemainderMode: input.manualRemainderMode,
      });
      const preview = distribution.preview;
      const finalDrafts = distribution.drafts;

      const totalAllocated = roundCents(finalDrafts.reduce((s, d) => s + d.amount, 0));
      if (totalAllocated > roundCents(input.amount)) {
        throw new AppError(
          'ALLOCATIONS_EXCEED_INCOME',
          `Total allocations (${totalAllocated.toFixed(2)} TJS) cannot exceed income (${input.amount.toFixed(2)} TJS).`,
          { total: totalAllocated.toFixed(2), income: input.amount.toFixed(2) }
        );
      }

      const incomeId = `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const createdAllocations: AllocationRecord[] = [];
      const allocationIds: string[] = [];

      for (let i = 0; i < finalDrafts.length; i++) {
        const d = finalDrafts[i];
        if (d.amount <= 0) continue;
        const allocId = `alloc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`;
        allocationIds.push(allocId);
        const record: AllocationRecord = {
          id: allocId,
          incomeId,
          fundId: d.fundId,
          fundName: d.fundName,
          amount: roundCents(d.amount),
          ruleStage: d.ruleStage,
          ruleUsed: d.ruleUsed,
          ...(d.ruleDetails ? { ruleDetails: d.ruleDetails } : {}),
          needBeforeAllocation: d.needBeforeAllocation,
          fundingRatio: d.fundingRatio,
          status: 'active',
          timestamp: now,
        };
        draft.allocations[allocId] = record;
        createdAllocations.push(record);
      }

      const updatedFunds = applyAllocationsToFunds(fundsList, finalDrafts, now);
      for (const uf of updatedFunds) {
        draft.funds[uf.id] = uf;
      }

      const accountId = input.accountId || '';
      if (accountId && draft.accounts[accountId]) {
        draft.accounts[accountId].balance = roundCents(
          draft.accounts[accountId].balance + input.amount
        );
      }

      draft.settings.workingCapitalBalance = roundCents(
        (draft.settings.workingCapitalBalance ?? 0) + distribution.workingCapitalAdded
      );

      const incomeDoc: IncomeTransaction = {
        id: incomeId,
        amount: roundCents(input.amount),
        date: input.date,
        source: input.source.trim(),
        accountId,
        appliedAllocations: allocationIds,
        unallocatedSurplus: distribution.workingCapitalAdded,
        fundingRatioAchieved: preview.needFundingRatio,
        status: 'active',
        createdAt: now,
      };
      draft.incomes[incomeId] = incomeDoc;

      const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      draft.auditLogs[logId] = {
        id: logId,
        action: 'INCOME_ADDED',
        entityType: 'income',
        entityId: incomeId,
        summary: `Added income ${incomeDoc.amount.toFixed(2)} TJS from "${incomeDoc.source}"`,
        details: { incomeId, amount: incomeDoc.amount, source: incomeDoc.source },
        timestamp: now,
      };

      return { income: incomeDoc, allocations: createdAllocations, preview };
    });
  }

  public undoIncome(
    incomeId: string,
    targetUserId: string = this.currentUserId
  ): { undoneIncome: IncomeTransaction; rolledBackAllocations: AllocationRecord[] } {
    return this.runAtomicTransaction(targetUserId, 'undoIncome', (draft) => {
      const income = draft.incomes[incomeId];
      if (!income || income.status === 'undone') {
        throw new Error('Income transaction cannot be undone.');
      }
      const now = new Date().toISOString();
      const allocationsToUndo: AllocationRecord[] = [];
      for (const allocId of income.appliedAllocations) {
        const rec = draft.allocations[allocId];
        if (rec && rec.status === 'active') {
          allocationsToUndo.push({ ...rec });
          draft.allocations[allocId].status = 'undone';
        }
      }

      const rolledBackFunds = rollbackAllocationsFromFunds(
        Object.values(draft.funds),
        allocationsToUndo,
        now
      );
      for (const rf of rolledBackFunds) {
        draft.funds[rf.id] = rf;
      }

      if (income.accountId && draft.accounts[income.accountId]) {
        draft.accounts[income.accountId].balance = roundCents(
          draft.accounts[income.accountId].balance - income.amount
        );
      }

      draft.settings.workingCapitalBalance = Math.max(
        0,
        roundCents((draft.settings.workingCapitalBalance ?? 0) - (income.unallocatedSurplus ?? 0))
      );

      income.status = 'undone';
      income.undoneAt = now;

      const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      draft.auditLogs[logId] = {
        id: logId,
        action: 'INCOME_UNDONE',
        entityType: 'income',
        entityId: incomeId,
        summary: `Undid income ${income.amount.toFixed(2)} TJS ("${income.source}")`,
        details: { incomeId, amount: income.amount, source: income.source },
        timestamp: now,
      };

      return { undoneIncome: { ...income }, rolledBackAllocations: allocationsToUndo };
    });
  }
}
