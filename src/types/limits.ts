/**
 * Size limits that the security rules (firestore.rules) put on text a person types.
 *
 * The screens use them as `maxLength`, so an over-long entry is stopped while typing instead of being refused by the
 * database as "access denied". `src/types/__tests__/limits.test.ts` reads firestore.rules and fails if these numbers
 * ever drift away from the rules.
 */
export const TEXT_LIMITS = {
  /** funds: name */
  cardName: 100,
  /** incomes: source */
  incomeSource: 120,
  /** expenses: category */
  expenseCategory: 80,
} as const;
