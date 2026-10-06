import {
  AllocationDraftItem,
  AllocationPreviewResult,
  AllocationRecord,
  AllocationSettings,
  AllocationStage,
  Fund,
  ManualAllocationPreviewResult,
  ManualDepositInput,
  ManualRemainderMode,
  RuleCardContext,
} from '../types/finance';
import { AppError } from '../types/errors';
import { CANON } from './canonicalLabels';

/**
 * Safely rounds a floating-point currency value to 2 decimal places (dirams / Somoni).
 */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates how many months remain between referenceDate and targetDate.
 * Clamps to at least 1 month if the target date is in the current month or past due.
 */
export function calculateMonthsRemaining(
  referenceDateStr: string = '2026-09-29',
  targetDateStr?: string,
  explicitMonths?: number
): number {
  if (explicitMonths !== undefined && explicitMonths !== null) {
    return Math.max(1, Math.floor(explicitMonths));
  }
  if (!targetDateStr) {
    return 1;
  }

  const refParts = referenceDateStr.split('T')[0].split('-').map(Number);
  const targetParts = targetDateStr.split('T')[0].split('-').map(Number);

  if (refParts.length < 2 || targetParts.length < 2) {
    return 1;
  }

  const [refYear, refMonth] = refParts;
  const [targetYear, targetMonth] = targetParts;

  const monthDiff = (targetYear - refYear) * 12 + (targetMonth - refMonth);
  return Math.max(1, monthDiff);
}

export interface FundNeedCalculation {
  fundId: string;
  fundName: string;
  /**
   * The full monthly required amount (e.g. 1,000 TJS for Fuel).
   */
  monthlyRequired: number;
  /**
   * Remaining balance carried over from the previous month (e.g. 200 TJS).
   */
  carryoverFromPrevMonth: number;
  /**
   * Net amount that needs to be topped up from incomes across this month:
   * max(0, monthlyRequired - carryoverFromPrevMonth).
   */
  monthlyTarget: number;
  /**
   * Amount already collected from incomes during this month (`cycleAllocated`).
   */
  alreadyAllocatedThisCycle: number;
  /**
   * Amount still needed from future incomes in this month:
   * max(0, monthlyTarget - alreadyAllocatedThisCycle).
   * Once this reaches 0, subsequent incomes in the same month will NOT charge this account.
   */
  remainingNeed: number;
  monthsRemaining: number;
  remainingTotalToGoal: number;
  /** Sinking / target cards only: what was still missing at the start of the month (TJS). */
  remainingTotalAtCycleStart?: number;
  explanation: string;
}

/**
 * Computes the current month's remaining need for a given Account Card / Fund.
 * - Percentage (Savings) accounts return 0 here (they are charged their fixed % in Stage 1 from every income).
 * - Monthly Spending accounts (Food, Wife's Expense, Fuel for Car, etc.):
 *     monthlyRequired = monthlyAmount ?? targetAmount
 *     carryoverFromPrevMonth = cycleStartBalance ?? 0
 *     monthlyTarget (top-up required this month) = max(0, monthlyRequired - carryoverFromPrevMonth)
 *     alreadyAllocatedThisCycle = cycleAllocated
 *     remainingNeed = max(0, monthlyTarget - alreadyAllocatedThisCycle)
 *   Once `alreadyAllocatedThisCycle` reaches `monthlyTarget`, `remainingNeed` is 0 and no further incomes
 *   in the same month will charge for this account (even if money is spent from the card during the month).
 * - Sinking / Target accounts:
 *     priorReserved = max(0, reservedAmount - cycleAllocated + (cycleSpent ?? 0))
 *     remainingTotalAtCycleStart = max(0, targetAmount - priorReserved)
 *     monthlyTarget = remainingTotalAtCycleStart / monthsRemaining
 *     remainingNeed = max(0, monthlyTarget - cycleAllocated)
 */
