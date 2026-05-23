# Plaid → Teller Migration — Design

**Status:** Brainstorm in progress. 6 of 7 sections drafted + user-approved. Section 7 (open questions / risks) pending. Spec self-review and user spec review also pending. See *Next session pickup* at the bottom.

**Why this migration:** Plaid billed $50 in March 2026. For a personal/small-user app, Plaid's per-Item pricing scales badly and is ~30–50× the cost of alternatives. Teller's Developer tier is free for up to 100 live connections, covering projected scale indefinitely.

---

## Decisions locked in

| Decision | Choice | Rationale |
|---|---|---|
| Replace Plaid? | Yes | Cost. |
| Keep auto-sync vs CSV-only? | **Keep auto-sync** | UX parity is non-negotiable. |
| Which provider? | **Teller.io** | Free tier ≤100 connections; polished OAuth-style Connect flow; modern API. |
| Vanguard (not covered by Teller)? | **Drop to manual account** | Only used for balance visibility; `bank_accounts.manual = true` already supported. |
| Projected scale | A (just me) → maybe B (small beta, ≤30 connections) | Stays inside Teller's free tier. |
| Historical Plaid transactions? | **Freeze and forward** (Option A) | Preserve all categorization work. Teller pulls forward from cutover. |
| Migration shape | **Approach 2: swap + semantic rename** | `plaid_items` → `bank_connections`, etc. Code stays honest. No abstraction layer (YAGNI). |
| Categorize new transactions from Teller's own category field? | **No** | Ignore Teller's categorization; rely on the existing rule engine. New rows land with `plaid_pfc` NULL and go to "To Sort" until rules fire. |
| Fingerprint early-exit on sync? | **Yes, in v1** | Hash stable fields of Teller's transaction response; skip all work when hash matches previous. |

---

## Section 1 — Architecture overview

**What changes:**
- Plaid → Teller as the bank aggregator.
- Auth model shifts from API-key + access-token → **mutual TLS (mTLS) client cert + per-enrollment access token**. Express loads an app-wide client cert/key and attaches to every outbound Teller request.
- Link flow shifts from Plaid Link (iframe) → **Teller Connect** (JS SDK). Connect's `onSuccess` returns `{ accessToken, enrollment, user }` directly — no `public_token → access_token` exchange step.
- Sync shifts from Plaid's cursor-based `/transactions/sync` (diffs) → Teller's `GET /accounts/:id/transactions` (full window, ~90 days, no cursor). Client-side dedupe via existing `transactions.transaction_id` UNIQUE constraint.
- Balance fetch: 1:1.

**What stays the same:**
- Categorization engine (simple rules, compound rules, manual overrides, triage flow).
- Vuex store shape (`accountBalances`, `itemErrors`, `lastSyncedAt` — already aggregator-neutral).
- `transactions` table structure (no renames needed — columns already neutral).
- `balance_snapshots` table (FK auto-follows the `plaid_items → bank_connections` rename).
- Venmo CSV enrichment (aggregator-independent).
- All historical Plaid-sourced transactions (kept intact; `active = false` on their parent connections).

**What's new:**
- `utils/tellerClient.js` — mTLS-aware HTTP helper.
- `utils/tellerTools.js` — `pullTellerTransactions()`, `fetchAndStoreBalances()` (renamed to be provider-agnostic name), `handleEnrollmentError()`.
- `bank-api.js` — replaces `plaid-api.js` (mounted at `/bank-api`).
- Teller cert files on disk (outside git), referenced via `TELLER_CERT_PATH` / `TELLER_KEY_PATH`.

**What's deleted (in cleanup phase):**
- `utils/plaidClient.js`, `utils/plaidTools.js`, `plaid-api.js`, `PlaidLinkHandler.vue`.
- `plaid` npm dep.
- `PLAID_*` env vars.

---

## Section 2 — DB schema changes

Single migration file: `db/migrations/010-teller-migration.sql`.

