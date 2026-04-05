# Shared Utility Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicated logic by extracting shared utilities for category types, dollar formatting, transaction dates, and P2P detection.

**Architecture:** Four sequential refactors in ascending risk order. Each is one commit. All are pure extractions with no behavior change except triage signed amounts (intentional).

**Tech Stack:** Vue 3, CommonJS (backend), ESM (frontend), Vitest

---

### Task 1: Category Type Constants

**Files:**
- Create: `shared/categoryTypes.js`
- Modify: `frontend/src/utils/budgetMath.js`
- Modify: `frontend/src/views/TrendsView.vue`
- Modify: `frontend/src/views/BudgetView.vue`
- Modify: `frontend/src/views/BudgetPlannerView.vue`
- Modify: `frontend/src/views/OnboardingView.vue`
- Modify: `frontend/src/components/SpendingBreakdown.vue`
- Modify: `frontend/src/components/DialogComponent.vue`
- Modify: `frontend/src/utils/budgetSetup.js`
- Modify: `frontend/src/App.vue`
- Modify: `utils/defaultCategories.js`
- Modify: `api.js`
- Modify: `db/database.js`

- [ ] **Step 1: Create shared/categoryTypes.js**

```js
// shared/categoryTypes.js
const CATEGORY_TYPES = {
  INCOME: 'income',
  EXPENSE: 'expense',
  PAYMENT: 'payment',
  SAVINGS: 'savings',
};

module.exports = { CATEGORY_TYPES };
```

- [ ] **Step 2: Update frontend files**

Add import to each frontend file that uses type string literals:
```js
import { CATEGORY_TYPES } from '../../shared/categoryTypes';
```
(Adjust relative path per file depth — views use `../../../shared/categoryTypes`, utils use `../../../shared/categoryTypes`, components use `../../../shared/categoryTypes`.)

Replace all instances in each file. The replacements are mechanical:
- `'income'` → `CATEGORY_TYPES.INCOME` (when used as a type check)
- `'expense'` → `CATEGORY_TYPES.EXPENSE`
- `'payment'` → `CATEGORY_TYPES.PAYMENT`
- `'savings'` → `CATEGORY_TYPES.SAVINGS`

Files and their type check locations:

**budgetMath.js** (3 checks):
- Line 26: `type === 'income'` → `type === CATEGORY_TYPES.INCOME`
- Line 27: `type === 'expense'` → `type === CATEGORY_TYPES.EXPENSE`
- Line 28: `type === 'savings'` → `type === CATEGORY_TYPES.SAVINGS`

**TrendsView.vue** (6 checks):
- Lines 222-225: four `cat.type ===` checks
- Lines 369-370: two `.filter(c => c.type ===` checks

**BudgetView.vue** (~15 checks):
- Lines 1114, 1492, 1498, 1506, 1536, 1546: various `g.type ===` / `c.type ===`
- Lines 1585, 1589, 1596, 1599, 1603: `groupedTransactions[category].type` checks
- Lines 1781, 1790, 1978: type checks in methods

**BudgetPlannerView.vue** (5 checks):
- Lines 324, 330, 347, 503, 530

**OnboardingView.vue** (1 check):
- Line 304

**SpendingBreakdown.vue** (1 check):
- Line 113

**DialogComponent.vue** (1 check):
- Line 163

**budgetSetup.js** (2 checks):
- Lines 66, 77

**App.vue** (2 checks):
- Lines 408, 409

- [ ] **Step 3: Update backend files**

Add require to each backend file:
```js
const { CATEGORY_TYPES } = require('./shared/categoryTypes');
```
(Adjust path: api.js uses `'./shared/categoryTypes'`, utils/ files use `'../shared/categoryTypes'`, db/ files use `'../shared/categoryTypes'`.)

**api.js** (1 check):
- Line 948: `c.type === 'expense'` → `c.type === CATEGORY_TYPES.EXPENSE`

**db/database.js** (2 defaults):
- Line 201: `cat.type || 'expense'` → `cat.type || CATEGORY_TYPES.EXPENSE`
- Line 217: `cat.type || 'expense'` → `cat.type || CATEGORY_TYPES.EXPENSE`

**utils/defaultCategories.js** (12 seed values):
- Lines 6-17: replace `type: 'income'` → `type: CATEGORY_TYPES.INCOME`, etc.

- [ ] **Step 4: Run tests**

Run: `cd /Users/chris/Projects/animated-space-waffle && npm test && cd frontend && npm test`
Expected: All 380 tests pass. No behavior change.

- [ ] **Step 5: Build frontend**