export function calculateFundMonthlyNeed(
  fund: Fund,
  referenceDateStr: string = '2026-09-29'
): FundNeedCalculation {
  if (!fund.isActive || fund.type === 'percentage') {
    return {
      fundId: fund.id,
      fundName: fund.name,
      monthlyRequired: 0,
      carryoverFromPrevMonth: 0,
      monthlyTarget: 0,
      alreadyAllocatedThisCycle: roundCents(fund.cycleAllocated ?? 0),
      remainingNeed: 0,
      monthsRemaining: 0,
      remainingTotalToGoal: 0,
      explanation:
        fund.type === 'percentage'
          ? `${fund.percentage ?? 0}% of every income (Savings)`
          : 'Inactive account',
    };
  }

  if (fund.type === 'monthly') {
    const monthlyRequired = roundCents(fund.monthlyAmount ?? fund.targetAmount);
    const carryoverFromPrevMonth = Math.max(0, roundCents(fund.cycleStartBalance ?? 0));
    const monthlyTarget = Math.max(0, roundCents(monthlyRequired - carryoverFromPrevMonth));
    const alreadyAllocated = roundCents(
      fund.cycleAllocated !== undefined ? fund.cycleAllocated : fund.reservedAmount
    );
    const remainingNeed = Math.max(0, roundCents(monthlyTarget - alreadyAllocated));

    let explanation = `Monthly required: ${monthlyRequired.toFixed(2)} TJS`;
    if (carryoverFromPrevMonth > 0) {
      explanation += ` (${carryoverFromPrevMonth.toFixed(2)} TJS carried over → ${monthlyTarget.toFixed(2)} TJS top-up needed)`;
    }
    if (alreadyAllocated > 0) {
      explanation += ` • Collected this month: ${alreadyAllocated.toFixed(2)} TJS`;
    }

    return {
      fundId: fund.id,
      fundName: fund.name,
      monthlyRequired,
      carryoverFromPrevMonth,
      monthlyTarget,
      alreadyAllocatedThisCycle: alreadyAllocated,
      remainingNeed,
      monthsRemaining: 1,
      remainingTotalToGoal: remainingNeed,
      explanation,
    };
  }

  // Sinking fund ('sinking') or Target-based goal ('target')
  const monthsRemaining = calculateMonthsRemaining(
    referenceDateStr,
    fund.targetDate,
    fund.monthsRemaining
  );
  const cycleAllocated = roundCents(fund.cycleAllocated ?? 0);
  const cycleSpent = roundCents(fund.cycleSpent ?? 0);
  const priorReserved =
    fund.cycleStartBalance !== undefined
      ? roundCents(fund.cycleStartBalance)
      : Math.max(0, roundCents(fund.reservedAmount - cycleAllocated + cycleSpent));

  const remainingTotalAtCycleStart = Math.max(0, roundCents(fund.targetAmount - priorReserved));
  const monthlyTarget = roundCents(remainingTotalAtCycleStart / monthsRemaining);
  const remainingNeed = Math.max(0, roundCents(monthlyTarget - cycleAllocated));
  const currentRemainingToGoal = Math.max(0, roundCents(fund.targetAmount - fund.reservedAmount));

  const typeLabel = fund.type === 'sinking' ? 'Sinking account' : 'Target account';
  const explanation =
    cycleAllocated > 0
      ? `${typeLabel}: ${remainingTotalAtCycleStart.toFixed(2)} TJS over ${monthsRemaining} mo = ${monthlyTarget.toFixed(2)} TJS/mo (${cycleAllocated.toFixed(2)} TJS collected this month)`
      : `${typeLabel}: ${remainingTotalAtCycleStart.toFixed(2)} TJS remaining over ${monthsRemaining} mo (${monthlyTarget.toFixed(2)} TJS/mo)`;

  return {
    fundId: fund.id,
    fundName: fund.name,
    monthlyRequired: monthlyTarget,
    carryoverFromPrevMonth: priorReserved,
    monthlyTarget,
    alreadyAllocatedThisCycle: cycleAllocated,
    remainingNeed,
    monthsRemaining,
    remainingTotalToGoal: currentRemainingToGoal,
    remainingTotalAtCycleStart,
    explanation,
  };
}

/**
 * Snapshot of a card's monthly situation for an allocation's `ruleDetails`
 * (no undefined values: these objects are written to Firestore as-is).
 */
function buildRuleCardContext(fund: Fund, calc: FundNeedCalculation): RuleCardContext {
  return {
    kind: fund.type === 'sinking' || fund.type === 'target' ? fund.type : 'monthly',
    monthlyRequired: calc.monthlyRequired,
    carryover: calc.carryoverFromPrevMonth,
    monthlyTarget: calc.monthlyTarget,
    collected: calc.alreadyAllocatedThisCycle,
    monthsRemaining: calc.monthsRemaining,
    ...(calc.remainingTotalAtCycleStart !== undefined
      ? { remainingTotalAtCycleStart: calc.remainingTotalAtCycleStart }
      : {}),
  };
}

