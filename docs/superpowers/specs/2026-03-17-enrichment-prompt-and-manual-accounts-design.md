# Pre-Triage Venmo Enrichment Prompt + Manual Accounts

**Date:** 2026-03-17
**Status:** Draft

---

## Feature 1: Pre-Triage Venmo Enrichment Prompt

### Problem

When users open the triage flow to sort unsorted transactions, P2P transactions
(Venmo, PayPal, Cash App) show up as generic entries with no counterparty name or
note. The Venmo CSV import exists but is only surfaced *after* triage completes
(post-triage nudge) or via the hamburger menu. Users sort blind, then learn they
could have enriched first.

### Design

Add a skippable prompt as the first screen of the triage flow, before the first
transaction card appears.

**Trigger condition:** `openTriageFlow()` checks whether any unsorted transactions
are unenriched P2P (reuses existing `isUnenrichedP2P()` helper from BudgetView).
If count > 0, show the prompt. If 0, go straight to the first triage card.

**Prompt UI:** Rendered inside the existing triage `BasilTray` bottom sheet — not a
separate dialog. Same visual language as the triage cards (centered content, action
buttons at bottom).

Contents:
- Icon: `upload_file` or similar
- Heading: "Add Venmo details before sorting?"
- Body: "You have **N** Venmo transactions without names or notes. Importing a CSV
  will make them easier to categorize."
- Primary button: **Import CSV** — closes triage sheet, opens existing
  `VenmoEnrichmentDialog`. On dialog close, re-opens triage flow (enriched data
  now visible on cards).
- Secondary button: **Skip** — advances to the first triage card immediately.

**State tracking:** A local boolean `enrichmentOffered` in BudgetView `data()`.
Set to `true` after the prompt is shown or skipped. The post-triage nudge checks
this flag: if `enrichmentOffered === true`, suppress the nudge (user already had
the chance). If `false` (triage opened with no unenriched P2P), the nudge can
still appear if P2P transactions were sorted.

**Re-opening behavior:** If triage is closed and re-opened in the same session,
the prompt shows again (reset in `openTriageFlow`). This is fine — user may have
imported the CSV in between.

### Files changed

| File | Change |
|------|--------|
| `BudgetView.vue` template (triage dialog section) | Add conditional prompt screen before first card |
| `BudgetView.vue` data | Add `enrichmentOffered` boolean |
| `BudgetView.vue` methods (`openTriageFlow`) | Compute unenriched P2P count, set initial triage state |
| `BudgetView.vue` template (post-triage nudge) | Gate on `!enrichmentOffered` |

### What stays the same

- `VenmoEnrichmentDialog` — no changes, opened as-is
- `isUnenrichedP2P()` helper — already exists, reused
- Hamburger menu entry — stays as a fallback entry point
- Backend routes — no changes

---

## Feature 2: Manual Accounts

### Problem

When a user tries to link an institution that Plaid doesn't support (credit unions,
brokerages, international banks), they hit a dead end. These accounts can't
participate in net worth tracking at all. Users want their full financial picture
even if some accounts can't auto-sync.

### Design

Allow users to create manual accounts that appear alongside Plaid-linked accounts
in AccountsView. Manual accounts contribute to net worth and balance snapshots but
have no transaction feed and require the user to update the balance themselves.

#### Schema: no new columns, one constraint change

Manual accounts use the existing `plaid_items` and `plaid_accounts` tables:

- **`plaid_items`**: row with `access_token = NULL`. This is the manual signal.
  `institution` holds the user-entered name. All other Plaid-specific fields
  (`cursor`, `error_code`, etc.) remain null.
