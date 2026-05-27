# Split income transactions — design

**Date:** 2026-05-27
**Status:** Approved — ready for implementation plan
**Branch:** `native-app-phase-0` (work continues here; ships when the branch merges)

## Background

Transaction splitting shipped 2026-05-25 as part of the native parity pass: a single
parent transaction can be carved into 2–20 child transactions with their own categories
and amounts. The feature works end-to-end across web (`DialogComponent.vue`), mobile
(`SplitEditor.tsx` shared between the edit sheet and triage sheet), and backend
(`POST /api/split`, `POST /api/unsplit`).

It was scoped to **expense transactions only** — income (paychecks, refunds, transfers
in) is blocked at three layers. This was a deliberate MVP cut, not an architectural
limit. We want to lift it.

## Why

The real-world cases people hit:

- A paycheck the user wants to split across multiple **income** categories (e.g.
  $4,000 Salary + $1,000 Bonus).
- A paycheck that includes a portion the user thinks of as a **savings transfer**
  (e.g. $5,000 paycheck where $1,000 is a 401k contribution → savings category).
- A **refund** that lands as income but should net against the original expense
  category (e.g. a $200 Target refund split across `-$67 Groceries`, `-$133 Home`).

All three are currently blocked. The user has no workaround except recategorizing
the whole transaction into one bucket, which loses fidelity.

## Goals

- Splitting works for any transaction that's not pending, not already split, and
  not itself a split child — regardless of whether the amount is positive (expense)
  or negative (income).
- The split editor UX stays identical: user enters positive dollar amounts; the
  "Remaining" indicator counts down to zero against the parent's magnitude.
- Child transactions store with the parent's sign, so they continue to flow through
  budget/trends/cash-flow math correctly (income children stay income, expense
  children stay expense, refund children stay negative inside expense categories).
- No DB migration. No new columns. No schema change.

## Non-goals

