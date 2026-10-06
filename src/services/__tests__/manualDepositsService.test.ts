import { describe, it, expect, vi } from 'vitest';

// The service module imports the real Firebase app at load time; the in-memory transaction engine under
// test never touches the network, so stub the app wiring.
vi.mock('../firebaseConfig', () => ({ app: {}, auth: {}, db: {}, appCheck: null }));

import { FinanceBaaSService } from '../financeService';
import { Fund } from '../../types/finance';

function setup() {
  const svc = new FinanceBaaSService('user-1', 'me@example.com', 'Me');
  const account = svc.saveAccount({ name: 'Main account', type: 'checking', balance: 0 });

  const savings = svc.saveFund({
    name: 'Savings',
    type: 'percentage',
    percentage: 10,
    targetAmount: 25000,
    priority: 1,
  });
  const fuel = svc.saveFund({
    name: 'Fuel for Car',
    type: 'monthly',
    monthlyAmount: 1000,
    targetAmount: 1000,
    priority: 2,
  });
  const wife = svc.saveFund({
    name: "Wife's Expense",
    type: 'monthly',
    monthlyAmount: 1000,
    targetAmount: 1000,
    priority: 3,
  });
  const food = svc.saveFund({
    name: 'Food',
    type: 'monthly',
    monthlyAmount: 1500,
    targetAmount: 1500,
    priority: 4,
  });
  return { svc, account, savings, fuel, wife, food };
}

const byId = (funds: Fund[], id: string) => funds.find((f) => f.id === id)!;

