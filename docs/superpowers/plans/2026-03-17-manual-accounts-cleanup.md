# Manual Accounts Cleanup Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile `!mask && !official_name` heuristic for identifying manual accounts with an explicit `manual` boolean column on `plaid_accounts`.

**Architecture:** Add a `manual BOOLEAN DEFAULT false` column to `plaid_accounts`. Set it `true` on insert for manually-created accounts. All manual-account checks (backend routes, frontend display, sync logic) use this column instead of inferring from nullable fields. The `manual` flag on `plaid_items` (derived from `access_token IS NULL`) stays — it identifies manual *institutions*. The new column identifies manual *accounts*, which matters when a manual account is added under a Plaid-linked institution.

**Tech Stack:** Postgres migration, Express routes (api.js), Vue 3 frontend (AccountsView.vue), plaidTools.js

---

## Current problems this plan fixes

1. **Heuristic fragility:** `!mask && !official_name` could misidentify a Plaid account from an institution that doesn't return those fields.
2. **Scattered inference:** The `manual` flag is computed differently in 3 places: `database.js` (findPlaidItems), `plaidTools.js` (fetchAndStoreBalances, toManualBalance), and implicitly in the PUT/DELETE routes (mask/official_name check). A column makes it one source of truth.
3. **Route inconsistency:** PUT and DELETE routes do a join + heuristic check. With a column, it's `WHERE account_id = $1 AND manual = true AND user_id = $2`.

## Files affected

| File | Change |
|------|--------|
| `db/migrations/004-manual-accounts.sql` | Add `manual BOOLEAN DEFAULT false` column |
| `api.js` | POST sets `manual = true` on insert; PUT/DELETE check `manual = true` instead of mask/official_name heuristic |
| `db/database.js` (`findPlaidItems`) | Remove `!a.mask && !a.officialName` heuristic, use `a.manual` directly |
| `utils/plaidTools.js` (`toManualBalance`, `fetchAndStoreBalances`) | Remove manual flag injection — it comes from the DB now |
| `frontend/src/views/AccountsView.vue` | No changes needed — already consumes `acct.manual` from the balance objects |
| `frontend/src/api.js` | No changes needed |

---

### Task 1: Migration — add `manual` column

**Files:**
- Modify: `db/migrations/004-manual-accounts.sql`

- [ ] **Step 1: Update migration file**

Add after the existing `DROP NOT NULL` statement:

```sql
-- Explicit manual flag for manually-created accounts
ALTER TABLE plaid_accounts ADD COLUMN IF NOT EXISTS manual BOOLEAN DEFAULT false;
```

- [ ] **Step 2: Run migration locally**

Run: `psql -d basil -c "ALTER TABLE plaid_accounts ADD COLUMN IF NOT EXISTS manual BOOLEAN DEFAULT false;"`

Expected: `ALTER TABLE`

- [ ] **Step 3: Verify column exists**

Run: `psql -d basil -c "\d plaid_accounts" | grep manual`

Expected: `manual | boolean | | | false`

- [ ] **Step 4: Set manual=true on any existing manual accounts**

Manual accounts currently have no mask and no official_name and belong to items with no access_token. Backfill:

```sql
UPDATE plaid_accounts pa
SET manual = true
FROM plaid_items pi
WHERE pa.item_id = pi.id AND pi.access_token IS NULL;
```

For manual accounts under Plaid institutions (access_token is set), backfill based on the heuristic one last time:

```sql
UPDATE plaid_accounts
SET manual = true
WHERE mask IS NULL AND official_name IS NULL
  AND account_id NOT IN (
    SELECT account_id FROM plaid_accounts pa
    JOIN plaid_items pi ON pa.item_id = pi.id
    WHERE pi.access_token IS NOT NULL AND (pa.mask IS NOT NULL OR pa.official_name IS NOT NULL)
  );
```

