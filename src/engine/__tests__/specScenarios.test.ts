import { describe, it, expect } from 'vitest';
import {
  applyAllocationsToFunds,
  calculateFundMonthlyNeed,
  previewIncomeAllocation,
  rolloverFundsToNextMonth,
  roundCents,
} from '../allocationEngine';
import { AllocationSettings, Fund } from '../../types/finance';

/**
 * The worked examples from the product brief, with the exact figures used in the brief
 * (Fuel 1,000 TJS/mo, Wife's Expense 1,500, Food 2,500, Savings 10 %).
 *
 * These used to be shown on a hard-coded "rule lab" screen with static expected text. They live here instead
 * because here the expected figures are actually compared against the engine's output.
 */

const settings = (month: string): AllocationSettings => ({
  surplusStrategy: 'unallocated',
  surplusRules: [],
  currentCycleMonth: month,
});

const savings = (over: Partial<Fund> = {}): Fund => ({
  id: 'sav',
  name: 'Savings Account',
  type: 'percentage',
  category: 'Savings',
  percentage: 10,
  targetAmount: 20000,
  reservedAmount: 0,
  cycleAllocated: 0,
  priority: 1,
  isActive: true,
  ...over,
});

const monthly = (id: string, name: string, amount: number, priority: number, over: Partial<Fund> = {}): Fund => ({
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
  ...over,
});

const amountOf = (res: ReturnType<typeof previewIncomeAllocation>, fundId: string) =>
  res.allocations.find((a) => a.fundId === fundId)?.amount ?? 0;

