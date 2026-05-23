# Plaid → Teller Migration — Design

**Status:** Brainstorm complete, pending user review. All 7 sections drafted; Sections 1–6 user-approved. Section 4 amended 2026-05-23 (Teller's pending→posted model + cutover dedup), Section 3 clarified (free `development` environment), Section 7 (open questions / risks) written 2026-05-23. Bank coverage verified against Teller's institution API — design holds. Next: user reviews the spec, then `writing-plans`.

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

**Environment choice:** use Teller's **`development`** environment, not `production`. Per Teller's docs, `development` connects to real banks, returns real data, is **free**, and allows up to 100 bank logins — far more than a personal app needs. The environment is selected in the Teller Connect widget config (`VITE_TELLER_ENVIRONMENT`, Section 5); the client cert is identical for `development` and `production`, so `tellerClient.js` does **not** branch on environment. This deliberately drops Plaid's per-user `forUser(isAdmin)` sandbox-vs-production dual-client pattern — there is exactly one environment per deployment. (`TELLER_ENVIRONMENT` in the backend `.env` is retained only for logging/diagnostics; it does not affect request routing.) Sandbox is fake-data-only and needs no cert — used solely for Phase 1 local smoke tests.

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
    continue  // nothing changed for this connection — skip import + sweep
  }

  // Map Teller shape → internal transaction shape; normalize the institution
  // name so it matches the Plaid-era `account` string (see Section 7, R1).
  const mapped = allTxns.map(tellerToInternal)

  // Reuse the existing reconciliation importer (insertTransactions, db/database.js).
  // It matches on real-world identity (user_id, name, amount, date, account) and:
  //   • new transaction_id, no identity match    → INSERT
  //   • identity match, different transaction_id  → adopt the new id onto the
  //     existing row. This dedupes the cutover overlap (a posted txn re-arriving
  //     from Teller under a new id) AND pending→posted-with-new-id when
  //     amount/date are unchanged.
  //   • same transaction_id (ON CONFLICT)         → DO UPDATE SET pending, date
  //     so same-id pending→posted transitions update the existing row in place.
  await insertTransactions(mapped)

  // Pending-sweep: Teller has NO pending_transaction_id, and occasionally drops a
  // pending row entirely when it posts under a new id with changed amount/date
  // (which the identity match above won't catch). After a fully-successful pull,
  // delete this connection's pending rows that Teller no longer reports.
  const freshIds = allTxns.map(t => t.id)
  DELETE FROM transactions
   WHERE account_id IN (<this connection's account ids>)
     AND pending = true
     AND transaction_id <> ALL($freshIds)

  UPDATE bank_connections SET last_transactions_hash = $1 WHERE id = $2

  if teller returned 401/disconnected:
    UPDATE bank_connections SET error_code = 'disconnected', error_detected_at = now()
```

**Why reuse `insertTransactions` instead of a parallel batched upsert:** the importer already encapsulates the reconciliation we need, so the Teller path extends a proven abstraction rather than duplicating insert logic (architecture-first). It solves two problems Teller's data model forces on us:

1. **No pending→posted breadcrumb.** Teller does not provide Plaid's `pending_transaction_id`. Most of the time Teller keeps a *stable* `transaction_id` when a pending charge posts, so the `ON CONFLICT (transaction_id)` path simply flips `pending` (and refreshes `date`, which Teller shifts to the posting date). When Teller instead mints a *new* id on posting, the identity reconciliation adopts it if amount/date are unchanged; the pending-sweep cleans up the leftover when they aren't.
2. **Cutover overlap.** On switchover, Teller re-delivers ~90 days that already exist as Plaid-era rows under different ids. The identity reconciliation adopts the Teller ids onto those existing rows instead of creating duplicates — preserving their categories, tags, and manual overrides.

**Required change to `insertTransactions`:** extend its `ON CONFLICT (transaction_id)` clause from `DO NOTHING` to `DO UPDATE SET pending = EXCLUDED.pending, date = EXCLUDED.date`. This is a shared improvement (also correct for Plaid); verify it doesn't regress the Plaid path during the Phase 1 side-by-side window (Section 7, R5).

**Tradeoff accepted:** `insertTransactions` runs one reconciliation `SELECT` per transaction rather than a single batched upsert. At personal-app scale (~hundreds of rows on first sync, then the fingerprint early-exit skips unchanged connections entirely) the cost is negligible and only paid when data actually changes.

**Fingerprint fields:** `id + amount + date + status + description`. Covers every content change the rule engine reads. Sort before hashing for ordering stability. Residual risk: if Teller adds a new field and starts updating it on existing transactions, our hash won't detect that change. Mitigation: whenever we add a new field dependency in the app, add it to the fingerprint at the same time.

**Window limitation:** Teller returns ~90 days. If a user is dormant >90 days, gap is irreversible. Not a real concern for active use. Because each sync re-pulls the full window (no incremental cursor), we automatically satisfy Teller's guidance to re-scan 7–10 days beyond the last sync to catch transactions that shift dates when posting — those shifts are always inside the re-fetched window.

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
- Download the **development** cert + key (free, no Teller review) → place at `~/.teller/` locally and `/opt/basil/certs/` on the VPS. A production cert is **not** required for cutover (see Section 3, *Environment choice*); only request one if we ever outgrow the free 100-login `development` tier.
- Sandbox needs no cert — Phase 1 sandbox smoke tests run off the public `applicationId` alone.
- Coverage verified 2026-05-23 against Teller's institution API: **Chase ✅, Citizens ✅**; Citizens Access folds into the `citizens` login (manual-account fallback if it doesn't surface). Final confirmation happens at the first live Teller Connect login. *No off-ramp remaining — design holds.*

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
- SSH to VPS, place the **development** Teller cert + key at `/opt/basil/certs/` (`chmod 600`).
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

### Resolved during design

**Bank coverage (the off-ramp).** Verified 2026-05-23 against Teller's full institution list (7,008 institutions, pulled from `https://api.teller.io/institutions`):
- **Chase** — supported (`chase`), with `transactions` + `balance`.
- **Citizens** — supported (`citizens`), with `transactions` + `balance`. Teller lists the major Citizens Financial Group under the unqualified brand "Citizens" (same convention it uses for "Chase"); every other "Citizens *X*" in the list is an unrelated community bank with a state/town qualifier. High confidence — the only 100% confirmation is a live Teller Connect login (R2).
- **Citizens Access** — **no standalone Teller institution.** Citizens retired the separate "Citizens Access" online-savings brand and folded those accounts into the main Citizens login, so the account most likely surfaces under the `citizens` connection. If it doesn't, it falls back to the manual-account pattern already designed for Vanguard (R3). Either way the design does not pivot.
- **Vanguard** — confirmed absent, validating the existing "Vanguard → manual account" decision.

**Environments.** Use Teller's `development` environment — real banks, free, ≤100 logins (Section 3). No per-user sandbox/production switching. Sandbox is fake-data-only, used solely for Phase 1 local smoke tests.

**Rate limits.** Not publicly numbered; `development` shares production's limits; exceeding returns HTTP 429. Our 4-hour auto-sync cadence is far below any plausible ceiling. Standard back-off-and-retry if ever hit.

**Venmo enrichment.** Provider-agnostic. It runs as a manual CSV flow (`/venmoEnrichment/preview` + `/apply`) that matches rows already in the `transactions` table by amount/date + P2P detection. It never touches the sync path, so Teller-sourced rows enrich identically. No change needed.

**`account_id` mixed values.** Plaid-era rows keep Plaid account ids; Teller-era rows carry Teller account ids; both eras' `bank_accounts` rows are retained at cutover (frozen connections aren't deleted). A transaction's `account_id` only ever joins its own era's `bank_accounts` row, so the two id formats never need to be compared. No conflict.

