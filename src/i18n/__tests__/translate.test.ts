import { describe, it, expect } from 'vitest';
import { translate, translations } from '../LanguageContext';

describe('translate() fills placeholders safely', () => {
  it('fills a placeholder that appears more than once', () => {
    // "Undid expense {amount} TJS (...) and restored {amount} TJS to ... card"
    expect(translate('en', 'auditlog_expense_undone_card', { amount: '50.00', description: 'Lunch', card: 'Food' })).toBe(
      'Undid expense 50.00 TJS ("Lunch") and restored 50.00 TJS to "Food" card'
    );
    expect(translate('ru', 'auditlog_expense_undone_card', { amount: '50.00', description: 'Обед', card: 'Еда' })).toBe(
      'Отменён расход 50.00 TJS («Обед») — 50.00 TJS возвращено на карту «Еда»'
    );
  });

  it('inserts user-typed text literally: "$&", "$$", "$`" and "$\'" are not special', () => {
    for (const typed of ['Cash $$', 'Bonus $&', 'a $` b', "x $' y", '$1 and $2', 'Price $$$ and $&']) {
      const out = translate('en', 'auditlog_income_added', { amount: '10.00', source: typed });
      expect(out).toBe(`Added income 10.00 TJS from "${typed}"`);
    }
  });

  it('does not expand placeholder-looking text inside a value', () => {
    // {name} comes BEFORE {detail} in this sentence, so a naive left-to-right replace would hit the user's text first.
    expect(translate('en', 'auditlog_fund_created', { name: '{detail}', detail: 'Goal 5.00 TJS' })).toBe(
      'Created Account Card "{detail}" (Goal 5.00 TJS)'
    );
    expect(translate('ru', 'auditlog_fund_created', { detail: 'цель: 5.00 TJS', name: '{detail}' })).toBe(
      'Создана карта «{detail}» (цель: 5.00 TJS)'
    );
  });

  it('keeps a placeholder visible when its value was not supplied (a missing value is easy to spot)', () => {
    expect(translate('en', 'auditlog_income_added', { amount: '10.00' })).toBe('Added income 10.00 TJS from "{source}"');
  });

  it('prints 0 and ignores extra values', () => {
    expect(translate('en', 'auditlog_part_cards', { count: 0, unused: 'x' })).toBe('cards funded: 0');
  });

  it('falls back from a missing translation to English, and finally to the key itself', () => {
    const key = 'nav_overview';
    const original = translations.uz[key];
    try {
      (translations.uz as Record<string, string>)[key] = '';
      expect(translate('uz', key)).toBe(translations.en[key]);
    } finally {
      (translations.uz as Record<string, string>)[key] = original;
    }
    expect(translate('en', 'no_such_key' as never)).toBe('no_such_key');
  });
});
