# MyFinance — Smart Personal Finance Manager (Firebase BaaS, Somoni / TJS)

A modular, auditable smart budgeting and sinking-fund web application built with **React + TypeScript + Tailwind CSS** and **Firebase BaaS (Firebase Auth, Cloud Firestore, Firebase App Check, and Callable Cloud Functions)**.

---

## Core Architecture & Features

### 1. 4-Stage Deterministic Allocation Engine (`src/engine/allocationEngine.ts`)
Every incoming payment runs through a pure, stateless calculation pipeline:
1. **Stage 1 — Percentage-First Allocation**:
   - Immediately deducts fixed percentage rules (e.g., `10%` Emergency Fund, `5%` Index Investment) from gross income and records each allocation.
2. **Stage 2 — Remaining Needs & Sinking Fund Math**:
   - **Fixed Monthly Envelopes (`type: 'monthly'`)**: `remainingNeed = max(0, monthlyTarget - cycleAllocated)`.
   - **Sinking Funds & Target Deadlines (`type: 'sinking' | 'target'`)**:
     $$\text{monthlyTarget} = \frac{\max(0, \text{targetAmount} - \text{priorReserved})}{\text{monthsRemaining}}$$
     $$\text{remainingNeed} = \max(0, \text{monthlyTarget} - \text{cycleAllocated})$$
   - Dynamically recalculates when months elapse or partial amounts are saved (e.g., `$600` annual bill over `6` months = `$100/mo`; if `$150` is saved after `3` months, Month 4 recalculates `$450 / 3 = $150/mo`).
3. **Stage 3 — Full Funding vs. Proportional Split on Shortfall**:
   - **Shortfall (`remainingIncome < totalRemainingNeeds`)**: Computes $\text{ratio} = \frac{\text{remainingIncome}}{\text{totalRemainingNeeds}}$ and distributes every cent using **Hamilton's Largest Remainder Method** so the sum of allocations equals the exact available income and small funds (e.g., `$30` Internet alongside `$1,000` Food) are never neglected.
   - **Full Funding (`remainingIncome >= totalRemainingNeeds`)**: Funds 100% of every remaining need.
4. **Stage 4 — Surplus Routing Rules**:
   - Any leftover cash after 100% need funding is either kept unallocated or distributed automatically across user-configured surplus targets (e.g., `50%` Emergency Reserve, `50%` Index Portfolio, or `100%` General Savings).

---

### 2. Manual Deposits to Specific Cards (`previewIncomeWithManualDeposits` in `src/engine/allocationEngine.ts`)
On **Add Income** switch *How should this income be split?* from **Auto-split** to **Manual deposit** and type an amount next to any card — for example, a `2,000 TJS` income as `1,000 TJS` → *Fuel for Car* + `1,000 TJS` → *Wife's Expense*.

- **Exactly as typed.** Manual amounts are taken from the full income; no Savings `%` is charged on them (you decided where that money goes).
- **They count.** Manual deposits are added to the card's *Monthly Deposit* (`cycleAllocated`). When the next salary is auto-split, a card that is already full gets `0 TJS`, and a partly funded card only receives what is still missing (`monthlyRequired − carryover − alreadyDeposited`). Depositing more than the monthly need is allowed (a warning is shown); the surplus carries over to next month like any unspent balance.
- **The rest is up to you.** Any part of the income you did not assign is either **auto-split** (Savings `%` of the remainder first, then cards that still need money — skipping the ones you just filled — then Working Capital) or sent straight to **Working Capital**.
- **Fully auditable & undoable.** Manual lines are stored as allocation records with `ruleStage: 'manual_deposit'`, are marked *Manual deposit* in History, and **Undo** reverses them exactly (card balance, monthly deposit, Working Capital and account balance).
- **One shared implementation.** `computeIncomeDistribution` is used by the Cloud Firestore transaction (`addIncomeToFirestore`), the in-memory test service (`FinanceBaaSService`) and the callable `addIncome` Cloud Function (`manualDeposits`, `manualRemainderMode`), so they cannot diverge.

---