- Lifting the **pending** block (data isn't trustworthy until posted).
- Lifting the **already-split parent** block (must unsplit first).
- Lifting the **split child** block (no nested splits).
- Allowing **signed** entries in the editor (positive only, like today).
- Allowing **mixed-sign children** within one split (each child inherits the
  parent's sign; the category determines display).

## Sign convention recap

Basil stores transactions with:

- **Positive `amount`** for expenses (money out)
- **Negative `amount`** for income (money in)

This is internal — the user never enters or sees signed amounts; the UI handles
display via category type and `formatSignedDollar`. The split editor follows the
same convention: positive entries in, positive entries out, and the system applies
the parent's sign at persistence time.

## Approach

### What's changing

The income block is enforced in three places. Each loses its `amount < 0` check
and gains sign-aware math:

| Layer | File | Change |
|---|---|---|
| Mobile UI gate | `mobile/src/components/splitHelpers.ts` | Drop `if (txn.amount < 0) return false` in `canSplit`. Change `splitRemaining` to use `Math.abs(parentAmount)`. |
| Web UI gate | `frontend/src/components/DialogComponent.vue` | Drop `if (this.item.amount < 0) return false` in `canSplit`. Change `splitRemaining` computed to use `Math.abs(this.item.amount)`. |
| Backend route | `api.js` `/api/split` | Drop the explicit "Cannot split income transactions" reject. Validation becomes `Math.abs(splitSum - Math.abs(parent.amount)) > 0.01`. Before calling `insertSplitChildren`, sign each split: `splits.map(s => ({ ...s, amount: s.amount * Math.sign(parent.amount) }))`. |

`insertSplitChildren`, `deleteSplitChildren`, and `findSplitChildren` in
`db/database.js` need **no changes** — they're already sign-agnostic. The route
pre-signs the splits before handing them off.

### Why sign-aware math works

`splitRemaining` today is `parentAmount - sum(rows)`. For an expense parent
(+$50) and entries $30 + $20, this evaluates to `50 - 50 = 0` and the editor
accepts. If we lifted the income block without changing the math, an income
parent (-$1,000) with entries $600 + $400 would evaluate to `-1000 - 1000 =
-2000` and the editor would refuse to save.

Changing one term — `parentAmount` → `Math.abs(parentAmount)` — fixes the
income case without touching the expense case (since `abs(+50) === +50`). Same
single-term change in the backend's `splitSum - parent.amount` check.

### Why child-sign-from-parent works

`freeCashFlow` (`shared/budgetMath.js`) sums raw amounts **per category** first,
then takes `Math.abs` of each category total before bucketing by category type
(income / expense / savings). This means:

- Paycheck split into Salary + Bonus → both children stored at negative amounts,
  both in income-type categories. Each category's `abs(sum)` adds to `income`. ✓
- Paycheck split with a savings portion → child in savings category, negative
  amount. `abs(sum)` adds to `savings`. ✓
- Target refund split across Groceries + Home → children stored at negative
  amounts in expense-type categories. The negative amounts net **inside** those
  category sums (offsetting prior positive spend) before `abs` is taken. So
  Groceries' visible spend drops by the refund amount. ✓

This is why the simple `amount * Math.sign(parent.amount)` rule is enough. We
don't need per-child sign logic; we don't need the editor to know about category
types.

## Test plan

Following the TDD convention used elsewhere in the codebase. Each test gets
written and watched failing first, then made to pass.

### Mobile (`mobile/src/components/splitHelpers.test.ts`)

- **Replace** `'returns false for income (amount < 0)'` → `'returns true for income (amount < 0)'` and update the assertion. Pending / parent / child / zero cases stay as-is.
- **Add** to the `splitRemaining` describe: `'balances against abs(parent) for negative parent'` — parent `-1000`, rows `[600, 400]` → remaining `0`.
- **Add** to the `splitValid` describe: `'is valid for negative parent when splits sum to magnitude'` — parent `-1000`, rows `[{amount: 600, categoryName: 'Salary'}, {amount: 400, categoryName: 'Bonus'}]` → `true`.

### Backend (likely a new test file or extend the existing `/api/split` tests; verify path during implementation)

- **Add** `'splits an income parent into negatively-signed children'` — POST `/api/split` with parent amount `-1000`, splits `[600 Salary, 400 Bonus]`. Expect 200, parent updated `is_split_parent = true`, two children both with negative amounts (-600, -400), each linked by `parent_transaction_id`.
- **Add** `'rejects when splits do not sum to abs(parent) for income'` — parent `-1000`, splits `[600, 300]` → 400 with message that references abs.
- **Keep** `'rejects pending'` and `'rejects a split child'` and `'rejects an already-split parent'`.
- **Remove** the existing `'rejects income (amount < 0)'` test (the behavior it's locking in is going away).
- **Add** `'unsplits an income parent restores it cleanly'` — split an income parent, then call `/api/unsplit`, parent's `is_split_parent` returns to false, children deleted. `/api/unsplit` already works on any parent; this is a defense-in-depth check.

### Manual / device

- Web: tap an income transaction → confirm Split button is visible in the edit dialog → split it → verify trends/budget render correctly.
- Mobile: same, on TestFlight build. (Will roll into the next build cycle on `native-app-phase-0`.)
- Refund offset case: split a refund across two expense categories → confirm those categories' month spending drops by the refund portions in the Budget view.

## Risks & follow-ups

- **Risk: an edge case I haven't thought of in the cash-flow math.** Mitigation: the spot-check above of `freeCashFlow` covers the three documented use cases. If a different consumer of `transactions[].amount` exists that depends on sign-by-row rather than sum-by-category-then-abs, we'd see it in trends regression. Verification step in implementation: grep for direct readers of `txn.amount` in `shared/` + `frontend/src/utils/` + `mobile/src/budget/` and confirm none of them assume sign tracks the transaction type rather than the category type.
- **Risk: zero-amount transactions.** Parent with `amount === 0` would have `Math.sign(0) === 0`, meaning children would store with amount `0`. The existing positive-splits-required validation prevents this from being reachable (you can't have ≥2 positive splits sum to 0). The backend keeps a sanity check; no extra handling needed.
- **Follow-up (out of scope, not new):** the existing `DialogComponent` prop-reactivity tech debt (open thread in memory) means a reused dialog instance for back-to-back splits could show stale state. Workaround already in place via `:key=...transaction_id`. Not touched by this work.

## Out of scope

- Editing an existing split's amounts/categories without unsplit-then-resplit.
- A "Split rule" that auto-splits a recurring pattern (e.g. always split paychecks
  the same way). Interesting but unrelated.
- Showing aggregate parent stats alongside children in the transaction list.

## Acceptance

- All three layers drop the income block. All three layers compute against
  `abs(parent)`. Backend signs children from parent.
- Mobile `splitHelpers.test.ts` is updated and passes.
- Backend `/api/split` tests are updated and pass.
- Full suites pass: backend, mobile, frontend.
- Tested manually on web and on a TestFlight build with a real income
  transaction (paycheck) and a refund-style transaction.
