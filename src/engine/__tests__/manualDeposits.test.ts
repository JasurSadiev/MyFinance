import { describe, it, expect } from 'vitest';
import {
  applyAllocationsToFunds,
  calculateFundMonthlyNeed,
  computeIncomeDistribution,
  countsTowardMonthlyDeposit,
  normalizeManualDeposits,
  previewIncomeAllocation,
  previewIncomeWithManualDeposits,
  rollbackAllocationsFromFunds,
  rolloverFundsToNextMonth,
  roundCents,
} from '../allocationEngine';
import { AllocationDraftItem, AllocationSettings, Fund } from '../../types/finance';

const settings: AllocationSettings = {
  surplusStrategy: 'unallocated',
  surplusRules: [],
  currentCycleMonth: '2026-10',
};

function makeFunds(): Fund[] {
  const monthly = (id: string, name: string, amount: number, priority: number): Fund => ({
    id,
    name,
    type: 'monthly',
    category: 'Spending',
    targetAmount: amount,
    monthlyAmount: amount,
    reservedAmount: 0,
    cycleStartBalance: 0,
    cycleAllocated: 0,
    cycleSpent: 0,
    priority,
    isActive: true,
  });
  return [
    {
      id: 'sav',
      name: 'Savings',
      type: 'percentage',
      category: 'Savings',
      percentage: 10,
      targetAmount: 25000,
      reservedAmount: 0,
      cycleAllocated: 0,
      priority: 1,
      isActive: true,
    },
    monthly('fuel', 'Fuel for Car', 1000, 2),
    monthly('wife', "Wife's Expense", 1000, 3),
    monthly('food', 'Food', 1500, 4),
  ];
}

const sum = (items: Array<{ amount: number }>) =>
  roundCents(items.reduce((s, a) => s + a.amount, 0));
const amountOf = (items: AllocationDraftItem[], fundId: string) =>
  items.find((a) => a.fundId === fundId)?.amount;
const fundById = (funds: Fund[], id: string) => funds.find((f) => f.id === id)!;