Actually, this second query is too broad — it would catch new Plaid accounts that haven't fetched balances yet. Safer to skip it. Manual accounts under Plaid institutions were only just created in this session and we can backfill them explicitly if needed.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/004-manual-accounts.sql
git commit -m "migration: add manual boolean column to plaid_accounts"
```

---

### Task 2: Backend — use column instead of heuristic

**Files:**
- Modify: `api.js` (POST, PUT, DELETE manual account routes)

- [ ] **Step 1: POST route — set manual=true on insert**

Change the INSERT query in `POST /manualAccount` from:

```sql
INSERT INTO plaid_accounts (account_id, item_id, user_id, name, type, subtype, balance, balance_fetched_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
```

To:

```sql
INSERT INTO plaid_accounts (account_id, item_id, user_id, name, type, subtype, balance, balance_fetched_at, manual)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
```

- [ ] **Step 2: PUT route — replace heuristic with column check**

Change the verification query in `PUT /manualAccount/:accountId` from:

```sql
SELECT pa.account_id, pa.item_id, pa.mask, pa.official_name, pi.access_token AS "accessToken"
FROM plaid_accounts pa JOIN plaid_items pi ON pa.item_id = pi.id
WHERE pa.account_id = $1 AND pa.user_id = $2
```

To:

```sql
SELECT pa.account_id, pa.item_id, pa.manual
FROM plaid_accounts pa
WHERE pa.account_id = $1 AND pa.user_id = $2
```

And change the guard from:

```js
if (rows[0].accessToken && (rows[0].mask || rows[0].official_name)) {
```

To:

```js
if (!rows[0].manual) {
```

The `itemId` is still needed for `recomputeItemSnapshot`, so keep `pa.item_id` in the SELECT.

- [ ] **Step 3: DELETE route — same pattern**

Change the verification query in `DELETE /manualAccount/:accountId` from the join query to:

```sql
SELECT pa.account_id, pa.item_id, pa.manual, pi.access_token AS "accessToken"
FROM plaid_accounts pa JOIN plaid_items pi ON pa.item_id = pi.id
WHERE pa.account_id = $1 AND pa.user_id = $2
```

Keep the join because we still need `accessToken` to decide whether to clean up the `plaid_items` row on last-account deletion.

Change the guard from:

```js
if (accessToken && (mask || official_name)) {
```

To:

```js
if (!rows[0].manual) {
```

Remove `mask` and `official_name` from the destructured variables at line 1112 — they're no longer needed for the guard.

- [ ] **Step 4: POST route — include manual flag in response**

Change the account object in the POST response from:

```js
account: { accountId, name: accountName, type: accountType, balance, balanceFetchedAt: now },
```

To:

```js
account: { accountId, name: accountName, type: accountType, balance, balanceFetchedAt: now, manual: true },
```

- [ ] **Step 5: Run tests**

Run: `npm test` from root

Expected: 132 tests pass (no manual account tests exist yet — backend routes aren't tested)

- [ ] **Step 6: Commit**

```bash
git add api.js
git commit -m "refactor: use manual column instead of mask/official_name heuristic in routes"
```

---

### Task 3: Database helper — use column in findPlaidItems

**Files:**
- Modify: `db/database.js` (findPlaidItems balance mapping)

- [ ] **Step 1: Add `manual` to the plaid_accounts SELECT**

In `findPlaidItems`, the accounts query at ~line 671:

```sql
SELECT account_id AS "accountId", item_id AS "itemId",
       user_id AS "userId", name, official_name AS "officialName",
       mask, type, subtype, balance, available,
       "limit", balance_fetched_at AS "balanceFetchedAt"
FROM plaid_accounts WHERE item_id = ANY($1)
```

Add `manual` to the SELECT:

```sql
SELECT account_id AS "accountId", item_id AS "itemId",
       user_id AS "userId", name, official_name AS "officialName",
       mask, type, subtype, balance, available,
       "limit", balance_fetched_at AS "balanceFetchedAt", manual
FROM plaid_accounts WHERE item_id = ANY($1)
```

- [ ] **Step 2: Replace heuristic in balance mapping**

Change the balance object mapping from:

```js
...(isManualItem || (!a.mask && !a.officialName) ? { manual: true } : {}),
```

To:

```js
...(a.manual ? { manual: true } : {}),
```

Remove the `isManualItem` variable — the per-account `manual` column is now the source of truth.

- [ ] **Step 3: Run tests**

Run: `npm test` from root

Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add db/database.js
git commit -m "refactor: use manual column in findPlaidItems balance mapping"
```

---

### Task 4: plaidTools — remove manual flag injection

**Files:**
- Modify: `utils/plaidTools.js`

- [ ] **Step 1: Update toManualBalance**

The `toManualBalance` helper currently hardcodes `manual: true`. Change it to read from the account object:

```js
function toManualBalance(a) {
  return {
    account_id: a.accountId,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    current: a.balance,
    available: a.available,
    limit: a.limit,
    fetchedAt: a.balanceFetchedAt,
    manual: a.manual || false,
  };
}
```

This still works because `item.accounts` comes from `findPlaidItems`, which now includes the `manual` field from the DB.

- [ ] **Step 2: Update getCachedBalances**

In `getCachedBalances` (~line 285), the account mapping also needs the `manual` field. Add `manual: a.manual || false` to the returned object alongside the other fields.

- [ ] **Step 3: Update fetchAndStoreBalances error fallback**

In the `catch` block of `fetchAndStoreBalances` (~line 269), when Plaid errors occur and cached balances are returned, the mapping also drops the `manual` field. Add `manual: a.manual || false` to the fallback mapping.

- [ ] **Step 4: Run tests and build**

Run: `npm test && cd frontend && npm run build`

Expected: All tests pass, build succeeds

- [ ] **Step 5: Commit**

```bash
git add utils/plaidTools.js
git commit -m "refactor: read manual flag from DB in plaidTools instead of hardcoding"
```

---

### Task 5: Run prod migration

**Note:** This must complete before the code deploy reaches production. The `DEFAULT false` makes a brief race condition safe (no crash), but manual accounts would temporarily lose their `manual` flag until the backfill runs.

- [ ] **Step 1: Run migration on production**

```bash
ssh root@178.156.248.108 'docker exec -i basil-postgres-1 psql -U basil -d basil -c "ALTER TABLE plaid_accounts ADD COLUMN IF NOT EXISTS manual BOOLEAN DEFAULT false;"'
```

- [ ] **Step 2: Backfill existing manual accounts on prod**

```bash
ssh root@178.156.248.108 'docker exec -i basil-postgres-1 psql -U basil -d basil -c "UPDATE plaid_accounts pa SET manual = true FROM plaid_items pi WHERE pa.item_id = pi.id AND pi.access_token IS NULL;"'
```

- [ ] **Step 3: Verify**

```bash
ssh root@178.156.248.108 'docker exec -i basil-postgres-1 psql -U basil -d basil -c "SELECT account_id, name, manual FROM plaid_accounts WHERE manual = true;"'
```

Expected: Any manually-created accounts show `manual = true`

---

## What this does NOT change

- `plaid_items.access_token IS NULL` convention — still used to skip items in sync loops and identify manual institutions
- Frontend `AccountsView.vue` — already consumes `acct.manual` from the balance objects, no template changes needed
- `frontend/src/api.js` — route paths unchanged (already uses `:accountId`)
- `BudgetView.vue` — Venmo enrichment prompt is separate, no interaction
- `VenmoEnrichmentDialog.vue` — no interaction
