export type AccountType = 'checking' | 'savings' | 'investment' | 'vault' | 'working_capital';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string; // 'TJS' (Somoni)
  updatedAt: string;
}

export type FundType = 'percentage' | 'monthly' | 'sinking' | 'target';

export interface Fund {
  id: string;
  name: string;
  type: FundType;
  category: string;
  /**
   * For 'percentage' (Savings) accounts: percentage of each gross income (0 - 100) charged first.
   * Spending is disabled on 'percentage' accounts.
   */
  percentage?: number;
  /**
   * Monthly required amount (for 'monthly' spending accounts) or total target amount (for 'sinking'/'target') in TJS.
   */
  targetAmount: number;
  /**
   * Explicit monthly requirement in TJS if type === 'monthly'.
   */
  monthlyAmount?: number;
  /**
   * ISO date string (YYYY-MM-DD) for 'sinking' or 'target' deadlines.
   */
  targetDate?: string;
  /**
   * Optional explicit months remaining override.
   */
  monthsRemaining?: number;
  /**
   * Current available balance on this Account Card (TJS).
   * Increases when income is allocated; decreases when expenses are charged to this card.
   */
  reservedAmount: number;
  /**
   * Remaining unspent balance carried over from the previous month at the start of the current month (TJS).
   * For a monthly spending account requiring 1,000 TJS, if 200 TJS was carried over from last month,
   * only 800 TJS will be topped up across this month's incomes.
   */
  cycleStartBalance?: number;
  /**
   * Amount deposited/collected into this Account Card from incomes during the current month (TJS).
   * Once (cycleStartBalance + cycleAllocated) reaches monthlyTarget, no more is charged from subsequent incomes this month.
   */
  cycleAllocated: number;
  /**
   * Total expenses spent from this Account Card during the current month (TJS).
   */
  cycleSpent?: number;
  /**
   * Optional linked bank account ID.
   */
  accountId?: string;
  priority: number;
  isActive: boolean;
  /**
   * Card visual theme color / gradient identifier.
   */
  color?: string;
  icon?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type AllocationStage =
  | 'percentage'
  | 'need_full'
  | 'need_proportional'
  | 'surplus'
  | 'working_capital'
  /** The user edited an auto-calculated line ("Customize Split"). */
  | 'manual_override'
  /** The user directed a specific amount to a specific card ("Manual deposit"). */
  | 'manual_deposit';

/**
 * The card's monthly situation at the moment of a deposit (TJS). Lets the UI re-create the
 * "Monthly required: ... carried over ... collected this month" explanation in the user's language.
 */
export interface RuleCardContext {
  kind: 'monthly' | 'sinking' | 'target';
  monthlyRequired: number;
  carryover: number;
  monthlyTarget: number;
  collected: number;
  monthsRemaining: number;
  /** Sinking / target cards only: what was still missing at the start of the month. */
  remainingTotalAtCycleStart?: number;
}

/**
 * The numbers behind an allocation's "rule applied" sentence, stored next to the English `ruleUsed` text so the
 * app can show the same explanation in English, Russian or Uzbek. Records created before this existed simply
 * lack it; the UI then falls back to what every record has (stage, amount, needBeforeAllocation, fundingRatio).
 */
export interface RuleDetails {
  /** Percentage used by the rule (Savings %, equal-ratio %, surplus %). */
  pct?: number;
  /** Amount that percentage was applied to (the part of the income being split / the surplus), TJS. */
  base?: number;
  /** Manual adjustment: the automatic amount before the user edited it, TJS. */
  autoAmount?: number;
  card?: RuleCardContext;
}

export interface AllocationRecord {
  id: string;
  incomeId: string;
  fundId: string;
  fundName: string;
  amount: number;
  ruleStage: AllocationStage;
  ruleUsed: string;
  ruleDetails?: RuleDetails;
  needBeforeAllocation: number;
  fundingRatio: number;
  status: 'active' | 'undone';
  timestamp: string;
}

export interface IncomeTransaction {
  id: string;
  amount: number;
  date: string;
  source: string;
  accountId: string;
  notes?: string;
  appliedAllocations: string[];
  /**
   * Leftover amount (in TJS) after all Savings and Spending Account Cards are 100% deposited for the month;
   * automatically credited to Working Capital.
   */
  unallocatedSurplus: number;
  fundingRatioAchieved: number;
  status: 'active' | 'undone';
  createdAt: string;
  undoneAt?: string;
}

export interface ExpenseTransaction {
  id: string;
  amount: number;
  date: string;
  category: string;
  description: string;
  /**
   * ID of the Spending Account Card (Fund) or 'working-capital' from which this expense was paid.
   */
  fundId?: string;
  fundName?: string;
  accountId: string;
  status: 'active' | 'undone';
  createdAt: string;
  undoneAt?: string;
}

export interface SurplusRuleItem {
  fundId: string;
  fundName?: string;
  percentage: number;
}

export interface AllocationSettings {
  id?: string;
  surplusStrategy: 'unallocated' | 'proportional_rules';
  surplusRules: SurplusRuleItem[];
  defaultAccountId?: string;
  currentCycleMonth: string; // e.g., '2026-09'
  /**
   * Current available balance in the Working Capital card (TJS).
   */
  workingCapitalBalance?: number;
  /**
   * Total deposited to Working Capital during the current month (TJS).
   */
  workingCapitalCycleDeposited?: number;
  /**
   * Total spent from Working Capital during the current month (TJS).
   */
  workingCapitalCycleSpent?: number;
  updatedAt?: string;
}

export type AuditActionType =
  | 'INCOME_ADDED'
  | 'INCOME_UNDONE'
  | 'EXPENSE_ADDED'
  | 'EXPENSE_UNDONE'
  | 'FUND_CREATED'
  | 'FUND_UPDATED'
  | 'FUND_DELETED'
  | 'SETTINGS_UPDATED'
  | 'CYCLE_RESET'
  | 'SCENARIO_LOADED';

export interface AuditLogEntry {
  id: string;
  action: AuditActionType;
  entityType: 'income' | 'expense' | 'fund' | 'settings' | 'system';
  entityId: string;
  summary: string;
  details: Record<string, unknown>;
  previousStateSnapshot?: Record<string, unknown>;
  newStateSnapshot?: Record<string, unknown>;
  timestamp: string;
}

export interface AllocationDraftItem {
  fundId: string;
  fundName: string;
  fundType: FundType;
  amount: number;
  ruleStage: AllocationStage;
  ruleUsed: string;
  ruleDetails?: RuleDetails;
  needBeforeAllocation: number;
  fundingRatio: number;
}

export interface AllocationPreviewResult {
  grossIncome: number;
  percentageTotal: number;
  remainingAfterPercentage: number;
  totalRemainingNeeds: number;
  needFundingRatio: number;
  isShortfall: boolean;
  allocatedToNeedsTotal: number;
  rawSurplus: number;
  allocatedSurplusTotal: number;
  /**
   * Amount flowing to Working Capital once all accounts are 100% deposited for the month.
   */
  unallocatedSurplus: number;
  allocations: AllocationDraftItem[];
  perFundTotals: Record<string, number>;
  referenceDate: string;
}

/**
 * A user-directed deposit of a specific amount (TJS) to a specific Account Card.
 * Example: income of 2,000 TJS -> { fuel, 1000 } + { wifeExpense, 1000 }.
 */
export interface ManualDepositInput {
  fundId: string;
  amount: number;
}

/**
 * What happens to the part of an income that was NOT manually directed to a card:
 * - 'auto_split'      : runs through the normal rules (Savings % first, monthly needs, then Working Capital)
 * - 'working_capital' : goes straight to Working Capital with no further splitting
 */
export type ManualRemainderMode = 'auto_split' | 'working_capital';

/**
 * Everything needed to record one income. At most ONE of `customAllocations` / `manualDeposits` may be used.
 */
export interface NewIncomeInput {
  amount: number;
  date: string;
  source: string;
  accountId: string;
  notes?: string;
  /** Edited auto-split lines ("Customize Split"). */
  customAllocations?: AllocationDraftItem[];
  /** Amounts the user directed to specific cards. Counted toward each card's monthly deposit. */
  manualDeposits?: ManualDepositInput[];
  /** How to treat the un-directed remainder when `manualDeposits` is used. Defaults to 'auto_split'. */
  manualRemainderMode?: ManualRemainderMode;
}

/**
 * Result of splitting an income with manual deposits.
 * `allocations` lists the manual lines first, then any auto-split lines for the remainder.
 * The stage totals inherited from AllocationPreviewResult (percentageTotal, totalRemainingNeeds, ...)
 * describe the auto-split part only; `grossIncome` is always the full income.
 */
export interface ManualAllocationPreviewResult extends AllocationPreviewResult {
  /** Sum of all manual deposits (TJS). */
  manualDepositTotal: number;
  /** Only the manual lines (ruleStage === 'manual_deposit'). */
  manualAllocations: AllocationDraftItem[];
  /** Amount that went through the auto-split pipeline (0 when the remainder goes to Working Capital). */
  autoSplitAmount: number;
  remainderMode: ManualRemainderMode;
}
