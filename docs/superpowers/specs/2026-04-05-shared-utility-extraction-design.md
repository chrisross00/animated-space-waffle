# Shared Utility Extraction — Design Spec

**Date:** 2026-04-05
**Goal:** Eliminate duplicated logic across the codebase by extracting shared utilities. Five refactors executed in ascending risk order. All are pure extractions — no behavior changes.

---

## 1. Category Type Constants

**Risk:** Low — string replacement only
**Files touched:** ~7 frontend files, 2 backend files

### Problem
`'income'`, `'expense'`, `'payment'`, `'savings'` are hardcoded as string literals in 20+ locations across 7+ files. A typo or a future type rename requires grepping everywhere.

### Solution
New file: `shared/categoryTypes.js` (importable from both frontend and backend).

```js
export const CATEGORY_TYPES = {
  INCOME: 'income',
  EXPENSE: 'expense',
  PAYMENT: 'payment',
  SAVINGS: 'savings',
};
```

Replace all `'income'` / `'expense'` / `'payment'` / `'savings'` type checks with `CATEGORY_TYPES.INCOME` etc. The `type` column values in the DB stay as strings — constants are only for code references.

### Placement
`shared/` directory at repo root, since both frontend (`frontend/src/`) and backend (`utils/`, `api.js`) need it. Frontend imports via Vite alias or relative path. Backend imports directly.

### What NOT to change
- DB column values (stay as strings)
- Category `name` fields (e.g., `'Income'`, `'To Sort'` — these are user-facing labels, not type enums)
- Seed data in `defaultCategories.js` — values stay as strings since they're written to the DB

---

## 2. Dollar Formatting + Display Convention

**Risk:** Low — visual output only
**Files touched:** BudgetView.vue, BudgetPlannerView.vue, TransactionDrillDown.vue, AccountsView.vue, TagsView.vue, OnboardingView.vue

### Problem
Four different display patterns exist with no shared convention:

| Pattern | Example | Where |
|---|---|---|
| Neutral | `$1,234` | Hero stats, category sums, most places |
| Signed + colored | `+$1,234` green / `−$1,234` red | BudgetView net, BudgetPlannerView net |
| Amount-colored (no sign) | `$1,234` in green or red | TagsView, AccountsView balances |
| Trend delta | `+$500` / `-$500` | TransactionDrillDown trend |

Each does formatting inline: `Math.round(x).toLocaleString()`, custom `formatDollar()` method in BudgetView, manual `Math.abs` + sign prefix. No shared utility.

### Solution
New file: `frontend/src/utils/formatDollar.js`

```js
/**
 * Format a number as a dollar display string (no $ prefix — caller adds it in template).
 * @param {number} amount
 * @param {number} decimals — 0 for integer, 2 for cents
 * @returns {string} e.g. "1,234" or "1,234.56"
 */
export function formatDollar(amount, decimals = 0) {
  return Math.abs(Number(amount)).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a signed dollar amount with sign prefix and color class.
 * For displaying net position, cash flow, deltas, etc.
 * @param {number} amount — positive = good (green), negative = bad (red)
 * @returns {{ text: string, colorClass: string }}
 *   text: "+$1,234" or "−$1,234"
 *   colorClass: 'basil-positive' or 'basil-negative'
 */
export function formatSignedDollar(amount, decimals = 0) {
  const formatted = formatDollar(amount, decimals);
  const positive = amount >= 0;
  return {
    text: `${positive ? '+' : '−'}$${formatted}`,
    colorClass: positive ? 'basil-positive' : 'basil-negative',
  };
}
```

Replace BudgetView's local `formatDollar` method with the shared import. Replace inline `{{ netPositive ? '+' : '−' }}${{ Math.round(Math.abs(x)).toLocaleString() }}` patterns with `formatSignedDollar`. Neutral dollar displays use `formatDollar`.

### New: Triage flow signed amounts
The triage card currently shows all amounts as neutral black `$50`. For P2P transactions especially (Venmo, Zelle), every card looks identical — the user can't tell money-in from money-out at a glance. As part of this refactor, triage cards should adopt `formatSignedDollar` for the transaction amount: green `+$50` for credits (negative Plaid amount = money in), red `$50` for debits (positive Plaid amount = money out). This is the one intentional behavior change in this refactor.

### What NOT to change
- Chart tooltip formatters (ECharts handles its own formatting)
- Backend responses (amounts are numbers, formatting is frontend-only)
- Color decisions outside triage — existing views already have the right sign/color convention, we're just consolidating the implementation

---

## 3. Transaction Date Helper

**Risk:** Medium — touches 30+ call sites across 6 files
**Files touched:** BudgetView.vue, TrendsView.vue, TransactionDrillDown.vue, AccountsView.vue, App.vue, store.js

