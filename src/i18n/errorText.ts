import { AppError, AppErrorCode } from '../types/errors';
import type { TranslationKey } from './LanguageContext';
import type { Translate } from './ruleText';

/**
 * The message for every AppError code.
 * Typed as a complete Record so adding an AppErrorCode without a message fails the build.
 */
export const APP_ERROR_KEYS: Record<AppErrorCode, TranslationKey> = {
  AUTH_REQUIRED: 'err_auth_required',
  FUND_NAME_REQUIRED: 'err_fund_name_required',
  FUND_PERCENT_RANGE: 'err_fund_percent_range',
  FUND_TARGET_NEGATIVE: 'err_fund_target_negative',
  FUND_BALANCE_NEGATIVE: 'err_fund_balance_negative',
  SAVINGS_TOTAL_EXCEEDS: 'err_savings_total_exceeds',
  FUND_HAS_BALANCE: 'err_fund_has_balance',
  ACCOUNT_NAME_REQUIRED: 'err_account_name_required',
  ACCOUNT_BALANCE_INVALID: 'err_account_balance_invalid',
  INCOME_AMOUNT_INVALID: 'inc_err_amount',
  INCOME_DATE_INVALID: 'err_income_date',
  INCOME_SOURCE_REQUIRED: 'inc_err_source',
  INCOME_NOT_FOUND: 'err_income_not_found',
  INCOME_ALREADY_UNDONE: 'err_income_already_undone',
  PERCENT_TOTAL_EXCEEDS: 'err_percent_total_exceeds',
  ALLOCATIONS_EXCEED_INCOME: 'err_alloc_exceed_income',
  MANUAL_TARGET_REQUIRED: 'err_manual_target_required',
  MANUAL_TARGET_NOT_FOUND: 'err_manual_target_not_found',
  MANUAL_AMOUNT_INVALID: 'err_manual_amount_invalid',
  MANUAL_CARD_INACTIVE: 'err_manual_card_inactive',
  MANUAL_EXCEEDS_INCOME: 'err_manual_exceeds_income',
  MANUAL_WITH_CUSTOM: 'err_manual_with_custom',
  EXPENSE_AMOUNT_INVALID: 'err_expense_amount',
  EXPENSE_DATE_INVALID: 'err_expense_date',
  EXPENSE_CATEGORY_REQUIRED: 'err_expense_category',
  EXPENSE_NOT_FOUND: 'err_expense_not_found',
  EXPENSE_ALREADY_UNDONE: 'err_expense_already_undone',
  SPEND_FROM_SAVINGS_DISABLED: 'err_spend_from_savings',
};

/**
 * Firebase Auth and Cloud Firestore report problems with a `code` ("auth/invalid-credential",
 * "permission-denied", ...). These are the ones a person can act on; everything else gets the generic message.
 * Wrong-password and unknown-email deliberately share one message (so the form doesn't reveal which emails exist).
 */
export const FIREBASE_ERROR_KEYS: Readonly<Record<string, TranslationKey>> = {
  'auth/invalid-credential': 'err_auth_invalid_credentials',
  'auth/invalid-login-credentials': 'err_auth_invalid_credentials',
  'auth/wrong-password': 'err_auth_invalid_credentials',
  'auth/user-not-found': 'err_auth_invalid_credentials',
  'auth/invalid-email': 'err_auth_invalid_email',
  'auth/missing-email': 'err_auth_invalid_email',
  'auth/email-already-in-use': 'err_auth_email_in_use',
  'auth/weak-password': 'err_auth_weak_password',
  'auth/user-disabled': 'err_auth_user_disabled',
  'auth/operation-not-allowed': 'err_auth_not_enabled',
  'auth/too-many-requests': 'err_too_many',
  'auth/network-request-failed': 'err_network',
  'permission-denied': 'err_permission',
  unauthenticated: 'err_auth_required',
  unavailable: 'err_network',
  'deadline-exceeded': 'err_network',
  'resource-exhausted': 'err_too_many',
  aborted: 'err_conflict',
};

function codeOf(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * Turns anything that was thrown into a sentence in the active language.
 *
 *  - AppError          -> its own message (with the numbers/names it carries)
 *  - Firebase error    -> a friendly message for the codes people can act on
 *  - anything else     -> `fallbackKey` (a generic message). Raw library text such as
 *                         "Firebase: Error (auth/...)" is never shown to the user.
 *
 * It is pure, so screens can keep the raw error in state and call it while rendering; the message then
 * follows the language switcher.
 */
export function describeError(
  err: unknown,
  t: Translate,
  fallbackKey: TranslationKey = 'err_generic'
): string {
  if (err instanceof AppError) {
    return t(APP_ERROR_KEYS[err.code], err.params);
  }
  const code = codeOf(err);
  if (code !== undefined && Object.prototype.hasOwnProperty.call(FIREBASE_ERROR_KEYS, code)) {
    return t(FIREBASE_ERROR_KEYS[code]);
  }
  return t(fallbackKey);
}