```sql
-- Drop cursor-based sync columns (Plaid-specific, unused by Teller)
ALTER TABLE plaid_items DROP COLUMN next_cursor;
ALTER TABLE plaid_items DROP COLUMN prev_cursor;

-- Mark whether a connection is syncable (inactive = frozen legacy)
ALTER TABLE plaid_items ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

-- Fingerprint for sync early-exit (see Section 4)
ALTER TABLE plaid_items ADD COLUMN last_transactions_hash TEXT;

-- Replace strict unique constraint with a partial index
-- (allows historical inactive row + new active row for the same institution)
ALTER TABLE plaid_items DROP CONSTRAINT plaid_items_user_id_institution_key;
CREATE UNIQUE INDEX bank_connections_user_institution_active_uk
  ON plaid_items (user_id, institution) WHERE active = true;

-- Semantic rename
ALTER TABLE plaid_items RENAME TO bank_connections;
ALTER TABLE plaid_accounts RENAME TO bank_accounts;
-- (Postgres auto-updates FK references on balance_snapshots.item_id)

-- On cutover: freeze all existing Plaid-era connections (no more sync attempts)
UPDATE bank_connections SET active = false;
```

**Not changed:**
- `transactions` — column names (`transaction_id`, `account_id`, `merchant_name`, `pending`, `account`, `pending_transaction_id`) are already provider-neutral. `plaid_pfc` and `plaid_pfc_detail` kept as-is on historical rows; NULL on new Teller rows.
- `categories.plaid_pfc` — kept, still used for historical rows.
- `sync_log`, `users`, `simple_rules`, `compound_rules`, `tags`, `transaction_tags` — untouched.

**Not added:**
- No `provider` column on `bank_connections`. YAGNI — all new rows are Teller; all inactive rows are historical.

---

## Section 3 — Backend: Teller client + link flow

**New: `utils/tellerClient.js`**

mTLS means every API call ships the app's client cert + key. Teller uses HTTP Basic auth with the user's access token as the username (empty password).

```js
const https = require('https');
const fs = require('fs');

const agent = new https.Agent({
  cert: fs.readFileSync(process.env.TELLER_CERT_PATH),
  key: fs.readFileSync(process.env.TELLER_KEY_PATH),
});

function client(accessToken) {
  const headers = {
    Authorization: 'Basic ' + Buffer.from(`${accessToken}:`).toString('base64'),
    Accept: 'application/json',
  };
  return {
    getAccounts: () => fetch('https://api.teller.io/accounts', { agent, headers }).then(r => r.json()),
    getTransactions: (acctId, fromId) => { /* paginated */ },
    getBalance: (acctId) => { /* ... */ },
  };
}

module.exports = { client };
```

**New: `bank-api.js`** (replaces `plaid-api.js`, mounted at `/bank-api`)

| Old Plaid route | New Teller route | Notes |
|---|---|---|
| `GET /plaid-api/create_link_token` | **gone** | Connect uses a public `applicationId`; no server round-trip needed. |
| `POST /plaid-api/exchange_public_token` | `POST /bank-api/store_enrollment` | Frontend passes `{ accessToken, enrollment, user }` from Connect's `onSuccess`. Server inserts `bank_connections` row + fetches accounts. |
| `GET /plaid-api/create_update_link_token` | **gone** | Connect handles reconnect via an `enrollmentId` param. |
| `POST /plaid-api/clear_item_error` | `POST /bank-api/clear_connection_error` | Renamed for clarity. |
| `POST /plaid-api/remove_account` | `POST /bank-api/remove_account` | Same logic. |
| `POST /plaid-api/sandbox_reset_login` | deferred | Port later if we need the dev flow. |

**Env vars added to `.env`:**
- `TELLER_APPLICATION_ID` — public
- `TELLER_ENVIRONMENT` — `sandbox` | `development` | `production`
- `TELLER_CERT_PATH` — absolute path to client cert PEM
- `TELLER_KEY_PATH` — absolute path to private key PEM

