import React, { createContext, useContext, useState, useEffect } from 'react';
import { Globe } from 'lucide-react';

export type Language = 'en' | 'ru' | 'uz';

export const LANGUAGE_LABELS: Record<Language, { short: string; name: string }> = {
  en: { short: 'EN', name: 'English' },
  ru: { short: 'RU', name: 'Русский' },
  uz: { short: 'UZ', name: "O'zbekcha" },
};

export const translations = {
  en: {
    // Navbar
    nav_overview: 'Overview',
    nav_cards: 'My Cards',
    nav_income: 'Add Income',
    nav_expenses: 'Pay / Spend',
    nav_history: 'History',
    nav_sign_out: 'Sign Out',
    nav_add_income_short: '+ Income',

    // AuthView
    auth_subtitle: 'Smart Account Cards & Monthly Budgeting in Somoni (TJS)',
    auth_sign_in_tab: 'Sign In',
    auth_create_account_tab: 'Create Account',
    auth_full_name: 'Full Name',
    auth_full_name_placeholder: 'Your Name',
    auth_email: 'Email Address',
    auth_email_placeholder: 'you@example.com',
    auth_password: 'Password',
    auth_sign_in_btn: 'Sign In to MyFinance',
    auth_create_btn: 'Create MyFinance Account',

    // AccountCard
    card_working_capital_badge: 'Working Capital',
    card_overflow_subtitle: 'Overflow & Operating Card',
    card_working_capital_title: 'Working Capital Account',
    card_available_balance: 'Available Balance',
    card_total_savings_balance: 'Total Savings Balance',
    card_available_card_balance: 'Available Card Balance',
    card_monthly_deposit: 'Monthly Deposit',
    card_monthly_expenses: 'Monthly Expenses',
    card_off: 'Off',
    card_wc_desc:
      'Automatically receives overflow income once Savings and all Spending Cards collect 100% of their monthly target.',
    card_spend_btn: 'Spend from Card',
    card_savings_badge: 'Savings',
    card_every_income: 'Every Income',
    card_month_cap_collected: 'Month Cap Collected',
    card_sinking_card: 'Sinking Card',
    card_spending_card: 'Spending Card',
    card_due: 'Due',
    card_charged_pct_every_income: 'Charged {pct}% from every income',
    card_goal: 'Goal',
    card_monthly_req: 'Monthly Req',
    card_carryover: 'Carryover',
    card_left_to_collect: '{amount} TJS left to collect',
    card_full_zero_next: 'Full (0 TJS on next income)',
    card_edit: 'Edit',
    card_delete: 'Delete card',
    card_spend_off_savings: 'Spend Off (Savings Only)',

    // DashboardView
    dash_billing_cycle: 'Billing Cycle',
    dash_national_currency: 'National Currency: Somoni (TJS)',
    dash_total_portfolio: 'Total Portfolio Across All Cards',
    dash_hero_desc:
      'Savings Cards deduct their required % from every income (spending disabled). Spending Cards (Fuel, Food, Wife\'s Expense) collect up to their monthly cap—once full, subsequent incomes flow to Working Capital, and unspent balances carry over to next month.',
    dash_add_income_btn: 'Add Income (TJS)',
    dash_pay_spend_btn: 'Pay / Spend',
    dash_new_card_btn: 'New Card',
    dash_new_month_btn: 'New Month Carryover',
    dash_rolling_over: 'Rolling Over…',
    dash_kpi_active_cards: 'Active Smart Cards',
    dash_kpi_cards_count: '{count} Goal Cards + Working Cap',
    dash_kpi_savings_vaults: '1. Savings Vaults',
    dash_kpi_savings_sub: 'Charged {pct}% on every income • Spend Off',
    dash_kpi_monthly_cap: '2. Monthly Spending Cap',
    dash_kpi_left: '({amount} TJS left)',
    dash_kpi_working_cap: '3. Working Capital',
    dash_kpi_working_cap_sub: 'Receives 100% overflow once cards are full',
    dash_my_smart_cards: 'My Smart Account Cards (Somoni / TJS)',
    dash_my_smart_cards_sub:
      'Each card displays its Available Balance, Monthly Deposit, and Monthly Expenses.',
    dash_create_card_btn: 'Create Card',
    dash_empty_cards:
      'You haven\'t added your custom Account Cards yet (e.g., Savings, Fuel for Car, Wife\'s Expense, Food).',
    dash_empty_cards_cta: 'Open My Cards to create your first card →',
    dash_tracker_title: 'Monthly Cap & Carryover Tracker',
    dash_tracker_sub:
      'Once a card collects 100% of its monthly target, subsequent incomes skip it for the rest of the month.',
    dash_100_collected: '100% Collected',
    dash_req_mo: 'Req/Mo',
    dash_deposited: 'Deposited',
    dash_tracker_empty:
      'Add Spending Cards (e.g. Fuel 1,000 TJS/mo) to track monthly collection caps and next-month carryover.',
    dash_recent_tx: 'Recent Transactions',
    dash_see_all: 'See All →',
    dash_cards_funded: '{count} cards',
    dash_undo: 'Undo',
    dash_card_label: 'Card',
    dash_no_tx:
      'No transactions recorded yet. Create your Account Cards and add an income in Somoni (TJS)!',

    // FundsView
    funds_edit_card: 'Edit Smart Card',
    funds_issue_card: 'Issue New Smart Card',
    funds_studio_sub:
      'Savings cards charge % on every income. Spending cards collect up to their monthly TJS cap.',
    funds_new_btn: '+ New',
    funds_templates_label: '1-Tap Somoni (TJS) Card Templates',
    funds_card_title: 'Card Title',
    funds_card_title_placeholder: "e.g., Fuel for Car, Wife's Expense, Food, Entertainment",
    funds_card_rule_type: 'Card Rule Type',
    funds_type_monthly: 'Spending Card (Monthly Cap TJS)',
    funds_type_percentage: 'Savings Vault (% Every Income, Spend OFF)',
    funds_type_sinking: 'Sinking Bill Card (Target + Due Date)',
    funds_type_target: 'Goal Card (Target + Date)',
    funds_category_tag: 'Category Tag',
    funds_savings_pct: 'Savings % (Every Income)',
    funds_savings_goal: 'Savings Goal (TJS)',
    funds_optional_goal: 'Optional goal (TJS)',
    funds_monthly_cap_label: 'Monthly Required Cap (TJS)',
    funds_sinking_target_label: 'Total Sinking Target (TJS)',
    funds_carryover_current: 'Carryover / Current (TJS)',
    funds_target_due_date: 'Target / Due Date',
    funds_card_color: 'Card Finish & Color',
    funds_saving_btn: 'Saving Card…',
    funds_save_changes_btn: 'Save Smart Card Changes',
    funds_issue_btn: 'Issue Smart Card (TJS)',
    funds_overflow_title: 'Overflow & Working Capital Rule',
    funds_overflow_sub:
      'Once all Spending Cards collect 100% of their required monthly TJS, subsequent incomes automatically route overflow here.',
    funds_wc_option_desc: 'Route 100% of leftover TJS to Working Capital Card',
    funds_custom_split: 'Custom Split',
    funds_custom_split_desc: 'Route overflow across specific cards by %',
    funds_add_overflow_target: '+ Add Overflow Target',
    funds_save_overflow_btn: 'Save Overflow Configuration',
    funds_issued_title: 'Issued Smart Cards ({count} Cards + Working Capital)',
    funds_cycle_month_sub:
      'Cycle Month: {month} • Unspent balances carry over to next month automatically.',
    funds_start_next_month: 'Start Next Month (Carry Over)',
    funds_empty_hint:
      'Select any of the 1-Tap Somoni (TJS) Card Templates on the left and click Issue Smart Card!',

    // IncomeView
    inc_title: 'Add Income (Somoni / TJS)',
    inc_subtitle: '1. Savings (%) → 2. Monthly Cap Split → 3. Working Capital',
    inc_amount_label: 'Gross Income Amount (Somoni / TJS)',
    inc_date_label: 'Payment Date',
    inc_source_label: 'Income Source / Paycheck Label',
    inc_source_placeholder: 'e.g., Salary #1, Salary #2, Client Invoice',
    inc_memo_label: 'Audit Memo (Optional)',
    inc_memo_placeholder: 'Optional note stored on the ledger',
    inc_confirm_btn: 'Confirm & Distribute ({amount} TJS)',
    inc_preview_title: 'Real-Time Smart Card Split Preview',
    inc_using_overrides: 'Using Manual Overrides',
    inc_customize_split: 'Customize Split',
    inc_trace_header: 'MyFinance Distribution Summary',
    inc_incoming_amount: 'Incoming Amount',
    inc_stage1_savings: '1. Savings Charged',
    inc_stage2_spending: '2. For Spending',
    inc_stage3_ratio: '3. Equal % Ratio',
    inc_stage4_wc: '4. Working Cap',
    inc_th_card: 'Smart Card',
    inc_th_stage: 'Stage',
    inc_th_math: 'Monthly Collection / Rule Math',
    inc_th_deposit: 'Deposit (TJS)',
    inc_total_deposited: 'Total Deposited to Savings & Spending Cards',
    inc_remaining_wc: 'Remaining → Deposited to Working Capital Card',
    inc_footer_note:
      'Once a Spending Card collects its full monthly required TJS (e.g., 1,000 TJS for Fuel across the first 2 incomes), it is skipped on the 3rd income, and any unspent balance carries over to next month.',

    // ExpensesView
    exp_title: 'Pay / Spend from Card (TJS)',
    exp_subtitle:
      'Choose a Spending Card or Working Capital (Savings cards have spending disabled)',
    exp_select_card: '1. Select Spending Card',
    exp_savings_locked: 'Savings Vaults Locked',
    exp_spent_this_mo: 'Spent this mo: {amount} TJS',
    exp_overflow_card: 'Overflow Card',
    exp_amount_label: '2. Payment Amount (Somoni / TJS)',
    exp_date_label: 'Date',
    exp_category_label: 'Category Tag',
    exp_merchant_label: 'Merchant / Description',
    exp_merchant_placeholder: 'e.g., Gazpromneft Fuel, Paykar Supermarket',
    exp_pay_btn: 'Pay from {card}',
    exp_history_title: 'Card Payment History',
    exp_history_sub:
      'Every payment shows which Smart Card funded it in Somoni (TJS) and can be reversed with 1 click.',
    exp_paid_from: 'Paid from:',
    exp_empty:
      'No card payments recorded yet. Select a Spending Card on the left to log a purchase in Somoni (TJS).',

    // AuditLedgerView
    audit_title: 'Transaction History & Activity (TJS)',
    audit_subtitle:
      'View all your income splits, card payments, and undo any recent transaction with one click.',
    audit_tab_splits: 'Card Splits',
    audit_tab_incomes: 'Incomes',
    audit_tab_trail: 'Audit Trail',
    audit_th_date: 'Date',
    audit_th_card: 'Smart Card',
    audit_th_stage: 'Stage',
    audit_th_rule: 'Rule Applied',
    audit_th_amount: 'Amount (TJS)',
    audit_th_status: 'Status',
    audit_status_rolled_back: 'ROLLED BACK',
    audit_status_committed: 'COMMITTED',
    audit_undo_splits_btn: 'Undo & Reverse Splits',
    audit_empty_splits: 'No allocation records found yet.',
    audit_empty_incomes: 'No income transactions recorded yet.',
    audit_empty_logs: 'No audit log entries recorded yet.',

    // App Toasts & Loading
    app_loading: 'Loading MyFinance…',
    app_syncing: 'Loading your cards and balances…',

    // Manual deposit (Add Income)
    inc_mode_title: 'How should this income be split?',
    inc_mode_auto: 'Auto-split',
    inc_mode_manual: 'Manual deposit',
    inc_mode_auto_hint: "Savings % first, then each card's monthly need, then Working Capital.",
    inc_mode_manual_hint:
      "Choose exactly how much goes to each card — no Savings % is taken from these amounts. They count toward each card's monthly requirement, so later auto-splits won't fill them twice.",
    man_status_progress: 'Collected {collected} / {target} TJS · needs {need}',
    man_status_full: 'Monthly need met ({collected} / {target} TJS)',
    man_status_savings: 'Auto-charged {pct}% of every income',
    man_fill_btn: 'Fill {amount}',
    man_amount_aria: 'Manual deposit amount for {card}',
    man_over_need: "{amount} TJS above this month's need",
    man_sum_income: 'Income',
    man_sum_assigned: 'Assigned manually',
    man_sum_left: 'Left to split',
    man_err_over_income: 'Manual deposits exceed the income by {amount} TJS.',
    man_err_invalid: 'Manual deposit amounts must be valid, non-negative numbers.',
    man_err_none: 'Enter an amount next to at least one card, or switch to Auto-split.',
    man_hint_enter_amount: 'Enter the income amount first, then assign it to cards.',
    man_remainder_title: 'What should happen to the remaining {amount} TJS?',
    man_remainder_auto: 'Auto-split the rest',
    man_remainder_auto_desc: 'Savings % first, then cards that still need money, then Working Capital.',
    man_remainder_wc: 'Rest to Working Capital',
    man_remainder_wc_desc: 'Keep it as flexible money — no further splitting.',
    man_pill_manual: 'Manual deposits',
    man_pill_auto: 'Auto-split rest',
    man_success: '+{amount} TJS recorded · {manual} TJS deposited manually · cards: {count}',
    man_footer_note:
      "Manual deposits count toward each card's monthly requirement. When your next salary is auto-split, cards that are already full receive 0 TJS and partly funded cards only receive what is still missing.",

    // Allocation stage labels (History & previews)
    stage_percentage: 'Savings',
    stage_need_full: '100%',
    stage_need_proportional: 'Equal %',
    stage_surplus: 'Surplus',
    stage_working_capital: 'Working Capital',
    stage_manual_override: 'Adjusted',
    stage_manual_deposit: 'Manual',
    audit_badge_manual: 'Manual deposit',

    // Errors shown to the user (see src/i18n/errorText.ts)
    err_generic: 'Something went wrong. Please try again.',
    err_network: 'No connection to the server. Check your internet and try again.',
    err_permission: 'Access denied. Please sign out, sign in again and retry.',
    err_too_many: 'Too many attempts. Please wait a little and try again.',
    err_conflict: 'The data changed while saving. Please try again.',
    err_auth_required: 'You are signed out. Please sign in again.',
    err_data_load_failed: 'Could not load your data.',
    err_auth_failed: 'Sign-in failed. Please try again.',
    err_auth_invalid_credentials: 'Incorrect email or password.',
    err_auth_invalid_email: 'Enter a valid email address.',
    err_auth_email_in_use: 'An account with this email already exists. Try signing in instead.',
    err_auth_weak_password: 'Password is too weak. Use at least 6 characters.',
    err_auth_user_disabled: 'This account has been disabled.',
    err_auth_not_enabled: 'Email sign-in is not enabled for this app.',
    err_fund_name_required: 'Enter a name for the card.',
    err_fund_percent_range: 'Savings percentage must be between 0.01 and 100.',
    err_fund_target_negative: 'The amount cannot be negative.',
    err_fund_balance_negative: 'The balance cannot be negative.',
    err_savings_total_exceeds: 'Savings percentages add up to {total}%, which is more than 100%.',
    err_fund_save_failed: 'Could not save the card.',
    err_fund_has_balance: '"{name}" still holds {amount} TJS, so the card cannot be deleted. A card can be deleted only when its balance is 0 TJS.',
    err_fund_delete_failed: 'Could not delete the card. Please try again.',
    err_undo_failed: 'Could not undo this transaction. Please try again.',
    err_rollover_failed: 'Could not start the new month. Please try again.',
    err_settings_save_failed: 'Could not save the Working Capital settings. Please try again.',
    common_dismiss: 'Dismiss',
    err_income_date: 'Enter a valid income date.',
    err_income_not_found: 'This income was not found.',
    err_income_already_undone: 'This income has already been undone.',
    err_percent_total_exceeds: 'Savings percentages add up to {total}%, which is more than 100% of the income.',
    err_alloc_exceed_income: 'The split ({total} TJS) is more than the income ({income} TJS).',
    err_manual_target_required: 'Choose a card for every manual deposit.',
    err_manual_target_not_found: 'A card chosen for a manual deposit no longer exists.',
    err_manual_amount_invalid: 'The manual deposit for "{name}" must be a number that is not negative.',
    err_manual_card_inactive: 'Cannot deposit to "{name}" because the card is inactive.',
    err_manual_exceeds_income: 'Manual deposits ({manual} TJS) are more than the income ({income} TJS).',
    err_manual_with_custom: 'Use either manual deposits or a customized split for one income, not both.',
    err_expense_amount: 'Expense amount must be a positive number (> 0.00 TJS).',
    err_expense_date: 'Enter a valid expense date.',
    err_expense_category: 'Enter a category for the expense.',
    err_expense_not_found: 'This expense was not found.',
    err_expense_already_undone: 'This expense has already been undone.',
    err_spend_from_savings: 'Spending from a Savings card is turned off.',
    err_expense_failed: 'Could not record the expense.',
    err_account_name_required: 'Enter an account name.',
    err_account_balance_invalid: 'The account balance must be a valid number.',

    // Cards / Pay screens: messages, placeholders, default labels
    funds_msg_updated: 'Updated "{name}".',
    funds_msg_issued_pct: 'Issued "{name}" ({pct}%)!',
    funds_msg_issued_amt: 'Issued "{name}" ({amount} TJS)!',
    funds_msg_wc_saved: 'Working Capital & Overflow rules saved!',
    exp_category_placeholder: 'Fuel, Food',
    unit_tjs_per_month: 'TJS/mo',
    cat_spending: 'Spending Account',
    cat_savings: 'Savings (Spend Off)',
    cat_sinking: 'Sinking Account',
    cat_account_card: 'Account Card',
    cat_general: 'General',
    cat_surplus_target: 'Surplus Target Account',
    tpl_name_savings: 'Savings Account',
    tpl_name_fuel: 'Fuel for Car',
    tpl_name_wife: "Wife's Expense",
    tpl_name_food: 'Food & Meals',
    tpl_name_fun: 'Entertainment',
    tpl_name_insurance: 'Annual Car Insurance',
    tpl_label_savings: 'Savings ({pct}%)',
    tpl_label_annual: 'Annual Bill (Sinking)',
    color_emerald: 'Emerald',
    color_amber: 'Gold Amber',
    color_rose: 'Rose Pink',
    color_cyan: 'Ocean Cyan',
    color_violet: 'Royal Violet',
    color_blue: 'Sapphire Blue',

    // Audit trail: event names and sentences (see src/i18n/auditText.ts)
    audit_act_income_added: 'Income added',
    audit_act_income_undone: 'Income undone',
    audit_act_expense_added: 'Expense added',
    audit_act_expense_undone: 'Expense undone',
    audit_act_fund_created: 'Card created',
    audit_act_fund_updated: 'Card updated',
    audit_act_fund_deleted: 'Card deleted',
    audit_act_settings_updated: 'Settings updated',
    audit_act_cycle_reset: 'New month',
    audit_act_scenario_loaded: 'Scenario loaded',
    auditlog_income_added: 'Added income {amount} TJS from "{source}"',
    auditlog_part_cards: 'cards funded: {count}',
    auditlog_part_manual: 'deposited manually: {amount} TJS',
    auditlog_part_wc: 'to Working Capital: +{amount} TJS',
    auditlog_income_undone: 'Undid income {amount} TJS ("{source}")',
    auditlog_income_undone_n: 'Undid income {amount} TJS ("{source}") — card allocations rolled back: {count}',
    auditlog_expense_added: 'Spent {amount} TJS ({category})',
    auditlog_expense_added_card: 'Spent {amount} TJS ({category}) from "{card}" card',
    auditlog_expense_undone: 'Undid expense {amount} TJS ("{description}")',
    auditlog_expense_undone_card: 'Undid expense {amount} TJS ("{description}") and restored {amount} TJS to "{card}" card',
    auditlog_fund_created: 'Created Account Card "{name}" ({detail})',
    auditlog_fund_updated: 'Updated Account Card "{name}" ({detail})',
    auditlog_fund_deleted: 'Deleted Account Card "{name}"',
    auditlog_fund_pct: 'Savings {pct}%',
    auditlog_fund_monthly: 'Monthly Required {amount} TJS',
    auditlog_fund_goal: 'Goal {amount} TJS',
    auditlog_cycle_reset: 'Rolled over to new month ({month}): carried over remaining account balances; only remaining needed amounts will be topped up',
    auditlog_settings: 'Updated surplus / Working Capital settings',

    // Rule explanations (how each deposit was calculated)
    rule_percentage: '{pct}% savings rule ({amount} TJS of {base} TJS)',
    rule_percentage_short: '{pct}% savings rule ({amount} TJS)',
    rule_need_full: '100% of remaining monthly need ({amount} TJS)',
    rule_need_proportional: '{pct}% equal-ratio split ({amount} TJS of {need} TJS remaining need)',
    rule_surplus: 'Surplus rule: {pct}% of {base} TJS surplus',
    rule_surplus_short: 'Surplus rule: {pct}% of the surplus',
    rule_override: 'User manual adjustment ({amount} TJS, auto was {auto} TJS)',
    rule_override_short: 'User manual adjustment ({amount} TJS)',
    rule_manual: 'Manual deposit chosen by you ({amount} TJS; {need} TJS was still needed this month)',
    rule_manual_short: 'Manual deposit chosen by you ({amount} TJS)',
    rule_card_monthly: 'Monthly required: {required} TJS',
    rule_card_carryover: '{carry} TJS carried over → {target} TJS top-up needed',
    rule_card_collected: 'Collected this month: {collected} TJS',
    rule_card_goal_collected:
      '{label}: {total} TJS over {months} mo = {monthly} TJS/mo ({collected} TJS collected this month)',
    rule_card_goal: '{label}: {total} TJS remaining over {months} mo ({monthly} TJS/mo)',
    rule_label_sinking: 'Sinking account',
    rule_label_target: 'Target account',

    // Add Income — messages
    inc_err_amount: 'Income amount must be a positive number (> 0.00 TJS).',
    inc_err_source: 'Please enter an income source description.',
    inc_err_adjusted_exceed: 'Adjusted allocations ({total} TJS) exceed gross income ({income} TJS).',
    inc_err_commit_failed: 'Failed to commit income.',
    inc_success_auto: '+{amount} TJS ({count} cards)',
    inc_success_auto_wc: '+{amount} TJS ({count} cards, +{wc} TJS Working Cap)',
    cur_somoni: 'Somoni',
  },

  ru: {
    // Navbar
    nav_overview: 'Обзор',
    nav_cards: 'Мои карты',
    nav_income: 'Доход',
    nav_expenses: 'Оплата / Расход',
    nav_history: 'История',
    nav_sign_out: 'Выйти',
    nav_add_income_short: '+ Доход',

    // AuthView
    auth_subtitle: 'Умные карты-счета и распределение бюджета в сомони (TJS)',
    auth_sign_in_tab: 'Вход',
    auth_create_account_tab: 'Регистрация',
    auth_full_name: 'Имя и фамилия',
    auth_full_name_placeholder: 'Ваше имя',
    auth_email: 'Электронная почта',
    auth_email_placeholder: 'you@example.com',
    auth_password: 'Пароль',
    auth_sign_in_btn: 'Войти в MyFinance',
    auth_create_btn: 'Создать аккаунт MyFinance',

    // AccountCard
    card_working_capital_badge: 'Оборотный капитал',
    card_overflow_subtitle: 'Операционная карта остатка',
    card_working_capital_title: 'Счёт оборотного капитала',
    card_available_balance: 'Доступный баланс',
    card_total_savings_balance: 'Баланс накоплений',
    card_available_card_balance: 'Доступно на карте',
    card_monthly_deposit: 'Пополнено за месяц',
    card_monthly_expenses: 'Расходы за месяц',
    card_off: 'Откл.',
    card_wc_desc:
      'Автоматически получает остаток дохода после того, как Накопления и все Расходные карты соберут 100% месячной нормы.',
    card_spend_btn: 'Оплатить с карты',
    card_savings_badge: 'Накопления',
    card_every_income: 'с каждого дохода',
    card_month_cap_collected: 'Норма месяца собрана',
    card_sinking_card: 'Целевая карта',
    card_spending_card: 'Расходная карта',
    card_due: 'Срок',
    card_charged_pct_every_income: 'Удерживается {pct}% с каждого дохода',
    card_goal: 'Цель',
    card_monthly_req: 'Норма/мес',
    card_carryover: 'Перенос',
    card_left_to_collect: 'Осталось собрать {amount} TJS',
    card_full_zero_next: 'Собрано (0 TJS со след. дохода)',
    card_edit: 'Изменить',
    card_delete: 'Удалить карту',
    card_spend_off_savings: 'Траты отключены (Копилка)',

    // DashboardView
    dash_billing_cycle: 'Расчётный месяц',
    dash_national_currency: 'Валюта: Сомони (TJS)',
    dash_total_portfolio: 'Общий баланс по всем картам',
    dash_hero_desc:
      'Накопительные карты удерживают свой % с каждого дохода (траты с них отключены). Расходные карты (Топливо, Продукты, Расходы жены) пополняются до месячного лимита — когда лимит собран, остаток идёт в Оборотный капитал, а неизрасходованный баланс переносится на следующий месяц.',
    dash_add_income_btn: 'Добавить доход (TJS)',
    dash_pay_spend_btn: 'Оплатить / Расход',
    dash_new_card_btn: 'Новая карта',
    dash_new_month_btn: 'Новый месяц (Перенос)',
    dash_rolling_over: 'Перенос…',
    dash_kpi_active_cards: 'Всего на всех картах',
    dash_kpi_cards_count: '{count} карт целей + Оборотный кап.',
    dash_kpi_savings_vaults: '1. Накопления (Копилка)',
    dash_kpi_savings_sub: '{pct}% с каждого дохода • Траты откл.',
    dash_kpi_monthly_cap: '2. Месячный план карт',
    dash_kpi_left: '(осталось {amount} TJS)',
    dash_kpi_working_cap: '3. Оборотный капитал',
    dash_kpi_working_cap_sub: 'Получает весь остаток сверх лимитов',
    dash_my_smart_cards: 'Мои умные карты-счета (Сомони / TJS)',
    dash_my_smart_cards_sub:
      'На каждой карте отображаются: Доступный баланс, Пополнено за месяц и Расходы за месяц.',
    dash_create_card_btn: 'Создать карту',
    dash_empty_cards:
      'У вас пока нет созданных карт-счетов (например: Накопления, Топливо, Расходы жены, Продукты).',
    dash_empty_cards_cta: 'Перейти в «Мои карты», чтобы выпустить первую карту →',
    dash_tracker_title: 'Лимиты месяца и перенос остатка',
    dash_tracker_sub:
      'Как только карта собирает 100% месячной нормы, следующие доходы в этом месяце её пропускают.',
    dash_100_collected: '100% собрано',
    dash_req_mo: 'Норма',
    dash_deposited: 'Внесено',
    dash_tracker_empty:
      'Добавьте расходные карты (например, Топливо 1 000 TJS/мес), чтобы отслеживать сбор лимита и перенос остатка.',
    dash_recent_tx: 'Последние операции',
    dash_see_all: 'Все →',
    dash_cards_funded: '{count} карт',
    dash_undo: 'Отменить',
    dash_card_label: 'Карта',
    dash_no_tx:
      'Операций пока нет. Создайте карты-счета и добавьте первый доход в сомони (TJS)!',

    // FundsView
    funds_edit_card: 'Редактировать карту',
    funds_issue_card: 'Выпустить умную карту',
    funds_studio_sub:
      'Накопления берут % с каждого дохода. Расходные карты собирают сумму до месячного лимита в TJS.',
    funds_new_btn: '+ Новая',
    funds_templates_label: 'Быстрые шаблоны карт (TJS)',
    funds_card_title: 'Название карты',
    funds_card_title_placeholder: 'напр., Топливо, Расходы жены, Продукты, Развлечения',
    funds_card_rule_type: 'Тип карты',
    funds_type_monthly: 'Расходная карта (Месячный лимит TJS)',
    funds_type_percentage: 'Накопительный счёт (% с каждого дохода, траты откл.)',
    funds_type_sinking: 'Целевой фонд к дате (Сумма + Срок)',
    funds_type_target: 'Финансовая цель (Сумма + Дата)',
    funds_category_tag: 'Категория',
    funds_savings_pct: '% накоплений (с каждого дохода)',
    funds_savings_goal: 'Цель накоплений (TJS)',
    funds_optional_goal: 'Необязательно (TJS)',
    funds_monthly_cap_label: 'Месячный лимит (TJS)',
    funds_sinking_target_label: 'Целевая сумма (TJS)',
    funds_carryover_current: 'Перенос / Текущий баланс (TJS)',
    funds_target_due_date: 'Дата цели / оплаты',
    funds_card_color: 'Дизайн и цвет карты',
    funds_saving_btn: 'Сохранение…',
    funds_save_changes_btn: 'Сохранить изменения карты',
    funds_issue_btn: 'Выпустить карту (TJS)',
    funds_overflow_title: 'Правило для остатка и оборотного капитала',
    funds_overflow_sub:
      'Когда все расходные карты собрали 100% месячной нормы TJS, остаток дохода направляется сюда.',
    funds_wc_option_desc: 'Направлять 100% остатка TJS на карту Оборотного капитала',
    funds_custom_split: 'Своё распределение',
    funds_custom_split_desc: 'Распределять остаток по выбранным картам в %',
    funds_add_overflow_target: '+ Добавить карту для остатка',
    funds_save_overflow_btn: 'Сохранить правило остатка',
    funds_issued_title: 'Выпущенные карты ({count} карт + Оборотный капитал)',
    funds_cycle_month_sub:
      'Месяц: {month} • Неизрасходованный остаток автоматически переносится на следующий месяц.',
    funds_start_next_month: 'Начать новый месяц (Перенос)',
    funds_empty_hint:
      'Выберите любой готовый шаблон слева (например: Топливо 1 000 TJS, Расходы жены 1 500 TJS или Накопления 10%) и нажмите «Выпустить карту»!',

    // IncomeView
    inc_title: 'Добавить доход (Сомони / TJS)',
    inc_subtitle: '1. Накопления (%) → 2. Добор месячного лимита карт → 3. Оборотный капитал',
    inc_amount_label: 'Сумма дохода (Сомони / TJS)',
    inc_date_label: 'Дата поступления',
    inc_source_label: 'Источник дохода',
    inc_source_placeholder: 'напр., Зарплата #1, Аванс, Оплата проекта',
    inc_memo_label: 'Комментарий (необязательно)',
    inc_memo_placeholder: 'Заметка к поступлению',
    inc_confirm_btn: 'Подтвердить и распределить ({amount} TJS)',
    inc_preview_title: 'Предпросмотр распределения по картам',
    inc_using_overrides: 'Ручная настройка активна',
    inc_customize_split: 'Изменить суммы вручную',
    inc_trace_header: 'Расчёт распределения MyFinance',
    inc_incoming_amount: 'Сумма дохода',
    inc_stage1_savings: '1. В накопления',
    inc_stage2_spending: '2. На расходные карты',
    inc_stage3_ratio: '3. Доля покрытия',
    inc_stage4_wc: '4. Оборотный кап.',
    inc_th_card: 'Умная карта',
    inc_th_stage: 'Этап',
    inc_th_math: 'Формула / Месячный лимит',
    inc_th_deposit: 'Пополнение (TJS)',
    inc_total_deposited: 'Итого распределено на карты накоплений и расходов',
    inc_remaining_wc: 'Остаток → Пополнение карты Оборотного капитала',
    inc_footer_note:
      'Как только расходная карта набирает месячную норму (например, 1 000 TJS на Топливо за первые 2 дохода), с 3-го дохода она не пополняется, а остаток переносится на следующий месяц.',

    // ExpensesView
    exp_title: 'Оплата / Расход с карты (TJS)',
    exp_subtitle:
      'Выберите расходную карту или Оборотный капитал (траты с накопительных счетов отключены)',
    exp_select_card: '1. Выберите карту для оплаты',
    exp_savings_locked: 'Копилки защищены от трат',
    exp_spent_this_mo: 'Потрачено за мес: {amount} TJS',
    exp_overflow_card: 'Карта остатка',
    exp_amount_label: '2. Сумма расхода (Сомони / TJS)',
    exp_date_label: 'Дата',
    exp_category_label: 'Категория',
    exp_merchant_label: 'Описание / Магазин',
    exp_merchant_placeholder: 'напр., АЗС Газпромнефть, Супермаркет Пайкар',
    exp_pay_btn: 'Оплатить с карты: {card}',
    exp_history_title: 'История оплат по картам',
    exp_history_sub:
      'Каждая покупка показывает, с какой карты она была оплачена в сомони (TJS), с возможностью отмены в 1 клик.',
    exp_paid_from: 'Оплачено с:',
    exp_empty:
      'Расходов по картам пока нет. Выберите карту слева, чтобы записать покупку в сомони (TJS).',

    // AuditLedgerView
    audit_title: 'История операций и отмена (TJS)',
    audit_subtitle:
      'Просматривайте все распределения доходов, оплаты по картам и отменяйте любую операцию одним нажатием.',
    audit_tab_splits: 'Пополнения карт',
    audit_tab_incomes: 'Доходы',
    audit_tab_trail: 'Журнал событий',
    audit_th_date: 'Дата',
    audit_th_card: 'Карта',
    audit_th_stage: 'Этап',
    audit_th_rule: 'Правило расчёта',
    audit_th_amount: 'Сумма (TJS)',
    audit_th_status: 'Статус',
    audit_status_rolled_back: 'ОТМЕНЕНО',
    audit_status_committed: 'ВЫПОЛНЕНО',
    audit_undo_splits_btn: 'Отменить доход и пополнения',
    audit_empty_splits: 'Записей о распределении пока нет.',
    audit_empty_incomes: 'Доходов пока нет.',
    audit_empty_logs: 'Событий в журнале пока нет.',

    // App Toasts & Loading
    app_loading: 'Загрузка MyFinance…',
    app_syncing: 'Загрузка ваших карт и балансов…',

    // Ручное пополнение (Добавить доход)
    inc_mode_title: 'Как распределить этот доход?',
    inc_mode_auto: 'Авто-распределение',
    inc_mode_manual: 'Ручное пополнение',
    inc_mode_auto_hint: 'Сначала накопления (%), затем месячная норма каждой карты, затем Оборотный капитал.',
    inc_mode_manual_hint:
      'Укажите, сколько именно зачислить на каждую карту — с этих сумм % накоплений не удерживается. Они засчитываются в месячную норму карты, поэтому следующие авто-распределения не пополнят её повторно.',
    man_status_progress: 'Собрано {collected} / {target} TJS · не хватает {need}',
    man_status_full: 'Месячная норма выполнена ({collected} / {target} TJS)',
    man_status_savings: 'Авто-удержание {pct}% с каждого дохода',
    man_fill_btn: 'Внести {amount}',
    man_amount_aria: 'Сумма ручного пополнения для карты {card}',
    man_over_need: 'На {amount} TJS больше нормы этого месяца',
    man_sum_income: 'Доход',
    man_sum_assigned: 'Распределено вручную',
    man_sum_left: 'Осталось распределить',
    man_err_over_income: 'Ручные суммы превышают доход на {amount} TJS.',
    man_err_invalid: 'Суммы ручного пополнения должны быть корректными неотрицательными числами.',
    man_err_none: 'Укажите сумму хотя бы для одной карты или переключитесь на Авто-распределение.',
    man_hint_enter_amount: 'Сначала введите сумму дохода, затем распределите её по картам.',
    man_remainder_title: 'Что сделать с остатком {amount} TJS?',
    man_remainder_auto: 'Распределить остаток автоматически',
    man_remainder_auto_desc: 'Сначала накопления (%), затем карты, которым ещё не хватает, затем Оборотный капитал.',
    man_remainder_wc: 'Остаток в Оборотный капитал',
    man_remainder_wc_desc: 'Оставить как свободные деньги — без дальнейшего деления.',
    man_pill_manual: 'Ручные пополнения',
    man_pill_auto: 'Авто-остаток',
    man_success: '+{amount} TJS записано · вручную зачислено {manual} TJS · карт: {count}',
    man_footer_note:
      'Ручные пополнения засчитываются в месячную норму карты. Когда следующая зарплата будет распределена автоматически, полностью собранные карты получат 0 TJS, а частично пополненные — только недостающую часть.',

    // Названия этапов распределения (История и предпросмотр)
    stage_percentage: 'Накопления',
    stage_need_full: '100%',
    stage_need_proportional: 'Равная доля',
    stage_surplus: 'Излишек',
    stage_working_capital: 'Оборотный капитал',
    stage_manual_override: 'Изменено',
    stage_manual_deposit: 'Вручную',
    audit_badge_manual: 'Ручное пополнение',

    // Errors shown to the user (see src/i18n/errorText.ts)
    err_generic: 'Что-то пошло не так. Попробуйте ещё раз.',
    err_network: 'Нет связи с сервером. Проверьте интернет и повторите попытку.',
    err_permission: 'Доступ запрещён. Выйдите из аккаунта, войдите снова и повторите.',
    err_too_many: 'Слишком много попыток. Подождите немного и повторите.',
    err_conflict: 'Данные изменились во время сохранения. Повторите попытку.',
    err_auth_required: 'Вы вышли из аккаунта. Войдите снова.',
    err_data_load_failed: 'Не удалось загрузить ваши данные.',
    err_auth_failed: 'Не удалось войти. Попробуйте ещё раз.',
    err_auth_invalid_credentials: 'Неверный email или пароль.',
    err_auth_invalid_email: 'Введите корректный адрес электронной почты.',
    err_auth_email_in_use: 'Аккаунт с таким email уже существует. Попробуйте войти.',
    err_auth_weak_password: 'Слишком простой пароль. Используйте не менее 6 символов.',
    err_auth_user_disabled: 'Этот аккаунт отключён.',
    err_auth_not_enabled: 'Вход по email для этого приложения не включён.',
    err_fund_name_required: 'Укажите название карты.',
    err_fund_percent_range: 'Процент накоплений должен быть от 0.01 до 100.',
    err_fund_target_negative: 'Сумма не может быть отрицательной.',
    err_fund_balance_negative: 'Баланс не может быть отрицательным.',
    err_savings_total_exceeds: 'Проценты накоплений в сумме составляют {total}% — это больше 100%.',
    err_fund_save_failed: 'Не удалось сохранить карту.',
    err_fund_has_balance: 'На карте «{name}» ещё {amount} TJS, поэтому её нельзя удалить. Карту можно удалить, только когда её баланс равен 0 TJS.',
    err_fund_delete_failed: 'Не удалось удалить карту. Попробуйте ещё раз.',
    err_undo_failed: 'Не удалось отменить операцию. Попробуйте ещё раз.',
    err_rollover_failed: 'Не удалось начать новый месяц. Попробуйте ещё раз.',
    err_settings_save_failed: 'Не удалось сохранить настройки оборотного капитала. Попробуйте ещё раз.',
    common_dismiss: 'Закрыть',
    err_income_date: 'Укажите корректную дату дохода.',
    err_income_not_found: 'Этот доход не найден.',
    err_income_already_undone: 'Этот доход уже отменён.',
    err_percent_total_exceeds: 'Проценты накоплений в сумме составляют {total}% — это больше 100% дохода.',
    err_alloc_exceed_income: 'Распределение ({total} TJS) больше суммы дохода ({income} TJS).',
    err_manual_target_required: 'Для каждого ручного пополнения выберите карту.',
    err_manual_target_not_found: 'Карта, выбранная для ручного пополнения, больше не существует.',
    err_manual_amount_invalid: 'Сумма ручного пополнения для «{name}» должна быть неотрицательным числом.',
    err_manual_card_inactive: 'Нельзя пополнить «{name}»: карта неактивна.',
    err_manual_exceeds_income: 'Ручные суммы ({manual} TJS) больше суммы дохода ({income} TJS).',
    err_manual_with_custom: 'Для одного дохода используйте либо ручное пополнение, либо изменённое распределение — не оба сразу.',
    err_expense_amount: 'Сумма расхода должна быть положительным числом (> 0.00 TJS).',
    err_expense_date: 'Укажите корректную дату расхода.',
    err_expense_category: 'Укажите категорию расхода.',
    err_expense_not_found: 'Этот расход не найден.',
    err_expense_already_undone: 'Этот расход уже отменён.',
    err_spend_from_savings: 'Траты с накопительной карты отключены.',
    err_expense_failed: 'Не удалось сохранить расход.',
    err_account_name_required: 'Укажите название счёта.',
    err_account_balance_invalid: 'Баланс счёта должен быть корректным числом.',

    // Cards / Pay screens: messages, placeholders, default labels
    funds_msg_updated: 'Карта «{name}» обновлена.',
    funds_msg_issued_pct: 'Карта «{name}» выпущена ({pct}%)!',
    funds_msg_issued_amt: 'Карта «{name}» выпущена ({amount} TJS)!',
    funds_msg_wc_saved: 'Правила оборотного капитала и излишка сохранены!',
    exp_category_placeholder: 'Топливо, Еда',
    unit_tjs_per_month: 'TJS/мес',
    cat_spending: 'Расходный счёт',
    cat_savings: 'Накопления (траты откл.)',
    cat_sinking: 'Целевой счёт',
    cat_account_card: 'Карта-счёт',
    cat_general: 'Общее',
    cat_surplus_target: 'Целевая карта для излишка',
    tpl_name_savings: 'Накопительный счёт',
    tpl_name_fuel: 'Топливо для авто',
    tpl_name_wife: 'Расходы жены',
    tpl_name_food: 'Питание',
    tpl_name_fun: 'Развлечения',
    tpl_name_insurance: 'Годовая страховка авто',
    tpl_label_savings: 'Накопления ({pct}%)',
    tpl_label_annual: 'Годовой платёж (цель)',
    color_emerald: 'Изумрудный',
    color_amber: 'Янтарный',
    color_rose: 'Розовый',
    color_cyan: 'Бирюзовый',
    color_violet: 'Фиолетовый',
    color_blue: 'Сапфировый',

    // Audit trail: event names and sentences (see src/i18n/auditText.ts)
    audit_act_income_added: 'Доход добавлен',
    audit_act_income_undone: 'Доход отменён',
    audit_act_expense_added: 'Расход добавлен',
    audit_act_expense_undone: 'Расход отменён',
    audit_act_fund_created: 'Карта создана',
    audit_act_fund_updated: 'Карта обновлена',
    audit_act_fund_deleted: 'Карта удалена',
    audit_act_settings_updated: 'Настройки обновлены',
    audit_act_cycle_reset: 'Новый месяц',
    audit_act_scenario_loaded: 'Сценарий загружен',
    auditlog_income_added: 'Добавлен доход {amount} TJS от «{source}»',
    auditlog_part_cards: 'пополнено карт: {count}',
    auditlog_part_manual: 'внесено вручную: {amount} TJS',
    auditlog_part_wc: 'в оборотный капитал: +{amount} TJS',
    auditlog_income_undone: 'Отменён доход {amount} TJS («{source}»)',
    auditlog_income_undone_n: 'Отменён доход {amount} TJS («{source}») — отменено пополнений карт: {count}',
    auditlog_expense_added: 'Расход {amount} TJS ({category})',
    auditlog_expense_added_card: 'Расход {amount} TJS ({category}) с карты «{card}»',
    auditlog_expense_undone: 'Отменён расход {amount} TJS («{description}»)',
    auditlog_expense_undone_card: 'Отменён расход {amount} TJS («{description}») — {amount} TJS возвращено на карту «{card}»',
    auditlog_fund_created: 'Создана карта «{name}» ({detail})',
    auditlog_fund_updated: 'Обновлена карта «{name}» ({detail})',
    auditlog_fund_deleted: 'Удалена карта «{name}»',
    auditlog_fund_pct: 'накопления {pct}%',
    auditlog_fund_monthly: 'нужно в месяц: {amount} TJS',
    auditlog_fund_goal: 'цель: {amount} TJS',
    auditlog_cycle_reset: 'Начался новый месяц ({month}): остатки на картах перенесены, пополняться будут только недостающие суммы',
    auditlog_settings: 'Обновлены настройки излишка и оборотного капитала',

    // Пояснения к правилам (как рассчитано каждое пополнение)
    rule_percentage: 'Правило накоплений {pct}% ({amount} TJS из {base} TJS)',
    rule_percentage_short: 'Правило накоплений {pct}% ({amount} TJS)',
    rule_need_full: '100% оставшейся месячной нормы ({amount} TJS)',
    rule_need_proportional: 'Равная доля {pct}% ({amount} TJS из {need} TJS оставшейся нормы)',
    rule_surplus: 'Правило излишка: {pct}% от излишка {base} TJS',
    rule_surplus_short: 'Правило излишка: {pct}% от излишка',
    rule_override: 'Ручная корректировка ({amount} TJS, авто было {auto} TJS)',
    rule_override_short: 'Ручная корректировка ({amount} TJS)',
    rule_manual: 'Ручное пополнение, выбранное вами ({amount} TJS; в этом месяце ещё требовалось {need} TJS)',
    rule_manual_short: 'Ручное пополнение, выбранное вами ({amount} TJS)',
    rule_card_monthly: 'Месячная норма: {required} TJS',
    rule_card_carryover: 'перенесено {carry} TJS → нужно пополнить на {target} TJS',
    rule_card_collected: 'Собрано в этом месяце: {collected} TJS',
    rule_card_goal_collected:
      '{label}: {total} TJS за {months} мес. = {monthly} TJS/мес. (собрано в этом месяце {collected} TJS)',
    rule_card_goal: '{label}: осталось {total} TJS на {months} мес. ({monthly} TJS/мес.)',
    rule_label_sinking: 'Целевой фонд',
    rule_label_target: 'Финансовая цель',

    // Добавить доход — сообщения
    inc_err_amount: 'Сумма дохода должна быть положительным числом (> 0.00 TJS).',
    inc_err_source: 'Укажите источник дохода.',
    inc_err_adjusted_exceed: 'Изменённые суммы ({total} TJS) превышают сумму дохода ({income} TJS).',
    inc_err_commit_failed: 'Не удалось сохранить доход.',
    inc_success_auto: '+{amount} TJS (карт: {count})',
    inc_success_auto_wc: '+{amount} TJS (карт: {count}, +{wc} TJS в оборотный капитал)',
    cur_somoni: 'Сомони',
  },

  uz: {
    // Navbar
    nav_overview: 'Asosiy',
    nav_cards: 'Kartalarim',
    nav_income: 'Daromad',
    nav_expenses: "To'lov / Xarajat",
    nav_history: 'Tarix',
    nav_sign_out: 'Chiqish',
    nav_add_income_short: '+ Daromad',

    // AuthView
    auth_subtitle: 'Aqlli hisob-kartalar va Somoniyda (TJS) oylik byudjet boshqaruvi',
    auth_sign_in_tab: 'Kirish',
    auth_create_account_tab: "Ro'yxatdan o'tish",
    auth_full_name: 'Ism va familiya',
    auth_full_name_placeholder: 'Ismingiz',
    auth_email: 'Elektron pochta',
    auth_email_placeholder: 'you@example.com',
    auth_password: 'Parol',
    auth_sign_in_btn: 'MyFinance-ga kirish',
    auth_create_btn: 'MyFinance hisobini yaratish',

    // AccountCard
    card_working_capital_badge: 'Aylanma mablag‘',
    card_overflow_subtitle: 'Ortiqcha daromad va amaliy karta',
    card_working_capital_title: 'Aylanma mablag‘ hisobi',
    card_available_balance: 'Mavjud balans',
    card_total_savings_balance: "Jami jamg'arma balansi",
    card_available_card_balance: 'Kartadagi mavjud balans',
    card_monthly_deposit: 'Oylik kirim',
    card_monthly_expenses: 'Oylik xarajat',
    card_off: "O'chiq",
    card_wc_desc:
      "Jamg'arma va barcha Xarajat kartalari oylik normasini 100% yig'ib bo'lgach, ortib qolgan daromad avtomatik ravishda shu yerga tushadi.",
    card_spend_btn: "Kartadan to'lash",
    card_savings_badge: "Jamg'arma",
    card_every_income: 'har bir daromaddan',
    card_month_cap_collected: "Oylik norma yig'ildi",
    card_sinking_card: 'Maqsadli karta',
    card_spending_card: 'Xarajat kartasi',
    card_due: 'Muddat',
    card_charged_pct_every_income: 'Har bir daromaddan {pct}% ushlab qolinadi',
    card_goal: 'Maqsad',
    card_monthly_req: 'Oylik norma',
    card_carryover: "O'tgan qoldiq",
    card_left_to_collect: "Yana {amount} TJS yig'ish kerak",
    card_full_zero_next: "To'ldi (keyingi daromaddan 0 TJS)",
    card_edit: 'Tahrirlash',
    card_delete: 'Kartani o\'chirish',
    card_spend_off_savings: "Xarajat o'chirilgan (Jamg'arma)",

    // DashboardView
    dash_billing_cycle: 'Hisob oyi',
    dash_national_currency: 'Valyuta: Somoniy (TJS)',
    dash_total_portfolio: 'Barcha kartalardagi jami balans',
    dash_hero_desc:
      "Jamg'arma kartalari har bir daromaddan o'z foizini oladi (ulardan pul sarflash o'chirilgan). Xarajat kartalari (Yoqilg'i, Oziq-ovqat, Turmush o'rtoq xarajati) oylik limitgacha to'ldiriladi — to'lgandan so'ng qolgan pul Aylanma mablag'ga o'tadi, ishlatilmagan qoldiq esa keyingi oyga o'tkaziladi.",
    dash_add_income_btn: "Daromad qo'shish (TJS)",
    dash_pay_spend_btn: "To'lov / Xarajat",
    dash_new_card_btn: 'Yangi karta',
    dash_new_month_btn: "Yangi oy (Qoldiqni o'tkazish)",
    dash_rolling_over: "O'tkazilmoqda…",
    dash_kpi_active_cards: 'Faol aqlli kartalar',
    dash_kpi_cards_count: '{count} ta karta + Aylanma mablag‘',
    dash_kpi_savings_vaults: "1. Jamg'arma hisoblari",
    dash_kpi_savings_sub: "Har daromaddan {pct}% • Xarajat o'chiq",
    dash_kpi_monthly_cap: "2. Oylik yig'im rejasi",
    dash_kpi_left: '({amount} TJS qoldi)',
    dash_kpi_working_cap: '3. Aylanma mablag‘',
    dash_kpi_working_cap_sub: "Limitdan ortgan barcha mablag' shu yerga tushadi",
    dash_my_smart_cards: 'Mening aqlli kartalarim (Somoniy / TJS)',
    dash_my_smart_cards_sub:
      'Har bir kartada Mavjud balans, Oylik kirim va Oylik xarajat ko‘rsatiladi.',
    dash_create_card_btn: 'Karta ochish',
    dash_empty_cards:
      "Siz hali shaxsiy kartalaringizni qo'shmadingiz (masalan: Jamg'arma, Avto yoqilg'i, Oila xarajati, Oziq-ovqat).",
    dash_empty_cards_cta: "Birinchi kartangizni ochish uchun «Kartalarim» bo'limiga o'ting →",
    dash_tracker_title: "Oylik limit va qoldiq ko'rsatkichlari",
    dash_tracker_sub:
      "Karta oylik normasini 100% yig'ib bo'lgach, shu oydagi keyingi daromadlardan unga pul olinmaydi.",
    dash_100_collected: "100% yig'ildi",
    dash_req_mo: 'Oylik',
    dash_deposited: 'Kirim',
    dash_tracker_empty:
      "Oylik limit va qoldiqni kuzatish uchun Xarajat kartalarini qo'shing (masalan, Yoqilg'i 1 000 TJS/oy).",
    dash_recent_tx: "So'nggi amaliyotlar",
    dash_see_all: 'Barchasi →',
    dash_cards_funded: '{count} ta karta',
    dash_undo: 'Bekor qilish',
    dash_card_label: 'Karta',
    dash_no_tx:
      "Hozircha amaliyotlar yo'q. Kartalarni yarating va Somoniyda (TJS) daromad kiriting!",

    // FundsView
    funds_edit_card: 'Kartani tahrirlash',
    funds_issue_card: 'Yangi aqlli karta ochish',
    funds_studio_sub:
      "Jamg'arma kartalari har daromaddan % oladi. Xarajat kartalari oylik TJS limitigacha yig'adi.",
    funds_new_btn: '+ Yangi',
    funds_templates_label: 'Tayyor karta shablonlari (TJS)',
    funds_card_title: 'Karta nomi',
    funds_card_title_placeholder: "masalan: Yoqilg'i, Turmush o'rtoq, Oziq-ovqat",
    funds_card_rule_type: 'Karta turi',
    funds_type_monthly: 'Xarajat kartasi (Oylik limit TJS)',
    funds_type_percentage: "Jamg'arma (% har daromaddan, xarajat o'chiq)",
    funds_type_sinking: 'Muddatli maqsad kartasi (Summa + Sana)',
    funds_type_target: 'Maqsadli jamg‘arma (Summa + Sana)',
    funds_category_tag: 'Toifa (Kategoriya)',
    funds_savings_pct: "Jamg'arma % (har daromaddan)",
    funds_savings_goal: "Jamg'arma maqsadi (TJS)",
    funds_optional_goal: 'Ixtiyoriy maqsad (TJS)',
    funds_monthly_cap_label: 'Oylik kerakli summa (TJS)',
    funds_sinking_target_label: 'Jami maqsad summasi (TJS)',
    funds_carryover_current: 'Joriy balans / Qoldiq (TJS)',
    funds_target_due_date: 'Maqsad sanasi',
    funds_card_color: 'Karta rangi',
    funds_saving_btn: 'Saqlanmoqda…',
    funds_save_changes_btn: "O'zgarishlarni saqlash",
    funds_issue_btn: 'Kartani ochish (TJS)',
    funds_overflow_title: 'Ortiqcha daromad va Aylanma mablag‘ qoidasi',
    funds_overflow_sub:
      "Barcha Xarajat kartalari oylik TJS normasini 100% yig'ib bo'lgach, ortgan pul shu qoida bo'yicha yo'naltiriladi.",
    funds_wc_option_desc: "100% ortiqcha TJSni Aylanma mablag' kartasiga o'tkazish",
    funds_custom_split: 'Maxsus taqsimot',
    funds_custom_split_desc: 'Ortiqcha summani tanlangan kartalarga % bo‘yicha bo‘lish',
    funds_add_overflow_target: "+ Karta qo'shish",
    funds_save_overflow_btn: 'Qoidani saqlash',
    funds_issued_title: 'Ochilgan kartalar ({count} ta karta + Aylanma mablag‘)',
    funds_cycle_month_sub:
      "Oy: {month} • Ishlatilmagan qoldiq keyingi oyga avtomatik o'tkaziladi.",
    funds_start_next_month: "Keyingi oyni boshlash (Qoldiqni o'tkazish)",
    funds_empty_hint:
      "Chap tomondagi tayyor shablonlardan birini tanlang (masalan: Yoqilg'i 1 000 TJS, Oziq-ovqat 2 500 TJS yoki Jamg'arma 10%) va «Kartani ochish» tugmasini bosing!",

    // IncomeView
    inc_title: "Daromad qo'shish (Somoniy / TJS)",
    inc_subtitle: "1. Jamg'arma (%) → 2. Oylik norma taqsimoti → 3. Aylanma mablag‘",
    inc_amount_label: 'Daromad summasi (Somoniy / TJS)',
    inc_date_label: 'Sana',
    inc_source_label: 'Daromad manbasi',
    inc_source_placeholder: 'masalan: Oylik #1, Oylik #2, Loyiha to‘lovi',
    inc_memo_label: 'Izoh (ixtiyoriy)',
    inc_memo_placeholder: 'Qo‘shimcha eslatma',
    inc_confirm_btn: 'Tasdiqlash va taqsimlash ({amount} TJS)',
    inc_preview_title: 'Kartalar bo‘yicha jonli taqsimot',
    inc_using_overrides: "Qo'lda o'zgartirish faol",
    inc_customize_split: "Summalarni qo'lda o'zgartirish",
    inc_trace_header: 'MyFinance taqsimot xulosasi',
    inc_incoming_amount: 'Kirim summasi',
    inc_stage1_savings: "1. Jamg'armaga",
    inc_stage2_spending: '2. Xarajat kartalariga',
    inc_stage3_ratio: '3. Qoplash ulushi',
    inc_stage4_wc: '4. Aylanma mablag‘',
    inc_th_card: 'Aqlli karta',
    inc_th_stage: 'Bosqich',
    inc_th_math: 'Oylik norma / Hisob formulasi',
    inc_th_deposit: 'Kirim (TJS)',
    inc_total_deposited: "Jamg'arma va Xarajat kartalariga jami kirim",
    inc_remaining_wc: 'Qoldiq → Aylanma mablag‘ kartasiga kirim',
    inc_footer_note:
      "Xarajat kartasi oylik normasini to'liq yig'ib bo'lgach (masalan, Yoqilg'i uchun 1 000 TJS dastlabki 2 ta daromaddan yig'ilsa), 3-daromaddan unga pul olinmaydi va ortgan qoldiq keyingi oyga o'tadi.",

    // ExpensesView
    exp_title: "Kartadan to'lov / Xarajat (TJS)",
    exp_subtitle:
      "Xarajat kartasini yoki Aylanma mablag'ni tanlang (Jamg'arma kartalaridan sarflash o'chirilgan)",
    exp_select_card: '1. Xarajat kartasini tanlang',
    exp_savings_locked: "Jamg'arma kartalari himoyalangan",
    exp_spent_this_mo: 'Shu oyda sarflandi: {amount} TJS',
    exp_overflow_card: 'Qoldiq kartasi',
    exp_amount_label: "2. To'lov summasi (Somoniy / TJS)",
    exp_date_label: 'Sana',
    exp_category_label: 'Kategoriya',
    exp_merchant_label: 'Tavsif / Xarid joyi',
    exp_merchant_placeholder: "masalan: Gazpromneft yoqilg'i, Paykar supermarketi",
    exp_pay_btn: "{card} kartasidan to'lash",
    exp_history_title: "Karta to'lovlari tarixi",
    exp_history_sub:
      "Har bir xarid qaysi kartadan Somoniyda (TJS) to'langanini ko'rsatadi va 1 bosishda bekor qilinishi mumkin.",
    exp_paid_from: "To'landi:",
    exp_empty:
      "Hozircha karta xarajatlari yo'q. Xaridni yozish uchun chap tomondan Xarajat kartasini tanlang.",

    // AuditLedgerView
    audit_title: 'Amaliyotlar tarixi va bekor qilish (TJS)',
    audit_subtitle:
      "Barcha daromad taqsimotlari va karta to'lovlarini ko'ring hamda istalgan amaliyotni 1 bosishda bekor qiling.",
    audit_tab_splits: 'Karta kirimlari',
    audit_tab_incomes: 'Daromadlar',
    audit_tab_trail: 'Tizim tarixi',
    audit_th_date: 'Sana',
    audit_th_card: 'Aqlli karta',
    audit_th_stage: 'Bosqich',
    audit_th_rule: 'Qoida',
    audit_th_amount: 'Summa (TJS)',
    audit_th_status: 'Holat',
    audit_status_rolled_back: 'BEKOR QILINGAN',
    audit_status_committed: 'BAJARILDI',
    audit_undo_splits_btn: 'Daromad va taqsimotni bekor qilish',
    audit_empty_splits: "Taqsimot yozuvlari hali yo'q.",
    audit_empty_incomes: "Daromad amaliyotlari hali yo'q.",
    audit_empty_logs: "Tarix yozuvlari hali yo'q.",

    // App Toasts & Loading
    app_loading: 'MyFinance yuklanmoqda…',
    app_syncing: 'Kartalar va balanslar yuklanmoqda…',

    // Qo'lda to'ldirish (Daromad qo'shish)
    inc_mode_title: 'Bu daromad qanday taqsimlansin?',
    inc_mode_auto: 'Avto-taqsimot',
    inc_mode_manual: "Qo'lda to'ldirish",
    inc_mode_auto_hint: "Avval jamg'arma (%), keyin har bir kartaning oylik normasi, so'ng Aylanma mablag‘.",
    inc_mode_manual_hint:
      "Har bir kartaga aniq qancha tushishini belgilang — bu summalardan jamg'arma % ushlanmaydi. Ular kartaning oylik normasiga qo'shiladi, shuning uchun keyingi avto-taqsimotlar uni qayta to'ldirmaydi.",
    man_status_progress: "Yig'ildi {collected} / {target} TJS · yana {need} kerak",
    man_status_full: 'Oylik norma bajarildi ({collected} / {target} TJS)',
    man_status_savings: 'Har bir daromaddan {pct}% avtomatik ushlanadi',
    man_fill_btn: '{amount} kiritish',
    man_amount_aria: "{card} kartasi uchun qo'lda kiritiladigan summa",
    man_over_need: "Bu oylik normadan {amount} TJS ko'p",
    man_sum_income: 'Daromad',
    man_sum_assigned: "Qo'lda taqsimlangan",
    man_sum_left: 'Taqsimlash uchun qolgan',
    man_err_over_income: "Qo'lda kiritilgan summalar daromaddan {amount} TJS ko'p.",
    man_err_invalid: "Qo'lda kiritiladigan summalar to'g'ri va manfiy bo'lmagan sonlar bo'lishi kerak.",
    man_err_none: 'Kamida bitta karta uchun summa kiriting yoki Avto-taqsimotga qayting.',
    man_hint_enter_amount: 'Avval daromad summasini kiriting, keyin uni kartalarga taqsimlang.',
    man_remainder_title: 'Qolgan {amount} TJS nima qilinsin?',
    man_remainder_auto: 'Qolganini avtomatik taqsimlash',
    man_remainder_auto_desc: "Avval jamg'arma (%), keyin hali pul yetmayotgan kartalar, so'ng Aylanma mablag‘.",
    man_remainder_wc: 'Qolganini Aylanma mablag‘ga',
    man_remainder_wc_desc: 'Erkin pul sifatida qoldirish — boshqa taqsimlanmaydi.',
    man_pill_manual: "Qo'lda to'ldirilgan",
    man_pill_auto: 'Avto-qoldiq',
    man_success: "+{amount} TJS yozildi · qo'lda {manual} TJS o'tkazildi · kartalar: {count}",
    man_footer_note:
      "Qo'lda to'ldirilgan summalar kartaning oylik normasiga qo'shiladi. Keyingi oylik avtomatik taqsimlanganda to'liq yig'ilgan kartalar 0 TJS oladi, qisman to'ldirilganlar esa faqat yetishmayotgan qismni oladi.",

    // Taqsimot bosqichlari nomlari (Tarix va ko'rib chiqish)
    stage_percentage: "Jamg'arma",
    stage_need_full: '100%',
    stage_need_proportional: 'Teng ulush',
    stage_surplus: 'Ortiqcha',
    stage_working_capital: 'Aylanma mablag‘',
    stage_manual_override: "O'zgartirilgan",
    stage_manual_deposit: "Qo'lda",
    audit_badge_manual: "Qo'lda to'ldirish",

    // Errors shown to the user (see src/i18n/errorText.ts)
    err_generic: "Nimadir xato ketdi. Qaytadan urinib ko'ring.",
    err_network: "Serverga ulanib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.",
    err_permission: "Ruxsat berilmadi. Hisobdan chiqib, qayta kiring va yana urinib ko'ring.",
    err_too_many: "Juda ko'p urinish bo'ldi. Biroz kutib, qayta urinib ko'ring.",
    err_conflict: "Saqlash vaqtida ma'lumotlar o'zgardi. Qayta urinib ko'ring.",
    err_auth_required: 'Siz hisobdan chiqqansiz. Qayta kiring.',
    err_data_load_failed: "Ma'lumotlaringizni yuklab bo'lmadi.",
    err_auth_failed: "Kirib bo'lmadi. Qaytadan urinib ko'ring.",
    err_auth_invalid_credentials: "Email yoki parol noto'g'ri.",
    err_auth_invalid_email: "To'g'ri email manzilini kiriting.",
    err_auth_email_in_use: "Bu email bilan hisob allaqachon mavjud. Kirishni sinab ko'ring.",
    err_auth_weak_password: 'Parol juda oddiy. Kamida 6 ta belgidan foydalaning.',
    err_auth_user_disabled: "Bu hisob o'chirib qo'yilgan.",
    err_auth_not_enabled: 'Bu ilova uchun email orqali kirish yoqilmagan.',
    err_fund_name_required: 'Karta nomini kiriting.',
    err_fund_percent_range: "Jamg'arma foizi 0.01 dan 100 gacha bo'lishi kerak.",
    err_fund_target_negative: "Summa manfiy bo'lishi mumkin emas.",
    err_fund_balance_negative: "Qoldiq manfiy bo'lishi mumkin emas.",
    err_savings_total_exceeds: "Jamg'arma foizlari yig'indisi {total}% — bu 100% dan ko'p.",
    err_fund_save_failed: "Kartani saqlab bo'lmadi.",
    err_fund_has_balance: '"{name}" kartasida hali {amount} TJS bor, shuning uchun kartani o\'chirib bo\'lmaydi. Kartani faqat balansi 0 TJS bo\'lganda o\'chirish mumkin.',
    err_fund_delete_failed: 'Kartani o\'chirib bo\'lmadi. Qaytadan urinib ko\'ring.',
    err_undo_failed: 'Amalni bekor qilib bo\'lmadi. Qaytadan urinib ko\'ring.',
    err_rollover_failed: 'Yangi oyni boshlab bo\'lmadi. Qaytadan urinib ko\'ring.',
    err_settings_save_failed: 'Aylanma mablag‘ sozlamalarini saqlab bo\'lmadi. Qaytadan urinib ko\'ring.',
    common_dismiss: 'Yopish',
    err_income_date: "Daromad sanasini to'g'ri kiriting.",
    err_income_not_found: 'Bu daromad topilmadi.',
    err_income_already_undone: 'Bu daromad allaqachon bekor qilingan.',
    err_percent_total_exceeds: "Jamg'arma foizlari yig'indisi {total}% — bu daromadning 100% idan ko'p.",
    err_alloc_exceed_income: "Taqsimot ({total} TJS) daromaddan ({income} TJS) ko'p.",
    err_manual_target_required: "Har bir qo'lda to'ldirish uchun karta tanlang.",
    err_manual_target_not_found: "Qo'lda to'ldirish uchun tanlangan karta endi mavjud emas.",
    err_manual_amount_invalid: "\"{name}\" uchun qo'lda kiritilgan summa manfiy bo'lmagan son bo'lishi kerak.",
    err_manual_card_inactive: "\"{name}\" kartasini to'ldirib bo'lmaydi: karta faol emas.",
    err_manual_exceeds_income: "Qo'lda kiritilgan summalar ({manual} TJS) daromaddan ({income} TJS) ko'p.",
    err_manual_with_custom: "Bitta daromad uchun yoki qo'lda to'ldirish, yoki o'zgartirilgan taqsimotdan foydalaning — ikkalasini birga emas.",
    err_expense_amount: "Xarajat summasi musbat son bo'lishi kerak (> 0.00 TJS).",
    err_expense_date: "Xarajat sanasini to'g'ri kiriting.",
    err_expense_category: 'Xarajat kategoriyasini kiriting.',
    err_expense_not_found: 'Bu xarajat topilmadi.',
    err_expense_already_undone: 'Bu xarajat allaqachon bekor qilingan.',
    err_spend_from_savings: "Jamg'arma kartasidan xarajat qilish o'chirilgan.",
    err_expense_failed: "Xarajatni saqlab bo'lmadi.",
    err_account_name_required: 'Hisob nomini kiriting.',
    err_account_balance_invalid: "Hisob qoldig'i to'g'ri son bo'lishi kerak.",

    // Cards / Pay screens: messages, placeholders, default labels
    funds_msg_updated: '"{name}" kartasi yangilandi.',
    funds_msg_issued_pct: '"{name}" kartasi ochildi ({pct}%)!',
    funds_msg_issued_amt: '"{name}" kartasi ochildi ({amount} TJS)!',
    funds_msg_wc_saved: 'Aylanma mablag‘ va ortiqcha mablag‘ qoidalari saqlandi!',
    exp_category_placeholder: "Yoqilg'i, Oziq-ovqat",
    unit_tjs_per_month: 'TJS/oy',
    cat_spending: 'Xarajat hisobi',
    cat_savings: "Jamg'arma (xarajat o'chiq)",
    cat_sinking: 'Maqsadli hisob',
    cat_account_card: 'Hisob kartasi',
    cat_general: 'Umumiy',
    cat_surplus_target: 'Ortiqcha uchun maqsadli karta',
    tpl_name_savings: "Jamg'arma hisobi",
    tpl_name_fuel: "Avto yoqilg'i",
    tpl_name_wife: "Turmush o'rtoq xarajati",
    tpl_name_food: 'Oziq-ovqat',
    tpl_name_fun: "Ko'ngilochar",
    tpl_name_insurance: "Avtomobil sug'urtasi (yillik)",
    tpl_label_savings: "Jamg'arma ({pct}%)",
    tpl_label_annual: "Yillik to'lov (maqsad)",
    color_emerald: 'Zumrad',
    color_amber: 'Oltin sariq',
    color_rose: 'Pushti',
    color_cyan: 'Firuza',
    color_violet: 'Binafsha',
    color_blue: "Safir ko'k",

    // Audit trail: event names and sentences (see src/i18n/auditText.ts)
    audit_act_income_added: "Daromad qo'shildi",
    audit_act_income_undone: 'Daromad bekor qilindi',
    audit_act_expense_added: "Xarajat qo'shildi",
    audit_act_expense_undone: 'Xarajat bekor qilindi',
    audit_act_fund_created: 'Karta yaratildi',
    audit_act_fund_updated: 'Karta yangilandi',
    audit_act_fund_deleted: "Karta o'chirildi",
    audit_act_settings_updated: 'Sozlamalar yangilandi',
    audit_act_cycle_reset: 'Yangi oy',
    audit_act_scenario_loaded: 'Stsenariy yuklandi',
    auditlog_income_added: "Daromad qo'shildi: {amount} TJS, manba: \"{source}\"",
    auditlog_part_cards: "to'ldirilgan kartalar: {count}",
    auditlog_part_manual: "qo'lda kiritilgan: {amount} TJS",
    auditlog_part_wc: 'aylanma mablag‘ga: +{amount} TJS',
    auditlog_income_undone: 'Daromad bekor qilindi: {amount} TJS ("{source}")',
    auditlog_income_undone_n: 'Daromad bekor qilindi: {amount} TJS ("{source}") — qaytarilgan karta kirimlari: {count}',
    auditlog_expense_added: 'Xarajat: {amount} TJS ({category})',
    auditlog_expense_added_card: 'Xarajat: {amount} TJS ({category}), "{card}" kartasidan',
    auditlog_expense_undone: 'Xarajat bekor qilindi: {amount} TJS ("{description}")',
    auditlog_expense_undone_card: 'Xarajat bekor qilindi: {amount} TJS ("{description}") — {amount} TJS "{card}" kartasiga qaytarildi',
    auditlog_fund_created: 'Karta yaratildi: "{name}" ({detail})',
    auditlog_fund_updated: 'Karta yangilandi: "{name}" ({detail})',
    auditlog_fund_deleted: "Karta o'chirildi: \"{name}\"",
    auditlog_fund_pct: "jamg'arma {pct}%",
    auditlog_fund_monthly: 'oyiga kerak: {amount} TJS',
    auditlog_fund_goal: 'maqsad: {amount} TJS',
    auditlog_cycle_reset: "Yangi oy boshlandi ({month}): kartalardagi qoldiqlar o'tkazildi, faqat yetishmayotgan summalar to'ldiriladi",
    auditlog_settings: 'Ortiqcha va aylanma mablag‘ sozlamalari yangilandi',

    // Qoida izohlari (har bir to'ldirish qanday hisoblangan)
    rule_percentage: "Jamg'arma qoidasi {pct}% ({base} TJS dan {amount} TJS)",
    rule_percentage_short: "Jamg'arma qoidasi {pct}% ({amount} TJS)",
    rule_need_full: "Oylik normadan qolganini to'liq to'ldirish ({amount} TJS)",
    rule_need_proportional: 'Teng ulush {pct}% ({need} TJS qolgan normadan {amount} TJS)',
    rule_surplus: 'Ortiqcha qoidasi: {base} TJS ortiqchaning {pct}%',
    rule_surplus_short: 'Ortiqcha qoidasi: ortiqchaning {pct}%',
    rule_override: "Qo'lda tuzatish ({amount} TJS, avto {auto} TJS edi)",
    rule_override_short: "Qo'lda tuzatish ({amount} TJS)",
    rule_manual: "Siz tanlagan qo'lda to'ldirish ({amount} TJS; shu oyda yana {need} TJS kerak edi)",
    rule_manual_short: "Siz tanlagan qo'lda to'ldirish ({amount} TJS)",
    rule_card_monthly: 'Oylik norma: {required} TJS',
    rule_card_carryover: "{carry} TJS o'tgan oydan qoldi → {target} TJS to'ldirish kerak",
    rule_card_collected: "Shu oyda yig'ildi: {collected} TJS",
    rule_card_goal_collected:
      "{label}: {months} oyda {total} TJS = oyiga {monthly} TJS (shu oyda {collected} TJS yig'ildi)",
    rule_card_goal: '{label}: {months} oyda {total} TJS qoldi (oyiga {monthly} TJS)',
    rule_label_sinking: 'Muddatli maqsad',
    rule_label_target: 'Maqsad',

    // Daromad qo'shish — xabarlar
    inc_err_amount: "Daromad summasi musbat son bo'lishi kerak (> 0.00 TJS).",
    inc_err_source: 'Daromad manbasini kiriting.',
    inc_err_adjusted_exceed: "O'zgartirilgan summalar ({total} TJS) daromaddan ({income} TJS) oshib ketdi.",
    inc_err_commit_failed: "Daromadni saqlab bo'lmadi.",
    inc_success_auto: '+{amount} TJS (kartalar: {count})',
    inc_success_auto_wc: '+{amount} TJS (kartalar: {count}, +{wc} TJS aylanma mablag‘ga)',
    cur_somoni: 'Somoniy',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

/**
 * Looks a key up in the given language (falling back to English, then to the key itself)
 * and fills in {placeholders}. The single implementation behind `t()`.
 */
export function translate(
  lang: Language,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const dict = translations[lang] || translations.en;
  const raw: string = dict[key] || translations.en[key] || key;
  if (!vars) return raw;
  // One pass over the template. This (unlike chained String.replace calls) fills a placeholder that appears
  // more than once, never treats `$&` / `$$` in a value (e.g. a user-typed source "Cash $$") as a special
  // replacement pattern, and never re-scans text that was just inserted.
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => translations.en[key] || key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('myfinance_lang') as Language | null;
      if (saved === 'en' || saved === 'ru' || saved === 'uz') return saved;
    } catch {
      // ignore storage errors
    }
    return 'ru'; // Default to Russian or English; user can toggle EN / RU / UZ anytime
  });

  useEffect(() => {
    try {
      localStorage.setItem('myfinance_lang', lang);
    } catch {
      // ignore
    }
  }, [lang]);

  const setLang = (next: Language) => {
    setLangState(next);
  };

  const t = (key: TranslationKey, vars?: Record<string, string | number>): string =>
    translate(lang, key, vars);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

export const LanguageSwitcher: React.FC = () => {
  const { lang, setLang } = useLanguage();
  const langs: Language[] = ['en', 'ru', 'uz'];

  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200/80 bg-slate-100/90 p-1">
      <Globe className="ml-1.5 mr-1 h-3.5 w-3.5 text-slate-400" />
      {langs.map((l) => {
        const active = lang === l;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            title={LANGUAGE_LABELS[l].name}
            className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
              active
                ? 'bg-white text-[#009947] shadow-sm ring-1 ring-slate-200/80'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {LANGUAGE_LABELS[l].short}
          </button>
        );
      })}
    </div>
  );
};