**`sync_log`.** Schema is provider-neutral (`institution`, `added/modified/removed_count`, `synced_at`). Teller's full-window + ON-CONFLICT model naturally produces `added_count` but not meaningful `modified`/`removed` counts, so those will usually read 0 under Teller. Cosmetic only — no schema change.

**Pending→posted + cutover dedup.** Resolved by reusing `insertTransactions` reconciliation + a pending-sweep + the `ON CONFLICT … DO UPDATE` extension — see the amended Section 4.

### Risks carried into implementation

- **R1 — Institution-name normalization (medium).** Cutover dedup relies on the reconciliation matching the `account` (institution name) string. If Teller's name ("Chase", "Citizens") differs from whatever Plaid stamped on historical rows, the overlap won't dedupe and the user sees ~90 days of duplicates. *Mitigation:* in Phase 1, inspect the exact `account` strings on existing Plaid-era rows and map Teller's institution names to them inside `tellerToInternal`. Fallback: the existing admin dedupe tool as a one-time post-cutover cleanup.
- **R2 — "Citizens" identity unconfirmed until login (low).** Strong naming evidence, not certainty. *Mitigation:* confirmed the moment the user links Citizens via Teller Connect at cutover. No code depends on it.
- **R3 — Citizens Access reachability (low).** May or may not appear under the `citizens` connection. *Mitigation:* manual-account fallback already designed; decide at link time.
- **R4 — Pending-sweep over-deletion (low).** The sweep deletes pending rows Teller no longer reports; a transient partial/short response could wrongly delete a still-pending row (the next full sync re-adds it). *Mitigation:* only run the sweep when the API call for *every* account in the connection succeeded; scope the delete to that connection's accounts; never sweep when Teller returned an error for the connection.
- **R5 — `insertTransactions` ON CONFLICT change touches the Plaid path (low).** Changing `DO NOTHING` → `DO UPDATE` affects any remaining Plaid imports during the Phase 1 side-by-side window. *Mitigation:* the update (refresh `pending`/`date`) is also correct for Plaid; verify in side-by-side smoke testing before cutover.
- **R6 — Fingerprint blind spot (low, pre-existing).** If Teller starts updating a field we don't hash, the early-exit skips a real change. *Mitigation (unchanged):* add any newly-depended-on field to the fingerprint at the same time.
- **R7 — >90-day dormancy gap (very low).** Teller's ~90-day window means a multi-month dormant period can leave a permanent gap. Not a concern for active use.