**Env vars removed:** `PLAID_SANDBOX_CLIENT_ID`, `PLAID_SANDBOX_SECRET`, `PLAID_PRODUCTION_CLIENT_ID`, `PLAID_PRODUCTION_SECRET`.

**Cert deployment:** one-time manual placement on the VPS at `/opt/basil/certs/` (`chmod 600`). This is the documented exception to the "never scp to prod" rule — certs are secrets that don't belong in git. `.env` references the path. Normal CI/CD handles everything else going forward.

**`index.js`:** remove `/plaid-api` mount + require; add `/bank-api` mount.
**`frontend/vite.config.js`:** remove `/plaid-api` proxy; add `/bank-api` proxy to `:3000`.

---

## Section 4 — Backend: sync flow

**New: `utils/tellerTools.js`** (replaces `utils/plaidTools.js`)

### `pullTellerTransactions(user_id)`

```
for each bank_connection where active = true and user_id = $1:

  allTxns = []
  accounts = tellerClient(connection.access_token).getAccounts()
  upsert into bank_accounts

  for each account:
    txns = tellerClient.getTransactions(account.id)
    allTxns.push(...txns)

  // Fingerprint early-exit
  const canonical = allTxns
    .map(t => [t.id, t.amount, t.date, t.status, t.description].join('|'))
    .sort()
    .join('\n')
  const hash = sha256(canonical)

  if (hash === connection.last_transactions_hash) {
    continue  // nothing changed for this connection — skip upsert
  }

  // Batched upsert
  INSERT INTO transactions (...) VALUES (... many rows ...)
    ON CONFLICT (transaction_id) DO UPDATE SET pending = EXCLUDED.pending
  // pending→posted transitions work via DO UPDATE on pending flag

  UPDATE bank_connections SET last_transactions_hash = $1 WHERE id = $2

  if teller returned 401/disconnected:
    UPDATE bank_connections SET error_code = 'disconnected', error_detected_at = now()
```

**Why ON CONFLICT DO UPDATE (on pending only):** `transactions.transaction_id` is already UNIQUE. Teller's IDs are stable strings. First sync inserts everything; subsequent syncs conflict and skip. The one exception is pending→posted — Teller sometimes changes the `transaction_id` when a pending transaction posts, so we also rely on the existing `pending_transaction_id` reconciliation logic (already in place for Plaid's same behavior).

**Fingerprint fields:** `id + amount + date + status + description`. Covers every content change the rule engine reads. Sort before hashing for ordering stability. Residual risk: if Teller adds a new field and starts updating it on existing transactions, our hash won't detect that change. Mitigation: whenever we add a new field dependency in the app, add it to the fingerprint at the same time.

**Window limitation:** Teller returns ~90 days. If a user is dormant >90 days, gap is irreversible. Not a real concern for active use.

### `fetchAndStoreBalances(user_id)`

```
for each active bank_connection:
  for each bank_account:
    balance = tellerClient.getBalance(account.id)
    UPDATE bank_accounts SET balance = ..., available = ..., balance_fetched_at = now()

  net = sum(balances for this connection)
  INSERT INTO balance_snapshots (item_id, date, net)
    VALUES (connection.id, CURRENT_DATE, net)
    ON CONFLICT (item_id, date) DO UPDATE SET net = EXCLUDED.net
```

Logic identical to current Plaid implementation — just swap the API call.

### `api.js` changes

```js
// Before
const { getNewPlaidTransactions, fetchAndStoreBalances } = require('./utils/plaidTools');
// After
const { pullTellerTransactions, fetchAndStoreBalances } = require('./utils/tellerTools');
```

`POST /sync` and `POST /sync/balances` keep their external contracts. Frontend doesn't change.

### Categorization

New rows: `plaid_pfc = NULL`, `plaid_pfc_detail = NULL`. Rule engine handles everything. Unmatched transactions → "To Sort" → triage flow → rule creation → future matches auto-categorize. Same UX as today, with temporary friction for new merchants until rules build up.