/**
 * Distributes `availableAmount` across `items` proportionally to their `weight`
 * using Hamilton's Largest Remainder Method in integer dirams (cents).
 */
export function distributeProportionallyInCents(
  availableAmount: number,
  items: Array<{ id: string; weight: number }>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    result[item.id] = 0;
  }

  const positiveItems = items.filter((item) => item.weight > 0);
  if (positiveItems.length === 0 || availableAmount <= 0) {
    return result;
  }

  const totalWeight = positiveItems.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    return result;
  }

  const totalCents = Math.round(roundCents(availableAmount) * 100);

  const quotas = positiveItems.map((item, idx) => {
    const exactCents = (item.weight / totalWeight) * totalCents;
    const flooredCents = Math.floor(exactCents + 1e-9);
    const remainder = exactCents - flooredCents;
    return {
      id: item.id,
      weight: item.weight,
      idx,
      flooredCents,
      remainder,
    };
  });

  const sumFloored = quotas.reduce((sum, q) => sum + q.flooredCents, 0);
  let leftoverCents = totalCents - sumFloored;

  const sortedForRemainder = [...quotas].sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-7) {
      return b.remainder - a.remainder;
    }
    if (b.weight !== a.weight) {
      return b.weight - a.weight;
    }
    return a.idx - b.idx;
  });

  for (let i = 0; i < sortedForRemainder.length && leftoverCents > 0; i++) {
    sortedForRemainder[i].flooredCents += 1;
    leftoverCents -= 1;
  }

  for (const q of sortedForRemainder) {
    result[q.id] = q.flooredCents / 100;
  }

  return result;
}

/**
 * Validates fund configuration inputs.
 */
export function validateFundInput(fund: Partial<Fund>): void {
  if (!fund.name || fund.name.trim().length === 0) {
    throw new AppError('FUND_NAME_REQUIRED', 'Account Card name is required.');
  }
  if (fund.type === 'percentage') {
    if (fund.percentage === undefined || fund.percentage <= 0 || fund.percentage > 100) {
      throw new AppError('FUND_PERCENT_RANGE', 'Savings percentage must be between 0.01 and 100.');
    }
  } else {
    const target =
      fund.type === 'monthly' ? (fund.monthlyAmount ?? fund.targetAmount) : fund.targetAmount;
    if (target === undefined || target < 0) {
      throw new AppError('FUND_TARGET_NEGATIVE', 'Target amount must be non-negative.');
    }
  }
  if (fund.reservedAmount !== undefined && fund.reservedAmount < 0) {
    throw new AppError('FUND_BALANCE_NEGATIVE', 'Balance cannot be negative.');
  }
}

/**
 * Pure, deterministic Allocation Engine.
 * Executes the allocation pipeline on each incoming payment (in TJS / Somoni):
 *   Stage 1: Savings Accounts (Percentage-First Allocation charged on every income)
 *   Stage 2: Calculate Remaining Monthly Needs (accounting for carryover & already-collected amounts this month)
 *   Stage 3: Full Deposit (up to exact monthly required amount) OR Equal % Proportional Split on Shortfall
 *   Stage 4: Working Capital / Surplus Routing (once all spending accounts have collected their monthly requirement)
 */