describe('Manual deposits to specific cards', () => {
  it("User scenario: receive 2,000 TJS -> 1,000 to Fuel + 1,000 to Wife's Expense; the next salary is auto-split and COUNTS those manual deposits", () => {
    let funds = makeFunds();

    const manual = previewIncomeWithManualDeposits(
      2000,
      funds,
      [
        { fundId: 'fuel', amount: 1000 },
        { fundId: 'wife', amount: 1000 },
      ],
      settings,
      '2026-10-03'
    );

    // Exactly what the user typed: nothing taken for Savings, nothing left over.
    expect(manual.allocations.map((a) => [a.fundId, a.amount, a.ruleStage])).toEqual([
      ['fuel', 1000, 'manual_deposit'],
      ['wife', 1000, 'manual_deposit'],
    ]);
    expect(manual.manualDepositTotal).toBe(2000);
    expect(manual.percentageTotal).toBe(0);
    expect(manual.unallocatedSurplus).toBe(0);
    expect(manual.autoSplitAmount).toBe(0);

    funds = applyAllocationsToFunds(funds, manual.allocations);
    // The cards now show it as this month's deposit AND as available balance.
    expect(fundById(funds, 'fuel').cycleAllocated).toBe(1000);
    expect(fundById(funds, 'fuel').reservedAmount).toBe(1000);
    expect(fundById(funds, 'wife').cycleAllocated).toBe(1000);
    expect(calculateFundMonthlyNeed(fundById(funds, 'fuel'), '2026-10-20').remainingNeed).toBe(0);

    // Later: a 6,000 TJS salary is auto-split.
    const salary = previewIncomeAllocation(6000, funds, settings, '2026-10-20');
    expect(salary.percentageTotal).toBe(600); // Savings 10% of every auto income
    expect(amountOf(salary.allocations, 'fuel')).toBeUndefined(); // already full -> 0 TJS
    expect(amountOf(salary.allocations, 'wife')).toBeUndefined(); // already full -> 0 TJS
    expect(amountOf(salary.allocations, 'food')).toBe(1500); // still needed
    expect(salary.unallocatedSurplus).toBe(3900); // 6000 - 600 - 1500 -> Working Capital
    expect(sum(salary.allocations) + salary.unallocatedSurplus).toBe(6000);
  });

  it('A partial manual deposit counts: later auto-splits only top up what is still missing', () => {
    let funds = makeFunds();
    const manual = previewIncomeWithManualDeposits(
      400,
      funds,
      [{ fundId: 'fuel', amount: 400 }],
      settings,
      '2026-10-02'
    );
    funds = applyAllocationsToFunds(funds, manual.allocations);

    const salary = previewIncomeAllocation(5000, funds, settings, '2026-10-15');
    expect(salary.percentageTotal).toBe(500);
    expect(amountOf(salary.allocations, 'fuel')).toBe(600); // 1000 - 400 already deposited
    expect(amountOf(salary.allocations, 'wife')).toBe(1000);
    expect(amountOf(salary.allocations, 'food')).toBe(1500);
    expect(salary.unallocatedSurplus).toBe(1400);

    // After the salary, Fuel has collected exactly its monthly requirement - no more, no less.
    const after = applyAllocationsToFunds(funds, salary.allocations);
    expect(fundById(after, 'fuel').cycleAllocated).toBe(1000);
  });

  it('Depositing MORE than the monthly need is allowed; the card is then treated as full and next month needs no top-up', () => {
    let funds = makeFunds();
    const manual = previewIncomeWithManualDeposits(
      1500,
      funds,
      [{ fundId: 'fuel', amount: 1500 }],
      settings,
      '2026-10-02'
    );
    funds = applyAllocationsToFunds(funds, manual.allocations);
    expect(fundById(funds, 'fuel').reservedAmount).toBe(1500);

    const salary = previewIncomeAllocation(3000, funds, settings, '2026-10-12');
    expect(amountOf(salary.allocations, 'fuel')).toBeUndefined();

    // New month: the whole 1,500 carries over, which already covers the 1,000 requirement.
    const nextMonth = rolloverFundsToNextMonth(funds);
    const need = calculateFundMonthlyNeed(fundById(nextMonth, 'fuel'), '2026-11-02');
    expect(need.carryoverFromPrevMonth).toBe(1500);
    expect(need.monthlyTarget).toBe(0);
    expect(need.remainingNeed).toBe(0);
  });

  it('Manual + automatic in ONE income: manual lines are exact, the remainder follows the normal rules against the updated cards', () => {
    const funds = makeFunds();
    const res = previewIncomeWithManualDeposits(
      5000,
      funds,
      [{ fundId: 'fuel', amount: 1000 }],
      settings,
      '2026-10-05'
    );

    expect(res.manualDepositTotal).toBe(1000);
    expect(res.autoSplitAmount).toBe(4000);
    expect(res.percentageTotal).toBe(400); // 10% of the 4,000 remainder, not of the full 5,000
    expect(res.allocations[0]).toMatchObject({ fundId: 'fuel', amount: 1000, ruleStage: 'manual_deposit' });
    expect(amountOf(res.allocations, 'sav')).toBe(400);
    expect(res.allocations.filter((a) => a.fundId === 'fuel')).toHaveLength(1); // Fuel is full -> not charged again
    expect(amountOf(res.allocations, 'wife')).toBe(1000);
    expect(amountOf(res.allocations, 'food')).toBe(1500);
    expect(res.unallocatedSurplus).toBe(1100);
    // Every diram is accounted for.
    expect(sum(res.allocations) + res.unallocatedSurplus).toBe(5000);
    expect(res.perFundTotals['fuel']).toBe(1000);
  });

  it('Shortfall in the auto-split remainder is shared in equal % across the cards that still need money', () => {
    const funds = makeFunds();
    const res = previewIncomeWithManualDeposits(
      2500,
      funds,
      [{ fundId: 'fuel', amount: 1000 }],
      settings,
      '2026-10-05'
    );

    // remainder 1,500 -> Savings 150 -> 1,350 for needs of 2,500 (Wife 1,000 + Food 1,500)
    expect(res.isShortfall).toBe(true);
    expect(res.needFundingRatio).toBe(0.54);
    expect(amountOf(res.allocations, 'sav')).toBe(150);
    expect(amountOf(res.allocations, 'wife')).toBe(540);
    expect(amountOf(res.allocations, 'food')).toBe(810);
    expect(res.unallocatedSurplus).toBe(0);
    expect(sum(res.allocations)).toBe(2500);
  });

  it("Remainder to Working Capital: no Savings % and no auto-split are applied to the rest", () => {
    const res = previewIncomeWithManualDeposits(
      3000,
      makeFunds(),
      [{ fundId: 'fuel', amount: 1000 }],
      settings,
      '2026-10-05',
      'working_capital'
    );

    expect(res.allocations).toHaveLength(1);
    expect(res.allocations[0]).toMatchObject({ fundId: 'fuel', amount: 1000 });
    expect(res.percentageTotal).toBe(0);
    expect(res.unallocatedSurplus).toBe(2000);
    expect(res.autoSplitAmount).toBe(0);
    expect(res.remainderMode).toBe('working_capital');
  });

  it("A manual deposit into Savings does not reduce the Savings % charged on later incomes", () => {
    let funds = makeFunds();
    const manual = previewIncomeWithManualDeposits(
      500,
      funds,
      [{ fundId: 'sav', amount: 500 }],
      settings,
      '2026-10-02'
    );
    funds = applyAllocationsToFunds(funds, manual.allocations);
    expect(fundById(funds, 'sav').reservedAmount).toBe(500);

    const salary = previewIncomeAllocation(1000, funds, settings, '2026-10-10');
    expect(amountOf(salary.allocations, 'sav')).toBe(100); // still 10% of the income
  });

  it('Carryover works with manual deposits: unspent manual money rolls into next month and only the difference is topped up', () => {
    const [sav, fuel] = makeFunds();
    let funds: Fund[] = [sav, fuel];
    const manual = previewIncomeWithManualDeposits(
      1000,
      funds,
      [{ fundId: 'fuel', amount: 1000 }],
      settings,
      '2026-10-02'
    );
    funds = applyAllocationsToFunds(funds, manual.allocations);
    // Spend 300 TJS from Fuel during the month.
    funds = funds.map((f) => (f.id === 'fuel' ? { ...f, reservedAmount: 700, cycleSpent: 300 } : f));

    const november = rolloverFundsToNextMonth(funds);
    expect(fundById(november, 'fuel').cycleStartBalance).toBe(700);

    const salary = previewIncomeAllocation(2000, november, settings, '2026-11-05');
    expect(salary.percentageTotal).toBe(200);
    expect(amountOf(salary.allocations, 'fuel')).toBe(300); // 1,000 required - 700 carried over
    expect(salary.unallocatedSurplus).toBe(1500);
  });

  it('Undo restores every card exactly, and the next auto-split charges the card its full need again', () => {
    const initial = makeFunds();
    const manual = previewIncomeWithManualDeposits(
      2000,
      initial,
      [
        { fundId: 'fuel', amount: 1000 },
        { fundId: 'wife', amount: 1000 },
      ],
      settings,
      '2026-10-03'
    );
    const applied = applyAllocationsToFunds(initial, manual.allocations);
    const rolledBack = rollbackAllocationsFromFunds(applied, manual.allocations);

    for (const original of initial) {
      const restored = fundById(rolledBack, original.id);
      expect(restored.reservedAmount).toBe(original.reservedAmount);
      expect(restored.cycleAllocated).toBe(original.cycleAllocated);
    }

    const salary = previewIncomeAllocation(6000, rolledBack, settings, '2026-10-20');
    expect(amountOf(salary.allocations, 'fuel')).toBe(1000);
    expect(amountOf(salary.allocations, 'wife')).toBe(1000);
  });

  it('Never loses or gains a diram with odd amounts', () => {
    const res = previewIncomeWithManualDeposits(
      1000.01,
      makeFunds(),
      [
        { fundId: 'fuel', amount: 333.33 },
        { fundId: 'wife', amount: 111.11 },
      ],
      settings,
      '2026-10-05'
    );
    expect(sum(res.allocations) + res.unallocatedSurplus).toBe(1000.01);
  });

  describe('validation', () => {
    const funds = makeFunds();

    it('rejects manual deposits that exceed the income', () => {
      expect(() =>
        previewIncomeWithManualDeposits(
          1000,
          funds,
          [
            { fundId: 'fuel', amount: 600 },
            { fundId: 'wife', amount: 500 },
          ],
          settings
        )
      ).toThrow(/exceed the income/);
    });

    it('rejects negative and non-numeric amounts', () => {
      expect(() => normalizeManualDeposits([{ fundId: 'fuel', amount: -1 }], funds)).toThrow(/non-negative/);
      expect(() => normalizeManualDeposits([{ fundId: 'fuel', amount: NaN }], funds)).toThrow(/non-negative/);
      expect(() =>
        normalizeManualDeposits([{ fundId: 'fuel', amount: '10' as unknown as number }], funds)
      ).toThrow(/non-negative/);
    });

    it('rejects unknown cards and deposits to inactive cards', () => {
      expect(() => normalizeManualDeposits([{ fundId: 'ghost', amount: 10 }], funds)).toThrow(/not found/);

      const withInactive = funds.map((f) => (f.id === 'food' ? { ...f, isActive: false } : f));
      expect(() => normalizeManualDeposits([{ fundId: 'food', amount: 10 }], withInactive)).toThrow(/inactive/);
      // ...but a blank/zero row for an inactive card is simply ignored.
      expect(normalizeManualDeposits([{ fundId: 'food', amount: 0 }], withInactive)).toEqual([]);
    });

    it('merges rows for the same card and ignores blank / zero rows', () => {
      const res = normalizeManualDeposits(
        [
          { fundId: 'fuel', amount: 300 },
          { fundId: 'wife', amount: 0 },
          { fundId: 'fuel', amount: 200.25 },
        ],
        funds
      );
      expect(res).toEqual([{ fundId: 'fuel', amount: 500.25 }]);
    });

    it('with no usable manual rows, the whole income is simply auto-split as usual', () => {
      const viaManual = previewIncomeWithManualDeposits(2000, funds, [{ fundId: 'fuel', amount: 0 }], settings, '2026-10-05');
      const viaAuto = previewIncomeAllocation(2000, funds, settings, '2026-10-05');
      expect(viaManual.manualDepositTotal).toBe(0);
      expect(viaManual.allocations.map((a) => [a.fundId, a.amount])).toEqual(
        viaAuto.allocations.map((a) => [a.fundId, a.amount])
      );
    });
  });
});

