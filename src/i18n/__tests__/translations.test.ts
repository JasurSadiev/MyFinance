import { describe, it, expect } from 'vitest';
import { translations } from '../LanguageContext';
import { STAGE_LABEL_KEYS } from '../stageLabels';

const placeholders = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort();

describe('Translations (EN / RU / UZ)', () => {
  const en = translations.en as Record<string, string>;
  const ru = translations.ru as Record<string, string>;
  const uz = translations.uz as Record<string, string>;

  it('every language defines exactly the same keys', () => {
    const enKeys = Object.keys(en).sort();
    expect(Object.keys(ru).sort()).toEqual(enKeys);
    expect(Object.keys(uz).sort()).toEqual(enKeys);
  });

  it('no translation is empty', () => {
    for (const [lang, dict] of Object.entries({ en, ru, uz })) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('every language uses the same {placeholders} as English for each key', () => {
    for (const key of Object.keys(en)) {
      expect(placeholders(ru[key]), `ru.${key}`).toEqual(placeholders(en[key]));
      expect(placeholders(uz[key]), `uz.${key}`).toEqual(placeholders(en[key]));
    }
  });

  it('every allocation stage has a label key that exists in all languages', () => {
    for (const key of Object.values(STAGE_LABEL_KEYS)) {
      expect(en[key], key).toBeTruthy();
      expect(ru[key], key).toBeTruthy();
      expect(uz[key], key).toBeTruthy();
    }
  });
});