export function previewIncomeAllocation(
  incomeAmount: number,
  funds: Fund[],
  settings?: Partial<AllocationSettings>,
  referenceDate: string = '2026-09-29'
): AllocationPreviewResult {
  if (!Number.isFinite(incomeAmount) || incomeAmount < 0) {
    throw new AppError('INCOME_AMOUNT_INVALID', 'Income amount must be a non-negative number.');
  }

  const grossIncome = roundCents(incomeAmount);
  const activeFunds = funds
    .filter((f) => f.isActive)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  const allocations: AllocationDraftItem[] = [];
  const perFundTotals: Record<string, number> = {};

  const addAllocationDraft = (draft: AllocationDraftItem) => {
    if (draft.amount <= 0 && grossIncome > 0) return;
    allocations.push(draft);
    perFundTotals[draft.fundId] = roundCents((perFundTotals[draft.fundId] ?? 0) + draft.amount);
  };

  if (grossIncome === 0) {
    return {
      grossIncome: 0,
      percentageTotal: 0,
      remainingAfterPercentage: 0,
      totalRemainingNeeds: 0,
      needFundingRatio: 0,
      isShortfall: false,
      allocatedToNeedsTotal: 0,
      rawSurplus: 0,
      allocatedSurplusTotal: 0,
      unallocatedSurplus: 0,
      allocations: [],
      perFundTotals: {},
      referenceDate,
    };
  }

  // ===========================================================================
  // STAGE 1: Savings Accounts (Charged Required % from Every Income)
  // ===========================================================================
  const percentageFunds = activeFunds.filter(
    (f) => f.type === 'percentage' && (f.percentage ?? 0) > 0
  );

  const totalPercentage = percentageFunds.reduce((sum, f) => sum + (f.percentage ?? 0), 0);
  if (totalPercentage > 100) {
    throw new AppError(
      'PERCENT_TOTAL_EXCEEDS',
      `Total percentage rules (${totalPercentage}%) cannot exceed 100% of income.`,
      { total: totalPercentage }
    );
  }

  let percentageTotal = 0;
  for (const pFund of percentageFunds) {
    const pct = pFund.percentage ?? 0;
    const rawAmt = roundCents(grossIncome * (pct / 100));
    percentageTotal = roundCents(percentageTotal + rawAmt);

    addAllocationDraft({
      fundId: pFund.id,
      fundName: pFund.name,
      fundType: pFund.type,
      amount: rawAmt,
      ruleStage: 'percentage',
      ruleUsed: `${pct}% savings rule (${rawAmt.toFixed(2)} TJS of ${grossIncome.toFixed(2)} TJS)`,
      ruleDetails: { pct, base: grossIncome },
      needBeforeAllocation: rawAmt,
      fundingRatio: pct / 100,
    });
  }

  const remainingAfterPercentage = Math.max(0, roundCents(grossIncome - percentageTotal));

  // ===========================================================================
  // STAGE 2: Calculate Remaining Monthly Needs for Spending & Sinking Accounts
  // ===========================================================================
  const needFunds = activeFunds.filter((f) => f.type !== 'percentage');
  const needCalculations = needFunds.map((f) => ({
    fund: f,
    calc: calculateFundMonthlyNeed(f, referenceDate),
  }));

  // Only accounts that have NOT yet collected their full monthly requirement (remainingNeed > 0)
  // participate in Stage 3. Accounts that already collected 100% of their monthly target are skipped.
  const positiveNeedEntries = needCalculations.filter((entry) => entry.calc.remainingNeed > 0);
  const totalRemainingNeeds = roundCents(
    positiveNeedEntries.reduce((sum, entry) => sum + entry.calc.remainingNeed, 0)
  );

  // ===========================================================================
  // STAGE 3: Full Funding vs. Equal % Proportional Split on Shortfall
  // ===========================================================================
  let needFundingRatio = 1;
  let isShortfall = false;
  let allocatedToNeedsTotal = 0;

  if (totalRemainingNeeds > 0 && remainingAfterPercentage > 0) {
    if (remainingAfterPercentage >= totalRemainingNeeds) {
      // FULL FUNDING CASE: Each account collects its exact remaining need for the month
      needFundingRatio = 1.0;
      isShortfall = false;

      for (const { fund, calc } of positiveNeedEntries) {
        const amt = calc.remainingNeed;
        allocatedToNeedsTotal = roundCents(allocatedToNeedsTotal + amt);
        addAllocationDraft({
          fundId: fund.id,
          fundName: fund.name,
          fundType: fund.type,
          amount: amt,
          ruleStage: 'need_full',
          ruleUsed: `100% of remaining monthly need (${amt.toFixed(2)} TJS) — ${calc.explanation}`,
          ruleDetails: { card: buildRuleCardContext(fund, calc) },
          needBeforeAllocation: calc.remainingNeed,
          fundingRatio: 1.0,
        });
      }
    } else {
      // PROPORTIONAL SPLIT ON SHORTFALL: Equal % of remaining need across every active spending account
      isShortfall = true;
      needFundingRatio = remainingAfterPercentage / totalRemainingNeeds;
      const pctDisplay = (needFundingRatio * 100).toFixed(2);

      const proportionalCentsMap = distributeProportionallyInCents(
        remainingAfterPercentage,
        positiveNeedEntries.map((e) => ({
          id: e.fund.id,
          weight: e.calc.remainingNeed,
        }))
      );

      for (const { fund, calc } of positiveNeedEntries) {
        const amt = proportionalCentsMap[fund.id] ?? 0;
        allocatedToNeedsTotal = roundCents(allocatedToNeedsTotal + amt);
        addAllocationDraft({
          fundId: fund.id,
          fundName: fund.name,
          fundType: fund.type,
          amount: amt,
          ruleStage: 'need_proportional',
          ruleUsed: `${pctDisplay}% equal-ratio split (${amt.toFixed(2)} TJS of ${calc.remainingNeed.toFixed(2)} TJS remaining need)`,
          ruleDetails: { pct: Number(pctDisplay) },
          needBeforeAllocation: calc.remainingNeed,
          fundingRatio: Number(needFundingRatio.toFixed(6)),
        });
      }
    }
  } else if (totalRemainingNeeds > 0 && remainingAfterPercentage === 0) {
    isShortfall = true;
    needFundingRatio = 0;
  }

  // ===========================================================================
  // STAGE 4: Working Capital / Surplus Handling
  // ===========================================================================
  const rawSurplus = Math.max(0, roundCents(remainingAfterPercentage - allocatedToNeedsTotal));
  let allocatedSurplusTotal = 0;

  if (
    rawSurplus > 0 &&
    settings?.surplusStrategy === 'proportional_rules' &&
    settings.surplusRules &&
    settings.surplusRules.length > 0
  ) {
    const validRules = settings.surplusRules.filter((r) => r.percentage > 0);
    const totalSurplusPct = validRules.reduce((sum, r) => sum + r.percentage, 0);

    if (totalSurplusPct > 0) {
      const effectiveSurplusToAllocate =
        totalSurplusPct >= 100
          ? rawSurplus
          : roundCents(rawSurplus * (totalSurplusPct / 100));

      const surplusDistribution = distributeProportionallyInCents(
        effectiveSurplusToAllocate,
        validRules.map((r) => ({ id: r.fundId, weight: r.percentage }))
      );

      for (const rule of validRules) {
        const amt = surplusDistribution[rule.fundId] ?? 0;
        if (amt > 0) {
          const targetFund = funds.find((f) => f.id === rule.fundId);
          allocatedSurplusTotal = roundCents(allocatedSurplusTotal + amt);
          addAllocationDraft({
            fundId: rule.fundId,
            fundName: targetFund?.name ?? rule.fundName ?? CANON.surplusTarget,
            fundType: targetFund?.type ?? 'target',
            amount: amt,
            ruleStage: 'surplus',
            ruleUsed: `Surplus rule: ${rule.percentage}% of ${rawSurplus.toFixed(2)} TJS surplus`,
            ruleDetails: { pct: rule.percentage, base: rawSurplus },
            needBeforeAllocation: 0,
            fundingRatio: rule.percentage / 100,
          });
        }
      }
    }
  }

  const unallocatedSurplus = Math.max(0, roundCents(rawSurplus - allocatedSurplusTotal));

  return {
    grossIncome,
    percentageTotal,
    remainingAfterPercentage,
    totalRemainingNeeds,
    needFundingRatio: Number(needFundingRatio.toFixed(6)),
    isShortfall,
    allocatedToNeedsTotal,
    rawSurplus,
    allocatedSurplusTotal,
    unallocatedSurplus,
    allocations,
    perFundTotals,
    referenceDate,
  };
}