### 3. Complete Auditability & Atomic Undo (`src/services/financeService.ts` & `functions/src/index.ts`)
- **Rule explanations in EN / RU / UZ**: every allocation stores the English sentence (`ruleUsed`, immutable audit text) *and* the numbers behind it (`ruleDetails`: percentage, base amount, the card's required / carried-over / collected figures). `describeAllocationRule` (`src/i18n/ruleText.ts`) rebuilds the sentence in the active language; with English it reproduces the stored text exactly (enforced by a test), and older records without `ruleDetails` get a shorter translated sentence.
- **Audit Trail in EN / RU / UZ**: each log entry keeps the English sentence (`summary`) *and* the structured facts (`details`: amounts, income source, card / expense names, counts). `describeAuditLog` (`src/i18n/auditText.ts`) rebuilds the sentence in the active language and the event badge shows a translated name instead of a code such as `INCOME_ADDED`. With English it reproduces the stored `summary` exactly for everything the app writes (enforced by a test that runs the real writers); Cloud Function entries use the same shape, and older entries take names from their stored sentence. Only an event with no template falls back to the stored English text.
- **Errors in EN / RU / UZ**: the engine and services raise `AppError` (a `code`, the numbers/names the message needs, and the English `message` for logs). `describeError` (`src/i18n/errorText.ts`) words it in the active language and turns Firebase Auth / Firestore codes (wrong password, offline, permission denied, …) into plain messages; raw library text such as `Firebase: Error (auth/…)` is never shown. To add an error: add a code to `AppErrorCode`, a message to the three dictionaries and a line to `APP_ERROR_KEYS` (the build fails until you do).
- **Failed one-click actions are never silent**: Undo, deleting a card and starting a new month show a dismissible red notice (in the active language, re-worded live if you switch language) when they fail. A double click on the same button is ignored while the first call is still running. A card that still holds money cannot be deleted, and the notice says how much it holds.
- **Default labels**: when a card category or expense category is left empty the app stores one canonical English default (`src/engine/canonicalLabels.ts`: "Spending Account", "Working Capital", …) and `displayLabel` (`src/i18n/labels.ts`) shows it translated, so existing records are translated too and a language switch re-words them. Text the user typed is never altered.
- **Live Income Entry Preview**: Before committing an income transaction, the UI displays the exact algorithmic trace and allows manual adjustments.
- **Expandable Transaction Ledger**: Every income transaction links to its `/users/{userId}/allocations/{allocId}` records showing the exact rule and funding ratio used.
- **One-Click Atomic Undo (Soft-Delete Rollback)**:
  - Undoing an income marks the income and its allocation records as `undone`, subtracts the allocated amounts from each fund's `reservedAmount` and `cycleAllocated`, reverses the account deposit, and writes an immutable `INCOME_UNDONE` entry to `/users/{userId}/auditLogs`.
  - Undoing an expense restores the deducted balance to the linked fund and account and logs `EXPENSE_UNDONE`.

---

### 4. Firebase BaaS Data Hierarchy & Security Rules (`firestore.rules`)
All user data is isolated under `/users/{userId}` with default **deny-all** locked mode at the root:
- `/users/{userId}/accounts/{accountId}` — Physical checking, savings, and investment accounts.
- `/users/{userId}/funds/{fundId}` — Percentage rules, fixed monthly budgets, sinking funds, and target savings goals.
- `/users/{userId}/incomes/{incomeId}` — Income transactions (schema-validated for `amount > 0`, valid ISO date, and soft-delete status transitions).
- `/users/{userId}/expenses/{expenseId}` — Expense transactions linked to funds and accounts.
- `/users/{userId}/allocations/{allocationId}` — Individual fund allocation records per income transaction.
- `/users/{userId}/auditLogs/{logId}` — Append-only chronological CFO audit trail (`allow update, delete: if false;`).
- `/users/{userId}/settings/default` — Singleton surplus / Working Capital configuration. The owner can read it; a write must carry a valid `surplusStrategy`.

Beyond "only the owner", the rules enforce:
- amounts are numbers (`> 0` for incomes and expenses, `>= 0` for card balances), dates are ISO strings, and incomes, expenses and allocations can only move from `active` to `undone` (an amount can never be edited);
- text limits: card name ≤ 100 characters, income source ≤ 120, expense category ≤ 80. The screens use the same numbers as `maxLength` (`src/types/limits.ts`), and a test compares them with this file;
- **a card can be deleted only when its balance is 0** (otherwise its money would vanish from the books);
- the audit trail is append-only.

**Checked against the real rules.** `npm run test:rules` runs the app's real writers and live listeners against the Cloud Firestore emulator with this exact file (see *Running & Testing*). It found and fixed a rule that denied *every read* of the settings document (`request.resource` exists only on writes), which broke the live listener, Add Income, Working Capital spending and the month rollover. **If you deployed an earlier copy of `firestore.rules`, deploy this one** (`firebase deploy --only firestore:rules`); a project keeps running the rules it was last given.

---

## Running & Testing

```bash
# Run the Vitest suite: allocation engine, manual deposits, the real Firestore writers (against a strict in-memory
# Firestore), screens in EN/RU/UZ, and guards that fail on hard-coded UI text or dictionary typos
npm test

# Run the app's real writers against the Cloud Firestore emulator, which enforces firestore.rules.
# Starts and stops the emulator itself; needs Java 21+ (and downloads firebase-tools on first use).
npm run test:rules

# Start the development server
npm run dev

# Build for production
npm run build
```

### Testing notes
- `src/test-utils/fakeFirestore.ts` is a strict in-memory stand-in for `firebase/firestore`. It lets tests run the **real** writers (`addIncomeToFirestore`, `undoIncomeInFirestore`, `addExpenseToFirestore`, …) and it enforces what the real SDK enforces: every read in a transaction before the first write, no `undefined` field values, all-or-nothing commits. It is not a substitute for trying the app against the live project.
- `src/i18n/__tests__/noHardcodedUiText.test.ts` parses every screen and fails (with file and line) if a sentence, label, placeholder or message is written into the code instead of the dictionary.
- `src/i18n/__tests__/dictionaryHygiene.test.ts` fails on mixed Latin/Cyrillic words, Cyrillic in the Uzbek text, English left in the Russian text, and Russian/Uzbek values that are copies of the English.
- `src/services/__tests__/securityRules.emulator.test.ts` is the test that proves the app and `firestore.rules` agree: every action the app performs (sign-in listeners, cards, manual and automatic incomes, expenses, Working Capital, Undo, month rollover, deleting a card) is accepted by the real rules, and negative controls prove the rules still refuse other people's data, over-long text, bad amounts, history edits and deleting a funded card. The in-memory stand-in above has no rules, so it cannot catch this class of mistake. It is skipped in a plain `npm test`.
- `src/engine/__tests__/specScenarios.test.ts` holds the worked examples from the product brief with their exact figures (3,000 TJS → Savings 300 and an equal 54 % of each need; a card already collected for the month is charged 0; 350 TJS carried over means only 650 TJS is topped up) as executable checks. They replace the old on-screen demo, whose expected figures were never compared with the engine.