Historical rows: keep their Plaid PFC data and continue working via the existing `categoryMapping.js` fallback.

---

## Section 5 — Frontend: Teller Connect + API layer

**New: `frontend/src/components/BankLinkHandler.vue`** (replaces `PlaidLinkHandler.vue`)

Teller Connect loads via a script tag from Teller's CDN. Wrapper component:

```js
onMounted(async () => {
  await loadScript('https://cdn.teller.io/connect/connect.js')
  tellerConnect = TellerConnect.setup({
    applicationId: import.meta.env.VITE_TELLER_APPLICATION_ID,
    environment: import.meta.env.VITE_TELLER_ENVIRONMENT,
    products: ['transactions', 'balance'],
    enrollmentId: props.reconnectEnrollmentId,  // optional — reconnect mode if set
    onSuccess: async (enrollment) => {
      await storeEnrollment(enrollment)
      emit('bank-link-success', enrollment)
    },
    onExit: () => emit('bank-link-exit'),
  })
})

function open() { tellerConnect.open() }
defineExpose({ open })
```

**Key differences from Plaid Link:**
- No pre-open server round-trip (Connect initializes from public `applicationId`).
- No `public_token → access_token` exchange (Connect returns access token directly to browser; we forward to server).
- Reconnect built in (pass `enrollmentId`).

**`frontend/src/api.js` changes:**

| Old helper | New helper | New endpoint |
|---|---|---|
| `getOrAddUserAccount(publicToken, institution)` | `storeEnrollment(enrollment)` | `POST /bank-api/store_enrollment` |
| `clearItemError(itemId)` | `clearConnectionError(connectionId)` | `POST /bank-api/clear_connection_error` |
| `removeAccount(itemId)` | `removeAccount(connectionId)` | `POST /bank-api/remove_account` |
| `createUpdateLinkToken(itemId)` | **deleted** | — |
| `triggerSync()` | unchanged | `POST /api/sync` |

**`AccountsView.vue`:** swap `<PlaidLinkHandler>` → `<BankLinkHandler ref="linker">`. Link button calls `linker.value.open()`. Reconnect button calls `open()` with `reconnectEnrollmentId` prop. Error copy reworded.

**`OnboardingView.vue`:** same swap, copy cleanup.

**New env vars (`frontend/.env`):**
- `VITE_TELLER_APPLICATION_ID`
- `VITE_TELLER_ENVIRONMENT`

**Deleted:** `PlaidLinkHandler.vue`, any `plaid-link`-style npm dep.

**Vuex store:** no changes — state names already aggregator-neutral.

---

## Section 6 — Migration & cutover plan

### Phase 0 — Prerequisites

- Sign up at teller.io → get `applicationId`.
- Download sandbox cert + key → place at `~/.teller/`.
- **Request production cert** — triggers Teller's review (takes a day or two). Start this early.
- Verify Chase, Citizens, Citizens Access all show as supported in the Teller dashboard. *Last off-ramp before writing code.*

### Phase 1 — Build on feature branch `teller-migration`

1. Write + run `db/migrations/010-teller-migration.sql` against local DB.
2. Backend: `utils/tellerClient.js`, `utils/tellerTools.js`, `bank-api.js`. Mount `bank-api` **alongside** existing `plaid-api` locally for side-by-side testing.
3. Frontend: `BankLinkHandler.vue`, `api.js` helpers, wire into `AccountsView.vue` and `OnboardingView.vue`.
4. Local smoke test with sandbox:
   - Link a sandbox bank via Teller Connect
   - `POST /api/sync` → confirm transactions appear
   - `POST /api/sync/balances` → confirm balance snapshot row
   - Run sync twice → confirm fingerprint short-circuit on the second call
   - Invalidate an enrollment → confirm error surface and reconnect UI

### Phase 2 — Cutover (merge day)

