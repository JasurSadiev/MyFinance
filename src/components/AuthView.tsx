import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import {
  Mail,
  KeyRound,
  User,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Wallet,
} from 'lucide-react';
import { LanguageSwitcher, useLanguage } from '../i18n/LanguageContext';
import { describeError } from '../i18n/errorText';

export const AuthView: React.FC = () => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  // The raw error, not a sentence: it is worded at render time so it follows the language switcher.
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailure(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err: unknown) {
      console.error('[MyFinance] authentication failed', err);
      setFailure({ error: err });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#F4F6F9] px-4 py-12 text-slate-900">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>

        {/* Brand Header */}
        <div className="text-center space-y-2.5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#00C85E] to-[#009947] shadow-xl shadow-[#00B956]/25">
            <Wallet className="h-7 w-7 text-white stroke-[2.2]" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            My<span className="text-[#00B956]">Finance</span>
          </h1>
          <p className="text-xs font-medium text-slate-500">
            {t('auth_subtitle')}
          </p>
        </div>

        {/* Elevated White Fintech Card */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-7 shadow-[0_12px_40px_-8px_rgba(15,23,42,0.07)]">
          {/* Segmented Switcher */}
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1.5">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setFailure(null);
              }}
              className={`rounded-xl py-2.5 text-xs font-bold transition ${
                mode === 'signin'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t('auth_sign_in_tab')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setFailure(null);
              }}
              className={`rounded-xl py-2.5 text-xs font-bold transition ${
                mode === 'signup'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t('auth_create_account_tab')}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {t('auth_full_name')}
                </label>
                <div className="relative mt-1.5">
                  <User className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t('auth_full_name_placeholder')}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#00B956] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#00B956]/10 transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                {t('auth_email')}
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth_email_placeholder')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#00B956] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#00B956]/10 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                {t('auth_password')}
              </label>
              <div className="relative mt-1.5">
                <KeyRound className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#00B956] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#00B956]/10 transition"
                />
              </div>
            </div>

            {failure && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                <span>{describeError(failure.error, t, 'err_auth_failed')}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#00B956] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[#00B956]/25 hover:bg-[#00A34B] disabled:opacity-50 transition"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>
                    {mode === 'signin' ? t('auth_sign_in_btn') : t('auth_create_btn')}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