/**
 * Allocation stages whose deposits count toward a card's monthly deposit (`cycleAllocated`).
 * This is what makes manual deposits "count": once a card has collected its monthly requirement
 * (manually or automatically), later auto-splits in the same month charge it 0 TJS.
 * Surplus-rule routing and Working Capital overflow are excluded on purpose: that is extra money,
 * not part of a card's monthly requirement.
 */
const MONTHLY_DEPOSIT_STAGES: ReadonlySet<AllocationStage> = new Set<AllocationStage>([
  'percentage',
  'need_full',
  'need_proportional',
  'manual_override',
  'manual_deposit',
]);

export function countsTowardMonthlyDeposit(stage: AllocationStage): boolean {
  return MONTHLY_DEPOSIT_STAGES.has(stage);
}

/**
 * Pure helper that applies an allocation preview (or custom drafts) to a list of funds,
 * updating both `reservedAmount` (current balance) and `cycleAllocated` (monthly deposit).
 */
export function applyAllocationsToFunds(
  funds: Fund[],
  drafts: AllocationDraftItem[],
  timestamp: string = new Date().toISOString()
): Fund[] {
  const deltaByFund: Record<string, { reservedDelta: number; cycleDelta: number }> = {};

  for (const draft of drafts) {
    if (!deltaByFund[draft.fundId]) {
      deltaByFund[draft.fundId] = { reservedDelta: 0, cycleDelta: 0 };
    }
    deltaByFund[draft.fundId].reservedDelta = roundCents(
      deltaByFund[draft.fundId].reservedDelta + draft.amount
    );
    if (countsTowardMonthlyDeposit(draft.ruleStage)) {
      deltaByFund[draft.fundId].cycleDelta = roundCents(
        deltaByFund[draft.fundId].cycleDelta + draft.amount
      );
    }
  }

  return funds.map((fund) => {
    const delta = deltaByFund[fund.id];
    if (!delta) return { ...fund };

    const baseCycle =
      fund.type === 'monthly' && fund.cycleAllocated === undefined
        ? fund.reservedAmount
        : (fund.cycleAllocated ?? 0);

    return {
      ...fund,
      reservedAmount: roundCents(fund.reservedAmount + delta.reservedDelta),
      cycleAllocated: roundCents(baseCycle + delta.cycleDelta),
      updatedAt: timestamp,
    };
  });
}