describe('Manual deposits through the transaction service', () => {
  it("records 2,000 TJS as 1,000 Fuel + 1,000 Wife's Expense, then the next auto-split salary counts them, and undo restores everything", () => {
    const { svc, account, savings, fuel, wife, food } = setup();

    // 1) 2,000 TJS received and directed by hand.
    const first = svc.addIncome({
      amount: 2000,
      date: '2026-10-03',
      source: 'Freelance project',
      accountId: account.id,
      manualDeposits: [
        { fundId: fuel.id, amount: 1000 },
        { fundId: wife.id, amount: 1000 },
      ],
    });

    expect(first.allocations.map((a) => [a.fundId, a.amount, a.ruleStage])).toEqual([
      [fuel.id, 1000, 'manual_deposit'],
      [wife.id, 1000, 'manual_deposit'],
    ]);
    expect(first.income.unallocatedSurplus).toBe(0);
    expect(svc.getUserSnapshot().settings.workingCapitalBalance).toBe(0);
    expect(svc.getAccounts()[0].balance).toBe(2000);

    let funds = svc.getFunds();
    expect(byId(funds, fuel.id).cycleAllocated).toBe(1000); // "Monthly Deposit" on the card
    expect(byId(funds, fuel.id).reservedAmount).toBe(1000); // available balance on the card
    expect(byId(funds, wife.id).cycleAllocated).toBe(1000);
    expect(byId(funds, savings.id).reservedAmount).toBe(0); // no Savings % taken from a manual deposit

    // 2) Later a 6,000 TJS salary arrives and is auto-split.
    const second = svc.addIncome({
      amount: 6000,
      date: '2026-10-20',
      source: 'Salary',
      accountId: account.id,
    });
    const secondFundIds = second.allocations.map((a) => a.fundId);
    expect(secondFundIds).not.toContain(fuel.id); // already full thanks to the manual deposit
    expect(secondFundIds).not.toContain(wife.id);
    expect(second.allocations.find((a) => a.fundId === savings.id)?.amount).toBe(600);
    expect(second.allocations.find((a) => a.fundId === food.id)?.amount).toBe(1500);
    expect(second.income.unallocatedSurplus).toBe(3900);
    expect(svc.getUserSnapshot().settings.workingCapitalBalance).toBe(3900);

    funds = svc.getFunds();
    expect(byId(funds, fuel.id).cycleAllocated).toBe(1000); // not charged twice
    expect(byId(funds, fuel.id).reservedAmount).toBe(1000);

    // 3) Undo the manual income: both cards are restored, so the manual money is "unpaid" again.
    svc.undoIncome(first.income.id);
    funds = svc.getFunds();
    expect(byId(funds, fuel.id).cycleAllocated).toBe(0);
    expect(byId(funds, fuel.id).reservedAmount).toBe(0);
    expect(byId(funds, wife.id).cycleAllocated).toBe(0);
    expect(svc.getAccounts()[0].balance).toBe(6000);
    expect(svc.getAllocationsForIncome(first.income.id).every((a) => a.status === 'undone')).toBe(true);

    // ...and a new auto-split salary charges them their full monthly need again.
    const third = svc.addIncome({ amount: 6000, date: '2026-10-25', source: 'Salary #2', accountId: account.id });
    expect(third.allocations.find((a) => a.fundId === fuel.id)?.amount).toBe(1000);
    expect(third.allocations.find((a) => a.fundId === wife.id)?.amount).toBe(1000);
  });

  it('saved allocation records keep the numbers behind their rule, ready to be shown in any language', () => {
    const { svc, account, savings, fuel } = setup();
    const res = svc.addIncome({ amount: 5000, date: '2026-10-03', source: 'Salary', accountId: account.id });

    const saved = svc.getAllocationsForIncome(res.income.id);
    const savingsLine = saved.find((a) => a.fundId === savings.id)!;
    const fuelLine = saved.find((a) => a.fundId === fuel.id)!;

    expect(savingsLine.ruleDetails).toStrictEqual({ pct: 10, base: 5000 });
    expect(fuelLine.ruleDetails?.card).toMatchObject({ kind: 'monthly', monthlyRequired: 1000, collected: 0 });
    // The English sentence is still stored too (immutable audit text + fallback).
    expect(savingsLine.ruleUsed).toBe('10% savings rule (500.00 TJS of 5000.00 TJS)');
  });

  it('manual deposit of part of an income + the rest to Working Capital', () => {
    const { svc, account, fuel, savings } = setup();
    const res = svc.addIncome({
      amount: 3000,
      date: '2026-10-03',
      source: 'Bonus',
      accountId: account.id,
      manualDeposits: [{ fundId: fuel.id, amount: 1000 }],
      manualRemainderMode: 'working_capital',
    });

    expect(res.allocations).toHaveLength(1);
    expect(res.income.unallocatedSurplus).toBe(2000);
    expect(svc.getUserSnapshot().settings.workingCapitalBalance).toBe(2000);
    expect(byId(svc.getFunds(), savings.id).reservedAmount).toBe(0);

    // Undo takes the Working Capital credit back as well.
    svc.undoIncome(res.income.id);
    expect(svc.getUserSnapshot().settings.workingCapitalBalance).toBe(0);
  });

  it('manual deposit + automatic remainder in the same income', () => {
    const { svc, account, fuel, wife, food, savings } = setup();
    const res = svc.addIncome({
      amount: 5000,
      date: '2026-10-03',
      source: 'Salary',
      accountId: account.id,
      manualDeposits: [{ fundId: fuel.id, amount: 1000 }],
    });

    const amounts = Object.fromEntries(res.allocations.map((a) => [a.fundId, a.amount]));
    expect(amounts).toEqual({
      [fuel.id]: 1000, // manual
      [savings.id]: 400, // 10% of the 4,000 that was not directed by hand
      [wife.id]: 1000,
      [food.id]: 1500,
    });
    expect(res.income.unallocatedSurplus).toBe(1100);
    expect(svc.getUserSnapshot().settings.workingCapitalBalance).toBe(1100);
  });

  it('rejects invalid manual deposits atomically (nothing is written)', () => {
    const { svc, account, fuel, wife } = setup();
    const before = JSON.stringify(svc.getUserSnapshot());

    expect(() =>
      svc.addIncome({
        amount: 1000,
        date: '2026-10-03',
        source: 'Too much',
        accountId: account.id,
        manualDeposits: [
          { fundId: fuel.id, amount: 700 },
          { fundId: wife.id, amount: 700 },
        ],
      })
    ).toThrow(/exceed the income/);

    expect(JSON.stringify(svc.getUserSnapshot())).toBe(before);
  });

  it('manual deposits made in October are carried over: only the missing part is topped up in November', () => {
    const { svc, account, fuel } = setup();
    svc.addIncome({
      amount: 1000,
      date: '2026-10-03',
      source: 'Advance',
      accountId: account.id,
      manualDeposits: [{ fundId: fuel.id, amount: 1000 }],
    });

    // 300 TJS is spent from Fuel during October, then the month rolls over.
    svc.saveFund({
      id: fuel.id,
      name: fuel.name,
      type: 'monthly',
      monthlyAmount: 1000,
      targetAmount: 1000,
      reservedAmount: 700,
      cycleSpent: 300,
    });
    svc.rolloverToNextMonth();
    expect(byId(svc.getFunds(), fuel.id).cycleStartBalance).toBe(700);

    // A salary big enough to fund every card in full, so only the carryover effect is visible:
    // Fuel needs 1,000 - 700 carried over = 300 (Wife's Expense and Food still need their full amounts).
    const nov = svc.addIncome({ amount: 4000, date: '2026-11-05', source: 'Salary', accountId: account.id });
    expect(nov.allocations.find((a) => a.fundId === fuel.id)?.amount).toBe(300);
  });
});
