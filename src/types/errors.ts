/**
 * Errors the app raises on purpose (validation, business rules).
 *
 * Every AppError carries
 *  - `message`: the English sentence (what developers read in logs and what the unit tests assert), and
 *  - `code` + `params`: what the UI needs to show the same message in English, Russian or Uzbek
 *    (see `src/i18n/errorText.ts`).
 *
 * The UI never prints `message` for these; it renders `code` in the active language. Because the class
 * extends Error, existing `toThrow(/message/)` assertions and `catch (e) { e.message }` code keep working.
 */
export type AppErrorCode =
  | 'AUTH_REQUIRED'
  // Account cards
  | 'FUND_NAME_REQUIRED'
  | 'FUND_PERCENT_RANGE'
  | 'FUND_TARGET_NEGATIVE'
  | 'FUND_BALANCE_NEGATIVE'
  | 'SAVINGS_TOTAL_EXCEEDS'
  | 'FUND_HAS_BALANCE'
  // Bank accounts
  | 'ACCOUNT_NAME_REQUIRED'
  | 'ACCOUNT_BALANCE_INVALID'
  // Income
  | 'INCOME_AMOUNT_INVALID'
  | 'INCOME_DATE_INVALID'
  | 'INCOME_SOURCE_REQUIRED'
  | 'INCOME_NOT_FOUND'
  | 'INCOME_ALREADY_UNDONE'
  | 'PERCENT_TOTAL_EXCEEDS'
  | 'ALLOCATIONS_EXCEED_INCOME'
  // Manual deposits
  | 'MANUAL_TARGET_REQUIRED'
  | 'MANUAL_TARGET_NOT_FOUND'
  | 'MANUAL_AMOUNT_INVALID'
  | 'MANUAL_CARD_INACTIVE'
  | 'MANUAL_EXCEEDS_INCOME'
  | 'MANUAL_WITH_CUSTOM'
  // Expenses
  | 'EXPENSE_AMOUNT_INVALID'
  | 'EXPENSE_DATE_INVALID'
  | 'EXPENSE_CATEGORY_REQUIRED'
  | 'EXPENSE_NOT_FOUND'
  | 'EXPENSE_ALREADY_UNDONE'
  | 'SPEND_FROM_SAVINGS_DISABLED';

export type ErrorParams = Record<string, string | number>;

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly params: ErrorParams;

  constructor(code: AppErrorCode, message: string, params: ErrorParams = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.params = params;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