/**
 * Pure helper that rolls back a set of AllocationRecords from funds when an income transaction is undone.
 */
export function rollbackAllocationsFromFunds(
  funds: Fund[],
  allocationsToUndo: Array<Pick<AllocationRecord, 'fundId' | 'amount' | 'ruleStage'> & { status?: 'active' | 'undone' }>,
  timestamp: string = new Date().toISOString()
): Fund[] {
  const deltaByFund: Record<string, { reservedDelta: number; cycleDelta: number }> = {};

  for (const alloc of allocationsToUndo) {
    if (alloc.status === 'undone') continue;
    if (!deltaByFund[alloc.fundId]) {
      deltaByFund[alloc.fundId] = { reservedDelta: 0, cycleDelta: 0 };
    }
    deltaByFund[alloc.fundId].reservedDelta = roundCents(
      deltaByFund[alloc.fundId].reservedDelta + alloc.amount
    );
    if (countsTowardMonthlyDeposit(alloc.ruleStage)) {
      deltaByFund[alloc.fundId].cycleDelta = roundCents(
        deltaByFund[alloc.fundId].cycleDelta + alloc.amount
      );
    }
  }

  return funds.map((fund) => {
    const delta = deltaByFund[fund.id];
    if (!delta) return { ...fund };

    return {
      ...fund,
      reservedAmount: Math.max(0, roundCents(fund.reservedAmount - delta.reservedDelta)),
      cycleAllocated: Math.max(0, roundCents((fund.cycleAllocated ?? 0) - delta.cycleDelta)),
      updatedAt: timestamp,
    };
  });
}

/**
 * Rolls over all Account Cards to a new month:
 * - For monthly spending accounts (Food, Wife's Expense, Fuel for Car, etc.), any remaining unspent
 *   balance (`reservedAmount`) is carried over into `cycleStartBalance` so that in the new month,
 *   ONLY the difference `max(0, monthlyRequired - cycleStartBalance)` will be topped up!
 * - Resets `cycleAllocated` (monthly deposit) and `cycleSpent` (monthly expenses) to 0 for the new month.
 */
export function rolloverFundsToNextMonth(
  funds: Fund[],
  timestamp: string = new Date().toISOString()
): Fund[] {
  return funds.map((fund) => ({
    ...fund,
    cycleStartBalance: fund.type === 'percentage' ? 0 : roundCents(fund.reservedAmount),
    cycleAllocated: 0,
    cycleSpent: 0,
    updatedAt: timestamp,
  }));
}

// =============================================================================
// MANUAL DEPOSITS
// =============================================================================

/**
 * Validates and normalizes user-directed deposits against the available cards:
 * - rows for the same card are merged (summed),
 * - blank / zero rows are ignored,
 * - unknown cards, inactive cards, negative or non-numeric amounts throw a descriptive Error.
 * Amounts are handled in integer dirams (cents) so merging never drifts.
 */
