import { previewIncomeAllocation, previewIncomeWithManualDeposits } from '../allocationEngine';
import { AllocationDraftItem, AllocationSettings, Fund } from '../../types/finance';

/** Shared by the rule-explanation tests: scenarios that between them produce every kind of allocation line. */
export const RULE_DATE = '2026-10-05';

export function makeRuleFunds(): Fund[] {
  const card = (
    o: Partial<Fund> & Pick<Fund, 'id' | 'name' | 'type' | 'priority'>
  ): Fund => ({
    category: 'Test',
    targetAmount: 0,
    reservedAmount: 0,
    cycleAllocated: 0,
    isActive: true,
    ...o,
  });

  return [
    card({ id: 'sav', name: 'Savings', type: 'percentage', percentage: 10, targetAmount: 25000, priority: 1 }),
    // Monthly card with last month's carryover AND money already collected this month
    card({
      id: 'fuel',
      name: 'Fuel',
      type: 'monthly',
      targetAmount: 1000,
      monthlyAmount: 1000,
      cycleStartBalance: 200,
      cycleAllocated: 300,
      reservedAmount: 500,
      priority: 2,
    }),
    // Plain monthly card
    card({
      id: 'food',
      name: 'Food',
      type: 'monthly',
      targetAmount: 1500,
      monthlyAmount: 1500,
      cycleStartBalance: 0,
      priority: 3,
    }),
    // Sinking card, nothing collected this month
    card({
      id: 'ins',
      name: 'Insurance',
      type: 'sinking',
      targetAmount: 1200,
      reservedAmount: 300,
      targetDate: '2026-12-01',
      priority: 4,
    }),
    // Target card, part already collected this month
    card({
      id: 'trip',
      name: 'Trip',
      type: 'target',
      targetAmount: 600,
      reservedAmount: 150,
      cycleAllocated: 50,
      targetDate: '2027-01-01',
      priority: 5,
    }),
  ];
}

const plainSettings: AllocationSettings = {
  surplusStrategy: 'unallocated',
  surplusRules: [],
  currentCycleMonth: '2026-10',
};

const surplusSettings: AllocationSettings = {
  surplusStrategy: 'proportional_rules',
  surplusRules: [
    { fundId: 'sav', percentage: 60 },
    { fundId: 'trip', percentage: 40 },
  ],
  currentCycleMonth: '2026-10',
};

export function ruleScenarios(): Array<{ name: string; drafts: AllocationDraftItem[] }> {
  const funds = makeRuleFunds();
  return [
    {
      name: 'full funding + surplus rules',
      drafts: previewIncomeAllocation(10000, funds, surplusSettings, RULE_DATE).allocations,
    },
    {
      name: 'shortfall (equal-ratio split)',
      drafts: previewIncomeAllocation(2000, funds, plainSettings, RULE_DATE).allocations,
    },
    {
      name: 'manual deposits + automatic remainder',
      drafts: previewIncomeWithManualDeposits(
        3000,
        funds,
        [
          { fundId: 'fuel', amount: 400 }, // card still needed 500 -> "was still needed" variant
          { fundId: 'food', amount: 1500 },
          { fundId: 'sav', amount: 100 }, // Savings has no monthly need -> short variant
        ],
        plainSettings,
        RULE_DATE
      ).allocations,
    },
  ];
}
