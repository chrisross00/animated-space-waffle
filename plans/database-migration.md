# Plan: Database Migration — MongoDB to Postgres (Supabase)

## Context

The app uses MongoDB (document store) for all persistence. The data model is textbook
relational: users have categories, categories have transactions, rules belong to users
and map to categories. We're manually enforcing referential integrity that a relational
database would give us for free (e.g., orphaned rules when a category is deleted,
`userId` filtering on every single query).

This document captures the migration plan and the decision framework for when to pull
the trigger.

---

## Do this if...

- **Multi-user features are next.** Shared expense circles, collaborative budgets, or
  any feature where users share data across accounts. Relational joins and foreign keys
  make this dramatically simpler and safer.
- **Data integrity bugs start appearing.** Orphaned transactions when an account is
  unlinked, rules pointing to deleted categories, duplicate records that `deduplicateData`
  has to clean up. These are symptoms of missing referential integrity.
- **Queries get painful.** If you find yourself writing Mongo aggregation pipelines to
  do what would be a simple JOIN, or doing multi-step lookups in application code to
  combine data from different collections.
- **You want row-level security.** Supabase RLS policies would replace the manual
  `userId` filtering that every single API route does today. One policy per table vs
  a filter in every query.

## Don't do this if...

- **The current setup isn't causing pain.** The app works, queries are fast, and the
  document model isn't fighting you. Migration has real cost with no user-facing benefit.
- **You're about to ship a time-sensitive feature.** The Accounts view, for example,
  works fine on Mongo. Don't let a migration block feature work.
- **You'd be the only user.** If the app stays single-user/personal, the benefits of
  referential integrity and RLS are mostly theoretical. Mongo is fine for single-tenant.

---

## Current state

### Collections (4)

| Collection | Purpose | Document shape |
|---|---|---|
| `Basil-Users` | User profiles | `{ userId, email, ... }` |
| `Basil-Categories` | Budget categories + simple rules | `{ userId, category, monthly_limit, type, rules: { merchant_name: [], name: [] }, ... }` |
| `Plaid-Transactions` | All transactions | `{ userId, transaction_id, name, merchant_name, amount, date, mappedCategory, account, manually_set, ... }` |
| `Plaid-Accounts` | Plaid tokens + account metadata | `{ userId, Accounts: { "Chase": { token, next_cursor, ... } } }` |
| `Basil-Rules` | Compound rules | `{ userId, label, conditions[], action, createdAt, createdFrom }` |

### Database layer (`db/database.js`)
- 17 exported functions (generic CRUD + domain-specific queries)
- All queries include manual `userId` filtering
- No transactions (atomic multi-document operations)
- No foreign keys — referential integrity enforced in application code

### Query surface
- `api.js`: ~59 database calls across ~20 routes
- `plaid-api.js`: 5 calls (token storage, account management)
- `utils/plaidTools.js`: 9 calls (transaction sync, account stamping)
- `utils/seedCategories.js`: 3 calls (initial category seeding)

---

## Target schema (Postgres)

```sql
-- Users
CREATE TABLE users (
  id            TEXT PRIMARY KEY,  -- Firebase UID
  email         TEXT,
  is_admin      BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Plaid items (one per institution link)
CREATE TABLE plaid_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  institution   TEXT NOT NULL,          -- "Chase", "Amex", etc.
  access_token  TEXT NOT NULL,
  next_cursor   TEXT,
  error_code    TEXT,                   -- e.g. 'ITEM_LOGIN_REQUIRED'
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Plaid accounts (many per item)
CREATE TABLE plaid_accounts (
  account_id    TEXT PRIMARY KEY,       -- Plaid account_id
  item_id       UUID REFERENCES plaid_items(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT,
  official_name TEXT,
  mask          TEXT,
  type          TEXT,                   -- depository, credit, loan, investment
  subtype       TEXT,                   -- checking, savings, credit card, etc.
  balance       DECIMAL(12,2),
  available     DECIMAL(12,2),
  "limit"       DECIMAL(12,2),
  balance_fetched_at TIMESTAMPTZ
);

-- Categories
CREATE TABLE categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT DEFAULT 'expense', -- expense, income, payment, savings
  monthly_limit DECIMAL(12,2) DEFAULT 0,
  show_on_budget BOOLEAN DEFAULT true,
  plaid_pfc     TEXT[],                 -- Plaid PFC codes mapped to this category
  fixed         BOOLEAN,               -- future: fixed vs variable dimension
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Simple rules (currently embedded in categories.rules)
CREATE TABLE simple_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID REFERENCES categories(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  rule_type     TEXT NOT NULL,          -- 'merchant_name' or 'name'
  rule_value    TEXT NOT NULL,
  UNIQUE(user_id, rule_type, rule_value)
);

-- Compound rules (currently Basil-Rules collection)
CREATE TABLE compound_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT,
  conditions    JSONB NOT NULL,         -- [{ field, op, value }] — keep as JSONB
  action        JSONB NOT NULL,         -- { type, categoryName, note }
  created_from  TEXT,                   -- 'triage', 'dialog', 'editor'
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Transactions
CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  TEXT UNIQUE NOT NULL,  -- Plaid transaction_id
  user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
  account_id      TEXT REFERENCES plaid_accounts(account_id),
  name            TEXT,
  merchant_name   TEXT,
  amount          DECIMAL(12,2),
  date            DATE,
  effective_date  DATE,                  -- user-set date override for budget month alignment
  mapped_category TEXT,                  -- category name (denormalized for speed)
  pending         BOOLEAN DEFAULT false,
  pending_transaction_id TEXT,
  note            TEXT,
  exclude_from_total BOOLEAN DEFAULT false,
  manually_set    BOOLEAN DEFAULT false,
  account         TEXT,                  -- institution name (denormalized)
  plaid_pfc       TEXT[],
  -- Venmo enrichment
  venmo_id        TEXT,
  venmo_counterparty TEXT,
  venmo_note      TEXT,
  -- Relationship detection
  linked_transaction JSONB,             -- { transaction_id, type, confirmedAt }
  dismissed_relationship BOOLEAN DEFAULT false,
  inserted_at     TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_txn_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_txn_user_merchant ON transactions(user_id, merchant_name);
CREATE INDEX idx_txn_user_category ON transactions(user_id, mapped_category);
CREATE INDEX idx_categories_user ON categories(user_id);
CREATE INDEX idx_simple_rules_user ON simple_rules(user_id);
CREATE INDEX idx_compound_rules_user ON compound_rules(user_id);
```

