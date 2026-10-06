import { describe, it, expect } from 'vitest';
import { translations } from '../LanguageContext';

const en = translations.en as Record<string, string>;
const ru = translations.ru as Record<string, string>;
const uz = translations.uz as Record<string, string>;

/** Words that are the same in every language: the currency code, the brand, e-mail. */
const SHARED = /\b(TJS|MyFinance|EN|RU|UZ|ID|email|you|example|com)\b/g;
const withoutPlaceholders = (v: string) => v.replace(/\{\w+\}/g, '');
const latinWords = (v: string) => withoutPlaceholders(v).replace(SHARED, '').match(/[A-Za-z]{3,}/g) ?? [];

describe('dictionary hygiene (catches typos a translator cannot see by eye)', () => {
  it('no word mixes Latin and Cyrillic letters (e.g. "Oзиq" for "Oziq")', () => {
    const offenders: string[] = [];
    for (const lang of ['en', 'ru', 'uz'] as const) {
      for (const [key, value] of Object.entries(translations[lang] as Record<string, string>)) {
        for (const word of value.match(/[\p{L}]+/gu) ?? []) {
          if (/\p{Script=Latin}/u.test(word) && /\p{Script=Cyrillic}/u.test(word)) offenders.push(`${lang}.${key}: "${word}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('Uzbek is written in the Latin alphabet only', () => {
    const offenders = Object.entries(uz).filter(([, v]) => /\p{Script=Cyrillic}/u.test(v)).map(([k]) => k);
    expect(offenders).toEqual([]);
  });

  it('Russian has no English words left in it (apart from TJS, MyFinance and e-mail)', () => {
    const offenders = Object.entries(ru)
      .map(([k, v]) => [k, latinWords(v)] as const)
      .filter(([, words]) => words.length > 0)
      .map(([k, words]) => `${k}: ${words.join(', ')}`);
    expect(offenders).toEqual([]);
  });

  it('no Russian or Uzbek text is just a copy of the English', () => {
    const copies = (dict: Record<string, string>) =>
      Object.entries(dict)
        .filter(([k, v]) => v === en[k] && latinWords(v).length > 0)
        .map(([k]) => k);
    expect(copies(ru)).toEqual([]);
    expect(copies(uz)).toEqual([]);
  });

  it('no value is empty or only whitespace', () => {
    for (const lang of ['en', 'ru', 'uz'] as const) {
      for (const [key, value] of Object.entries(translations[lang] as Record<string, string>)) {
        expect(value.trim().length, `${lang}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});
