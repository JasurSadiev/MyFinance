import React from 'react';
import {
  LayoutDashboard,
  ArrowDownLeft,
  CreditCard,
  History,
  LogOut,
  Receipt,
  Wallet,
} from 'lucide-react';
import { LanguageSwitcher, useLanguage } from '../i18n/LanguageContext';

export type NavTab =
  | 'dashboard'
  | 'income'
  | 'funds'
  | 'expenses'
  | 'audit';

interface NavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  currentUserId: string;
  currentUserEmail: string;
  currentUserName: string;
  onSignOut: () => void;
  activeUndoableCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  currentUserEmail,
  currentUserName,
  onSignOut,
  activeUndoableCount,
}) => {
  const { t } = useLanguage();

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode; badge?: number }> = [
    {
      id: 'dashboard',
      label: t('nav_overview'),
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'funds',
      label: t('nav_cards'),
      icon: <CreditCard className="w-4 h-4" />,
    },
    {
      id: 'income',
      label: t('nav_income'),
      icon: <ArrowDownLeft className="w-4 h-4" />,
    },
    {
      id: 'expenses',
      label: t('nav_expenses'),
      icon: <Receipt className="w-4 h-4" />,
    },
    {
      id: 'audit',
      label: t('nav_history'),
      icon: <History className="w-4 h-4" />,
      badge: activeUndoableCount,
    },
  ];

  const initials = (currentUserName || currentUserEmail || 'U')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-3 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          {/* Brand Logo */}
          <div className="flex items-center justify-between">
            <div
              onClick={() => onSelectTab('dashboard')}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#00C85E] to-[#009947] shadow-md shadow-[#00B956]/25 group-hover:scale-105 transition">
                <Wallet className="h-5 w-5 text-white stroke-[2.2]" />
              </div>
              <div>
                <span className="text-lg font-extrabold tracking-tight text-slate-900">
                  My<span className="text-[#00B956]">Finance</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 lg:hidden">
              <LanguageSwitcher />
              <button
                onClick={() => onSelectTab('income')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#00B956] px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-[#00B956]/25 hover:bg-[#00A34B] transition"
              >
                <ArrowDownLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                {t('nav_add_income_short')}
              </button>
              <button
                onClick={onSignOut}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Segmented Pill Navigation */}
          <nav className="flex items-center gap-1 overflow-x-auto rounded-2xl bg-slate-100/90 p-1.5 border border-slate-200/60">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                  }`}
                >
                  <span className={active ? 'text-[#00B956]' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`ml-0.5 rounded-full px-1.5 py-0.2 font-mono text-[10px] font-bold ${
                        active
                          ? 'bg-[#00B956]/15 text-[#009947]'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Language Switcher, User Profile & Sign Out */}
          <div className="hidden lg:flex items-center gap-2.5">
            <LanguageSwitcher />

            <div className="flex items-center gap-2 rounded-xl bg-slate-100/80 px-3 py-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#00B956]/15 font-mono text-[11px] font-bold text-[#009947]">
                {initials}
              </div>
              <span className="text-xs font-semibold text-slate-700 truncate max-w-[140px]">
                {currentUserName || currentUserEmail}
              </span>
            </div>

            <button
              onClick={onSignOut}
              title={t('nav_sign_out')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('nav_sign_out')}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