### Design decisions

- **`conditions` and `action` stay as JSONB.** The compound rule condition arrays have
  variable structure (different fields, operators, values). JSONB is the right tool —
  Postgres can index and query it when needed, but we don't need to normalize it into
  separate tables.
- **`mapped_category` is a denormalized name, not a foreign key.** This matches the
  current behavior. A FK to `categories(id)` would be cleaner but would require
  rewriting all frontend/backend code that passes category names around. Could be a
  follow-up normalization.
- **Simple rules get their own table.** Currently embedded as arrays inside category
  documents (`rules.merchant_name`, `rules.name`). Pulling them out enables proper
  uniqueness constraints and cascading deletes.
- **`plaid_items` replaces the nested `Accounts` structure.** The current Mongo doc
  nests all institutions under a single user document. Flattening to a proper table
  makes the Accounts view and reconnect flow much simpler to query.

---

## Migration strategy: Direct cutover

No dual-write phase — pre-launch with no real users, so a clean cutover is simpler and
faster. One migration, one switch.

### Phase 1: Setup + schema
1. Set up self-hosted Supabase on Hetzner VPS via Docker Compose
   (Postgres, GoTrue auth, Studio dashboard, PostgREST)
2. Set up Google OAuth in GoTrue (same Google Cloud project, new redirect URI)
3. Run schema migration (tables, indexes, RLS policies)
4. Add `@supabase/supabase-js` (frontend) and Supabase service-role client (backend)

### Phase 2: Backend rewrite
1. Replace `db/database.js` — swap all 17 Mongo functions for Postgres equivalents
2. Replace Firebase admin auth verification with Supabase JWT verification
3. Update `api.js` call sites (~59 calls) — function signatures stay similar
4. Update `plaid-api.js` (5 calls), `plaidTools.js` (9 calls), `seedCategories.js` (3 calls)
5. Enable RLS policies — remove manual `userId` filtering from all queries
6. Write data migration script (Mongo → Postgres, one-time, run before cutover)

### Phase 3: Frontend auth swap
1. Replace `firebase.js` auth — swap `firebase.auth()` + `GoogleAuthProvider` for
   `supabase.auth.signInWithOAuth({ provider: 'google' })`
2. Replace Bearer token handling — Supabase JWT instead of Firebase ID token
3. Remove Firestore sessions collection (legacy, unused by app logic)
4. Update `frontend/.env` — replace `VITE_FIREBASE_*` vars with `VITE_SUPABASE_URL`
   and `VITE_SUPABASE_ANON_KEY`
5. Update root `.env` — replace `VUE_APP_FIREBASE_*` with `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`

### Phase 4: Cleanup
1. Remove `mongodb`, `firebase`, and `firebase-admin` dependencies
2. Delete or refactor `frontend/src/firebase.js` → `supabase.js`
3. Update test seed scripts for Postgres
4. Update admin portal auth

### Data migration script (one-time)

Run once before cutover to move existing data from Mongo to Postgres.

