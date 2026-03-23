# Smarter Similar Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-strategy `findSimilarTransactions` with a tiered system that picks the most specific useful grouping, with P2P-aware exceptions for Venmo/Zelle/etc.

**Architecture:** `findSimilarTransactions` becomes a cascade of strategies tried in specificity order (most specific first). Each tier is tried; the first one that finds matches wins. P2P transactions skip merchant/name tiers entirely and only match on exact name or exact amount+account. A shared `P2P_MERCHANT_PATTERNS` list is extracted so both client (`ruleUtils.js`) and server (`categoryMapping.js`) use the same set.

**Tech Stack:** Pure JS — no new dependencies. Changes are entirely in `frontend/src/utils/ruleUtils.js` (logic), `frontend/src/__tests__/ruleUtils.test.js` (tests), and `frontend/src/components/DialogComponent.vue` + `frontend/src/views/BudgetView.vue` (strategy hint label).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/utils/ruleUtils.js` | Modify | New tiered `findSimilarTransactions`, new `isP2P` helper, new `extractStablePrefix` helper |
| `frontend/src/__tests__/ruleUtils.test.js` | Modify | Tests for each tier, P2P exceptions, prefix extraction |
| `frontend/src/components/DialogComponent.vue` | Modify | Update strategy hint label to handle new strategy names |
| `frontend/src/views/BudgetView.vue` | Modify | Update triage strategy hint label to handle new strategy names |

---

## Design: Tier Cascade

Strategies tried in order (first match with >0 results wins):

| Tier | Strategy name | Match logic | Rule created | Skip for P2P? |
|------|--------------|-------------|-------------|----------------|
| 1 | `exact_name` | `name eq` (case-insensitive) | `{ field: 'name', op: 'eq' }` | No |
| 2 | `merchant_name` | `merchant_name eq` (case-insensitive) | `{ field: 'merchant_name', op: 'eq' }` | **Yes** |
| 3 | `name_prefix` | Stable prefix of `name` via `contains` | `{ field: 'name', op: 'contains' }` | **Yes** |
| 4 | `amount_account` | `amount eq` + `account eq` | `{ field: 'amount', op: 'eq' } + { field: 'account', op: 'eq' }` | No |

**Why this order:**
- **Tier 1 (exact name)** is the strongest signal — "Gusto-OSV PAYROLL1 CITIZENS PAID EARLY" matching itself exactly means it's definitely the same transaction type. This also catches the common case that the old strategy 1 (merchant) used to catch — most merchant-matched transactions also have identical names.
- **Tier 2 (merchant)** catches the rest — when names differ slightly but merchant is the same (e.g., "Target #1234" vs "Target #5678"). Skipped for P2P because "Venmo" as a merchant matches everything.
- **Tier 3 (name prefix)** catches payroll processors, utilities with account numbers, etc. "Gusto-OSV" is the stable prefix of "Gusto-OSV 00007055 CITIZENS PAID EARLY". Skipped for P2P because "Venmo Payment" prefix would match all Venmo.
- **Tier 4 (amount + account)** is the weakest but catches recurring P2P and subscriptions — same dollar amount from the same institution is likely the same thing. This is the only non-name/merchant tier, so it's the fallback.

**Prefix extraction (`extractStablePrefix`):**
1. Find the first run of 3+ digits in the name
2. Take everything before it, trimmed
3. If the prefix is fewer than 4 characters, return null (too short to be meaningful)
4. Examples:
   - `"Gusto-OSV 00007055 CITIZENS PAID EARLY"` → `"Gusto-OSV"`
   - `"CHECK # 1234"` → `"CHECK #"` → `"CHECK"` (trimmed, and `#` stripped as trailing punctuation)
   - `"Netflix"` → `null` (no digit run, so prefix extraction doesn't apply — tier 3 is skipped, which is fine because tier 1 or 2 would catch Netflix)
   - `"A1B"` → `null` (digit run is only 1 char, not 3+)

**P2P detection (`isP2P`):**
Port the existing `P2P_PATTERNS` array from `utils/categoryMapping.js` to a shared constant. On the client side, check `merchant_name` and `name` fields (not `account` — the account is the bank, not the P2P service):
```js
const P2P_PATTERNS = [/venmo/i, /zelle/i, /cash app/i, /cashapp/i, /paypal/i, /apple cash/i];
function isP2P(txn) {
  const sources = [txn.merchant_name, txn.name].filter(Boolean);
  return sources.some(s => P2P_PATTERNS.some(p => p.test(s)));
}
```

---

## Task 1: Add `extractStablePrefix` helper + tests

**Files:**
- Modify: `frontend/src/utils/ruleUtils.js`
- Modify: `frontend/src/__tests__/ruleUtils.test.js`

- [ ] **Step 1: Write failing tests for `extractStablePrefix`**

Add to `ruleUtils.test.js`, after the `findSimilarTransactions` describe block:

```js
// ---------------------------------------------------------------------------
// extractStablePrefix
// ---------------------------------------------------------------------------

describe('extractStablePrefix', () => {
  it('extracts prefix before first 3+ digit run', () => {
    expect(extractStablePrefix('Gusto-OSV 00007055 CITIZENS PAID EARLY')).toBe('Gusto-OSV')
  })

  it('strips trailing whitespace and punctuation from prefix', () => {
    expect(extractStablePrefix('CHECK # 1234')).toBe('CHECK')
  })

  it('returns null when no 3+ digit run exists', () => {
    expect(extractStablePrefix('Netflix')).toBeNull()
  })

  it('returns null when prefix would be too short (< 4 chars)', () => {
    expect(extractStablePrefix('AB 12345')).toBeNull()
  })

  it('ignores 1-2 digit runs', () => {
    expect(extractStablePrefix('Route 66 Express 00123')).toBe('Route 66 Express')
  })

  it('returns null for empty/null input', () => {
    expect(extractStablePrefix('')).toBeNull()
    expect(extractStablePrefix(null)).toBeNull()
  })

  it('handles prefix that is the whole string minus digits', () => {
    expect(extractStablePrefix('PAYROLL 202603')).toBe('PAYROLL')
  })
})
```

Update the import at top of test file to include `extractStablePrefix`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/ruleUtils.test.js`
Expected: FAIL — `extractStablePrefix` is not exported

- [ ] **Step 3: Implement `extractStablePrefix`**

Add to `ruleUtils.js` after the `condKey` function (before `findExistingRule`):

```js
/**
 * Extract the stable prefix of a transaction name — everything before the first
 * run of 3+ consecutive digits. Returns null if no such run exists or if the
 * resulting prefix is shorter than 4 characters.
 *
 * Examples:
 *   "Gusto-OSV 00007055 CITIZENS" → "Gusto-OSV"
 *   "Netflix"                     → null (no digit run)
 *   "AB 12345"                    → null (prefix too short)
 */
export function extractStablePrefix(name) {
  if (!name) return null;
  const match = name.match(/\d{3,}/);
  if (!match) return null;
  const raw = name.slice(0, match.index).replace(/[\s#\-_.*]+$/, '');
  return raw.length >= 4 ? raw : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/ruleUtils.test.js`
Expected: All `extractStablePrefix` tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/ruleUtils.js frontend/src/__tests__/ruleUtils.test.js
git commit -m "feat: add extractStablePrefix helper for name-prefix similarity matching"
```

---

## Task 2: Add `isP2P` helper + tests

**Files:**
- Modify: `frontend/src/utils/ruleUtils.js`
- Modify: `frontend/src/__tests__/ruleUtils.test.js`

- [ ] **Step 1: Write failing tests for `isP2P`**

Add to `ruleUtils.test.js`:

```js
// ---------------------------------------------------------------------------
// isP2P
// ---------------------------------------------------------------------------

describe('isP2P', () => {
  it('detects Venmo by merchant_name', () => {
    expect(isP2P(txn({ merchant_name: 'Venmo' }))).toBe(true)
  })

  it('detects Venmo by name (case-insensitive)', () => {
    expect(isP2P(txn({ name: 'VENMO PAYMENT' }))).toBe(true)
  })

  it('detects Zelle', () => {
    expect(isP2P(txn({ name: 'Zelle payment from John' }))).toBe(true)
  })

  it('detects Cash App', () => {
    expect(isP2P(txn({ merchant_name: 'Cash App' }))).toBe(true)
  })

  it('detects PayPal', () => {
    expect(isP2P(txn({ merchant_name: 'PayPal' }))).toBe(true)
  })

  it('detects Apple Cash', () => {
    expect(isP2P(txn({ name: 'Apple Cash Payment' }))).toBe(true)
  })

  it('returns false for regular merchants', () => {
    expect(isP2P(txn({ merchant_name: 'Starbucks', name: 'Starbucks Coffee' }))).toBe(false)
  })

  it('returns false for null fields', () => {
    expect(isP2P(txn({ merchant_name: null, name: null }))).toBe(false)
  })
})
```

Update the import to include `isP2P`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/ruleUtils.test.js`
Expected: FAIL — `isP2P` is not exported

- [ ] **Step 3: Implement `isP2P`**

Add to `ruleUtils.js` after `extractStablePrefix`:

```js
const P2P_PATTERNS = [/venmo/i, /zelle/i, /cash app/i, /cashapp/i, /paypal/i, /apple cash/i];

/**
 * Detect P2P payment transactions (Venmo, Zelle, Cash App, PayPal, Apple Cash).
 * P2P transactions get special handling in similarity matching because matching
 * by merchant or name prefix is too broad — all Venmo txns share the same merchant.
 */
export function isP2P(txn) {
  const sources = [txn.merchant_name, txn.name].filter(Boolean);
  return sources.some(s => P2P_PATTERNS.some(p => p.test(s)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/ruleUtils.test.js`
Expected: All `isP2P` tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/ruleUtils.js frontend/src/__tests__/ruleUtils.test.js
git commit -m "feat: add isP2P helper for P2P-aware similarity detection"
```

---

## Task 3: Rewrite `findSimilarTransactions` with tiered cascade

**Files:**
- Modify: `frontend/src/utils/ruleUtils.js`
- Modify: `frontend/src/__tests__/ruleUtils.test.js`

- [ ] **Step 1: Write failing tests for the new tiered behavior**

Add new tests and update existing ones in `ruleUtils.test.js`. The existing tests for strategies 1-3 need to be updated since the cascade order changes (exact name is now tier 1, not merchant). Add these new tests inside the existing `describe('findSimilarTransactions', ...)` block:

```js
  // --- Tier 1: exact name ---

  it('tier 1: matches by exact name before merchant', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Starbucks', name: 'Starbucks #1234 Purchase' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Starbucks', name: 'Starbucks #1234 Purchase' }),
      txn({ transaction_id: 'c', merchant_name: 'Starbucks', name: 'Starbucks #5678 Purchase' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('exact_name')
    expect(result.allCount).toBe(1) // only the exact name match, not the other Starbucks
  })

  // --- Tier 2: merchant (non-P2P only) ---

  it('tier 2: falls through to merchant when no exact name matches', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Target', name: 'Target #1234' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Target', name: 'Target #5678' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('merchant_name')
    expect(result.allCount).toBe(1)
  })

  it('tier 2: skips merchant for P2P transactions', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Venmo', name: 'Venmo Payment - Alice' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Venmo', name: 'Venmo Payment - Bob' }),
      txn({ transaction_id: 'c', merchant_name: 'Venmo', name: 'Venmo Payment - Charlie' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    // Should NOT match by merchant (would get 2 matches) — skips to later tiers
    expect(result.strategy).not.toBe('merchant_name')
  })

  // --- Tier 3: name prefix ---

  it('tier 3: matches by name prefix for payroll-style transactions', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: 'Gusto-OSV 00007055 CITIZENS PAID EARLY', account: 'Citizens Bank' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', name: 'Gusto-OSV 00007008 CITIZENS PAID EARLY', account: 'Citizens Bank' }),
      txn({ transaction_id: 'c', name: 'Gusto-OSV 00006956 CITIZENS PAID EARLY', account: 'Citizens Bank' }),
      txn({ transaction_id: 'd', name: 'Something Else', account: 'Citizens Bank' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('name_prefix')
    expect(result.allCount).toBe(2)
    expect(result.conditions).toEqual([{ field: 'name', op: 'contains', value: 'Gusto-OSV' }])
    expect(result.label).toBe('Gusto-OSV')
  })

  it('tier 3: skips name prefix for P2P transactions', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Venmo', name: 'Venmo Payment 12345' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Venmo', name: 'Venmo Payment 67890' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).not.toBe('name_prefix')
  })

  // --- Tier 4: amount + account ---

  it('tier 4: matches by amount + account as final fallback', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Venmo', name: 'Venmo Payment - Alice', amount: -50, account: 'Chase' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Venmo', name: 'Venmo Payment - Alice', amount: -50, account: 'Chase' }),
      txn({ transaction_id: 'c', merchant_name: 'Venmo', name: 'Venmo Payment - Bob', amount: -50, account: 'Chase' }),
      txn({ transaction_id: 'd', merchant_name: 'Venmo', name: 'Venmo Payment - Alice', amount: -25, account: 'Chase' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    // Tier 1 finds exact name match (b), so it should stop there
    expect(result.strategy).toBe('exact_name')
    expect(result.allCount).toBe(1)
  })

  it('tier 4: P2P with no exact name match falls to amount + account', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Venmo', name: 'Venmo Payment - Alice 1', amount: -50, account: 'Chase' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Venmo', name: 'Venmo Payment - Alice 2', amount: -50, account: 'Chase' }),
      txn({ transaction_id: 'c', merchant_name: 'Venmo', name: 'Venmo Payment - Bob', amount: -50, account: 'Chase' }),
      txn({ transaction_id: 'd', merchant_name: 'Venmo', name: 'Venmo Payment - Alice 3', amount: -25, account: 'Chase' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    // No exact name match, merchant skipped (P2P), prefix skipped (P2P) → amount+account
    expect(result.strategy).toBe('amount_account')
    expect(result.allCount).toBe(2) // b and c both match $50 + Chase
  })

  it('tier 4: requires account for amount matching', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: 'Unique Thing', amount: -9.99, account: null })
    const all = [
      anchor,
      txn({ transaction_id: 'b', name: 'Other Thing', amount: -9.99, account: null }),
    ]
    const result = findSimilarTransactions(anchor, all)
    // No account → tier 4 skipped entirely
    expect(result.allCount).toBe(0)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/ruleUtils.test.js`
Expected: Several new tests FAIL (old behavior doesn't match new expectations)

- [ ] **Step 3: Rewrite `findSimilarTransactions`**

Replace the entire function in `ruleUtils.js`:

```js
/**
 * Find transactions similar to an anchor transaction using a tiered cascade.
 * Tries strategies in specificity order; the first tier with matches wins.
 *
 * Tiers (in order):
 * 1. exact_name     — identical transaction name (strongest signal)
 * 2. merchant_name  — same merchant (skipped for P2P)
 * 3. name_prefix    — stable prefix before numeric codes (skipped for P2P)
 * 4. amount_account — same dollar amount + same institution (weakest, catches recurring)
 *
 * @param {object}   anchor       - The transaction to find matches for
 * @param {object[]} transactions - All transactions to search
 * @returns {object} { matches, allCount, strategy, ruleType, conditions, ruleField, ruleValue, label }
 */
export function findSimilarTransactions(anchor, transactions) {
  const empty = { matches: [], allCount: 0, strategy: null, ruleType: null, conditions: [], ruleField: null, ruleValue: null, label: '' };
  if (!anchor || !transactions?.length) return empty;

  const anchorName = anchor.name || '';
  const hasMerchant = anchor.merchant_name != null && anchor.merchant_name !== '';
  const hasAccount = anchor.account != null && anchor.account !== '' && anchor.account !== '?';
  const p2p = isP2P(anchor);

  const tiers = [];

  // Tier 1: exact name (always tried)
  if (anchorName) {
    const nameLower = anchorName.toLowerCase();
    tiers.push({
      strategy: 'exact_name',
      ruleType: hasMerchant ? 'merchant' : 'compound',
      ruleField: 'name',
      ruleValue: anchorName,
      label: hasMerchant ? anchor.merchant_name : anchorName,
      conditions: [{ field: 'name', op: 'eq', value: anchorName }],
      matchFn: t => (t.name || '').toLowerCase() === nameLower,
    });
  }

  // Tier 2: merchant (skip for P2P)
  if (hasMerchant && !p2p) {
    const val = anchor.merchant_name;
    const valLower = val.toLowerCase();
    tiers.push({
      strategy: 'merchant_name',
      ruleType: 'merchant',
      ruleField: 'merchant_name',
      ruleValue: val,
      label: val,
      conditions: [{ field: 'merchant_name', op: 'eq', value: val }],
      matchFn: t => t.merchant_name != null && t.merchant_name.toLowerCase() === valLower,
    });
  }

  // Tier 3: name prefix (skip for P2P)
  if (!p2p && anchorName) {
    const prefix = extractStablePrefix(anchorName);
    if (prefix) {
      const prefixLower = prefix.toLowerCase();
      tiers.push({
        strategy: 'name_prefix',
        ruleType: 'compound',
        ruleField: null,
        ruleValue: null,
        label: prefix,
        conditions: [{ field: 'name', op: 'contains', value: prefix }],
        matchFn: t => (t.name || '').toLowerCase().includes(prefixLower),
      });
    }
  }

  // Tier 4: amount + account (always tried when account exists)
  if (hasAccount && anchor.amount != null) {
    const absAmount = Math.abs(anchor.amount);
    tiers.push({
      strategy: 'amount_account',
      ruleType: 'compound',
      ruleField: null,
      ruleValue: null,
      label: `$${absAmount % 1 === 0 ? absAmount : absAmount.toFixed(2)} from ${anchor.account}`,
      conditions: [
        { field: 'amount', op: 'eq', value: absAmount },
        { field: 'account', op: 'eq', value: anchor.account },
      ],
      matchFn: t => Math.abs(t.amount) === absAmount && t.account === anchor.account,
    });
  }

  // Try each tier — first one with matches wins
  for (const tier of tiers) {
    const matches = transactions.filter(t =>
      t.transaction_id !== anchor.transaction_id && tier.matchFn(t)
    );
    if (matches.length > 0) {
      return {
        matches,
        allCount: matches.length,
        strategy: tier.strategy,
        ruleType: tier.ruleType,
        conditions: tier.conditions,
        ruleField: tier.ruleField,
        ruleValue: tier.ruleValue,
        label: tier.label,
      };
    }
  }

  // No tier found matches — return empty with best-guess strategy for "Remember for future"
  // Use the first tier that was attempted (if any) so the rule still gets created
  if (tiers.length > 0) {
    const first = tiers[0];
    return {
      matches: [],
      allCount: 0,
      strategy: first.strategy,
      ruleType: first.ruleType,
      conditions: first.conditions,
      ruleField: first.ruleField,
      ruleValue: first.ruleValue,
      label: first.label,
    };
  }

  return empty;
}
```

- [ ] **Step 4: Update existing tests that assert old strategy names**

Several existing tests assert `strategy === 'merchant_name'` or `strategy === 'name'` for cases where the new cascade would pick `exact_name` first. Update these:

- `'matches by merchant_name (strategy 1)'` — if the test txns have the same name, strategy will now be `exact_name`. Either update the assertion or make the names different so merchant tier is tested.
- `'is case-insensitive for merchant_name'` — same issue. Give the test txns different names.
- `'uses name + account when merchant_name is null (strategy 2)'` — exact name match will hit first. Give different names to test merchant fallthrough.
- `'falls back to name-only when account is null (strategy 3)'` — now becomes `exact_name`. Give different names.

For each: make transaction names unique so the test actually exercises the intended tier. For example, for the merchant test:

```js
  it('tier 2: matches by merchant_name when names differ', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Starbucks', name: 'Starbucks Store #100' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Starbucks', name: 'Starbucks Store #200', mappedCategory: 'To Sort' }),
      txn({ transaction_id: 'c', merchant_name: 'Uber', name: 'Uber Trip', mappedCategory: 'To Sort' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('merchant_name')
    expect(result.allCount).toBe(1)
  })
```

- [ ] **Step 5: Run all `findSimilarTransactions` tests**

Run: `cd frontend && npx vitest run src/__tests__/ruleUtils.test.js`
Expected: ALL tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/ruleUtils.js frontend/src/__tests__/ruleUtils.test.js
git commit -m "feat: tiered similarity cascade with P2P-aware exceptions

findSimilarTransactions now tries 4 strategies in specificity order:
exact name → merchant → name prefix → amount+account.
P2P transactions (Venmo, Zelle, etc.) skip merchant and prefix tiers."
```

---

## Task 4: Update strategy hint labels in UI

**Files:**
- Modify: `frontend/src/components/DialogComponent.vue:99`
- Modify: `frontend/src/views/BudgetView.vue:905`

The hint text below the checkbox says "Matched by merchant / name + institution / name". New strategies need labels.

- [ ] **Step 1: Update DialogComponent.vue hint**

In `DialogComponent.vue` around line 99, replace the existing strategy hint:

```html
<div class="basil-dialog-similar__hint">
  Matched by {{ {
    exact_name: 'name',
    merchant_name: 'merchant',
    name_prefix: 'name pattern',
    amount_account: 'amount + institution',
  }[similarityData.strategy] || similarityData.strategy }}
</div>
```

- [ ] **Step 2: Update BudgetView.vue triage hint**

In `BudgetView.vue` around line 905, replace the existing triage strategy hint with the same map:

```html
<div class="basil-triage__similar-hint">
  Matched by {{ {
    exact_name: 'name',
    merchant_name: 'merchant',
    name_prefix: 'name pattern',
    amount_account: 'amount + institution',
  }[triageSimilar.strategy] || triageSimilar.strategy }}
</div>
```

- [ ] **Step 3: Verify dev server renders correctly**

Run: `cd frontend && npm run dev`
Open a transaction dialog for a Gusto-like transaction (if available in dev data) and verify the hint says "Matched by name pattern".

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/DialogComponent.vue frontend/src/views/BudgetView.vue
git commit -m "fix: update similarity hint labels for new strategy names"
```

---

## Task 5: Manual QA on production data

This task is not automatable — it requires the deployed app.

- [ ] **Step 1: Test Gusto transactions**

Open a Gusto transaction in the edit dialog. Verify:
- Checkbox appears: "Also categorize N similar" (where N = other Gusto payroll entries)
- Hint says "Matched by name pattern"
- Checking and submitting creates a compound rule with `name contains "Gusto-OSV"`

- [ ] **Step 2: Test Venmo transactions**

Open a Venmo transaction. Verify:
- If there's an exact name match → shows count, hint says "Matched by name"
- If no exact name match but same amount from same account → shows count, hint says "Matched by amount + institution"
- Does NOT show 80+ matches from merchant grouping

- [ ] **Step 3: Test regular merchants (Starbucks, Target, etc.)**

Verify existing behavior is preserved — merchant matching still works for non-P2P.

- [ ] **Step 4: Test "Remember for future" (zero matches)**

Open a truly unique transaction. Verify checkbox still shows "Remember for future" text with zero actionable count.
