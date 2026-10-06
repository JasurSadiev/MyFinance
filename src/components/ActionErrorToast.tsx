import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useLanguage, type TranslationKey } from '../i18n/LanguageContext';
import { describeError } from '../i18n/errorText';

interface ActionErrorToastProps {
  /** Whatever was thrown. It is worded here, at render time, so the notice follows the language switcher. */
  error: unknown;
  /** The sentence to show when the error is not one the app knows how to explain. */
  fallbackKey: TranslationKey;
  onDismiss: () => void;
}

/**
 * The notice shown when a one-click action (Undo, delete a card, start a new month) fails.
 * Without it those failures would be silent: the button would just appear to do nothing.
 */
export const ActionErrorToast: React.FC<ActionErrorToastProps> = ({ error, fallbackKey, onDismiss }) => {
  const { t } = useLanguage();

  return (
    <div
      role="alert"
      className="pointer-events-auto flex w-full items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 shadow-2xl"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
      <span className="min-w-0 flex-1 break-words">{describeError(error, t, fallbackKey)}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('common_dismiss')}
        className="-mr-1 -mt-0.5 shrink-0 rounded-lg p-1 text-rose-400 transition hover:bg-rose-100 hover:text-rose-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
