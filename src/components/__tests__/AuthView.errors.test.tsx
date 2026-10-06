// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirebaseError } from 'firebase/app';

vi.mock('../../services/firebaseConfig', () => ({ app: {}, auth: {}, db: {}, appCheck: null }));
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
}));

import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { AuthView } from '../AuthView';
import { LanguageProvider } from '../../i18n/LanguageContext';

const signIn = vi.mocked(signInWithEmailAndPassword);
const signUp = vi.mocked(createUserWithEmailAndPassword);

function renderAuth(lang: 'en' | 'ru' | 'uz') {
  localStorage.setItem('myfinance_lang', lang);
  const utils = render(
    <LanguageProvider>
      <AuthView />
    </LanguageProvider>
  );
  return { ...utils, user: userEvent.setup() };
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  await user.type(screen.getByPlaceholderText('you@example.com'), 'me@example.com');
  await user.type(screen.getByPlaceholderText('••••••••'), 'secret1');
  await user.click(container.querySelector('button[type="submit"]') as HTMLElement);
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  signIn.mockReset();
  signUp.mockReset();
});

describe('Sign in / sign up errors', () => {
  it('a wrong password is explained in Russian, not as "Firebase: Error (auth/invalid-credential)"', async () => {
    signIn.mockRejectedValueOnce(new FirebaseError('auth/invalid-credential', 'Firebase: Error (auth/invalid-credential).'));
    const { user, container } = renderAuth('ru');
    await submitCredentials(user, container);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Неверный email или пароль.');
    expect(container.textContent).not.toMatch(/Firebase|auth\//);
    // a failed attempt must leave the form usable (the button is not stuck in its "loading" state)
    await waitFor(() => expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false));
  });

  it('the message follows the language switcher while it is on screen', async () => {
    signIn.mockRejectedValueOnce(new FirebaseError('auth/invalid-credential', 'Firebase: Error (auth/invalid-credential).'));
    const { user, container } = renderAuth('ru');
    await submitCredentials(user, container);
    expect((await screen.findByRole('alert')).textContent).toBe('Неверный email или пароль.');

    await user.click(screen.getByText('UZ'));
    expect(screen.getByRole('alert').textContent).toBe("Email yoki parol noto'g'ri.");
    await user.click(screen.getByText('EN'));
    expect(screen.getByRole('alert').textContent).toBe('Incorrect email or password.');
  });

  it('an email that is already registered, on the sign-up tab', async () => {
    signUp.mockRejectedValueOnce(new FirebaseError('auth/email-already-in-use', 'Firebase: Error (auth/email-already-in-use).'));
    const { user, container } = renderAuth('uz');
    await user.click(screen.getByText("Ro'yxatdan o'tish"));
    await submitCredentials(user, container);
    expect((await screen.findByRole('alert')).textContent).toBe(
      "Bu email bilan hisob allaqachon mavjud. Kirishni sinab ko'ring."
    );
  });

  it('an unrecognised failure shows the generic message in the active language (never the raw text)', async () => {
    signIn.mockRejectedValueOnce(new Error('Some internal SDK message that must not reach the screen'));
    const { user, container } = renderAuth('ru');
    await submitCredentials(user, container);
    expect((await screen.findByRole('alert')).textContent).toBe('Не удалось войти. Попробуйте ещё раз.');
    expect(container.textContent).not.toContain('internal SDK');
  });

  it('switching between Sign in and Create account clears the error', async () => {
    signIn.mockRejectedValueOnce(new FirebaseError('auth/network-request-failed', 'Firebase: Error (auth/network-request-failed).'));
    const { user, container } = renderAuth('ru');
    await submitCredentials(user, container);
    expect((await screen.findByRole('alert')).textContent).toBe('Нет связи с сервером. Проверьте интернет и повторите попытку.');

    await user.click(screen.getByText('Регистрация'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
