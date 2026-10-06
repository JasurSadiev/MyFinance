/**
 * Firebase Cloud Functions (v2 Callable) for Smart Finance Manager
 * Stateless backend endpoints executing atomic Firestore transactions
 * with Firebase App Check and strict schema validation.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';
import {
  computeIncomeDistribution,
  IncomeDistribution,
  applyAllocationsToFunds,
  rollbackAllocationsFromFunds,
  validateFundInput,
  roundCents,
} from '../../src/engine/allocationEngine';
import {
  AllocationRecord,
  AllocationSettings,
  ExpenseTransaction,
  Fund,
  IncomeTransaction,
} from '../../src/types/finance';

initializeApp();
const db = getFirestore();
// A Working Capital expense has no fundId/fundName; without this the Admin SDK throws on `undefined` fields.
db.settings({ ignoreUndefinedProperties: true });

/**
 * Callable Cloud Function: /addIncome
 * Validates positive income amount & date, runs the Percentage-First + Sinking Fund
 * + Proportional Shortfall / Surplus engine inside an atomic Firestore transaction,
 * updates target funds & checking account, creates AllocationRecords, and logs to auditLogs.
 *
 * Optional manual deposits: `manualDeposits: [{ fundId, amount }]` directs exact amounts to specific cards.
 * They count toward each card's monthly deposit, and the rest of the income follows `manualRemainderMode`
 * ('auto_split' (default) | 'working_capital'). Same shared logic as the web app.
 */
export const addIncome = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const { amount, date, source, accountId, notes, manualDeposits, manualRemainderMode } = request.data;
  if (typeof amount !== 'number' || amount <= 0 || !Number.isFinite(amount)) {
    throw new HttpsError('invalid-argument', 'Income amount must be a positive number.');
  }
  if (
    manualDeposits !== undefined &&
    (!Array.isArray(manualDeposits) ||
      manualDeposits.some(
        (d: unknown) =>
          !d ||
          typeof (d as { fundId?: unknown }).fundId !== 'string' ||
          typeof (d as { amount?: unknown }).amount !== 'number'
      ))
  ) {
    throw new HttpsError('invalid-argument', 'manualDeposits must be a list of { fundId, amount } items.');
  }
  if (
    manualRemainderMode !== undefined &&
    manualRemainderMode !== 'auto_split' &&
    manualRemainderMode !== 'working_capital'
  ) {
    throw new HttpsError('invalid-argument', "manualRemainderMode must be 'auto_split' or 'working_capital'.");
  }
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date)) {
    throw new HttpsError('invalid-argument', 'A valid ISO date (YYYY-MM-DD) is required.');
  }
  if (!source || typeof source !== 'string' || source.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Income source is required.');
  }

  const userRef = db.collection('users').doc(uid);
  const now = new Date().toISOString();

  return await db.runTransaction(async (tx) => {
    const fundsSnap = await tx.get(userRef.collection('funds'));
    const settingsSnap = await tx.get(userRef.collection('settings').doc('default'));
    const accountRef = userRef.collection('accounts').doc(accountId || 'acc-checking');
    const accountSnap = await tx.get(accountRef);

    const funds: Fund[] = fundsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Fund, 'id'>) }));
    const settings = settingsSnap.exists
      ? (settingsSnap.data() as AllocationSettings)
      : undefined;

    let distribution: IncomeDistribution;
    try {
      distribution = computeIncomeDistribution(amount, funds, settings, date, {
        manualDeposits,
        manualRemainderMode,
      });
    } catch (err: unknown) {
      throw new HttpsError(
        'invalid-argument',
        err instanceof Error ? err.message : 'Invalid manual deposits.'
      );
    }
    const preview = distribution.preview;
    const updatedFunds = applyAllocationsToFunds(funds, distribution.drafts, now);

    const incomeId = `inc-${Date.now()}`;
    const allocationIds: string[] = [];

    // 1. Write allocation documents
    for (let i = 0; i < distribution.drafts.length; i++) {
      const draft = distribution.drafts[i];
      const allocId = `alloc-${Date.now()}-${i}`;
      allocationIds.push(allocId);

      const allocRecord: AllocationRecord = {
        id: allocId,
        incomeId,
        fundId: draft.fundId,
        fundName: draft.fundName,
        amount: draft.amount,
        ruleStage: draft.ruleStage,
        ruleUsed: draft.ruleUsed,
        ...(draft.ruleDetails ? { ruleDetails: draft.ruleDetails } : {}),
        needBeforeAllocation: draft.needBeforeAllocation,
        fundingRatio: draft.fundingRatio,
        status: 'active',
        timestamp: now,
      };
      tx.set(userRef.collection('allocations').doc(allocId), allocRecord);
    }

    // 2. Update funds
    for (const uFund of updatedFunds) {
      tx.set(userRef.collection('funds').doc(uFund.id), uFund);
    }

    // 3. Update physical account balance
    if (accountSnap.exists) {
      const currentBal = accountSnap.data()?.balance ?? 0;
      tx.update(accountRef, {
        balance: roundCents(currentBal + amount),
        updatedAt: now,
      });
    }

    // 4. Write income document
    const incomeDoc: IncomeTransaction = {
      id: incomeId,
      amount: roundCents(amount),
      date,
      source: source.trim(),
      accountId: accountId || 'acc-checking',
      notes: notes || '',
      appliedAllocations: allocationIds,
      unallocatedSurplus: distribution.workingCapitalAdded,
      fundingRatioAchieved: preview.needFundingRatio,
      status: 'active',
      createdAt: now,
    };
    tx.set(userRef.collection('incomes').doc(incomeId), incomeDoc);

    // 5. Append immutable audit log entry
    const logId = `audit-${Date.now()}`;
    tx.set(userRef.collection('auditLogs').doc(logId), {
      id: logId,
      action: 'INCOME_ADDED',
      entityType: 'income',
      entityId: incomeId,
      summary: `Added income ${incomeDoc.amount.toFixed(2)} TJS from "${incomeDoc.source}" (cards funded: ${distribution.drafts.length}${
        distribution.manualDepositTotal > 0
          ? `, deposited manually: ${distribution.manualDepositTotal.toFixed(2)} TJS`
          : ''
      }${
        distribution.workingCapitalAdded > 0
          ? `, to Working Capital: +${distribution.workingCapitalAdded.toFixed(2)} TJS`
          : ''
      })`,
      details: {
        incomeId,
        amount: incomeDoc.amount,
        source: incomeDoc.source,
        allocationCount: distribution.drafts.length,
        workingCapitalAdded: distribution.workingCapitalAdded,
        manualDepositTotal: distribution.manualDepositTotal,
        percentageTotal: preview.percentageTotal,
        allocatedToNeedsTotal: preview.allocatedToNeedsTotal,
        unallocatedSurplus: preview.unallocatedSurplus,
        needFundingRatio: preview.needFundingRatio,
      },
      timestamp: now,
    });

    return { income: incomeDoc, preview };
  });
});

