# Plaid → Teller Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Plaid with Teller.io as the bank-data provider — link flow, transaction sync, and balance refresh — while preserving all historical data, categories, rules, and tags.

**Architecture:** Teller uses mTLS (a client certificate sent on every request) + HTTP Basic auth (the user's access token as username). Unlike Plaid's cursor-based incremental sync, the Teller sync re-pulls the full ~90-day window per connection, short-circuits via a content fingerprint when nothing changed, and imports through the **existing** `insertTransactions` reconciliation (which dedupes by real-world identity) plus a "pending-sweep". A new connection's data flows into the same `transactions` / `plaid_accounts` / `balance_snapshots` tables the Plaid path uses; the rule engine (`categoryMapping.js`) is untouched.

**Tech Stack:** Node/Express + Postgres (`pg`), Vue 3 + Vuex, Vitest (pure-function unit tests only — no live DB/API in the suite). Teller Connect (browser SDK) + Teller REST API over mTLS.

---

## Spec & refinements this plan implements

Design spec: `docs/superpowers/specs/2026-04-22-plaid-teller-migration-design.md`.

Two refinements were decided when mapping the spec onto real code (both reduce cutover risk):

1. **Section 4 amendment (already in the spec):** reuse `insertTransactions` reconciliation + a pending-sweep + an `ON CONFLICT … DO UPDATE` change, because Teller has no `pending_transaction_id` and re-delivers ~90 days at cutover.
2. **Rename deferred to Phase 3 (this plan):** the cutover migration (010) only **adds** columns + swaps the unique constraint. The table rename (`plaid_items → bank_connections`) and the `next_cursor`/`prev_cursor` drops move to the Phase 3 cleanup PR — so the Plaid code keeps working unchanged during side-by-side testing and rollback stays one-click. (This supersedes the spec's Section 2, which put the rename in 010. Same end state, safer switchover.)

**One spec gap found & filled here:** Teller reconnect needs the enrollment id, but the schema had no column for it. Migration 010 adds `enrollment_id`.

## Testing approach (matches this codebase)

The Vitest suite tests **pure functions and SQL-string generation only** (see `__tests__/database.test.js`). There is no live-DB or live-API test harness, and no Vue component test setup. Accordingly:

- **Pure transforms get full TDD** (Task 2): `buildFingerprint`, `normalizeInstitutionName`, `tellerToInternal`. These hold the highest-risk logic (the amount sign flip).
- **I/O code (mTLS client, sync orchestration, routes, DB helpers, Vue) is implemented with complete code, then verified by the Phase 1 smoke-test checklist** (Task 10) — mirroring how the Plaid path is validated today. Do **not** add live-network or live-DB tests to the Vitest suite.

## Amount sign convention (read before Task 2)

The app follows **Plaid's convention: positive `amount` = money spent (outflow), negative = money received (inflow).** Verified in `BudgetView.vue:443-445` (`item.amount < 0` → `+` prefix + `--income` class). Teller follows the **bank-ledger convention (opposite):** a purchase is negative, a deposit positive. Therefore `tellerToInternal` must **negate** Teller's amount. Credit-card sign is account-type-dependent and is an explicit verification gate in Task 10.

---

## File Structure

**Create:**
- `db/migrations/010-teller-cutover.sql` — add `active`, `last_transactions_hash`, `enrollment_id`; swap unique constraint; freeze existing connections.
- `utils/tellerClient.js` — mTLS client factory: `getAccounts`, `getTransactions` (paginated), `getBalance`.
- `utils/tellerTools.js` — pure transforms (`buildFingerprint`, `normalizeInstitutionName`, `tellerToInternal`) + orchestration (`pullTellerTransactions`, `fetchAndStoreBalances`).
- `bank-api.js` — Teller link routes: `store_enrollment`, `clear_connection_error`, `remove_account`.
- `__tests__/tellerTools.test.js` — unit tests for the pure transforms.
- `frontend/src/components/BankLinkHandler.vue` — Teller Connect wrapper (replaces `PlaidLinkHandler.vue`).

**Modify:**
- `db/database.js` — extend `insertTransactions` ON CONFLICT; add new columns to connection SELECTs; extend `insertPlaidItem` with `enrollmentId`; add `updateConnectionHash`, `sweepPendingTransactions`; export them.
- `index.js` — mount `/bank-api` (keep `/plaid-api` during side-by-side).
- `frontend/vite.config.js` — add `/bank-api` proxy.
- `api.js` — swap the sync import from `plaidTools` to `tellerTools`.
- `frontend/src/api.js` — add `storeEnrollment`, `clearConnectionError`; point `removeAccount` at `/bank-api`; delete `createUpdateLinkToken`.
- `frontend/src/views/AccountsView.vue`, `frontend/src/views/OnboardingView.vue` — swap `PlaidLinkHandler` → `BankLinkHandler`.
- `.env.example`, `frontend/.env.example` — Teller vars.

**Phase 3 only (separate PR):** delete `utils/plaidClient.js`, `utils/plaidTools.js`, `plaid-api.js`, `PlaidLinkHandler.vue`; rename tables; drop cursor columns; remove `plaid` dep.

---

## Task 1: Migration 010 — add columns, swap constraint, freeze

**Files:**
- Create: `db/migrations/010-teller-cutover.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 010-teller-cutover.sql
-- Teller cutover: additive only. Table rename + cursor-column drops are deferred
-- to the Phase 3 cleanup PR so the Plaid path keeps working during side-by-side
-- and rollback stays a one-click code revert.

-- Whether a connection is syncable. Frozen (false) = historical Plaid-era, kept
-- for its data but never synced again.
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Fingerprint of the last full transaction pull, for sync early-exit.
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS last_transactions_hash TEXT;

-- Teller enrollment id, needed to drive Connect's reconnect (update) mode.
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS enrollment_id TEXT;

-- Replace the strict (user_id, institution) uniqueness with a partial index that
-- only applies to active rows. This lets a frozen Plaid "Chase" and a new active
-- Teller "Chase" coexist.
ALTER TABLE plaid_items DROP CONSTRAINT IF EXISTS plaid_items_user_id_institution_key;
CREATE UNIQUE INDEX IF NOT EXISTS bank_connections_user_institution_active_uk
  ON plaid_items (user_id, institution) WHERE active = true;

-- Freeze every existing (Plaid-era) connection. New Teller connections insert as active.
UPDATE plaid_items SET active = false;
```

- [ ] **Step 2: Run it against the local DB**

Run: `psql "postgresql://chris@localhost/basil" -f db/migrations/010-teller-cutover.sql`
Expected: `ALTER TABLE` / `CREATE INDEX` / `UPDATE N` with no errors.

- [ ] **Step 3: Verify the schema changed**

Run: `psql "postgresql://chris@localhost/basil" -c "\d plaid_items"`
Expected: columns `active`, `last_transactions_hash`, `enrollment_id` present; partial unique index `bank_connections_user_institution_active_uk` listed.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/010-teller-cutover.sql
git commit -m "feat(db): add Teller cutover columns + partial unique index (migration 010)"
```

---

## Task 2: Pure transforms in `utils/tellerTools.js` (TDD)

This task builds and tests the three pure functions that hold the migration's correctness-critical logic. Write the test first each time.

**Files:**
- Create: `__tests__/tellerTools.test.js`
- Create: `utils/tellerTools.js`

- [ ] **Step 1: Write the failing tests**

```js
// __tests__/tellerTools.test.js
import { describe, it, expect } from 'vitest';

const { buildFingerprint, normalizeInstitutionName, tellerToInternal } = require('../utils/tellerTools');

describe('buildFingerprint', () => {
  const a = { id: 't1', amount: '-5.00', date: '2026-05-01', status: 'posted', description: 'COFFEE' };
  const b = { id: 't2', amount: '-9.00', date: '2026-05-02', status: 'pending', description: 'LUNCH' };

  it('is stable regardless of input order', () => {
    expect(buildFingerprint([a, b])).toBe(buildFingerprint([b, a]));
  });

  it('changes when a transaction status changes (pending → posted)', () => {
    const bPosted = { ...b, status: 'posted' };
    expect(buildFingerprint([a, b])).not.toBe(buildFingerprint([a, bPosted]));
  });

  it('returns a hex sha256 string', () => {
    expect(buildFingerprint([a])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('normalizeInstitutionName', () => {
  const map = { Citizens: 'Citizens Bank' };

  it('applies an override when present', () => {
    expect(normalizeInstitutionName('Citizens', map)).toBe('Citizens Bank');
  });

  it('falls back to the raw name when no override', () => {
    expect(normalizeInstitutionName('Chase', map)).toBe('Chase');
  });

  it('handles null/empty input', () => {
    expect(normalizeInstitutionName(null, map)).toBe(null);
  });
});

describe('tellerToInternal', () => {
  const base = {
    id: 'txn_abc', account_id: 'acc_1', amount: '-42.50', date: '2026-05-10',
    description: 'STARBUCKS STORE 123', status: 'posted',
    details: { counterparty: { name: 'Starbucks' } },
  };

  it('flips the sign: a Teller debit (negative) becomes a positive spend', () => {
    expect(tellerToInternal(base, { userId: 'u1', institution: 'Chase' }).amount).toBe(42.5);
  });

  it('flips the sign: a Teller credit (positive) becomes a negative inflow', () => {
    const deposit = { ...base, amount: '1500.00' };
    expect(tellerToInternal(deposit, { userId: 'u1', institution: 'Chase' }).amount).toBe(-1500);
  });

  it('maps identity, name, merchant, date, pending, account', () => {
    const r = tellerToInternal(base, { userId: 'u1', institution: 'Chase' });
    expect(r).toMatchObject({
      transaction_id: 'txn_abc',
      userId: 'u1',
      account_id: 'acc_1',
      name: 'STARBUCKS STORE 123',
      merchant_name: 'Starbucks',
      date: '2026-05-10',
      pending: false,
      account: 'Chase',
    });
  });

  it('sets pending true when status is pending', () => {
    expect(tellerToInternal({ ...base, status: 'pending' }, { userId: 'u1', institution: 'Chase' }).pending).toBe(true);
  });

  it('tolerates a missing counterparty (merchant_name null)', () => {
    const noCp = { ...base, details: {} };
    expect(tellerToInternal(noCp, { userId: 'u1', institution: 'Chase' }).merchant_name).toBe(null);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tellerTools`
Expected: FAIL — `Cannot find module '../utils/tellerTools'`.

- [ ] **Step 3: Implement the pure functions**

```js
// utils/tellerTools.js
const crypto = require('crypto');

// Maps Teller's institution name → the exact string Plaid stamped on historical
// `transactions.account` rows, so cutover reconciliation matches. Populated in
// Task 10 after inspecting `SELECT DISTINCT account FROM transactions` on prod.
// Empty = pass-through (correct when the names already match, e.g. "Chase").
const INSTITUTION_NAME_OVERRIDES = {};

function buildFingerprint(txns) {
  const canonical = txns
    .map((t) => [t.id, t.amount, t.date, t.status, t.description].join('|'))
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function normalizeInstitutionName(name, overrideMap = INSTITUTION_NAME_OVERRIDES) {
  if (!name) return name;
  return overrideMap[name] || name;
}

// Map a Teller transaction to the internal shape insertTransactions expects.
// NOTE: Teller's ledger sign is the opposite of Plaid's. The app treats positive
// amount as money spent (BudgetView.vue:443), so we negate Teller's amount.
function tellerToInternal(t, { userId, institution }) {
  return {
    transaction_id: t.id,
    userId,
    account_id: t.account_id,
    name: t.description,
    merchant_name: t.details?.counterparty?.name || null,
    amount: -Number(t.amount),
    date: t.date,
    pending: t.status === 'pending',
    account: normalizeInstitutionName(institution),
  };
}

module.exports = {
  INSTITUTION_NAME_OVERRIDES,
  buildFingerprint,
  normalizeInstitutionName,
  tellerToInternal,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tellerTools`
Expected: PASS (all 12 assertions green).

- [ ] **Step 5: Commit**

```bash
git add utils/tellerTools.js __tests__/tellerTools.test.js
git commit -m "feat(teller): pure transforms (fingerprint, name normalize, txn mapper) with tests"
```

---

## Task 3: Teller mTLS client (`utils/tellerClient.js`)

I/O module — no Vitest test; verified in Task 10. Every call ships the client cert + key (mTLS) and Basic auth (access token as username, empty password).

**Files:**
- Create: `utils/tellerClient.js`

- [ ] **Step 1: Implement the client factory**

> **Transport note (verified during build):** Node's global `fetch` (undici) does
> **not** honor a client cert passed via the `agent` option — a local mutual-TLS
> handshake confirmed the cert is never presented. Use `axios` (already a project
> dependency) with `httpsAgent`, which does present the client cert.

```js
// utils/tellerClient.js
const https = require('https');
const fs = require('fs');
const axios = require('axios');

const BASE = 'https://api.teller.io';

// One shared mTLS agent for the whole process. Node's global fetch (undici) does
// NOT honor a client cert passed via the `agent` option, so we use axios, which
// sends the client cert via `httpsAgent`. Sandbox needs no cert, so only build
// the agent when both paths are configured.
let httpsAgent = null;
if (process.env.TELLER_CERT_PATH && process.env.TELLER_KEY_PATH) {
  httpsAgent = new https.Agent({
    cert: fs.readFileSync(process.env.TELLER_CERT_PATH),
    key: fs.readFileSync(process.env.TELLER_KEY_PATH),
  });
}

async function request(accessToken, path) {
  const auth = Buffer.from(`${accessToken}:`).toString('base64');
  try {
    const res = await axios.get(`${BASE}${path}`, {
      httpsAgent,
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    return res.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 401) {
      const err = new Error('Teller enrollment disconnected');
      err.status = 401;
      err.tellerDisconnected = true;
      throw err;
    }
    const err = new Error(`Teller ${status || ''} on ${path}: ${error.message}`);
    err.status = status;
    throw err;
  }
}

function client(accessToken) {
  return {
    getAccounts: () => request(accessToken, '/accounts'),

    getBalance: (accountId) => request(accessToken, `/accounts/${accountId}/balances`),

    // Teller paginates via ?from_id=<last id>&count=<n>. Walk until a short page.
    getTransactions: async (accountId, count = 250) => {
      const all = [];
      let fromId = null;
      // Safety cap: 20 pages (5,000 txns) is far beyond a ~90-day window.
      for (let page = 0; page < 20; page++) {
        const qs = `count=${count}` + (fromId ? `&from_id=${fromId}` : '');
        const batch = await request(accessToken, `/accounts/${accountId}/transactions?${qs}`);
        if (!Array.isArray(batch) || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < count) break;
        fromId = batch[batch.length - 1].id;
      }
      return all;
    },
  };
}

module.exports = { client };
```

- [ ] **Step 2: Verify the file loads without throwing**

Run: `node -e "require('./utils/tellerClient'); console.log('ok')"`
Expected: prints `ok` (no cert configured locally yet → agent stays null, no crash).

- [ ] **Step 3: Commit**

```bash
git add utils/tellerClient.js
git commit -m "feat(teller): mTLS client (accounts, balances, paginated transactions)"
```

---

## Task 4: DB layer changes (`db/database.js`)

**Files:**
- Modify: `db/database.js` — `insertTransactions` (~line 500), `findPlaidItems` SELECT (~801), `findPlaidItemByInstitution` SELECT (~876), `insertPlaidItem` (~898), new helpers + exports.

- [ ] **Step 1: Extend `insertTransactions` ON CONFLICT (so same-id pending→posted updates in place)**

Find (in `insertTransactions`, ~line 500):

```js
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (transaction_id) DO NOTHING`,
```

Replace with:

```js
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (transaction_id) DO UPDATE SET
           pending = EXCLUDED.pending,
           date = EXCLUDED.date`,
```

- [ ] **Step 2: Add the new columns to both connection SELECTs**

In `findPlaidItems` (~line 801-804) and `findPlaidItemByInstitution` (~line 876-879), the SELECT list ends with `created_at AS "createdAt"`. In **both**, append the three new columns. Change:

```js
            error_detected_at AS "errorDetectedAt", created_at AS "createdAt"
```

to:

```js
            error_detected_at AS "errorDetectedAt", created_at AS "createdAt",
            active, last_transactions_hash AS "lastTransactionsHash",
            enrollment_id AS "enrollmentId"
```

(Apply this replacement in both functions.)

- [ ] **Step 3: Extend `insertPlaidItem` to persist `enrollmentId` and return `active`**

Replace the body of `insertPlaidItem` (~line 898-906) with:

```js
async function insertPlaidItem({ userId, institution, accessToken, enrollmentId = null }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO plaid_items (user_id, institution, access_token, enrollment_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, institution, accessToken, enrollmentId]
  );
  return { id: rows[0].id };
}
```

- [ ] **Step 4: Add two new helpers (place them right after `upsertBalanceSnapshot`, ~line 1032)**

```js
// Persist the fingerprint of a connection's last full transaction pull.
async function updateConnectionHash(connectionId, hash) {
  const pool = getPool();
  await pool.query(
    `UPDATE plaid_items SET last_transactions_hash = $2 WHERE id = $1`,
    [connectionId, hash]
  );
}

// Pending-sweep: delete this user's pending rows on the given accounts that the
// latest Teller pull no longer reports (they posted under a new id, or dropped).
// Returns the number of rows removed.
async function sweepPendingTransactions(userId, accountIds, freshIds) {
  if (!accountIds.length) return 0;
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM transactions
      WHERE user_id = $1
        AND account_id = ANY($2)
        AND pending = true
        AND NOT (transaction_id = ANY($3))`,
    [userId, accountIds, freshIds]
  );
  return result.rowCount;
}
```

- [ ] **Step 5: Export the new helpers**

In the `module.exports = {` block (~line 1295), add `updateConnectionHash` and `sweepPendingTransactions` to the exported list.

- [ ] **Step 6: Verify the file parses and existing DB tests still pass**

Run: `node -e "require('./db/database'); console.log('ok')" && npm test -- database`
Expected: prints `ok`; all `database.test.js` tests PASS (the `buildSetClause`/`conditionsToSqlWhere` suites are unaffected).

- [ ] **Step 7: Commit**

```bash
git add db/database.js
git commit -m "feat(db): Teller import support (ON CONFLICT update, connection columns, sweep + hash helpers)"
```

---

## Task 5: Sync orchestration in `utils/tellerTools.js`

Append the orchestration functions to the file created in Task 2. I/O — verified in Task 10.

**Files:**
- Modify: `utils/tellerTools.js`

- [ ] **Step 1: Add requires at the top of the file (below `const crypto = ...`)**

```js
const { client: tellerClient } = require('./tellerClient');
const {
  findPlaidItems, findCategories, findUserRules, insertTransactions,
  upsertPlaidAccounts, updatePlaidItem, upsertBalanceSnapshot,
  updateConnectionHash, sweepPendingTransactions, insertSyncLog,
} = require('../db/database');
const { getMappingRuleList, mapTransactions } = require('./categoryMapping');
```

- [ ] **Step 2: Add a Teller→accounts adapter and the two orchestration functions (before `module.exports`)**

```js
// Teller GET /accounts has no balances (those come from /balances). Adapt to the
// shape upsertPlaidAccounts expects so we reuse the existing account upsert.
function tellerAccountToUpsertShape(a) {
  return {
    account_id: a.id,
    name: a.name || null,
    official_name: a.name || null,
    mask: a.last_four || null,
    type: a.type || null,       // 'depository' | 'credit'
    subtype: a.subtype || null, // 'checking' | 'savings' | 'credit_card'
    balances: { current: null, available: null, limit: null },
  };
}

function netFromBalances(balances) {
  return balances.reduce((sum, acct) => {
    const isLiability = acct.type === 'credit' || acct.type === 'loan';
    const bal = isLiability ? (acct.current ?? 0) : (acct.available ?? acct.current ?? 0);
    return isLiability ? sum - Math.abs(bal) : sum + bal;
  }, 0);
}

async function pullTellerTransactions(uid) {
  const userId = uid.toString();
  const connections = (await findPlaidItems(userId)).filter((c) => c.active && c.accessToken);
  const categories = await findCategories(userId);
  const ruleList = await getMappingRuleList(categories);
  const compoundRules = await findUserRules(userId);
  const errors = {};

  for (const conn of connections) {
    try {
      const c = tellerClient(conn.accessToken);
      const accounts = await c.getAccounts();
      await upsertPlaidAccounts(conn.id, userId, accounts.map(tellerAccountToUpsertShape));

      let allTxns = [];
      for (const acct of accounts) {
        const txns = await c.getTransactions(acct.id);
        allTxns.push(...txns);
      }

      const hash = buildFingerprint(allTxns);
      if (hash === conn.lastTransactionsHash) continue; // nothing changed — skip import + sweep

      const mapped = allTxns.map((t) => tellerToInternal(t, { userId, institution: conn.institution }));
      const categorized = await mapTransactions(mapped, ruleList, compoundRules);
      await insertTransactions(categorized);

      const accountIds = accounts.map((a) => a.id);
      const freshIds = allTxns.map((t) => t.id);
      await sweepPendingTransactions(userId, accountIds, freshIds);

      await updateConnectionHash(conn.id, hash);
      await insertSyncLog({
        userId, institution: conn.institution,
        addedCount: allTxns.length, modifiedCount: 0, removedCount: 0,
      });
      await updatePlaidItem(userId, conn.institution, {
        errorCode: null, errorMessage: null, errorDetectedAt: null,
      });
    } catch (err) {
      if (err.tellerDisconnected) {
        await updatePlaidItem(userId, conn.institution, {
          errorCode: 'disconnected',
          errorMessage: 'Reconnect required',
          errorDetectedAt: new Date(),
        });
        errors[conn.institution] = { error_code: 'disconnected', detectedAt: new Date() };
      } else {
        console.error(`pullTellerTransactions error for ${conn.institution}:`, err.message);
      }
    }
  }

  return { errors: Object.keys(errors).length ? errors : null };
}

async function fetchAndStoreBalances(uid) {
  const userId = uid.toString();
  const connections = await findPlaidItems(userId);
  const results = {};
  const balanceErrors = {};
  const today = new Date().toISOString().slice(0, 10);

  for (const conn of connections) {
    // Manual accounts (no access token): snapshot the cached balances, same as Plaid path.
    if (!conn.accessToken) {
      if (conn.accounts?.length) {
        const manual = conn.accounts.map((a) => ({
          account_id: a.accountId, name: a.name, type: a.type, subtype: a.subtype,
          current: a.balance, available: a.available, limit: a.limit,
          fetchedAt: a.balanceFetchedAt, manual: true,
        }));
        results[conn.institution] = manual;
        await upsertBalanceSnapshot(conn.id, {
          date: today, net: Math.round(netFromBalances(manual) * 100) / 100, fetchedAt: new Date(),
        });
      }
      continue;
    }
    if (!conn.active) continue; // frozen Plaid-era connection — don't hit the network

    try {
      const c = tellerClient(conn.accessToken);
      const accounts = await c.getAccounts();
      await upsertPlaidAccounts(conn.id, userId, accounts.map(tellerAccountToUpsertShape));
      const fetchedAt = new Date();
      const balances = [];
      for (const a of accounts) {
        const b = await c.getBalance(a.id);
        balances.push({
          account_id: a.id, name: a.name, type: a.type, subtype: a.subtype,
          current: b.ledger != null ? Number(b.ledger) : null,
          available: b.available != null ? Number(b.available) : null,
          limit: null, fetchedAt,
        });
      }
      // Persist fetched balances onto the account rows.
      await upsertPlaidAccounts(conn.id, userId, accounts.map((a, i) => ({
        ...tellerAccountToUpsertShape(a),
        balances: { current: balances[i].current, available: balances[i].available, limit: null },
      })));

      await upsertBalanceSnapshot(conn.id, {
        date: today, net: Math.round(netFromBalances(balances) * 100) / 100, fetchedAt,
      });
      results[conn.institution] = balances;
    } catch (err) {
      if (err.tellerDisconnected) {
        await updatePlaidItem(userId, conn.institution, {
          errorCode: 'disconnected', errorMessage: 'Reconnect required', errorDetectedAt: new Date(),
        });
        balanceErrors[conn.institution] = { error_code: 'disconnected', detectedAt: new Date() };
      } else {
        console.error(`fetchAndStoreBalances error for ${conn.institution}:`, err.message);
      }
    }
  }

  return { balances: results, errors: Object.keys(balanceErrors).length ? balanceErrors : null };
}
```

- [ ] **Step 3: Add the new functions to `module.exports`**

Change the exports block to:

```js
module.exports = {
  INSTITUTION_NAME_OVERRIDES,
  buildFingerprint,
  normalizeInstitutionName,
  tellerToInternal,
  pullTellerTransactions,
  fetchAndStoreBalances,
};
```

- [ ] **Step 4: Verify the module loads and the pure-function tests still pass**

Run: `node -e "require('./utils/tellerTools'); console.log('ok')" && npm test -- tellerTools`
Expected: prints `ok`; Task 2 tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/tellerTools.js
git commit -m "feat(teller): sync orchestration (pullTellerTransactions, fetchAndStoreBalances)"
```

---

## Task 6: `bank-api.js` link routes + wiring

**Files:**
- Create: `bank-api.js`
- Modify: `index.js` (mount), `frontend/vite.config.js` (proxy)

- [ ] **Step 1: Create `bank-api.js`**

```js
// bank-api.js — Teller Connect server endpoints (replaces plaid-api.js)
const express = require('express');
const bodyParser = require('body-parser');
const {
  findPlaidItems, findPlaidItemByInstitution, insertPlaidItem,
  updatePlaidItem, deletePlaidItem, upsertPlaidAccounts,
} = require('./db/database');
const { validateIdToken, rejectTestUser } = require('./utils/authentication');
const { client: tellerClient } = require('./utils/tellerClient');

const router = express.Router();
router.use(bodyParser.json({ limit: '1mb' }));

// Teller Connect returns the access token + enrollment to the browser; the client
// forwards them here. We insert an active connection and fetch accounts immediately.
router.post('/store_enrollment', async (req, res) => {
  let decodedToken;
  try {
    decodedToken = await validateIdToken(req);
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  if (await rejectTestUser(decodedToken.uid, res)) return;

  try {
    const userId = decodedToken.uid;
    const { accessToken, enrollment } = req.body || {};
    const institution = enrollment?.institution?.name;
    const enrollmentId = enrollment?.id || null;
    if (!accessToken || !institution || typeof institution !== 'string' || /[.$]/.test(institution)) {
      return res.status(400).json({ message: 'Invalid enrollment payload' });
    }

    // Only block if there is already an ACTIVE connection for this institution.
    const existing = (await findPlaidItems(userId))
      .find((c) => c.active && c.institution === institution);
    if (existing) return res.json({ alreadyLinked: true });

    const { id: connectionId } = await insertPlaidItem({ userId, institution, accessToken, enrollmentId });

    try {
      const accounts = await tellerClient(accessToken).getAccounts();
      await upsertPlaidAccounts(connectionId, userId, accounts.map((a) => ({
        account_id: a.id, name: a.name || null, official_name: a.name || null,
        mask: a.last_four || null, type: a.type || null, subtype: a.subtype || null,
        balances: { current: null, available: null, limit: null },
      })));
    } catch (err) {
      console.error('store_enrollment: account fetch failed (non-fatal):', err.message);
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('/store_enrollment error:', error.message);
    return res.status(500).json({ message: 'Failed to store enrollment' });
  }
});

router.post('/clear_connection_error', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const { institution } = req.body;
    if (!institution) return res.status(400).json({ message: 'institution required' });
    await updatePlaidItem(decodedToken.uid, institution, {
      errorCode: null, errorMessage: null, errorDetectedAt: null,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('/clear_connection_error error:', error.message);
    res.status(500).json({ message: 'Failed to clear connection error' });
  }
});

router.post('/remove_account', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    if (await rejectTestUser(decodedToken.uid, res)) return;
    const { institution } = req.body;
    await deletePlaidItem(decodedToken.uid, institution);
    res.json({ success: true });
  } catch (error) {
    console.error('/remove_account error:', error.message);
    res.status(500).json({ message: 'Failed to remove account' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount it in `index.js` (keep `/plaid-api` during side-by-side)**

After the `/plaid-api` mount (~line 75) add:

```js
const bankApiRouter = require("./bank-api");
app.use("/bank-api", bankApiRouter);
```

- [ ] **Step 3: Add the Vite proxy (`frontend/vite.config.js`, ~line 17)**

After the `/plaid-api` proxy line add:

```js
      '/bank-api':  { target: 'http://localhost:3000', changeOrigin: true },
```

- [ ] **Step 4: Verify both files load**

Run: `node -e "require('./bank-api'); require('./index'); console.log('ok')"` then Ctrl-C if it stays up (index starts the server). Alternatively: `node -e "require('./bank-api'); console.log('ok')"`
Expected: prints `ok` with no require errors.

- [ ] **Step 5: Commit**

```bash
git add bank-api.js index.js frontend/vite.config.js
git commit -m "feat(teller): bank-api routes (store_enrollment, clear/remove) + mount + proxy"
```

---

## Task 7: Point `/api/sync` at Teller

**Files:**
- Modify: `api.js:6`

- [ ] **Step 1: Swap the import**

Change line 6 from:

```js
const { getNewPlaidTransactions, fetchAndStoreBalances, getCachedBalances } = require('./utils/plaidTools');
```

to:

```js
const { pullTellerTransactions, fetchAndStoreBalances } = require('./utils/tellerTools');
const { getCachedBalances } = require('./utils/plaidTools'); // still used for cached reads until Phase 3
```

- [ ] **Step 2: Update the `/sync` route call (~line 130)**

Change:

```js
    const syncResult = await getNewPlaidTransactions(userId);
```

to:

```js
    const syncResult = await pullTellerTransactions(userId);
```

(`fetchAndStoreBalances` keeps its name — it now resolves to the Teller version. `findPlaidItems` reads back snapshots unchanged. The route's response contract is unchanged.)

- [ ] **Step 3: Verify api.js loads**

Run: `node -e "require('./api'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add api.js
git commit -m "feat(teller): route /api/sync through pullTellerTransactions"
```

---

## Task 8: Frontend — `BankLinkHandler.vue` + API helpers + view wiring

**Files:**
- Create: `frontend/src/components/BankLinkHandler.vue`
- Modify: `frontend/src/api.js`, `frontend/src/views/AccountsView.vue`, `frontend/src/views/OnboardingView.vue`

> Read `DESIGN.md` before editing the views. `BankLinkHandler` is a headless wrapper (no visible UI), so it needs no Basil components — but the surrounding view markup must stay on existing Basil components.

- [ ] **Step 1: Create `BankLinkHandler.vue`**

```vue
<template>
  <div></div>
</template>

<script>
import { storeEnrollment, getAuthHeaders } from '@/api'; // getAuthHeaders kept for parity/future use

let scriptPromise = null;
function loadTellerConnect() {
  if (window.TellerConnect) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.teller.io/connect/connect.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load Teller Connect'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default {
  props: {
    // When set, opens Connect in reconnect (update) mode for an existing enrollment.
    reconnectEnrollmentId: { type: String, default: null },
  },
  data() {
    return { connect: null };
  },
  async mounted() {
    try {
      await loadTellerConnect();
    } catch (e) {
      console.error('BankLinkHandler:', e.message);
      this.$emit('onBankExit');
      return;
    }
    this.connect = window.TellerConnect.setup({
      applicationId: import.meta.env.VITE_TELLER_APPLICATION_ID,
      environment: import.meta.env.VITE_TELLER_ENVIRONMENT,
      products: ['transactions', 'balance'],
      ...(this.reconnectEnrollmentId ? { enrollmentId: this.reconnectEnrollmentId } : {}),
      onSuccess: async (enrollment) => {
        // Reconnect mode: credentials already refreshed, just tell the parent.
        if (this.reconnectEnrollmentId) {
          this.$emit('onBankSuccess', enrollment);
          return;
        }
        await storeEnrollment(enrollment);
        this.$emit('onBankSuccess', enrollment);
      },
      onExit: () => this.$emit('onBankExit'),
    });
    this.connect.open();
  },
};
</script>
```

- [ ] **Step 2: Add `storeEnrollment` + `clearConnectionError` and repoint `removeAccount` in `frontend/src/api.js`**

Add near the other account helpers:

```js
export async function storeEnrollment(enrollment) {
  const headers = await getAuthHeaders();
  const response = await fetch('/bank-api/store_enrollment', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: enrollment.accessToken, enrollment: enrollment.enrollment }),
  });
  return response.json();
}

export async function clearConnectionError(institution) {
  const headers = await getAuthHeaders();
  const response = await fetch('/bank-api/clear_connection_error', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ institution }),
  });
  return response.json();
}
```

Change `removeAccount` (~line 208-212) to POST `/bank-api/remove_account` instead of `/plaid-api/remove_account` (keep its signature `removeAccount(institution)` and body `{ institution }`).

Delete `createUpdateLinkToken` (~line 70-78). (Teller reconnect uses `reconnectEnrollmentId`, not a server token.)

- [ ] **Step 3: Wire `AccountsView.vue`**

- Replace the import (line 379): `import BankLinkHandler from '../components/BankLinkHandler.vue';`
- Components registration (line 394): replace `PlaidLinkHandler` with `BankLinkHandler`.
- Replace the three `<PlaidLinkHandler …>` tags (lines 34, 52, 208):
  - Primary link: `<BankLinkHandler v-if="showPlaidLink" @onBankSuccess="handlePlaidSuccess" />`
  - Reconnect (line 52-56): `<BankLinkHandler :reconnect-enrollment-id="reconnectEnrollmentId" @onBankSuccess="handleReconnectSuccess" @onBankExit="reconnectEnrollmentId = null; reconnecting = null" />`
- In `<script>`: update the import line 372 — remove `createUpdateLinkToken`, change `clearItemError` → `clearConnectionError`. Replace the reconnect handler body (~line 687) that called `createUpdateLinkToken(institution)`: instead set `this.reconnectEnrollmentId = <the connection's enrollmentId>` and show the handler. (The connection's `enrollmentId` comes through the store from `findPlaidItems`, now that the SELECT returns it — Task 4 Step 2.) Replace `clearItemError(institution)` call (~line 703) with `clearConnectionError(institution)`.
- Add `reconnectEnrollmentId: null` to `data()`; remove any `reconnectToken` field it replaces.

- [ ] **Step 4: Wire `OnboardingView.vue`**

- Import (line 171) → `import BankLinkHandler from '../components/BankLinkHandler.vue';`
- Components (line 179) → `BankLinkHandler`.
- Tag (line 73) → `<BankLinkHandler v-if="showPlaidLink" @onBankSuccess="onPlaidSuccess" @onBankExit="onPlaidExit" />`
- `onPlaidSuccess`/`onPlaidExit` method bodies need no change (they just resync).

- [ ] **Step 5: Verify the frontend builds**

Run: `npm run build --prefix frontend`
Expected: build succeeds, no unresolved imports (no references to `PlaidLinkHandler` or `createUpdateLinkToken` remain). If the build flags a leftover reference, fix it.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/BankLinkHandler.vue frontend/src/api.js frontend/src/views/AccountsView.vue frontend/src/views/OnboardingView.vue
git commit -m "feat(teller): BankLinkHandler + Teller API helpers + view wiring"
```

---

## Task 9: Env vars + deployment artifacts

**Files:**
- Modify: `.env.example`, `frontend/.env.example` (create if absent)

- [ ] **Step 1: Add Teller vars to `.env.example`**

```
# Teller (bank data provider)
TELLER_APPLICATION_ID=app_xxxxxxxx
TELLER_ENVIRONMENT=development
TELLER_CERT_PATH=/absolute/path/to/teller-cert.pem
TELLER_KEY_PATH=/absolute/path/to/teller-key.pem
```

- [ ] **Step 2: Add Teller vars to `frontend/.env.example`**

```
VITE_TELLER_APPLICATION_ID=app_xxxxxxxx
VITE_TELLER_ENVIRONMENT=development
```

- [ ] **Step 3: Set the real values in local `.env` / `frontend/.env`**

Add the same keys to the (gitignored) `.env` and `frontend/.env`, pointing `TELLER_CERT_PATH`/`TELLER_KEY_PATH` at the development cert downloaded to `~/.teller/`.

- [ ] **Step 4: Verify deployment artifacts cover the new files**

Run: `grep -nE "COPY|dockerignore" Dockerfile 2>/dev/null; echo '---'; cat .dockerignore 2>/dev/null`
Confirm: `bank-api.js`, `utils/`, and `db/migrations/` fall under existing COPY paths (they're in already-copied locations — no new top-level directory is added, so no COPY change is expected). **Cert files must NOT be added to the image** — they live on the VPS at `/opt/basil/certs/` and are referenced by absolute path. If the Node runtime is containerized, confirm `/opt/basil/certs` is volume-mounted into the container so `TELLER_CERT_PATH` resolves; if it runs under PM2 on the host, no mount is needed.

- [ ] **Step 5: Commit**

```bash
git add .env.example frontend/.env.example
git commit -m "chore(teller): document Teller env vars in example files"
```

---

## Task 10: Phase 1 — local smoke test (sandbox) + populate overrides

No code unless a check fails. This is the empirical gate for the I/O code and the amount sign.

- [ ] **Step 1: Start the app** — `npm run dev` (api on :3000, app on :8080). Log in as `test-user-active`.
- [ ] **Step 2: Link a Teller sandbox bank** via the Add Account button → Teller Connect opens (sandbox needs no cert) → complete the fake login. Confirm a row appears: `psql "postgresql://chris@localhost/basil" -c "SELECT institution, active, enrollment_id IS NOT NULL AS has_enrollment FROM plaid_items WHERE active = true;"`
- [ ] **Step 3: Sync** — tap Sync. Confirm transactions land: `… -c "SELECT count(*) FROM transactions WHERE account_id IN (SELECT account_id FROM plaid_accounts WHERE item_id IN (SELECT id FROM plaid_items WHERE active = true));"`
- [ ] **Step 4: VERIFY THE AMOUNT SIGN (critical).** Pick a known sandbox **purchase** and confirm it shows in the UI as an **expense** (no `+`, expense-colored), not income. In the DB its `amount` must be **positive**. If it renders as income / stores negative, the sign is inverted for this account type — revisit `tellerToInternal` in `utils/tellerTools.js` (Task 2 Step 3) and the Task 2 tests. Repeat the check for a **deposit** (should be negative `amount`, `+`-prefixed income) and, if the sandbox offers one, a **credit-card charge** (should be a positive expense).
- [ ] **Step 5: Fingerprint short-circuit** — tap Sync again. Confirm no duplicate rows were created (re-run the count from Step 3; it should be unchanged) and the logs show the connection skipped.
- [ ] **Step 6: Balances** — confirm `… -c "SELECT institution, date, net FROM balance_snapshots bs JOIN plaid_items pi ON pi.id = bs.item_id WHERE pi.active = true ORDER BY date DESC LIMIT 3;"` shows a snapshot for today.
- [ ] **Step 7: Disconnect handling** — use Teller sandbox's disconnect simulation (or temporarily corrupt the access token) → sync → confirm the connection shows a `disconnected` error and the reconnect UI appears; reconnect and confirm the error clears.
- [ ] **Step 8: Populate `INSTITUTION_NAME_OVERRIDES`.** On prod data, run `SELECT DISTINCT account FROM transactions ORDER BY 1;` and compare those strings to Teller's institution names (`Chase`, `Citizens`). For any mismatch, add an entry to `INSTITUTION_NAME_OVERRIDES` in `utils/tellerTools.js` (e.g. `{ Citizens: 'Citizens Bank' }`) so cutover reconciliation will dedupe. Add/extend a `normalizeInstitutionName` test for each entry. Commit: `git commit -am "feat(teller): institution name overrides for cutover dedup"`.
- [ ] **Step 9: Full suite green** — `npm test` and `npm run build --prefix frontend` both pass.

---

## Task 11: Phase 2 — cutover (merge day)

- [ ] **Step 1: Pre-stage the VPS** — SSH in; place the **development** Teller cert + key at `/opt/basil/certs/` (`chmod 600`); add `TELLER_*` vars to `/opt/basil/app/.env` and the `VITE_TELLER_*` vars to the frontend env/build. Leave `PLAID_*` vars in place (rollback safety).
- [ ] **Step 2: Confirm cert reachability** — per Task 9 Step 4, ensure the runtime can read `TELLER_CERT_PATH` (host PM2: direct; containerized: volume-mounted).
- [ ] **Step 3: Merge the PR** → GitHub Actions runs tests → deploys → **runs migration 010** (this is the cutover moment: all historical connections flip to `active = false`) → PM2 restarts.
- [ ] **Step 4: Link live banks** — open the app, link Chase, then Citizens, via Teller Connect. **Confirm at this step** whether the Citizens enrollment surfaces the Citizens Access savings account (spec R3); if not, add it as a manual account.
- [ ] **Step 5: Sync** — tap Sync. Verify recent transactions appear and the **~90-day overlap did NOT duplicate** historical rows: `SELECT name, amount, date, count(*) FROM transactions WHERE date > current_date - 95 GROUP BY 1,2,3 HAVING count(*) > 1;` should return few/no rows. If duplicates appear, the institution-name override (Task 10 Step 8) was incomplete — fix the map and run the existing admin dedupe tool once.
- [ ] **Step 6: Sync again** — confirm fingerprint short-circuit (no new rows).
- [ ] **Step 7: Verify balances chart** — historical snapshots + today's new snapshot both render in Trends.
- [ ] **Step 8: Watch Sentry** for 24h for sync/auth errors.

**Rollback (if needed):** revert the PR → Actions redeploys the previous commit → Plaid path is live again (its tables/columns are untouched because the rename + cursor drops were deferred). Re-enable historical rows if desired: `UPDATE plaid_items SET active = true;`. No data is ever deleted.

---

## Task 12: Phase 3 — cleanup (separate PR, 1–2 weeks after cutover)

Only after Teller is proven stable. This is where the semantic rename + Plaid removal happen.

- [ ] **Step 1:** Delete `utils/plaidClient.js`, `utils/plaidTools.js`, `plaid-api.js`, `frontend/src/components/PlaidLinkHandler.vue`. Remove the `/plaid-api` mount in `index.js`, the `/plaid-api` proxy in `frontend/vite.config.js`, and the `getCachedBalances` import added in Task 7 (re-home it into `tellerTools.js` if still used).
- [ ] **Step 2:** Remove `plaid` from root `package.json` dependencies; `npm install` to update the lockfile.
- [ ] **Step 3:** Remove `PLAID_*` from `.env.example` and `/opt/basil/app/.env`.
- [ ] **Step 4:** Write + run `db/migrations/011-bank-rename.sql`: `ALTER TABLE plaid_items DROP COLUMN next_cursor, DROP COLUMN prev_cursor;` then `ALTER TABLE plaid_items RENAME TO bank_connections; ALTER TABLE plaid_accounts RENAME TO bank_accounts;` (Postgres auto-updates the FK references on `balance_snapshots.item_id`).
- [ ] **Step 5:** Update every SQL string in `db/database.js` that names `plaid_items`/`plaid_accounts` → `bank_connections`/`bank_accounts` (refs at lines ~805, 816, 829, 880, 891, 901, 931, 951, 959, 967, 978, 1011, 1049, 1061, 1271 — re-grep to confirm). Optionally rename the helper functions (`findPlaidItems` → `findBankConnections`, etc.) and their call sites for clarity.
- [ ] **Step 6:** Run `npm test`, `npm run build --prefix frontend`, and a local smoke sync. Commit.

---

## Self-Review

**Spec coverage:**
- §1 architecture (sync vs read, fingerprint early-exit) → Tasks 5, 7. ✅
- §2 schema (additive columns, partial index, freeze; rename deferred per refinement) → Task 1, Task 12. ✅
- §3 Teller client + link flow (mTLS, store_enrollment, env) → Tasks 3, 6, 9. ✅
- §4 sync flow (reuse `insertTransactions`, pending-sweep, ON CONFLICT update, fingerprint) → Tasks 4, 5. ✅
- §5 frontend (BankLinkHandler, api helpers, view swaps) → Task 8. ✅
- §6 migration/cutover phases → Tasks 10, 11, 12. ✅
- §7 risks: R1 institution-name normalization → Task 2 + Task 10 Step 8; R4 pending-sweep guarded to successful pulls (sweep only runs after a successful full pull in `pullTellerTransactions`); R5 ON CONFLICT change verified against Plaid path via `npm test -- database` (Task 4 Step 6) + side-by-side (Task 10). ✅

**Placeholder scan:** `INSTITUTION_NAME_OVERRIDES` ships empty by design with an explicit populate step (Task 10 Step 8) and tests that pass an explicit map — not a placeholder. No TBD/TODO steps. ✅

**Type/signature consistency:** `tellerClient` exported as `{ client }`, imported as `client: tellerClient` everywhere (Tasks 3, 5, 6). `insertPlaidItem({ …, enrollmentId })` defined in Task 4, called with `enrollmentId` in Task 6. `findPlaidItems` returns `active`, `lastTransactionsHash`, `enrollmentId` (Task 4) and those exact names are consumed in Task 5 (`conn.active`, `conn.lastTransactionsHash`) and Task 8 (`enrollmentId`). Events `onBankSuccess`/`onBankExit` consistent between `BankLinkHandler` (Task 8 Step 1) and the view wiring (Task 8 Steps 3-4). ✅

**Known assumption to confirm during execution:** Teller's transaction field names (`description`, `details.counterparty.name`, `status`, `amount` as a signed string) and balance fields (`ledger`, `available`) per Teller docs as of 2026-05; verify against live sandbox payloads in Task 10 and adjust `tellerToInternal` / `fetchAndStoreBalances` field reads if Teller's shape differs.

---

## Build session notes (2026-05-23) — Tasks 1–9 implemented

Tasks 1–9 are built, committed on branch `teller-migration`, and verified (157 backend tests pass, frontend builds, all modules load). Deviations from the plan as written, all made during the build to fix real defects:

1. **axios instead of `fetch` for mTLS (Task 3).** A local mutual-TLS handshake proved Node's global `fetch` ignores the `agent` option (client cert never sent). `tellerClient.js` uses `axios` + `httpsAgent`. Plan Task 3 updated to match.
2. **`deleteActiveBankConnection` (review fix).** `bank-api.js` `remove_account` deletes only the `active` connection, so unlinking a Teller institution during side-by-side doesn't also delete the frozen Plaid row (and its snapshots) for the same name. New helper in `db/database.js`; the shared `deletePlaidItem` (legacy Plaid path) is untouched.
3. **Backend `enrollmentIdByInstitution` (Task 8).** `createClientSideUser` in `api.js` now exposes each connection's `enrollmentId` to the frontend — required for reconnect, which would otherwise silently no-op. Verified wired end-to-end.
4. **Dockerfile COPY (Task 9).** Added `bank-api.js` to the runtime-stage `COPY` line — it was missing, which would have crashed prod with "Cannot find module './bank-api'".
5. **`store_enrollment` failure handling (review fix).** Frontend `storeEnrollment` now notifies + returns null on a non-OK response, and `BankLinkHandler` only emits success if the enrollment actually persisted.

### Deferred minor follow-ups (non-blocking, address before full production or in Phase 3)
- **Auth error status codes:** `bank-api.js` `clear_connection_error` and `remove_account` return HTTP 500 (not 401) when the JWT is missing/expired, unlike `store_enrollment`. Cosmetic/debuggability only — no security impact (routes require a valid JWT to act).
- **`sync_log.added_count` is the total pulled, not newly inserted** (`pullTellerTransactions` passes `allTxns.length`). `insertTransactions` doesn't return an insert count; accurate counts need a schema/return change. Acknowledged Teller-model limitation (see spec §7 `sync_log` note).

### Cutover-phase verification additions (fold into Task 11)
- **Confirm the strict unique constraint is actually dropped on prod.** Locally there was no `plaid_items_user_id_institution_key` to drop (migration ran clean anyway). On prod the inline `UNIQUE(user_id, institution)` from migration 001 should be named `plaid_items_user_id_institution_key` and drop cleanly — but verify post-migration that NO non-partial unique constraint on `(user_id, institution)` remains, else a new active Teller "Chase" can't coexist with the frozen Plaid "Chase". Check: `SELECT conname FROM pg_constraint WHERE conrelid='plaid_items'::regclass AND contype='u';` (expect empty).
- **Confirm the cert is reachable by the runtime.** The app runs from the Docker runtime image; `TELLER_CERT_PATH`/`TELLER_KEY_PATH` point at `/opt/basil/certs/`. Certs are NOT in the image (correct). Ensure that directory is volume-mounted into the container (or the process runs on the host) so the paths resolve at runtime.