Run: `cd /Users/chris/Projects/animated-space-waffle/frontend && npm run build`
Expected: Build succeeds. Vite resolves `../../shared/categoryTypes` imports.

- [ ] **Step 6: Commit**

```bash
git add shared/categoryTypes.js frontend/src/ utils/ api.js db/
git commit -m "refactor: extract category type constants to shared/categoryTypes.js

Replace 47 hardcoded type string literals with CATEGORY_TYPES constants.
Single source of truth for income/expense/payment/savings type values."
```

---

### Task 2: Dollar Formatting + Display Convention

**Files:**
- Create: `frontend/src/utils/formatDollar.js`
- Create: `frontend/src/__tests__/formatDollar.test.js`
- Modify: `frontend/src/views/BudgetView.vue` (remove local formatDollar method, update templates)
- Modify: `frontend/src/views/BudgetPlannerView.vue`
- Modify: `frontend/src/views/TransactionDrillDown.vue`
- Modify: `frontend/src/components/SpendingBreakdown.vue`
- Modify: `frontend/src/views/OnboardingView.vue`
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: Write tests for formatDollar**

Create `frontend/src/__tests__/formatDollar.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { formatDollar, formatSignedDollar } from '@/utils/formatDollar';

describe('formatDollar', () => {
  it('formats integer amounts with commas', () => {
    expect(formatDollar(1234)).toBe('1,234');
    expect(formatDollar(0)).toBe('0');
    expect(formatDollar(999999)).toBe('999,999');
  });

  it('uses absolute value', () => {
    expect(formatDollar(-500)).toBe('500');
  });

  it('respects decimal places', () => {
    expect(formatDollar(1234.5, 2)).toBe('1,234.50');
    expect(formatDollar(1234, 2)).toBe('1,234.00');
  });

  it('handles NaN gracefully', () => {
    expect(formatDollar(NaN)).toBe('0');
  });
});

describe('formatSignedDollar', () => {
  it('formats positive with + prefix and positive class', () => {
    const result = formatSignedDollar(500);
    expect(result.text).toBe('+$500');
    expect(result.colorClass).toBe('basil-positive');
  });

  it('formats negative with − prefix and negative class', () => {
    const result = formatSignedDollar(-500);
    expect(result.text).toBe('−$500');
    expect(result.colorClass).toBe('basil-negative');
  });

  it('formats zero as positive', () => {
    const result = formatSignedDollar(0);
    expect(result.text).toBe('+$0');
    expect(result.colorClass).toBe('basil-positive');
  });

  it('respects decimal places', () => {
    const result = formatSignedDollar(-1234.5, 2);
    expect(result.text).toBe('−$1,234.50');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/chris/Projects/animated-space-waffle/frontend && npx vitest run src/__tests__/formatDollar.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create formatDollar.js**

Create `frontend/src/utils/formatDollar.js`:

```js
/**
 * Format a number as a dollar display string (no $ prefix — templates add it).
 * @param {number} amount
 * @param {number} decimals — 0 for integer, 2 for cents
 * @returns {string} e.g. "1,234" or "1,234.50"
 */