export function normalizeManualDeposits(
  deposits: ManualDepositInput[],
  funds: Fund[]
): ManualDepositInput[] {
  const centsByFund = new Map<string, number>();

  for (const dep of deposits) {
    if (!dep || typeof dep.fundId !== 'string' || dep.fundId.length === 0) {
      throw new AppError('MANUAL_TARGET_REQUIRED', 'Every manual deposit needs a target card.');
    }
    const fund = funds.find((f) => f.id === dep.fundId);
    if (!fund) {
      throw new AppError(
        'MANUAL_TARGET_NOT_FOUND',
        `Manual deposit target card '${dep.fundId}' was not found.`
      );
    }
    if (typeof dep.amount !== 'number' || !Number.isFinite(dep.amount) || dep.amount < 0) {
      throw new AppError(
        'MANUAL_AMOUNT_INVALID',
        `Manual deposit for "${fund.name}" must be a non-negative number.`,
        { name: fund.name }
      );
    }
    const cents = Math.round(roundCents(dep.amount) * 100);
    if (cents === 0) continue;
    if (!fund.isActive) {
      throw new AppError(
        'MANUAL_CARD_INACTIVE',
        `Cannot deposit to "${fund.name}" because the card is inactive.`,
        { name: fund.name }
      );
    }
    centsByFund.set(dep.fundId, (centsByFund.get(dep.fundId) ?? 0) + cents);
  }

  return Array.from(centsByFund, ([fundId, cents]) => ({ fundId, amount: cents / 100 }));
}

/**
 * Splits an income when the user directs specific amounts to specific cards
 * (e.g. 2,000 TJS received -> 1,000 TJS to Fuel + 1,000 TJS to Wife's Expense).
 *
 *   Step 1  Manual deposits are applied EXACTLY as typed, taken from the full income.
 *           (No Savings % is charged on them - the user decided where this money goes.)
 *   Step 2  They count toward each card's monthly deposit (`cycleAllocated`), so a card that is now
 *           full receives 0 TJS from later auto-splits, and a partly funded card only receives
 *           what is still missing.
 *   Step 3  The remainder (income - manual total) either
 *             - 'auto_split'      : runs through the normal pipeline against the cards as they are AFTER step 2
 *                                   (Savings % of the remainder first, then monthly needs, then Working Capital), or
 *             - 'working_capital' : goes straight to Working Capital.
 *
 * Throws if the manual deposits exceed the income or are otherwise invalid.
 */
export function previewIncomeWithManualDeposits(
  incomeAmount: number,
  funds: Fund[],
  manualDeposits: ManualDepositInput[],
  settings?: Partial<AllocationSettings>,
  referenceDate: string = '2026-09-29',
  remainderMode: ManualRemainderMode = 'auto_split'
): ManualAllocationPreviewResult {
  if (!Number.isFinite(incomeAmount) || incomeAmount < 0) {
    throw new AppError('INCOME_AMOUNT_INVALID', 'Income amount must be a non-negative number.');
  }

  const grossIncome = roundCents(incomeAmount);
  const deposits = normalizeManualDeposits(manualDeposits, funds);
  const manualDepositTotal = roundCents(deposits.reduce((sum, d) => sum + d.amount, 0));

  if (manualDepositTotal > grossIncome) {
    throw new AppError(
      'MANUAL_EXCEEDS_INCOME',
      `Manual deposits (${manualDepositTotal.toFixed(2)} TJS) exceed the income amount (${grossIncome.toFixed(2)} TJS).`,
      { manual: manualDepositTotal.toFixed(2), income: grossIncome.toFixed(2) }
    );
  }

  // Manual lines follow the cards' priority order so previews and the ledger are stable.
  const manualDrafts: AllocationDraftItem[] = [];
  const fundsByPriority = [...funds].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  for (const fund of fundsByPriority) {
    const deposit = deposits.find((d) => d.fundId === fund.id);
    if (!deposit) continue;

    const needBefore = calculateFundMonthlyNeed(fund, referenceDate).remainingNeed;
    manualDrafts.push({
      fundId: fund.id,
      fundName: fund.name,
      fundType: fund.type,
      amount: deposit.amount,
      ruleStage: 'manual_deposit',
      ruleUsed:
        needBefore > 0
          ? `Manual deposit chosen by you (${deposit.amount.toFixed(2)} TJS; ${needBefore.toFixed(2)} TJS was still needed this month)`
          : `Manual deposit chosen by you (${deposit.amount.toFixed(2)} TJS)`,
      needBeforeAllocation: needBefore,
      fundingRatio: needBefore > 0 ? Number(Math.min(1, deposit.amount / needBefore).toFixed(6)) : 1,
    });
  }

  const remainder = roundCents(grossIncome - manualDepositTotal);

  let restPreview: AllocationPreviewResult;
  if (remainderMode === 'working_capital') {
    restPreview = {
      grossIncome: remainder,
      percentageTotal: 0,
      remainingAfterPercentage: remainder,
      totalRemainingNeeds: 0,
      needFundingRatio: 0,
      isShortfall: false,
      allocatedToNeedsTotal: 0,
      rawSurplus: remainder,
      allocatedSurplusTotal: 0,
      unallocatedSurplus: remainder,
      allocations: [],
      perFundTotals: {},
      referenceDate,
    };
  } else {
    // The cards as they will be once the manual deposits are in: this is what makes the
    // auto-split "consider the manually paid ones" (full cards are skipped, partial ones topped up).
    const fundsAfterManual = applyAllocationsToFunds(funds, manualDrafts);
    restPreview = previewIncomeAllocation(remainder, fundsAfterManual, settings, referenceDate);
  }

  const allocations = [...manualDrafts, ...restPreview.allocations];
  const perFundTotals: Record<string, number> = {};
  for (const a of allocations) {
    perFundTotals[a.fundId] = roundCents((perFundTotals[a.fundId] ?? 0) + a.amount);
  }

  return {
    ...restPreview,
    grossIncome,
    allocations,
    perFundTotals,
    referenceDate,
    manualDepositTotal,
    manualAllocations: manualDrafts,
    autoSplitAmount: remainderMode === 'auto_split' ? remainder : 0,
    remainderMode,
  };
}

