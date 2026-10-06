import type { FundType } from '../types/finance';

/**
 * The few English strings the app itself writes into stored records when the user leaves a field empty
 * (a card's category, an expense's category, the Working Capital "card" name, a missing surplus target).
 *
 * They are stored in this one canonical form so logic can compare against them and old records stay valid.
 * Screens never print them raw: `displayLabel()` (src/i18n/labels.ts) shows them in the active language.
 */
export const CANON = {
  workingCapital: 'Working Capital',
  general: 'General',
  accountCard: 'Account Card',
  spendingCategory: 'Spending Account',
  savingsCategory: 'Savings (Spend Off)',
  sinkingCategory: 'Sinking Account',
  surplusTarget: 'Surplus Target Account',
} as const;

/** The category a card gets when the user does not type one. */
export function defaultCategoryForType(type: FundType): string {
  switch (type) {
    case 'percentage':
      return CANON.savingsCategory;
    case 'sinking':
      return CANON.sinkingCategory;
    case 'monthly':
      return CANON.spendingCategory;
    default:
      return CANON.accountCard;
  }
}

/** True when `category` is one of the app-written defaults (as opposed to text the user typed). */
export function isDefaultCategory(category: string | undefined | null): boolean {
  return (
    category === CANON.savingsCategory ||
    category === CANON.spendingCategory ||
    category === CANON.sinkingCategory ||
    category === CANON.accountCard ||
    category === CANON.general
  );
}