```js
async function migrate() {
  // 1. Users
  const users = await mongo.collection('Basil-Users').find().toArray();
  await supabase.from('users').insert(users.map(u => ({
    id: u.userId, email: u.email, is_admin: u.isAdmin || false
  })));

  // 2. Categories + simple rules (flatten embedded rules)
  const categories = await mongo.collection('Basil-Categories').find().toArray();
  for (const cat of categories) {
    const { data } = await supabase.from('categories').insert({
      user_id: cat.userId, name: cat.category, type: cat.type || 'expense',
      monthly_limit: cat.monthly_limit || 0, plaid_pfc: cat.plaid_pfc || [],
    }).select('id');
    for (const merchant of cat.rules?.merchant_name || []) {
      await supabase.from('simple_rules').insert({
        category_id: data[0].id, user_id: cat.userId,
        rule_type: 'merchant_name', rule_value: merchant,
      });
    }
    for (const name of cat.rules?.name || []) {
      await supabase.from('simple_rules').insert({
        category_id: data[0].id, user_id: cat.userId,
        rule_type: 'name', rule_value: name,
      });
    }
  }

  // 3. Plaid items + accounts (flatten nested Accounts structure)
  const accountDocs = await mongo.collection('Plaid-Accounts').find().toArray();
  for (const doc of accountDocs) {
    for (const [institution, data] of Object.entries(doc.Accounts || {})) {
      const { data: item } = await supabase.from('plaid_items').insert({
        user_id: doc.userId, institution, access_token: data.token,
        next_cursor: data.next_cursor, error_code: data.error?.error_code,
      }).select('id');
      // insert individual accounts under this item...
    }
  }

  // 4. Transactions (batch insert, ~1000 at a time)
  const txns = await mongo.collection('Plaid-Transactions').find().toArray();
  for (let i = 0; i < txns.length; i += 1000) {
    const batch = txns.slice(i, i + 1000).map(t => ({ /* map fields */ }));
    await supabase.from('transactions').insert(batch);
  }

  // 5. Compound rules
  const rules = await mongo.collection('Basil-Rules').find().toArray();
  await supabase.from('compound_rules').insert(rules.map(r => ({
    user_id: r.userId, label: r.label, conditions: r.conditions,
    action: r.action, created_from: r.createdFrom,
  })));
}
```

---

## Effort estimate

| Phase | Work | Files touched |
|---|---|---|
| Schema + Supabase setup | Design tables, create project, set up RLS policies | New migration files |
| `database.js` rewrite | Replace 17 Mongo functions with Postgres equivalents | `db/database.js` |
| `api.js` updates | Update ~59 call sites (mostly minor — function signatures stay similar) | `api.js` |
| `plaid-api.js` updates | 5 call sites for token/account management | `plaid-api.js` |
| `plaidTools.js` updates | 9 call sites for transaction sync | `utils/plaidTools.js` |
| `seedCategories.js` | 3 call sites | `utils/seedCategories.js` |
| Migration script | One-time data migration from Mongo to Postgres | New script |
| Frontend auth swap | Replace Firebase auth with Supabase auth, update env vars | `frontend/src/firebase.js`, `frontend/.env` |
| Tests | Update `categoryMapping.test.js` if it mocks DB directly | `__tests__/` |

**Frontend is untouched.** The API contract doesn't change — the frontend sends/receives
the same JSON. All changes are backend-only.

**Estimated scope:** ~1-2 focused weeks. The `database.js` rewrite is the bulk of it.
Most functions map cleanly from Mongo to Postgres (find → SELECT, updateOne → UPDATE,
insertOne → INSERT). The tricky parts are the aggregation pipelines
(`findMerchantsWithStats`, `deduplicateData`, `findSimilarTransactionGroups*`) which
need to become SQL GROUP BY queries.

---

## What this unlocks

- **Referential integrity** — delete a category, its rules cascade. Unlink an account,
  its transactions are cleaned up. No more orphans.
- **Row-level security** — Supabase RLS replaces manual `{ userId: uid }` on every query.
  One policy per table, enforced at the database level. Security bug surface area drops
  dramatically.
- **Proper joins** — "give me all rules with their category names" is one query, not
  two lookups stitched together in JS.
- **Schema enforcement** — NOT NULL, UNIQUE, CHECK constraints catch bad data at write
  time instead of producing silent corruption.
- **Supabase ecosystem** — auth (if you ever want to move off Firebase), realtime
  subscriptions, edge functions, dashboard for data inspection.
- **Accounts view readiness** — the flattened `plaid_items` + `plaid_accounts` tables
  are much easier to query than the current nested Mongo document.

---

## What this does NOT change

- **Plaid integration** — same API calls, just storing results in Postgres instead of Mongo.
- **Application logic** — `api.js` route handlers, `categoryMapping.js`, `ruleUtils.js`
  all keep their logic. Only the database calls underneath change.
- **API contract** — frontend sends/receives the same JSON shapes. Views are untouched
  beyond the auth swap.

---

## Decisions (resolved)

1. **Self-hosted Supabase on Hetzner VPS** — Docker Compose with Postgres, GoTrue (auth),
   Studio (dashboard). Full control, no vendor lock-in, RLS is native Postgres. Production
   hosting is Hetzner VPS, so self-hosting makes more sense than Supabase Cloud.
2. **Migrate auth with DB** — Firebase is only used for Google Sign-In + a dead Firestore
   sessions collection. No advantage to keeping it. Supabase Auth (GoTrue) supports Google
   OAuth natively. One migration, one cutover.
3. **Direct cutover** — no dual-write. Pre-launch with no real users, so a clean switch
   is simpler and faster.
4. **`mapped_category` stays as string** — normalizing to FK touches frontend code.
   Follow-up after core migration if needed.
5. **Compound rule conditions stay as JSONB** — flexible structure, Postgres can index
   and query it when needed.