describe('Product-brief worked examples (exact figures)', () => {
  it('1. Shortfall: 3,000 TJS, Savings 10 % first (300), then the remaining 2,700 is split at an equal 54 % of each need', () => {
    const funds = [
      savings(),
      monthly('fuel', 'Fuel for Car', 1000, 2),
      monthly('wife', "Wife's Expense", 1500, 3),
      monthly('food', 'Food & Meals', 2500, 4),
    ];

    const res = previewIncomeAllocation(3000, funds, settings('2026-09'), '2026-09-01');

    expect(res.percentageTotal).toBe(300);
    expect(res.remainingAfterPercentage).toBe(2700);
    expect(res.totalRemainingNeeds).toBe(5000);
    expect(res.needFundingRatio).toBeCloseTo(0.54, 10);
    expect(res.isShortfall).toBe(true);

    expect(amountOf(res, 'sav')).toBe(300);
    expect(amountOf(res, 'fuel')).toBe(540);
    expect(amountOf(res, 'wife')).toBe(810);
    expect(amountOf(res, 'food')).toBe(1350);
    expect(res.unallocatedSurplus).toBe(0);

    // What is still missing on each card afterwards (the brief's "460 / 690 / 1,150 still needed")
    const after = applyAllocationsToFunds(funds, res.allocations);
    const stillNeeded = (id: string) =>
      calculateFundMonthlyNeed(after.find((f) => f.id === id)!, '2026-09-01').remainingNeed;
    expect(stillNeeded('fuel')).toBe(460);
    expect(stillNeeded('wife')).toBe(690);
    expect(stillNeeded('food')).toBe(1150);

    // No diram is lost or invented
    expect(roundCents(res.allocations.reduce((s, a) => s + a.amount, 0))).toBe(3000);
  });

  it('2. Fuel (1,000/mo) was collected from the first two incomes: the 3rd income of 2,000 charges it 0 and sends 1,800 to Working Capital', () => {
    const funds = [
      savings({ reservedAmount: 500, cycleAllocated: 500 }),
      // 1,000 collected this month; 400 already spent at the gas station, so 600 is left on the card
      monthly('fuel', 'Fuel for Car', 1000, 2, { reservedAmount: 600, cycleAllocated: 1000, cycleSpent: 400 }),
    ];

    const res = previewIncomeAllocation(2000, funds, settings('2026-09'), '2026-09-25');

    expect(res.percentageTotal).toBe(200);
    expect(amountOf(res, 'sav')).toBe(200);
    expect(res.allocations.find((a) => a.fundId === 'fuel')).toBeUndefined();
    expect(amountOf(res, 'fuel')).toBe(0);
    expect(res.unallocatedSurplus).toBe(1800);
    expect(roundCents(amountOf(res, 'sav') + res.unallocatedSurplus)).toBe(2000);
  });

  it('3. Next month: 350 TJS carried over on Fuel, so only 650 (1,000 - 350) is topped up from a 2,000 income; 1,150 goes to Working Capital', () => {
    const funds = [
      savings({ reservedAmount: 1000, cycleAllocated: 0 }),
      monthly('fuel', 'Fuel for Car', 1000, 2, { reservedAmount: 350, cycleStartBalance: 350 }),
    ];

    const need = calculateFundMonthlyNeed(funds[1], '2026-10-01');
    expect(need.monthlyRequired).toBe(1000);
    expect(need.carryoverFromPrevMonth).toBe(350);
    expect(need.remainingNeed).toBe(650);

    const res = previewIncomeAllocation(2000, funds, settings('2026-10'), '2026-10-01');

    expect(amountOf(res, 'sav')).toBe(200);
    expect(amountOf(res, 'fuel')).toBe(650);
    expect(res.unallocatedSurplus).toBe(1150);

    // ... which brings the card to exactly its monthly amount
    const after = applyAllocationsToFunds(funds, res.allocations);
    expect(after.find((f) => f.id === 'fuel')!.reservedAmount).toBe(1000);
  });

  it('4. Walkthrough: three incomes in month 1 (600 + 600 + 1,000), 650 spent on fuel, then month 2 tops up only what was spent', () => {
    const s1 = settings('2026-09');
    let funds: Fund[] = [
      savings({ name: 'Savings (10%)', targetAmount: 10000 }),
      monthly('fuel', 'Fuel for Car (1,000 TJS/mo)', 1000, 2),
    ];

    // Income #1 (600): Savings 60, Fuel gets the other 540
    const inc1 = previewIncomeAllocation(600, funds, s1, '2026-09-05');
    expect(inc1.percentageTotal).toBe(60);
    expect(amountOf(inc1, 'fuel')).toBe(540);
    expect(inc1.unallocatedSurplus).toBe(0);
    funds = applyAllocationsToFunds(funds, inc1.allocations);
    expect(funds.find((f) => f.id === 'fuel')!.cycleAllocated).toBe(540); // "Fuel collected: 540 / 1,000"

    // Income #2 (600): Savings 60, Fuel capped at the 460 still missing, 80 to Working Capital
    const inc2 = previewIncomeAllocation(600, funds, s1, '2026-09-15');
    expect(inc2.percentageTotal).toBe(60);
    expect(amountOf(inc2, 'fuel')).toBe(460);
    expect(inc2.unallocatedSurplus).toBe(80);
    funds = applyAllocationsToFunds(funds, inc2.allocations);
    expect(funds.find((f) => f.id === 'fuel')!.cycleAllocated).toBe(1000); // "1,000 / 1,000"

    // 650 spent from the Fuel card
    funds = funds.map((f) =>
      f.id === 'fuel' ? { ...f, reservedAmount: roundCents(f.reservedAmount - 650), cycleSpent: 650 } : f
    );

    // Income #3 (1,000): Fuel is skipped even though it was spent from, because the month's amount was collected
    const inc3 = previewIncomeAllocation(1000, funds, s1, '2026-09-25');
    expect(inc3.percentageTotal).toBe(100);
    expect(amountOf(inc3, 'fuel')).toBe(0);
    expect(inc3.unallocatedSurplus).toBe(900);
    funds = applyAllocationsToFunds(funds, inc3.allocations);

    // Month 2: the 350 left on the card carries over; a 1,000 income tops up only 650
    const month2 = rolloverFundsToNextMonth(funds);
    const fuel2 = month2.find((f) => f.id === 'fuel')!;
    expect(fuel2.cycleStartBalance).toBe(350);
    expect(fuel2.cycleAllocated).toBe(0);

    const inc4 = previewIncomeAllocation(1000, month2, settings('2026-10'), '2026-10-05');
    expect(inc4.percentageTotal).toBe(100);
    expect(amountOf(inc4, 'fuel')).toBe(650);
    expect(inc4.unallocatedSurplus).toBe(250);
    const month2After = applyAllocationsToFunds(month2, inc4.allocations);
    expect(month2After.find((f) => f.id === 'fuel')!.reservedAmount).toBe(1000); // "Restored to 1,000 TJS"
  });
});