Pre-merge:
- SSH to VPS, place production Teller cert at `/opt/basil/certs/` (`chmod 600`).
- Update `/opt/basil/app/.env` with `TELLER_*` vars. Leave `PLAID_*` vars in place for safety.

Merge PR → GitHub Actions:
1. Tests pass
2. Deploy pulls code
3. Runs migration 010 (**this is the moment of cutover** — all historical connections flip to `active = false`)
4. PM2 restarts

Immediately after:
- Link Chase, Citizens, Citizens Access via Teller Connect (creates new active `bank_connections` rows)
- Tap Sync → verify transactions appear
- Tap Sync again → verify fingerprint skip
- Verify balance snapshot chart (historical + new data both present)

### Phase 3 — Cleanup (follow-up PR, 1–2 weeks later)

After Teller proves stable:
- Delete `utils/plaidClient.js`, `utils/plaidTools.js`, `plaid-api.js`, `PlaidLinkHandler.vue`.
- Remove `plaid` from `package.json`.
- Remove `PLAID_*` env vars from `.env.example` and `/opt/basil/app/.env`.
- Remove `/plaid-api` mount from `index.js`.
- Remove `/plaid-api` proxy from `vite.config.js`.

Keeping cleanup separate means the first weeks have a trivial rollback path.

### Rollback plan

- **Code:** revert PR → Actions redeploys previous commit → Plaid path is live again.
- **DB:** `UPDATE bank_connections SET active = true` re-enables historical rows. Reverse rename if needed.
- **Data:** never touched. Zero risk of data loss at any step.

### Not in scope

- Aggregator abstraction layer (Approach 3, rejected).
- Changes to `categoryMapping.js` or rule engine.
- Port of `/plaid-api/sandbox_reset_login` (use Teller sandbox's own disconnect simulation).
- New automated tests for Teller (existing suite doesn't cover Plaid either; separate effort).

---

## Section 7 — Open questions & risks

**TO BE WRITTEN in next session.** Candidate items to cover:

- Teller sandbox vs development vs production environments — when do we use which? Does dev admin use sandbox like the current Plaid setup (`forUser(isAdmin)` in `plaidClient.js`)?
- `account_id` column on `transactions`: today it holds Plaid's account_id. After cutover, new rows hold Teller's account_id. Mixed values in the same column — any code that joins `transactions.account_id` against `bank_accounts.account_id` needs to understand both ID formats coexist. (Likely fine since they never need to compare across eras, but confirm.)
- `pending_transaction_id` handling: Teller's pending→posted model differs from Plaid's. Need to verify the existing reconciliation logic in `insertTransactions` handles Teller correctly.
- Venmo enrichment interaction: enrichment runs after transactions land. Works on Teller-sourced rows the same way?
- Sync log — `sync_log` table tracks sync timing. Anything Plaid-specific in its columns?
- Historical `bank_accounts` rows with `manual = false` and inactive parent connection: do we ever show these in the UI? If so, what do we say (e.g., "archived")?
- The Vanguard manual account: does the user set it up before or after cutover? Does `active = false` on historical connections affect the `manual = true` Vanguard row we're adding?
- Teller rate limits for balance refresh — what's the actual ceiling, and does our current "sync every 4 hours" policy need adjustment?

---

## Next session pickup

**Where we stopped:** end of Section 6. User approved sections 1–6.

**Remaining steps (in order):**
1. Complete Section 7 (open questions + risks) — draft candidate list above; needs review and additions.
2. Spec self-review (scan for placeholders, contradictions, ambiguity, scope).
3. User reviews the committed spec.
4. Invoke `superpowers:writing-plans` to create the implementation plan.
5. Implementation happens in a separate session (per the user's workflow).

**Open action before resuming:** user should sign up at teller.io and verify Chase + Citizens + Citizens Access coverage on the Teller dashboard. This is the last off-ramp — if coverage is gapped, the whole design pivots.

**Branch state at pause:** `main`, clean. Feature branch `teller-migration` not yet created — will be created at the start of Phase 1.