### Problem
`txn.effectiveDate || txn.date` appears 30+ times with three different comparison approaches:
- `dayjs(txn.effectiveDate || txn.date).year() === sel.year() && .month() === sel.month()`
- `dayjs(txn.effectiveDate || txn.date).format('MMM YYYY') === m`
- `(txn.effectiveDate || txn.date)?.substring(0, 7) === month`

The effective-date-or-date fallback is the core pattern that should be extracted.

### Solution
New file: `frontend/src/utils/transactionDate.js`

```js
import dayjs from 'dayjs';

/** Canonical transaction date — effective_date if set, otherwise date. */
export function txnDate(txn) {
  return txn.effectiveDate || txn.date;
}

/** Dayjs instance for the canonical transaction date. */
export function txnDayjs(txn) {
  return dayjs(txn.effectiveDate || txn.date);
}

/** Is the transaction in the given month? (dayjs month object) */
export function isInMonth(txn, month) {
  const d = dayjs(txn.effectiveDate || txn.date);
  return d.year() === month.year() && d.month() === month.month();
}

/** Transaction's month key as YYYY-MM string. */
export function txnMonth(txn) {
  return (txn.effectiveDate || txn.date)?.substring(0, 7);
}
```

Replace inline patterns with the appropriate helper. The three comparison approaches map to:
- `isInMonth(txn, sel)` for dayjs month comparisons
- `txnDayjs(txn).format('MMM YYYY')` for formatted string comparisons
- `txnMonth(txn)` for YYYY-MM substring comparisons

### Migration approach
Mechanical find-and-replace, file by file. Run tests after each file.

### What NOT to change
- Backend SQL queries (they use `effective_date` / `date` columns directly)
- `budgetMath.js` — already uses the pattern internally but is self-contained

---

## 4. P2P Detection

**Risk:** Medium-high — 4 copies with subtle signature differences
**Files touched:** frontend `ruleUtils.js`, frontend `relationshipDetector.js`, backend `categoryMapping.js`, script `similarity-analysis.js`, both test files

### Problem
Four copies of the same P2P regex list and detection function:
1. `ruleUtils.js` — `isP2P(txn)` checks `merchant_name` + `name`
2. `relationshipDetector.js` — `isP2PTransaction(txn)` checks `account` + `merchant_name` + `name`
3. `categoryMapping.js` (backend) — `isP2PTransaction(txn)` checks `account` + `merchant_name` + `name`
4. `similarity-analysis.js` (script) — `isP2P(txn)` checks `merchant_name` + `name`

Two different function signatures: `isP2P` (2 fields) vs `isP2PTransaction` (3 fields including `account`).

### Solution
Single canonical source: `shared/p2pDetection.js`

```js
export const P2P_PATTERNS = [
  /venmo/i, /zelle/i, /cash app/i, /cashapp/i, /paypal/i, /apple cash/i,
];

/**
 * Is this a P2P transaction (Venmo, Zelle, Cash App, PayPal, Apple Cash)?
 * Checks account, merchant_name, and name fields.
 */
export function isP2PTransaction(txn) {
  const sources = [txn.account, txn.merchant_name, txn.name].filter(Boolean);
  return sources.some(s => P2P_PATTERNS.some(p => p.test(s)));
}
```

The canonical version checks all 3 fields (the more thorough approach). `ruleUtils.js` currently only checks 2 fields — upgrading to 3 is safe because `account` values are institution names (e.g., "Chase"), not P2P names, so the extra check won't produce false positives.

### Migration
- `ruleUtils.js`: replace local `P2P_PATTERNS` + `isP2P` with import, re-export as `isP2P` alias for backwards compatibility with existing consumers
- `relationshipDetector.js`: replace local copy with import
- `categoryMapping.js`: replace local copy with import
- `similarity-analysis.js`: replace local copy with import
- Update both test files to test the canonical source

### What NOT to change
- `venmoEnrichment.js` — only checks for Venmo specifically (not all P2P), which is correct for its purpose (Venmo CSV import)

---

---

## Shared directory structure

```
shared/
  categoryTypes.js      — #1 (CJS)
  p2pDetection.js       — #4 (CJS)
frontend/src/utils/
  formatDollar.js       — #2 (ESM)
  transactionDate.js    — #3 (ESM)
  budgetMath.js         — (already exists, ESM)
```

Frontend-only utilities go in `frontend/src/utils/` as ESM. Code shared between frontend and backend goes in `shared/` at repo root as **CommonJS** (`module.exports`), since the backend uses `require()`. Vite handles CJS → ESM interop automatically, so the frontend imports them with normal `import` syntax. No Vite config changes needed.

---

## Execution order

1. Category type constants — simplest, string replacement
2. Dollar formatting + display convention — visual only, low risk
3. Transaction date helper — mechanical extraction, medium file count
4. P2P detection — consolidation with signature alignment

Each refactor is one commit. Run all tests after each. No behavior changes — if any test fails, something was extracted incorrectly.