export function formatDollar(amount, decimals = 0) {
  const num = Math.abs(Number(amount));
  if (isNaN(num)) return '0';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a signed dollar amount with sign prefix and color class.
 * @param {number} amount — positive = good (green), negative = bad (red)
 * @param {number} decimals
 * @returns {{ text: string, colorClass: string }}
 */
export function formatSignedDollar(amount, decimals = 0) {
  const formatted = formatDollar(amount, decimals);
  const positive = amount >= 0;
  return {
    text: `${positive ? '+' : '\u2212'}$${formatted}`,
    colorClass: positive ? 'basil-positive' : 'basil-negative',
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/chris/Projects/animated-space-waffle/frontend && npx vitest run src/__tests__/formatDollar.test.js`
Expected: All 8 tests PASS.

- [ ] **Step 5: Replace BudgetView's local formatDollar**

In `BudgetView.vue`:
1. Add import: `import { formatDollar, formatSignedDollar } from '@/utils/formatDollar';`
2. Delete the local `formatDollar` method (lines 1851-1863).
3. In the component's `methods`, the local `formatDollar` is called as `this.formatDollar(...)` in methods and `formatDollar(...)` in templates. Both will resolve to the import.

Replace signed net position patterns (lines 134, 176):
```
{{ netPositive ? '+' : '−' }}${{ Math.round(Math.abs(displayedStats.netPosition)).toLocaleString() }}
```
becomes:
```
{{ formatSignedDollar(displayedStats.netPosition).text }}
```
And update the `:style` binding to use `formatSignedDollar(displayedStats.netPosition).colorClass`.

Replace neutral `toLocaleString` patterns (lines 51, 63, 78, 83, 87, 91, 120, 127, 141, 145, 161, 168, 182, 186, 197, 206):
```
${{ Math.round(displayedSummary.spent).toLocaleString() }}
```
becomes:
```
${{ formatDollar(displayedSummary.spent) }}
```

Update triage card amount (line 792):
```
{{ triageItems[0].amount < 0 ? `-$${Math.abs(triageItems[0].amount).toFixed(2)}` : `$${triageItems[0].amount.toFixed(2)}` }}
```
becomes:
```html
<span :class="formatSignedDollar(-triageItems[0].amount).colorClass">{{ formatSignedDollar(-triageItems[0].amount, 2).text }}</span>
```
Note: negate the Plaid amount so positive = money in = green, negative = money out = red.

- [ ] **Step 6: Replace in other files**

**BudgetPlannerView.vue**: Add import. Replace `toLocaleString` patterns (lines 80, 103, 110, 117, 139, 166, 337, 342, 357). Replace signed net (line 124) with `formatSignedDollar`.

**TransactionDrillDown.vue**: Add import. Replace `toLocaleString` patterns (lines 10, 28, 32). Replace signed trend delta (line 37) with `formatSignedDollar`.

**SpendingBreakdown.vue**: Add import. Replace `toLocaleString` patterns (lines 59, 184, 186, 242).

**OnboardingView.vue**: Add import. Replace `toLocaleString` patterns (lines 115, 134).

**App.vue**: Add import. Replace `toLocaleString` patterns (lines 413, 414).

- [ ] **Step 7: Run all tests and build**

Run: `cd /Users/chris/Projects/animated-space-waffle/frontend && npm test && npm run build`
Expected: All tests pass, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/utils/formatDollar.js frontend/src/__tests__/formatDollar.test.js frontend/src/
git commit -m "refactor: extract formatDollar + formatSignedDollar to shared utility

Replace 76 inline dollar formatting patterns with shared functions.
Add signed colored amounts to triage cards (green +$ for credits,
red $ for debits) — helps distinguish Venmo in/out at a glance."
```

---

### Task 3: Transaction Date Helper

**Files:**
- Create: `frontend/src/utils/transactionDate.js`
- Create: `frontend/src/__tests__/transactionDate.test.js`
- Modify: `frontend/src/views/BudgetView.vue`
- Modify: `frontend/src/views/TrendsView.vue`
- Modify: `frontend/src/views/TransactionDrillDown.vue`
- Modify: `frontend/src/views/AccountsView.vue`
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/utils/budgetMath.js`

- [ ] **Step 1: Write tests**

Create `frontend/src/__tests__/transactionDate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { txnDate, txnDayjs, txnMonth, isInMonth } from '@/utils/transactionDate';

describe('txnDate', () => {
  it('returns effectiveDate when set', () => {
    expect(txnDate({ effectiveDate: '2026-03-15', date: '2026-03-10' })).toBe('2026-03-15');
  });

  it('falls back to date', () => {
    expect(txnDate({ date: '2026-03-10' })).toBe('2026-03-10');
  });

  it('falls back to date when effectiveDate is null', () => {
    expect(txnDate({ effectiveDate: null, date: '2026-03-10' })).toBe('2026-03-10');
  });
});

describe('txnMonth', () => {
  it('returns YYYY-MM from effectiveDate', () => {
    expect(txnMonth({ effectiveDate: '2026-03-15', date: '2026-02-28' })).toBe('2026-03');
  });

  it('returns YYYY-MM from date fallback', () => {
    expect(txnMonth({ date: '2026-01-05' })).toBe('2026-01');
  });
});

describe('txnDayjs', () => {
  it('returns dayjs instance for effectiveDate', () => {
    const d = txnDayjs({ effectiveDate: '2026-03-15', date: '2026-03-10' });
    expect(d.format('YYYY-MM-DD')).toBe('2026-03-15');
  });
});

describe('isInMonth', () => {
  const march = dayjs('2026-03-01');

  it('matches transaction in the target month', () => {
    expect(isInMonth({ date: '2026-03-15' }, march)).toBe(true);
  });

  it('rejects transaction in a different month', () => {
    expect(isInMonth({ date: '2026-04-01' }, march)).toBe(false);
  });

  it('uses effectiveDate over date', () => {
    expect(isInMonth({ effectiveDate: '2026-03-15', date: '2026-04-01' }, march)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/chris/Projects/animated-space-waffle/frontend && npx vitest run src/__tests__/transactionDate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create transactionDate.js**

Create `frontend/src/utils/transactionDate.js`:

```js
import dayjs from 'dayjs';

/** Canonical transaction date — effectiveDate if set, otherwise date. */
export function txnDate(txn) {
  return txn.effectiveDate || txn.date;
}

/** Dayjs instance for the canonical transaction date. */
export function txnDayjs(txn) {
  return dayjs(txn.effectiveDate || txn.date);
}

/** Transaction's month key as YYYY-MM string. */
export function txnMonth(txn) {
  return (txn.effectiveDate || txn.date)?.substring(0, 7);
}

/** Is the transaction in the given month? (dayjs month object) */
export function isInMonth(txn, month) {
  const d = dayjs(txn.effectiveDate || txn.date);
  return d.year() === month.year() && d.month() === month.month();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/chris/Projects/animated-space-waffle/frontend && npx vitest run src/__tests__/transactionDate.test.js`
Expected: All 7 tests PASS.

- [ ] **Step 5: Replace patterns in each file**

Work file by file. For each file, add the import and replace inline patterns:

```js
import { txnDate, txnDayjs, txnMonth, isInMonth } from '@/utils/transactionDate';
```

**Replacement patterns:**

| Inline pattern | Replacement |
|---|---|
| `txn.effectiveDate \|\| txn.date` (raw value) | `txnDate(txn)` |
| `dayjs(txn.effectiveDate \|\| txn.date)` (dayjs instance) | `txnDayjs(txn)` |
| `(txn.effectiveDate \|\| txn.date)?.substring(0, 7)` | `txnMonth(txn)` |
| `dayjs(x).year() === sel.year() && dayjs(x).month() === sel.month()` | `isInMonth(txn, sel)` |
| `dayjs(txn.effectiveDate \|\| txn.date).format('MMM YYYY')` | `txnDayjs(txn).format('MMM YYYY')` |
| `dayjs(txn.effectiveDate \|\| txn.date).format('YYYY-MM')` | `txnDayjs(txn).format('YYYY-MM')` |

**Files with approximate replacement counts:**
- `BudgetView.vue` — ~18 replacements
- `TrendsView.vue` — ~4 replacements
- `TransactionDrillDown.vue` — ~4 replacements
- `AccountsView.vue` — ~1 replacement
- `App.vue` — ~1 replacement
- `store.js` — ~6 replacements
- `budgetMath.js` — ~1 replacement (inside `freeCashFlow`)

After each file, run tests to catch any issues:
```bash
cd /Users/chris/Projects/animated-space-waffle/frontend && npm test
```

- [ ] **Step 6: Run all tests and build**

Run: `cd /Users/chris/Projects/animated-space-waffle && npm test && cd frontend && npm test && npm run build`
Expected: All tests pass, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/transactionDate.js frontend/src/__tests__/transactionDate.test.js frontend/src/ 
git commit -m "refactor: extract transaction date helpers to transactionDate.js

Replace 30+ inline 'txn.effectiveDate || txn.date' patterns with
shared helpers: txnDate, txnDayjs, txnMonth, isInMonth."
```

---

### Task 4: P2P Detection Consolidation

**Files:**
- Create: `shared/p2pDetection.js`
- Create: `__tests__/p2pDetection.test.js`
- Modify: `frontend/src/utils/ruleUtils.js`
- Modify: `frontend/src/utils/relationshipDetector.js`
- Modify: `utils/categoryMapping.js`
- Modify: `scripts/similarity-analysis.js`

- [ ] **Step 1: Write tests for canonical implementation**

Create `__tests__/p2pDetection.test.js`:

```js
const { describe, it, expect } = require('vitest');
const { P2P_PATTERNS, isP2PTransaction } = require('../shared/p2pDetection');

const txn = (overrides) => ({ account: null, merchant_name: null, name: null, ...overrides });

describe('isP2PTransaction', () => {
  it('detects Venmo by merchant_name', () => {
    expect(isP2PTransaction(txn({ merchant_name: 'Venmo' }))).toBe(true);
  });

  it('detects Venmo by name', () => {
    expect(isP2PTransaction(txn({ name: 'VENMO PAYMENT' }))).toBe(true);
  });

  it('detects Venmo by account', () => {
    expect(isP2PTransaction(txn({ account: 'Venmo' }))).toBe(true);
  });

  it('detects Zelle', () => {
    expect(isP2PTransaction(txn({ name: 'Zelle payment from John' }))).toBe(true);
  });

  it('detects Cash App', () => {
    expect(isP2PTransaction(txn({ merchant_name: 'Cash App' }))).toBe(true);
  });

  it('detects PayPal', () => {
    expect(isP2PTransaction(txn({ merchant_name: 'PayPal' }))).toBe(true);
  });

  it('detects Apple Cash', () => {
    expect(isP2PTransaction(txn({ name: 'Apple Cash Payment' }))).toBe(true);
  });

  it('returns false for non-P2P', () => {
    expect(isP2PTransaction(txn({ merchant_name: 'Starbucks', name: 'Starbucks Coffee' }))).toBe(false);
  });

  it('returns false for all-null fields', () => {
    expect(isP2PTransaction(txn({}))).toBe(false);
  });

  it('exports P2P_PATTERNS array', () => {
    expect(Array.isArray(P2P_PATTERNS)).toBe(true);
    expect(P2P_PATTERNS.length).toBe(6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/chris/Projects/animated-space-waffle && npx vitest run __tests__/p2pDetection.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create shared/p2pDetection.js**

```js
// shared/p2pDetection.js
const P2P_PATTERNS = [
  /venmo/i, /zelle/i, /cash app/i, /cashapp/i, /paypal/i, /apple cash/i,
];

/**
 * Is this a P2P transaction (Venmo, Zelle, Cash App, PayPal, Apple Cash)?
 * Checks account, merchant_name, and name fields.
 */
function isP2PTransaction(txn) {
  const sources = [txn.account, txn.merchant_name, txn.name].filter(Boolean);
  return sources.some(s => P2P_PATTERNS.some(p => p.test(s)));
}

module.exports = { P2P_PATTERNS, isP2PTransaction };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/chris/Projects/animated-space-waffle && npx vitest run __tests__/p2pDetection.test.js`
Expected: All 10 tests PASS.

- [ ] **Step 5: Update frontend/src/utils/ruleUtils.js**

Remove the local `P2P_PATTERNS` and `isP2P` function (lines 126-136). Replace with import and re-export:

```js
import { P2P_PATTERNS, isP2PTransaction } from '../../../shared/p2pDetection';

// Re-export as isP2P for backwards compatibility with existing consumers
export const isP2P = isP2PTransaction;
export { P2P_PATTERNS };
```

The internal usage at line 174 (`const p2p = isP2P(anchor)`) continues to work via the re-export.

- [ ] **Step 6: Update frontend/src/utils/relationshipDetector.js**

Remove the local `P2P_PATTERNS` (lines 14-18) and `isP2PTransaction` function (lines 23-26). Replace with import:

```js
import { P2P_PATTERNS, isP2PTransaction } from '../../../shared/p2pDetection';
```

The existing `export { isP2PTransaction, P2P_PATTERNS }` at the bottom of the file (lines 357, 369) stays — it re-exports the import.

- [ ] **Step 7: Update utils/categoryMapping.js**

Remove the local `P2P_PATTERNS` (lines 3-6) and `isP2PTransaction` function (lines 8-11). Replace with require:

```js
const { isP2PTransaction } = require('../shared/p2pDetection');
```

Usage at line 150 (`if (isP2PTransaction(transaction))`) stays unchanged.

- [ ] **Step 8: Update scripts/similarity-analysis.js**

Remove the local `P2P_PATTERNS` and `isP2P` function (lines 19-22). Replace with require:

```js
const { isP2PTransaction: isP2P } = require('../shared/p2pDetection');
```

All existing `isP2P(...)` calls continue to work.

- [ ] **Step 9: Run all tests and build**

Run: `cd /Users/chris/Projects/animated-space-waffle && npm test && cd frontend && npm test && npm run build`
Expected: All tests pass (including existing ruleUtils and relationshipDetector tests), build succeeds.

- [ ] **Step 10: Commit**

```bash
git add shared/p2pDetection.js __tests__/p2pDetection.test.js frontend/src/utils/ruleUtils.js frontend/src/utils/relationshipDetector.js utils/categoryMapping.js scripts/similarity-analysis.js
git commit -m "refactor: consolidate P2P detection to shared/p2pDetection.js

Replace 4 copies of P2P_PATTERNS + isP2P/isP2PTransaction with one
canonical source. All consumers now check account + merchant_name + name
(ruleUtils previously only checked merchant_name + name)."
```

---

## Post-Implementation

After all 4 tasks are committed:

1. **Update CLAUDE.md** — Add `shared/categoryTypes.js`, `shared/p2pDetection.js`, `frontend/src/utils/formatDollar.js`, and `frontend/src/utils/transactionDate.js` to the shared utilities table.

2. **Remove P2P sync warning** from CLAUDE.md — The warning about keeping P2P lists in sync is no longer needed since there's one canonical source.

3. **Push to production** — All 4 commits at once.