- **`plaid_accounts`**: normal row under that item. `account_id` is a server-generated
  UUID stored as text (matching Plaid's text `account_id` convention). `name`, `type`,
  `subtype`, `balance` are user-provided. `mask` is null.

**Required migration:** `access_token` is currently `TEXT NOT NULL` on `plaid_items`.
A migration is needed to drop the NOT NULL constraint:
```sql
ALTER TABLE plaid_items ALTER COLUMN access_token DROP NOT NULL;
```

The `access_token IS NULL` convention distinguishes manual from Plaid-linked items
across all code paths.

**Institution name collisions:** `plaid_items` has a `UNIQUE(user_id, institution)`
constraint. If a user manually adds "Chase" and later links Chase via Plaid, the
Plaid insert would fail. Handle this by checking for duplicates before insert and
returning a clear error ("An account with this institution name already exists").

#### Adding a manual account

**Entry point:** AccountsView, below the "Link Account" (Plaid) button. A secondary
"Add manually" text button or link.

**Form:** Opens a `BasilTray` bottom sheet with:
- Institution name (text input, required)
- Account name (text input, required — e.g. "Brokerage", "Checking")
- Account type (select: depository / credit / loan / investment)
- Current balance (number input, required)

**On save (backend):**
1. Insert `plaid_items` row: `{ user_id, institution, access_token: NULL }`
2. Insert `plaid_accounts` row: `{ item_id, account_id: generated UUID, name, type, balance }`
3. Upsert balance snapshot for today (reuses `upsertBalanceSnapshot`)
4. Return the new item + account data

**On save (frontend):**
- Commit store mutations to add the new institution and account to display
- Net worth recalculates automatically (existing computed property)

#### Displaying manual accounts

Manual accounts appear in AccountsView grouped by institution, same as Plaid
accounts. Differences:

- **"Manual" badge** — subtle chip next to institution name (like the "Needs
  reconnect" chip but informational, not warning)
- **No sync spinner** — sync flow skips `access_token = NULL` items
- **No "Reconnect" button** — no Plaid errors possible
- **"Edit" button instead** — opens the edit balance sheet (see below)
- **Last updated timestamp** — shows `fetched_at` from the most recent balance
  snapshot, labeled "Last updated" (not "Last synced")

#### Updating balance

Tapping a manual account (or its edit button) opens a `BasilTray` sheet:
- Current balance (pre-filled, editable)
- Account name (pre-filled, editable)
- Save button

**On save:**
1. Update `plaid_accounts` row (balance, name if changed)
2. Upsert balance snapshot for today
3. Frontend store updates, net worth recalculates

#### Removing a manual account

Uses the existing account removal flow. Deleting the `plaid_items` row cascades
to `plaid_accounts` and `balance_snapshots` via foreign key constraints.

#### Safety: code paths that must skip manual items

| Code path | Current behavior | Manual-safe? |
|-----------|-----------------|--------------|
| `fetchAndStoreBalances()` | `if (!accessToken) continue` | Yes, already skips |
| `getNewPlaidTransactions()` | No null-token guard — passes all items to Plaid API | **Needs fix**: add `if (!token) continue` guard in the sync loop |
| `getCachedBalances()` | Iterates all items, returns cached account data | Yes, works correctly — manual accounts should appear in cached balances |
| Reconnect flow | Only shown for items with `errorCode` | Yes, manual items have no errors |
| Account removal | Deletes `plaid_items` row, cascades | Yes, works as-is |
| Balance display (AccountsView) | Groups by institution from store | Yes, works as-is |
| Net worth calculation | Sums all account balances | Yes, includes manual accounts correctly |
| Balance snapshots | Per-item snapshots aggregated by date | Yes, manual snapshots participate |

### Files changed

| File | Change |
|------|--------|
| `db/migrations/003-manual-accounts.sql` | `ALTER TABLE plaid_items ALTER COLUMN access_token DROP NOT NULL` |
| `api.js` (or `plaid-api.js`) | New route: `POST /api/manualAccount` (create), `PUT /api/manualAccount/:id` (update balance) |
| `db/database.js` | Helpers: `insertManualItem`, `updateManualAccountBalance` (thin wrappers around existing insert/update patterns) |
| `utils/plaidTools.js` (`getNewPlaidTransactions`) | Add `if (!token) continue` guard to skip manual items in sync loop |
| `frontend/src/api.js` | Fetch wrappers for new routes |
| `frontend/src/views/AccountsView.vue` | "Add manually" button, manual account form sheet, edit balance sheet, "Manual" badge, conditional UI (hide reconnect/sync for manual) |
| `frontend/src/store.js` | Mutation to add a new account/item to store state |

### What stays the same

- `plaid_items` / `plaid_accounts` / `balance_snapshots` schema — no new columns (one constraint change)
- `fetchAndStoreBalances()` — no changes needed
- `PlaidLinkHandler.vue` — untouched
- Net worth computed property — works without changes
- Snapshot aggregation — works without changes

---

## Out of scope

- Recurring merchants visibility sheet (scrapped)
- Multi-provider P2P import (future — only Venmo supported)
- Manual transaction entry for manual accounts (manual accounts are balance-only)
- Plaid institution-not-supported detection (nice-to-have but not required for
  manual accounts to be useful — the "Add manually" button is always available)
