import { describe, it, expect } from 'vitest';
import { previewIncomeAllocation } from '../allocationEngine';
import { RULE_DATE, makeRuleFunds, ruleScenarios } from './fixtures';
import { AllocationSettings } from '../../types/finance';

const settings: AllocationSettings = {
  surplusStrategy: 'proportional_rules',
  surplusRules: [
    { fundId: 'sav', percentage: 60 },
    { fundId: 'trip', percentage: 40 },
  ],
  currentCycleMonth: '2026-10',
};

describe('Allocation lines carry the numbers behind their rule (ruleDetails)', () => {
  const lines = previewIncomeAllocation(10000, makeRuleFunds(), settings, RULE_DATE).allocations;
  const line = (stage: string, fundId: string) =>
    lines.find((l) => l.ruleStage === stage && l.fundId === fundId)!;

  it('Savings line: the percentage and the amount it was applied to', () => {
    expect(line('percentage', 'sav').ruleDetails).toStrictEqual({ pct: 10, base: 10000 });
  });

  it('monthly card: required, carried over, top-up target and what was already collected this month', () => {
    expect(line('need_full', 'fuel').ruleDetails).toStrictEqual({
      card: {
        kind: 'monthly',
        monthlyRequired: 1000,
        carryover: 200,
        monthlyTarget: 800,
        collected: 300,
        monthsRemaining: 1,
      },
    });
  });

  it('sinking and target cards include what was still missing at the start of the month', () => {
    expect(line('need_full', 'ins').ruleDetails).toStrictEqual({
      card: {
        kind: 'sinking',
        monthlyRequired: 450,
        carryover: 300,
        monthlyTarget: 450,
        collected: 0,
        monthsRemaining: 2,
        remainingTotalAtCycleStart: 900,
      },
    });
    expect(line('need_full', 'trip').ruleDetails?.card).toMatchObject({
      kind: 'target',
      collected: 50,
      monthsRemaining: 3,
      remainingTotalAtCycleStart: 500,
    });
  });

  it('surplus lines: the surplus percentage and the surplus it applied to', () => {
    expect(line('surplus', 'sav').ruleDetails).toStrictEqual({ pct: 60, base: 6433.33 });
    expect(line('surplus', 'trip').ruleDetails).toStrictEqual({ pct: 40, base: 6433.33 });
  });

  it('equal-ratio lines: the percentage', () => {
    const short = previewIncomeAllocation(2000, makeRuleFunds(), settings, RULE_DATE).allocations;
    const proportional = short.filter((l) => l.ruleStage === 'need_proportional');
    expect(proportional.length).toBeGreaterThan(0);
    for (const l of proportional) {
      expect(l.ruleDetails).toStrictEqual({ pct: 70.13 });
    }
  });

  it('is safe to write to Firestore as-is: no undefined values anywhere, every scenario', () => {
    let checked = 0;
    for (const { drafts } of ruleScenarios()) {
      for (const d of drafts) {
        if (!d.ruleDetails) continue;
        // JSON drops undefined; the Firebase Admin SDK would throw on it.
        expect(JSON.parse(JSON.stringify(d.ruleDetails))).toStrictEqual(d.ruleDetails);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(8);
  });

  it('the scenarios used by the translation tests cover every kind of line', () => {
    const stages = new Set(ruleScenarios().flatMap((s) => s.drafts.map((d) => d.ruleStage)));
    expect([...stages].sort()).toEqual(
      ['manual_deposit', 'need_full', 'need_proportional', 'percentage', 'surplus'].sort()
    );
    const kinds = new Set(
      ruleScenarios().flatMap((s) => s.drafts.map((d) => d.ruleDetails?.card?.kind).filter(Boolean))
    );
    expect([...kinds].sort()).toEqual(['monthly', 'sinking', 'target']);
  });
});
