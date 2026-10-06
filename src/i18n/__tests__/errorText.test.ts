import { describe, it, expect } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { APP_ERROR_KEYS, FIREBASE_ERROR_KEYS, describeError } from '../errorText';
import { translate, translations, type Language, type TranslationKey } from '../LanguageContext';
import { AppError, type AppErrorCode } from '../../types/errors';
import {
  computeIncomeDistribution,
  normalizeManualDeposits,
  previewIncomeAllocation,
  validateFundInput,
} from '../../engine/allocationEngine';
import type { Fund } from '../../types/finance';

const LANGS: Language[] = ['en', 'ru', 'uz'];
const tFor =
  (lang: Language) =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    translate(lang, key, vars);

const card = (o: Partial<Fund> & Pick<Fund, 'id' | 'name' | 'type'>): Fund => ({
  category: 'Test', targetAmount: 100, reservedAmount: 0, cycleAllocated: 0, isActive: true, priority: 1, ...o,
});

function thrown(run: () => unknown): AppError {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error('expected the call to throw');
}

describe('every error the app raises has a message in English, Russian and Uzbek', () => {
  const codes = Object.keys(APP_ERROR_KEYS) as AppErrorCode[];

  it('has an entry for each code in every dictionary', () => {
    expect(codes.length).toBeGreaterThanOrEqual(27);
    for (const code of codes) {
      for (const lang of LANGS) {
        expect(translations[lang][APP_ERROR_KEYS[code]], `${lang}: ${code}`).toBeTruthy();
      }
    }
  });

  it('fills every placeholder when the code is given the values its message needs', () => {
    for (const code of codes) {
      const placeholders = [...translations.en[APP_ERROR_KEYS[code]].matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const params = Object.fromEntries(placeholders.map((p) => [p, `<${p}>`]));
      for (const lang of LANGS) {
        const text = describeError(new AppError(code, 'english message', params), tFor(lang));
        expect(text, `${lang}: ${code}`).not.toMatch(/\{\w+\}/);
        for (const p of placeholders) expect(text).toContain(`<${p}>`);
      }
    }
  });

  it('never prints the English developer message in Russian or Uzbek', () => {
    for (const code of codes) {
      const err = new AppError(code, 'THE ENGLISH DEVELOPER MESSAGE');
      for (const lang of ['ru', 'uz'] as const) {
        expect(describeError(err, tFor(lang))).not.toContain('DEVELOPER');
      }
    }
  });
});

describe('errors thrown by the engine carry what the message needs', () => {
  it('card validation', () => {
    expect(thrown(() => validateFundInput({ name: ' ', type: 'monthly', targetAmount: 1 })).code).toBe('FUND_NAME_REQUIRED');
    expect(thrown(() => validateFundInput({ name: 'S', type: 'percentage', percentage: 0 })).code).toBe('FUND_PERCENT_RANGE');
    expect(thrown(() => validateFundInput({ name: 'S', type: 'percentage', percentage: 101 })).code).toBe('FUND_PERCENT_RANGE');
    expect(thrown(() => validateFundInput({ name: 'M', type: 'monthly', targetAmount: -1 })).code).toBe('FUND_TARGET_NEGATIVE');
    expect(thrown(() => validateFundInput({ name: 'M', type: 'monthly', targetAmount: 1, reservedAmount: -5 })).code).toBe('FUND_BALANCE_NEGATIVE');
  });

  it('savings percentages above 100% of an income', () => {
    const funds = [
      card({ id: 'a', name: 'A', type: 'percentage', percentage: 60, priority: 1 }),
      card({ id: 'b', name: 'B', type: 'percentage', percentage: 50, priority: 2 }),
    ];
    const err = thrown(() => previewIncomeAllocation(1000, funds, {}, '2026-10-05'));
    expect(err.code).toBe('PERCENT_TOTAL_EXCEEDS');
    expect(err.params).toEqual({ total: 110 });
    expect(describeError(err, tFor('ru'))).toBe('Проценты накоплений в сумме составляют 110% — это больше 100% дохода.');
    expect(describeError(err, tFor('uz'))).toBe("Jamg'arma foizlari yig'indisi 110% — bu daromadning 100% idan ko'p.");
  });

  it('manual deposits: unknown card, bad amount, inactive card, more than the income, mixed with a custom split', () => {
    const funds = [
      card({ id: 'fuel', name: 'Fuel for Car', type: 'monthly' }),
      card({ id: 'old', name: 'Old card', type: 'monthly', isActive: false, priority: 2 }),
    ];

    expect(thrown(() => normalizeManualDeposits([{ fundId: '', amount: 5 }], funds)).code).toBe('MANUAL_TARGET_REQUIRED');
    expect(thrown(() => normalizeManualDeposits([{ fundId: 'ghost', amount: 5 }], funds)).code).toBe('MANUAL_TARGET_NOT_FOUND');

    const bad = thrown(() => normalizeManualDeposits([{ fundId: 'fuel', amount: -5 }], funds));
    expect(bad.code).toBe('MANUAL_AMOUNT_INVALID');
    expect(bad.params).toEqual({ name: 'Fuel for Car' });
    expect(describeError(bad, tFor('ru'))).toBe('Сумма ручного пополнения для «Fuel for Car» должна быть неотрицательным числом.');

    const inactive = thrown(() => normalizeManualDeposits([{ fundId: 'old', amount: 5 }], funds));
    expect(inactive.code).toBe('MANUAL_CARD_INACTIVE');
    expect(describeError(inactive, tFor('uz'))).toBe('"Old card" kartasini to\'ldirib bo\'lmaydi: karta faol emas.');

    const over = thrown(() =>
      computeIncomeDistribution(500, funds, {}, '2026-10-05', { manualDeposits: [{ fundId: 'fuel', amount: 800 }] })
    );
    expect(over.code).toBe('MANUAL_EXCEEDS_INCOME');
    expect(describeError(over, tFor('ru'))).toBe('Ручные суммы (800.00 TJS) больше суммы дохода (500.00 TJS).');

    const both = thrown(() =>
      computeIncomeDistribution(500, funds, {}, '2026-10-05', {
        manualDeposits: [{ fundId: 'fuel', amount: 1 }],
        customAllocations: [],
      })
    );
    expect(both.code).toBe('MANUAL_WITH_CUSTOM');
  });

  it('keeps the original English message, so logs and older assertions still read the same', () => {
    expect(thrown(() => previewIncomeAllocation(-1, [], {}, '2026-10-05')).message).toBe(
      'Income amount must be a non-negative number.'
    );
  });
});

describe('describeError: sign-in, network and database problems', () => {
  it('words the Firebase codes a person can act on, using the real SDK error object', () => {
    const wrongPassword = new FirebaseError('auth/invalid-credential', 'Firebase: Error (auth/invalid-credential).');
    expect(describeError(wrongPassword, tFor('en'), 'err_auth_failed')).toBe('Incorrect email or password.');
    expect(describeError(wrongPassword, tFor('ru'), 'err_auth_failed')).toBe('Неверный email или пароль.');
    expect(describeError(wrongPassword, tFor('uz'), 'err_auth_failed')).toBe("Email yoki parol noto'g'ri.");

    const offline = new FirebaseError('auth/network-request-failed', 'Firebase: Error (auth/network-request-failed).');
    expect(describeError(offline, tFor('ru'))).toBe('Нет связи с сервером. Проверьте интернет и повторите попытку.');

    const denied = new FirebaseError('permission-denied', 'Missing or insufficient permissions.');
    expect(describeError(denied, tFor('uz'))).toBe("Ruxsat berilmadi. Hisobdan chiqib, qayta kiring va yana urinib ko'ring.");
  });

  it('has a message in every language for every Firebase code it knows', () => {
    for (const [code, key] of Object.entries(FIREBASE_ERROR_KEYS)) {
      for (const lang of LANGS) {
        expect(translations[lang][key], `${lang}: ${code}`).toBeTruthy();
      }
    }
    // wrong password and unknown email share one message (the form must not reveal which emails have accounts)
    expect(FIREBASE_ERROR_KEYS['auth/wrong-password']).toBe(FIREBASE_ERROR_KEYS['auth/user-not-found']);
  });

  it('never shows raw library text: unknown codes and plain errors get the generic message', () => {
    const unknownCode = new FirebaseError('auth/some-new-code', 'Firebase: Error (auth/some-new-code).');
    const plain = new Error('TypeError: Cannot read properties of undefined (reading "x")');
    for (const lang of ['ru', 'uz'] as const) {
      for (const err of [unknownCode, plain, 'network down', null, undefined, 42, {}, { code: 7 }]) {
        const text = describeError(err, tFor(lang), 'err_auth_failed');
        expect(text).toBe(translations[lang].err_auth_failed);
        expect(text).not.toMatch(/Firebase|auth\/|TypeError/);
      }
    }
    expect(describeError(plain, tFor('en'))).toBe('Something went wrong. Please try again.'); // default fallback
  });

  it('a code that is a prototype property name is not mistaken for a known code', () => {
    for (const code of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(describeError({ code }, tFor('ru'), 'err_generic')).toBe(translations.ru.err_generic);
    }
  });
});
