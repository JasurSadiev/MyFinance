import React from 'react';
import type { TranslationKey } from '../i18n/LanguageContext';
import { ActionErrorToast } from './ActionErrorToast';

interface NoticeStackProps {
  /** The short confirmation ("✓", an amount, a card name), or null. */
  toast: string | null;
  /** A failed one-click action, or null. */
  actionError: { error: unknown; fallbackKey: TranslationKey } | null;
  onDismissError: () => void;
}

/**
 * The corner of the screen where short notices appear: a failure (red, with a dismiss button) above the usual
 * dark confirmation. The stack never blocks clicks on the page behind it and never grows wider than the screen.
 */
export const NoticeStack: React.FC<NoticeStackProps> = ({ toast, actionError, onDismissError }) => (
  <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[calc(100vw-2.5rem)] max-w-sm flex-col items-end gap-2">
    {actionError && (
      <ActionErrorToast error={actionError.error} fallbackKey={actionError.fallbackKey} onDismiss={onDismissError} />
    )}
    {toast && (
      <div className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-2xl">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#00E56B] animate-ping" />
        <span className="min-w-0 break-words">{toast}</span>
      </div>
    )}
  </div>
);