/**
 * Callable Cloud Function: /addExpense
 * Atomically records an expense and deducts from the linked Fund and Account.
 */
export const addExpense = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const { amount, date, category, description, fundId, accountId } = request.data;
  if (typeof amount !== 'number' || amount <= 0 || !Number.isFinite(amount)) {
    throw new HttpsError('invalid-argument', 'Expense amount must be a positive number.');
  }
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date)) {
    throw new HttpsError('invalid-argument', 'A valid ISO date (YYYY-MM-DD) is required.');
  }

  const userRef = db.collection('users').doc(uid);
  const now = new Date().toISOString();

  return await db.runTransaction(async (tx) => {
    let fundName: string | undefined;
    if (fundId) {
      const fundRef = userRef.collection('funds').doc(fundId);
      const fundSnap = await tx.get(fundRef);
      if (fundSnap.exists) {
        const fundData = fundSnap.data() as Fund;
        fundName = fundData.name;
        tx.update(fundRef, {
          reservedAmount: Math.max(0, roundCents(fundData.reservedAmount - amount)),
          updatedAt: now,
        });
      }
    }

    const accRef = userRef.collection('accounts').doc(accountId || 'acc-checking');
    const accSnap = await tx.get(accRef);
    if (accSnap.exists) {
      const bal = accSnap.data()?.balance ?? 0;
      tx.update(accRef, {
        balance: roundCents(bal - amount),
        updatedAt: now,
      });
    }

    const expenseId = `exp-${Date.now()}`;
    const expenseDoc: ExpenseTransaction = {
      id: expenseId,
      amount: roundCents(amount),
      date,
      category: category || 'General',
      description: description || category || 'General',
      fundId,
      fundName,
      accountId: accountId || 'acc-checking',
      status: 'active',
      createdAt: now,
    };
    tx.set(userRef.collection('expenses').doc(expenseId), expenseDoc);

    const logId = `audit-${Date.now()}`;
    tx.set(userRef.collection('auditLogs').doc(logId), {
      id: logId,
      action: 'EXPENSE_ADDED',
      entityType: 'expense',
      entityId: expenseId,
      summary: `Spent ${expenseDoc.amount.toFixed(2)} TJS (${expenseDoc.category})${fundName ? ` from "${fundName}" card` : ''}`,
      details: {
        expenseId,
        amount: expenseDoc.amount,
        category: expenseDoc.category,
        description: expenseDoc.description,
        fundId: fundId ?? null,
        fundName: fundName ?? null,
      },
      timestamp: now,
    });

    return expenseDoc;
  });
});