export interface IncomeDistributionOptions {
  /** Edited auto-split lines ("Customize Split"). */
  customAllocations?: AllocationDraftItem[];
  /** Amounts directed to specific cards. */
  manualDeposits?: ManualDepositInput[];
  /** Treatment of the un-directed remainder when `manualDeposits` is used. Defaults to 'auto_split'. */
  manualRemainderMode?: ManualRemainderMode;
}

export interface IncomeDistribution {
  preview: AllocationPreviewResult;
  /** The final lines to record as allocations. */
  drafts: AllocationDraftItem[];
  /** Amount credited to Working Capital by this income. */
  workingCapitalAdded: number;
  /** Total of manual deposits in this income (0 when none). */
  manualDepositTotal: number;
}

/**
 * Single entry point used by every income-recording path (Cloud Firestore transaction, in-memory
 * test service, Cloud Function) so they can never diverge:
 *   - `manualDeposits`     -> manual deposits first, then the remainder per `manualRemainderMode`
 *   - `customAllocations`  -> the user's edited lines; whatever is not allocated goes to Working Capital
 *   - neither              -> the standard automatic split
 */
export function computeIncomeDistribution(
  amount: number,
  funds: Fund[],
  settings: Partial<AllocationSettings> | undefined,
  date: string,
  options: IncomeDistributionOptions = {}
): IncomeDistribution {
  if (options.manualDeposits && options.customAllocations) {
    throw new AppError(
      'MANUAL_WITH_CUSTOM',
      'Use either manual deposits or a customized split for one income, not both.'
    );
  }

  if (options.manualDeposits) {
    const result = previewIncomeWithManualDeposits(
      amount,
      funds,
      options.manualDeposits,
      settings,
      date,
      options.manualRemainderMode ?? 'auto_split'
    );
    return {
      preview: result,
      drafts: result.allocations,
      workingCapitalAdded: result.unallocatedSurplus,
      manualDepositTotal: result.manualDepositTotal,
    };
  }

  const preview = previewIncomeAllocation(amount, funds, settings, date);

  if (options.customAllocations) {
    const totalAllocated = roundCents(options.customAllocations.reduce((s, d) => s + d.amount, 0));
    return {
      preview,
      drafts: options.customAllocations,
      workingCapitalAdded: Math.max(0, roundCents(amount - totalAllocated)),
      manualDepositTotal: 0,
    };
  }

  return {
    preview,
    drafts: preview.allocations,
    workingCapitalAdded: preview.unallocatedSurplus,
    manualDepositTotal: 0,
  };
}
