import { describe, it, expect } from 'vitest';
import { displayLabel } from '../labels';
import { translate, type Language, type TranslationKey } from '../LanguageContext';
import { CANON, defaultCategoryForType, isDefaultCategory } from '../../engine/canonicalLabels';
import type { FundType } from '../../types/finance';

const tFor =
  (lang: Language) =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    translate(lang, key, vars);

describe('displayLabel: stored default labels are shown in the active language', () => {
  it('English shows exactly what was stored (nothing changes for English users or old records)', () => {
    for (const stored of Object.values(CANON)) {
      expect(displayLabel(stored, tFor('en')), stored).toBe(stored);
    }
  });

  it('Russian and Uzbek show a translation, never the stored English', () => {
    const expected: Record<string, [string, string]> = {
      [CANON.workingCapital]: ['Оборотный капитал', 'Aylanma mablag‘'],
      [CANON.general]: ['Общее', 'Umumiy'],
      [CANON.accountCard]: ['Карта-счёт', 'Hisob kartasi'],
      [CANON.spendingCategory]: ['Расходный счёт', 'Xarajat hisobi'],
      [CANON.savingsCategory]: ['Накопления (траты откл.)', "Jamg'arma (xarajat o'chiq)"],
      [CANON.sinkingCategory]: ['Целевой счёт', 'Maqsadli hisob'],
      [CANON.surplusTarget]: ['Целевая карта для излишка', 'Ortiqcha uchun maqsadli karta'],
    };
    expect(Object.keys(expected).sort()).toEqual(Object.values(CANON).sort()); // every canonical label is covered
    for (const [stored, [ru, uz]] of Object.entries(expected)) {
      expect(displayLabel(stored, tFor('ru'))).toBe(ru);
      expect(displayLabel(stored, tFor('uz'))).toBe(uz);
    }
  });

  it('leaves anything the user typed untouched', () => {
    for (const typed of ['Fuel for Car', 'Groceries', 'general', ' General', 'Working capital', 'Savings', 'Лёгкий обед']) {
      for (const lang of ['en', 'ru', 'uz'] as const) {
        expect(displayLabel(typed, tFor(lang))).toBe(typed);
      }
    }
  });

  it('is safe for names that are properties of every JavaScript object', () => {
    for (const typed of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(displayLabel(typed, tFor('ru'))).toBe(typed);
    }
  });

  it('shows nothing for a missing label', () => {
    expect(displayLabel(undefined, tFor('ru'))).toBe('');
    expect(displayLabel(null, tFor('ru'))).toBe('');
    expect(displayLabel('', tFor('ru'))).toBe('');
  });
});

describe('the category a card gets when the user does not type one', () => {
  it('depends on the card type', () => {
    const expected: Record<FundType, string> = {
      percentage: CANON.savingsCategory,
      monthly: CANON.spendingCategory,
      sinking: CANON.sinkingCategory,
      target: CANON.accountCard,
    };
    for (const [type, category] of Object.entries(expected)) {
      expect(defaultCategoryForType(type as FundType)).toBe(category);
    }
  });

  it('recognises app-written defaults, and not typed text', () => {
    expect(isDefaultCategory('Spending Account')).toBe(true);
    expect(isDefaultCategory('Savings (Spend Off)')).toBe(true);
    expect(isDefaultCategory('Sinking Account')).toBe(true);
    expect(isDefaultCategory('Account Card')).toBe(true);
    expect(isDefaultCategory('General')).toBe(true);
    expect(isDefaultCategory('Auto')).toBe(false);
    expect(isDefaultCategory('Working Capital')).toBe(false); // that is a card name, not a category default
    expect(isDefaultCategory('')).toBe(false);
    expect(isDefaultCategory(undefined)).toBe(false);
  });
});
