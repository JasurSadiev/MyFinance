import { CANON } from '../engine/canonicalLabels';
import type { TranslationKey } from './LanguageContext';
import type { Translate } from './ruleText';

/**
 * App-written default labels (see engine/canonicalLabels.ts) -> their translations.
 * A Map, not an object, so a user-typed category such as "constructor" can never hit a prototype property.
 */
const LABEL_KEYS = new Map<string, TranslationKey>([
  [CANON.workingCapital, 'card_working_capital_badge'],
  [CANON.general, 'cat_general'],
  [CANON.accountCard, 'cat_account_card'],
  [CANON.spendingCategory, 'cat_spending'],
  [CANON.savingsCategory, 'cat_savings'],
  [CANON.sinkingCategory, 'cat_sinking'],
  [CANON.surplusTarget, 'cat_surplus_target'],
]);

/**
 * Text to show for a stored label.
 *
 * Records keep the English default the app wrote ("Spending Account", "Working Capital", ...), so this
 * also fixes records created before translations existed. Anything the user typed (a card name,
 * a custom category, a merchant) is returned unchanged.
 */
export function displayLabel(text: string | null | undefined, t: Translate): string {
  if (!text) return '';
  const key = LABEL_KEYS.get(text);
  return key ? t(key) : text;
}
