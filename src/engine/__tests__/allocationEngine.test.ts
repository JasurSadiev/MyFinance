import { describe, it, expect } from 'vitest';
import {
  applyAllocationsToFunds,
  calculateFundMonthlyNeed,
  calculateMonthsRemaining,
  previewIncomeAllocation,
  rollbackAllocationsFromFunds,
  rolloverFundsToNextMonth,
  roundCents,
} from '../allocationEngine';
import { AllocationSettings, Fund } from '../../types/finance';

const baseSettings: AllocationSettings = {
  surplusStrategy: 'unallocated',
  surplusRules: [],
  currentCycleMonth: '2026-09',
};

describe('Smart Finance Manager — Somoni (TJS) Allocation Engine Test Suite', () => {
  it('Scenario 1: Income = 3,000 TJS, Savings = 10% (300 TJS), Remaining = 2,700 TJS, Equal % split across spending cards', () => {
    const funds: Fund[] = [
      {
        id: 'sav',
        name: 'Savings',
        type: 'percentage',
        category: 'Savings',
        percentage: 10,
        targetAmount: 10000,
        reservedAmount: 0,
        cycleAllocated: 0,
        priority: 1,
        isActive: true,
      },
      {
        id: 'rent',
        name: 'Rent',
        type: 'monthly',
        category: 'Housing',
        targetAmount: 2000,
        monthlyAmount: 2000,
        reservedAmount: 0,
        cycleStartBalance: 0,
        cycleAllocated: 0,
        priority: 2,
        isActive: true,
      },
      {
        id: 'food',
        name: 'Food',
        type: 'monthly',
        category: 'Living',
        targetAmount: 1000,
        monthlyAmount: 1000,
        reservedAmount: 0,
        cycleStartBalance: 0,
        cycleAllocated: 0,
        priority: 3,
        isActive: true,
      },
      {
        id: 'car',
        name: 'Car Sinking Fund',
        type: 'sinking',
        category: 'Auto',
        targetAmount: 1000,
        monthsRemaining: 1,
        reservedAmount: 0,
        cycleAllocated: 0,
        priority: 4,
        isActive: true,
      },
    ];

    const res = previewIncomeAllocation(3000, funds, baseSettings, '2026-09-01');

    expect(res.percentageTotal).toBe(300);
    expect(res.remainingAfterPercentage).toBe(2700);
    expect(res.totalRemainingNeeds).toBe(4000);
    expect(res.needFundingRatio).toBeCloseTo(0.675, 5);
    expect(res.isShortfall).toBe(true);
    expect(res.rawSurplus).toBe(0);

    const byId = Object.fromEntries(res.allocations.map((a) => [a.fundId, a.amount]));
    expect(byId['sav']).toBe(300);
    expect(byId['rent']).toBe(1350);
    expect(byId['food']).toBe(675);
    expect(byId['car']).toBe(675);

    const sum = roundCents(res.allocations.reduce((s, a) => s + a.amount, 0));
    expect(sum).toBe(3000);
  });

  it('Scenario 2: Monthly Collection Cap across 3 incomes (Fuel = 1,000 TJS/mo collected on first 2 incomes -> 0 TJS charged on 3rd income even after spending)', () => {
    let funds: Fund[] = [
      {
        id: 'sav',
        name: 'Savings Account',
        type: 'percentage',
        category: 'Savings',
        percentage: 10,
        targetAmount: 25000,
        reservedAmount: 0,
        cycleAllocated: 0,
        priority: 1,
        isActive: true,
      },
      {
        id: 'fuel',
        name: 'Fuel for Car',
        type: 'monthly',
        category: 'Auto',
        targetAmount: 1000,
        monthlyAmount: 1000,
        reservedAmount: 0,
        cycleStartBalance: 0,
        cycleAllocated: 0,
        cycleSpent: 0,
        priority: 2,
        isActive: true,
      },
    ];

    // 1st Income: 600 TJS -> Savings gets 10% (60 TJS), Fuel gets remaining 540 TJS
    const inc1 = previewIncomeAllocation(600, funds, baseSettings, '2026-09-05');
    expect(inc1.percentageTotal).toBe(60);
    expect(inc1.allocations.find((a) => a.fundId === 'fuel')?.amount).toBe(540);
    funds = applyAllocationsToFunds(funds, inc1.allocations);

    // 2nd Income: 600 TJS -> Savings gets 10% (60 TJS), Fuel only needs 460 TJS to reach 1,000 TJS monthly cap! Remaining 80 TJS -> Working Capital
    const inc2 = previewIncomeAllocation(600, funds, baseSettings, '2026-09-15');
    expect(inc2.percentageTotal).toBe(60);
    expect(inc2.allocations.find((a) => a.fundId === 'fuel')?.amount).toBe(460);
    expect(inc2.unallocatedSurplus).toBe(80);
    funds = applyAllocationsToFunds(funds, inc2.allocations);

    // Verify Fuel has collected 1,000 TJS this month
    const fuelAfter2 = funds.find((f) => f.id === 'fuel')!;
    expect(fuelAfter2.cycleAllocated).toBe(1000);
    expect(fuelAfter2.reservedAmount).toBe(1000);

    // Spend 650 TJS from Fuel mid-month (leaving 350 TJS on the Fuel card)
    funds = funds.map((f) =>
      f.id === 'fuel' ? { ...f, reservedAmount: 350, cycleSpent: 650 } : f
    );

    // 3rd Income in the same month: 1,000 TJS -> Savings gets 10% (100 TJS), Fuel MUST get 0 TJS because 1,000 TJS was already collected this month!
    const inc3 = previewIncomeAllocation(1000, funds, baseSettings, '2026-09-25');
    expect(inc3.percentageTotal).toBe(100);
    expect(inc3.allocations.find((a) => a.fundId === 'fuel')).toBeUndefined();
    expect(inc3.unallocatedSurplus).toBe(900);
  });

  it('Scenario 3: Next-Month Carryover Top-Up — remaining balance carries over and only (monthlyRequired - carriedOver) is topped up next month', () => {
    const endOfMonth1Funds: Fund[] = [
      {
        id: 'sav',
        name: 'Savings Account',
        type: 'percentage',
        category: 'Savings',
        percentage: 10,
        targetAmount: 25000,
        reservedAmount: 220,
        cycleAllocated: 220,
        priority: 1,
        isActive: true,
      },
      {
        id: 'fuel',
        name: 'Fuel for Car',
        type: 'monthly',
        category: 'Auto',
        targetAmount: 1000,
        monthlyAmount: 1000,
        reservedAmount: 350, // 350 TJS unspent at end of Month 1
        cycleStartBalance: 0,
        cycleAllocated: 1000,
        cycleSpent: 650,
        priority: 2,
        isActive: true,
      },
    ];

    // Roll over to Month 2
    const month2Funds = rolloverFundsToNextMonth(endOfMonth1Funds);
    const fuelM2 = month2Funds.find((f) => f.id === 'fuel')!;
    expect(fuelM2.cycleStartBalance).toBe(350);
    expect(fuelM2.cycleAllocated).toBe(0);
    expect(fuelM2.cycleSpent).toBe(0);
    expect(fuelM2.reservedAmount).toBe(350);

    // Calculate monthly need in Month 2: required = 1000, carryover = 350 -> only 650 TJS needed!
    const needCalc = calculateFundMonthlyNeed(fuelM2, '2026-10-01');
    expect(needCalc.monthlyRequired).toBe(1000);
    expect(needCalc.carryoverFromPrevMonth).toBe(350);
    expect(needCalc.monthlyTarget).toBe(650);
    expect(needCalc.remainingNeed).toBe(650);

    // Receive 1,000 TJS in Month 2 -> Savings gets 100 TJS, Fuel only tops up 650 TJS (bringing balance to 1,000 TJS), 250 TJS to Working Capital
    const m2Preview = previewIncomeAllocation(1000, month2Funds, baseSettings, '2026-10-05');
    expect(m2Preview.percentageTotal).toBe(100);
    expect(m2Preview.allocations.find((a) => a.fundId === 'fuel')?.amount).toBe(650);
    expect(m2Preview.unallocatedSurplus).toBe(250);

    const updatedM2 = applyAllocationsToFunds(month2Funds, m2Preview.allocations);
    expect(updatedM2.find((f) => f.id === 'fuel')?.reservedAmount).toBe(1000);
  });

  it('Scenario 4: Surplus — Income = 5,000 TJS, Savings = 10% (500 TJS), Remaining = 4,500 TJS, Needs = 4,000 TJS -> 500 TJS Surplus routed by rules', () => {
    const funds: Fund[] = [
      {
        id: 'sav',
        name: 'Savings',
        type: 'percentage',
        category: 'Savings',
        percentage: 10,
        targetAmount: 10000,
        reservedAmount: 0,
        cycleAllocated: 0,
        priority: 1,
        isActive: true,
      },
      {
        id: 'rent',
        name: 'Rent',
        type: 'monthly',
        category: 'Housing',
        targetAmount: 2000,
        monthlyAmount: 2000,
        reservedAmount: 0,
        cycleStartBalance: 0,
        cycleAllocated: 0,
        priority: 2,
        isActive: true,
      },
      {
        id: 'food',
        name: 'Food',
        type: 'monthly',
        category: 'Living',
        targetAmount: 1000,
        monthlyAmount: 1000,
        reservedAmount: 0,
        cycleStartBalance: 0,
        cycleAllocated: 0,
        priority: 3,
        isActive: true,
      },
      {
        id: 'car',
        name: 'Car Sinking Fund',
        type: 'sinking',
        category: 'Auto',
        targetAmount: 1000,
        monthsRemaining: 1,
        reservedAmount: 0,
        cycleAllocated: 0,
        priority: 4,
        isActive: true,
      },
    ];

    const surplusSettings: AllocationSettings = {
      surplusStrategy: 'proportional_rules',
      surplusRules: [
        { fundId: 'sav', percentage: 60 },
        { fundId: 'car', percentage: 40 },
      ],
      currentCycleMonth: '2026-09',
    };

    const res = previewIncomeAllocation(5000, funds, surplusSettings, '2026-09-01');

    expect(res.percentageTotal).toBe(500);
    expect(res.remainingAfterPercentage).toBe(4500);
    expect(res.totalRemainingNeeds).toBe(4000);
    expect(res.needFundingRatio).toBe(1);
    expect(res.isShortfall).toBe(false);
    expect(res.rawSurplus).toBe(500);
    expect(res.unallocatedSurplus).toBe(0);
  });

  it('Sinking Fund Formula: (targetAmount - reservedAmount) / monthsRemaining', () => {
    const sinkingFund: Fund = {
      id: 'ins',
      name: 'Annual Car Insurance',
      type: 'sinking',
      category: 'Insurance',
      targetAmount: 1200,
      reservedAmount: 300,
      cycleAllocated: 0,
      targetDate: '2026-12-01',
      priority: 2,
      isActive: true,
    };

    const calc = calculateFundMonthlyNeed(sinkingFund, '2026-09-01');
    expect(calc.monthsRemaining).toBe(3);
    expect(calc.monthlyTarget).toBe(300);
    expect(calc.remainingNeed).toBe(300);
  });

  it('Due-Date Edge Case: Past or same-month targetDate clamps monthsRemaining to 1 without dividing by zero', () => {
    expect(calculateMonthsRemaining('2026-09-15', '2026-09-01')).toBe(1);
    expect(calculateMonthsRemaining('2026-09-15', '2025-01-01')).toBe(1);
  });

  it('Cent-Reconciliation Invariant: Odd primes and 3-way splits never lose or gain a diram/cent', () => {
    const funds: Fund[] = [
      {
        id: 'f1',
        name: 'Fund A',
        type: 'monthly',
        category: 'A',
        targetAmount: 333.33,
        monthlyAmount: 333.33,
        reservedAmount: 0,
        cycleStartBalance: 0,
        cycleAllocated: 0,
        priority: 1,
        isActive: true,
      },
      {
        id: 'f2',
        name: 'Fund B',
        type: 'monthly',
        category: 'B',
        targetAmount: 333.33,
        monthlyAmount: 333.33,
        reservedAmount: 0,
        cycleStartBalance: 0,
        cycleAllocated: 0,
        priority: 2,
        isActive: true,
      },
      {
        id: 'f3',
        name: 'Fund C',
        type: 'monthly',
        category: 'C',
        targetAmount: 333.34,
        monthlyAmount: 333.34,
        reservedAmount: 0,
        cycleStartBalance: 0,
        cycleAllocated: 0,
        priority: 3,
        isActive: true,
      },
    ];

    const res = previewIncomeAllocation(100, funds, baseSettings, '2026-09-01');
    const sum = roundCents(res.allocations.reduce((s, a) => s + a.amount, 0));
    expect(sum).toBe(100);
  });

  it('Undo / Rollback Invariant: Applying and rolling back an allocation restores exact original balances and cycleAllocated', () => {
    const initialFunds: Fund[] = [
      {
        id: 'sav',
        name: 'Savings',
        type: 'percentage',
        category: 'Savings',
        percentage: 15,
        targetAmount: 5000,
        reservedAmount: 1200,
        cycleAllocated: 150,
        priority: 1,
        isActive: true,
      },
      {
        id: 'rent',
        name: 'Rent',
        type: 'monthly',
        category: 'Housing',
        targetAmount: 2000,
        monthlyAmount: 2000,
        reservedAmount: 500,
        cycleStartBalance: 0,
        cycleAllocated: 500,
        priority: 2,
        isActive: true,
      },
    ];

    const preview = previewIncomeAllocation(1000, initialFunds, baseSettings, '2026-09-10');
    const afterApply = applyAllocationsToFunds(initialFunds, preview.allocations);
    const afterRollback = rollbackAllocationsFromFunds(afterApply, preview.allocations);

    expect(afterRollback[0].reservedAmount).toBe(initialFunds[0].reservedAmount);
    expect(afterRollback[0].cycleAllocated).toBe(initialFunds[0].cycleAllocated);
    expect(afterRollback[1].reservedAmount).toBe(initialFunds[1].reservedAmount);
    expect(afterRollback[1].cycleAllocated).toBe(initialFunds[1].cycleAllocated);
  });
});