/**
 * Callable Cloud Function: /addFund
 * Validates and creates a new Fund or Sinking Goal under /users/{userId}/funds.
 */
export const addFund = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const fundData = request.data as Partial<Fund>;
  try {
    validateFundInput(fundData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid fund configuration.';
    throw new HttpsError('invalid-argument', message);
  }

  const userRef = db.collection('users').doc(uid);
  const now = new Date().toISOString();
  const fundId = `fund-${Date.now()}`;

  const newFund: Fund = {
    id: fundId,
    name: fundData.name!.trim(),
    type: fundData.type || 'monthly',
    category: fundData.category || 'Essential',
    percentage: fundData.percentage,
    targetAmount: roundCents(fundData.targetAmount ?? fundData.monthlyAmount ?? 0),
    monthlyAmount: fundData.monthlyAmount ? roundCents(fundData.monthlyAmount) : undefined,
    targetDate: fundData.targetDate,
    monthsRemaining: fundData.monthsRemaining,
    reservedAmount: roundCents(fundData.reservedAmount ?? 0),
    cycleAllocated: roundCents(fundData.cycleAllocated ?? 0),
    priority: fundData.priority ?? 10,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  await userRef.collection('funds').doc(fundId).set(newFund);
  return newFund;
});

/**
 * Callable Cloud Function: /undoIncome
 * Soft-deletes an income transaction and atomically rolls back all of its allocations
 * from the corresponding funds and physical account, appending an audit trail entry.
 */
export const undoIncome = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const { incomeId } = request.data;
  const userRef = db.collection('users').doc(uid);
  const now = new Date().toISOString();

  return await db.runTransaction(async (tx) => {
    const incRef = userRef.collection('incomes').doc(incomeId);
    const incSnap = await tx.get(incRef);
    if (!incSnap.exists) {
      throw new HttpsError('not-found', 'Income transaction not found.');
    }
    const income = incSnap.data() as IncomeTransaction;
    if (income.status === 'undone') {
      throw new HttpsError('failed-precondition', 'Income transaction is already undone.');
    }

    const fundsSnap = await tx.get(userRef.collection('funds'));
    const funds: Fund[] = fundsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Fund, 'id'>) }));

    const allocDocs: AllocationRecord[] = [];
    for (const allocId of income.appliedAllocations) {
      const aSnap = await tx.get(userRef.collection('allocations').doc(allocId));
      if (aSnap.exists) {
        allocDocs.push(aSnap.data() as AllocationRecord);
      }
    }

    const rolledBackFunds = rollbackAllocationsFromFunds(funds, allocDocs, now);

    for (const rFund of rolledBackFunds) {
      tx.set(userRef.collection('funds').doc(rFund.id), rFund);
    }

    for (const alloc of allocDocs) {
      tx.update(userRef.collection('allocations').doc(alloc.id), { status: 'undone' });
    }

    tx.update(incRef, { status: 'undone', undoneAt: now });

    const logId = `audit-${Date.now()}`;
    tx.set(userRef.collection('auditLogs').doc(logId), {
      id: logId,
      action: 'INCOME_UNDONE',
      entityType: 'income',
      entityId: incomeId,
      summary: `Undid income ${income.amount.toFixed(2)} TJS ("${income.source}") — card allocations rolled back: ${allocDocs.length}`,
      details: {
        incomeId,
        amount: income.amount,
        source: income.source,
        allocationsRolledBack: allocDocs.length,
      },
      timestamp: now,
    });

    return { success: true, incomeId };
  });
});