### Open questions to confirm in-flight (non-blocking)

- **Production cert lead time.** Teller reviews production-cert requests (a day or two). We use `development` (no review, free), so this only matters if we outgrow the 100-login tier — not on the critical path. Phase 0's old "request production cert" step is dropped.
- **Vanguard manual-account timing.** Add before or after cutover — user's choice; `active = false` on historical connections has no effect on a `manual = true` row.
- **Archived-account display.** After cutover both frozen Plaid `bank_accounts` and new Teller `bank_accounts` exist (e.g., old Chase + new Chase). Decide whether the Accounts UI hides connection-inactive accounts or labels them "archived." Low effort; resolve during Phase 1 frontend work.

---

## Next session pickup

**Where we are (2026-05-23):** Section 7 written. Section 4 amended for Teller's pending→posted model + cutover dedup (reuse `insertTransactions` reconciliation + pending-sweep + `ON CONFLICT … DO UPDATE`). Section 3 clarified to use the free `development` environment. Coverage verified against Teller's institution API — design holds, no pivot.

**Remaining steps (in order):**
1. User reviews this spec (focus on the amended Section 4 + new Section 7).
2. Invoke `superpowers:writing-plans` to create the implementation plan.
3. Implementation happens in a separate session (per the user's workflow).

**Last off-ramp:** cleared via research. The only residual confirmation — that the `citizens` connection includes the Citizens Access savings account — happens at first live Teller Connect login, with a manual-account fallback if it doesn't surface.

**Branch state:** `main`, clean. Feature branch `teller-migration` not yet created — will be created at the start of Phase 1.