describe('computeIncomeDistribution (shared by the Firestore service, the in-memory service and the Cloud Function)', () => {
  const funds = makeFunds();

  it('no options -> the standard automatic split', () => {
    const d = computeIncomeDistribution(3000, funds, settings, '2026-10-05');
    const auto = previewIncomeAllocation(3000, funds, settings, '2026-10-05');
    expect(d.drafts).toEqual(auto.allocations);
    expect(d.workingCapitalAdded).toBe(auto.unallocatedSurplus);
    expect(d.manualDepositTotal).toBe(0);
  });

  it("customAllocations -> whatever is not allocated goes to Working Capital (unchanged behaviour)", () => {
    const auto = previewIncomeAllocation(3000, funds, settings, '2026-10-05');
    const custom = auto.allocations.map((a) => ({ ...a, amount: a.fundId === 'food' ? 0 : a.amount }));
    const d = computeIncomeDistribution(3000, funds, settings, '2026-10-05', { customAllocations: custom });
    expect(d.drafts).toBe(custom);
    expect(d.workingCapitalAdded).toBe(roundCents(3000 - sum(custom)));
  });

  it('manualDeposits -> manual lines + auto remainder; Working Capital = what is left', () => {
    const d = computeIncomeDistribution(5000, funds, settings, '2026-10-05', {
      manualDeposits: [{ fundId: 'fuel', amount: 1000 }],
    });
    expect(d.manualDepositTotal).toBe(1000);
    expect(d.drafts[0]).toMatchObject({ fundId: 'fuel', ruleStage: 'manual_deposit' });
    expect(sum(d.drafts) + d.workingCapitalAdded).toBe(5000);
  });

  it("manualDeposits + manualRemainderMode 'working_capital'", () => {
    const d = computeIncomeDistribution(5000, funds, settings, '2026-10-05', {
      manualDeposits: [{ fundId: 'fuel', amount: 1000 }],
      manualRemainderMode: 'working_capital',
    });
    expect(d.drafts).toHaveLength(1);
    expect(d.workingCapitalAdded).toBe(4000);
  });

  it('refuses to combine manualDeposits with customAllocations', () => {
    expect(() =>
      computeIncomeDistribution(1000, funds, settings, '2026-10-05', {
        manualDeposits: [{ fundId: 'fuel', amount: 100 }],
        customAllocations: [],
      })
    ).toThrow(/not both/);
  });
});

describe('countsTowardMonthlyDeposit', () => {
  it('counts manual deposits (and the other card-funding stages) but not surplus routing or Working Capital', () => {
    expect(countsTowardMonthlyDeposit('manual_deposit')).toBe(true);
    expect(countsTowardMonthlyDeposit('manual_override')).toBe(true);
    expect(countsTowardMonthlyDeposit('percentage')).toBe(true);
    expect(countsTowardMonthlyDeposit('need_full')).toBe(true);
    expect(countsTowardMonthlyDeposit('need_proportional')).toBe(true);
    expect(countsTowardMonthlyDeposit('surplus')).toBe(false);
    expect(countsTowardMonthlyDeposit('working_capital')).toBe(false);
  });
});
