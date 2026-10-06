import { describe, it, expect } from 'vitest';
import { describeAllocationRule, RuleSource, Translate } from '../ruleText';
import { Language, translate } from '../LanguageContext';
import { ruleScenarios } from '../../engine/__tests__/fixtures';
import { AllocationDraftItem } from '../../types/finance';

const tFor = (lang: Language): Translate => (key, vars) => translate(lang, key, vars);
const allDrafts = () => ruleScenarios().flatMap((s) => s.drafts);

/** Words from the English sentences that must never leak into Russian / Uzbek. */
const ENGLISH_LEAK =
  /savings rule|equal-ratio|remaining|Monthly required|carried over|Collected|collected this month|Surplus rule|Manual deposit|adjustment|top-up|Sinking|Target account|\bmo\b/i;

describe('describeAllocationRule', () => {
  it('English reproduces the engine\'s original sentence EXACTLY for every kind of line and card', () => {
    const t = tFor('en');
    const drafts = allDrafts();
    expect(drafts.length).toBeGreaterThan(15);
    for (const d of drafts) {
      expect(describeAllocationRule(d, t), `${d.ruleStage} / ${d.fundName}`).toBe(d.ruleUsed);
    }
  });

  it.each(['ru', 'uz'] as const)('%s: fully translated, keeps every number, and differs from the English text', (lang) => {
    const t = tFor(lang);
    for (const d of allDrafts()) {
      const text = describeAllocationRule(d, t);
      expect(text, `${d.ruleStage} / ${d.fundName}`).not.toMatch(ENGLISH_LEAK);
      expect(text).not.toBe(d.ruleUsed);
      expect(text).not.toMatch(/\{[a-z]+\}/); // every placeholder was filled
      if (d.ruleStage !== 'surplus') {
        expect(text).toContain(d.amount.toFixed(2));
      }
    }
  });

  it('shows the monthly-card explanation (required / carried over / collected) in the user\'s language', () => {
    const fuel = allDrafts().find((d) => d.ruleStage === 'need_full' && d.fundId === 'fuel')!;
    expect(describeAllocationRule(fuel, tFor('en'))).toBe(
      '100% of remaining monthly need (500.00 TJS) — Monthly required: 1000.00 TJS (200.00 TJS carried over → 800.00 TJS top-up needed) • Collected this month: 300.00 TJS'
    );
    expect(describeAllocationRule(fuel, tFor('ru'))).toBe(
      '100% оставшейся месячной нормы (500.00 TJS) — Месячная норма: 1000.00 TJS (перенесено 200.00 TJS → нужно пополнить на 800.00 TJS) • Собрано в этом месяце: 300.00 TJS'
    );
    expect(describeAllocationRule(fuel, tFor('uz'))).toBe(
      "Oylik normadan qolganini to'liq to'ldirish (500.00 TJS) — Oylik norma: 1000.00 TJS (200.00 TJS o'tgan oydan qoldi → 800.00 TJS to'ldirish kerak) • Shu oyda yig'ildi: 300.00 TJS"
    );
  });

  describe('older records without ruleDetails still get a translated sentence', () => {
    // What a record saved before ruleDetails existed looks like: no ruleDetails at all.
    const legacy = (d: AllocationDraftItem): RuleSource => {
      const { ruleDetails: _omit, ...rest } = d;
      return rest;
    };

    it.each(['en', 'ru', 'uz'] as const)('%s: every stage renders, with no English leaking into RU/UZ', (lang) => {
      const t = tFor(lang);
      for (const d of allDrafts()) {
        const text = describeAllocationRule(legacy(d), t);
        expect(text.length).toBeGreaterThan(5);
        expect(text).not.toMatch(/\{[a-z]+\}/);
        if (lang !== 'en') expect(text, `${d.ruleStage}/${d.fundName}`).not.toMatch(ENGLISH_LEAK);
      }
    });

    it('English: uses the shorter sentence when the base amount is unknown', () => {
      const t = tFor('en');
      const find = (stage: string) => allDrafts().find((d) => d.ruleStage === stage && d.fundId !== 'trip')!;

      expect(describeAllocationRule(legacy(find('percentage')), t)).toMatch(/^10% savings rule \(\d+\.\d{2} TJS\)$/);
      expect(describeAllocationRule(legacy(find('need_full')), t)).toMatch(
        /^100% of remaining monthly need \(\d+\.\d{2} TJS\)$/
      );
      expect(describeAllocationRule(legacy(find('surplus')), t)).toBe('Surplus rule: 60% of the surplus');
    });

    it('equal-ratio sentences can be rebuilt completely from the old fields', () => {
      const t = tFor('en');
      const proportional = ruleScenarios()[1].drafts.filter((d) => d.ruleStage === 'need_proportional');
      expect(proportional.length).toBeGreaterThan(0);
      for (const d of proportional) {
        expect(describeAllocationRule(legacy(d), t)).toBe(d.ruleUsed);
      }
    });
  });

  it('manual adjustments mention the automatic amount when it is known', () => {
    const base = { ruleStage: 'manual_override', amount: 700, needBeforeAllocation: 0, fundingRatio: 1, ruleUsed: 'x' } as const;
    expect(describeAllocationRule({ ...base, ruleDetails: { autoAmount: 650 } }, tFor('en'))).toBe(
      'User manual adjustment (700.00 TJS, auto was 650.00 TJS)'
    );
    expect(describeAllocationRule({ ...base, ruleDetails: { autoAmount: 650 } }, tFor('ru'))).toBe(
      'Ручная корректировка (700.00 TJS, авто было 650.00 TJS)'
    );
    expect(describeAllocationRule({ ...base }, tFor('uz'))).toBe("Qo'lda tuzatish (700.00 TJS)");
  });

  it('an unknown stage falls back to the stored text instead of showing nothing', () => {
    expect(
      describeAllocationRule(
        { ruleStage: 'working_capital', amount: 5, needBeforeAllocation: 0, fundingRatio: 1, ruleUsed: 'stored text' },
        tFor('ru')
      )
    ).toBe('stored text');
  });
});
