# Data Layer Rearchitecture

## Problem statement

The app currently treats transaction data as a monolith: one endpoint (`/getNewAuth`) both syncs from Plaid and returns every transaction the user has ever had. The frontend stores the entire dataset in Vuex and persists it to sessionStorage. This creates cascading problems:

1. **Every page load can trigger a Plaid sync** — expensive, rate-limited (10/5min), and unnecessary when the user just wants to see cached data
2. **No pagination** — a user with 3 years of data across 3 institutions downloads thousands of transactions on every sync
3. **sessionStorage has a 5MB cap** — ~3,000 transactions fills it; after that, persistence silently fails and hard refresh loses all data
4. **No MongoDB indexes** — every query is a collection scan; gets slower as data grows
5. **Frontend holds everything in memory** — BudgetView only needs the current month, but it loads years of history

These aren't independent bugs — they're symptoms of a data layer that was built for a demo-sized dataset and needs to be rearchitected for real usage.

---

## Current architecture

```
User action (refresh, pull-to-refresh, Sync FAB)
        │
        ▼
  GET /getNewAuth
        │
        ├── getNewPlaidTransactions(uid)    ← calls Plaid API (expensive)
        │     └── inserts/updates/deletes in MongoDB
        │
        └── getAllUserTransactions(uid)      ← reads ALL from MongoDB (no filter)
              └── returns full array to frontend
                    │
                    ▼
              store.commit('setTransactions', [...])
                    │
                    ▼
              sessionStorage (entire array serialized)
```

**Key problem:** "sync new from Plaid" and "give me what you have" are the same operation. There is no way to read cached data without also triggering a sync.

---

## Proposed architecture

### Principle: Separate sync from read

```
                    ┌─────────────────────────┐
                    │   POST /api/sync         │  ← Plaid sync (explicit only)
                    │   Calls Plaid API        │
                    │   Updates MongoDB        │
                    │   Returns: { synced: N } │
                    └─────────────────────────┘

                    ┌──────────────────────────────────┐
                    │   GET /api/transactions           │  ← Read from MongoDB
                    │   ?month=2026-03                  │     (cheap, no Plaid call)
                    │   ?startDate=...&endDate=...      │
                    │   ?page=1&limit=100               │
                    │   Returns: { transactions, total, │
                    │              hasMore, syncedAt }   │
                    └──────────────────────────────────┘
```

### 1. Split `/getNewAuth` into two endpoints

**`POST /api/sync`** — Trigger Plaid sync
- Calls `getNewPlaidTransactions()` (existing logic)
- Does NOT return transactions
- Returns `{ synced: { added, modified, removed }, syncedAt }`
- Keep existing rate limiter (10/5min)
- Called by: Sync FAB, pull-to-refresh, post-account-link

**`GET /api/transactions`** — Read cached transactions
- Reads from MongoDB only (no Plaid call)
- Supports query params:
  - `month=2026-03` — returns single month (most common)
  - `startDate=...&endDate=...` — date range (for Trends charts)
  - `page=1&limit=100` — cursor/offset pagination for table view
- Returns `{ transactions, total, hasMore }`
- No special rate limiting needed (just reads from DB)
- Called by: page load, month navigation, "Show all" table

**Migration path:** Keep `/getNewAuth` working during transition. New endpoints are additive. Frontend switches over incrementally. Remove old endpoint when no longer called.

### 2. Add MongoDB indexes

These should be created immediately regardless of other changes:

```javascript
// In db/database.js or a migration script
db.collection('Plaid-Transactions').createIndex({ userId: 1, date: -1 });
db.collection('Plaid-Transactions').createIndex({ userId: 1, merchant_name: 1 });
db.collection('Plaid-Transactions').createIndex({ userId: 1, mappedCategory: 1 });
db.collection('Plaid-Transactions').createIndex({ userId: 1, transaction_id: 1 }, { unique: true });
db.collection('Basil-Categories').createIndex({ userId: 1 });
db.collection('Basil-Rules').createIndex({ userId: 1, createdAt: -1 });
db.collection('Plaid-Accounts').createIndex({ userId: 1 });
```

The `{userId, date}` compound index is the most impactful — it covers the primary query pattern (all transactions for a user, sorted by date) and enables efficient month-range queries.

### 3. Frontend: month-based data loading

Replace the "load everything" pattern with month-scoped fetching:

```
BudgetView mounted:
  1. ensureAppData() → categories + rules (same as now)
  2. fetchMonth(currentMonth) → GET /api/transactions?month=2026-03
  3. Store: transactions keyed by month, not a flat array

Month navigation:
  - Check if month is in store cache
  - If yes: render from cache
  - If no: fetchMonth(selectedMonth)

TrendsView:
  - Fetch range: GET /api/transactions?startDate=2025-03&endDate=2026-03
  - Or fetch month-by-month as needed

"Show all" table:
  - Paginated: GET /api/transactions?page=1&limit=100
  - Infinite scroll or "Load more" button
```

**Store shape change:**

```javascript
// Before (flat array)
state: {
  transactions: [/* every transaction ever */]
}

// After (month-keyed cache)
state: {
  transactionsByMonth: {
    '2026-03': [...],
    '2026-02': [...],
  },
  transactionsMeta: {
    totalCount: 1847,
    oldestDate: '2024-01-15',
    lastSyncedAt: '2026-03-08T10:00:00Z',
  }
}
```

### 4. Drop transaction persistence from sessionStorage

With month-based fetching, each page load makes a single cheap DB read for the current month (~50-200 transactions, ~50-150KB). No need to persist transactions in browser storage. Categories, rules, user, and session remain persisted (small, bounded data).

```javascript
reducer: state => ({
  session: state.session,
  user: state.user,
  categories: state.categories,
  rules: state.rules,
  lastPlaidFetch: state.lastPlaidFetch,
})
```

### 5. Sync UX

The user controls when Plaid sync happens:

| Action | What happens |
|--------|-------------|
| Page load / hard refresh | `GET /api/transactions?month=current` — reads from DB, no Plaid call |
| Pull-to-refresh | `POST /api/sync` → then `GET /api/transactions?month=current` |
| Sync FAB | Same as pull-to-refresh |
| Link new account | `POST /api/sync` → then `GET /api/transactions?month=current` |
| Navigate to older month | `GET /api/transactions?month=YYYY-MM` — DB read only |

Throttle on sync endpoint stays (10/5min). Read endpoint has no special throttle.

Optional: show "Last synced: 2 hours ago" badge on Budget view so user knows when data was last refreshed from Plaid.

---

## Implementation phases

### Phase 0: MongoDB indexes (do now, independent of everything else)
- Add indexes to `database.js` initialization
- Zero risk, immediate performance improvement
- Can be done in the current codebase with no other changes

### Phase 1: Split the endpoint (backend only)
- Add `POST /api/sync` — extract Plaid sync logic from `/getNewAuth`
- Add `GET /api/transactions` with `?month=` support
- Keep `/getNewAuth` working (don't break frontend)
- Add `findUserTransactionsByMonth(userId, month)` to `database.js`
- Tests for new endpoints

### Phase 2: Frontend month-based loading
- New store shape: `transactionsByMonth` + `transactionsMeta`
- New store mutations: `setMonthTransactions(month, txns)`, `clearTransactionCache()`
- Update `firebase.js`: `fetchTransactionsForMonth(month)`, `triggerSync()`
- Update BudgetView: fetch current month on mount, fetch on month navigate
- Update TrendsView: fetch date range
- Remove transactions from sessionStorage reducer

### Phase 3: Pagination for table view
- Add `?page=&limit=` to `GET /api/transactions`
- Update "Show all" table in BudgetView to paginate
- Infinite scroll or "Load more" pattern

### Phase 4: Cleanup
- Remove `/getNewAuth` endpoint
- Remove `getAllUserTransactions()` from plaidTools
- Remove flat `state.transactions` from store
- Update any remaining consumers (rule matching, similarity engine)

---

## Impact on existing features

| Feature | Change needed | Risk |
|---------|--------------|------|
| BudgetView month display | Fetch per month instead of filter from array | Low — same data, different source |
| TrendsView charts | Fetch date range | Low — aggregation logic stays client-side |
| RulesView | No transaction data needed currently | None |
| MerchantBrowser | Already uses `/merchantStats` aggregation | None |
| Rule creation sweep | Backend sweep unchanged; frontend `sweepStore` needs to update month cache | Medium |
| Similarity engine (`findSimilarTransactions`) | Currently scans all transactions in store. Would need to either: (a) scan only loaded months, or (b) add a backend similarity endpoint | Medium |
| Bulk categorize | Currently sends transaction IDs. No change needed on the API. Frontend selection is from loaded transactions only | Low |
| "Show all" table with search | Currently filters client-side from all transactions. Needs backend search endpoint or client-side search within loaded pages | Medium |
| Transaction count in header stats | Currently sums from all transactions. Would sum from current month only (which is what it already filters to) | None |

---

## What this does NOT change

- Category and rule data fetching (small, bounded, stays as-is)
- Auth flow (Firebase, dev-bypass — unrelated)
- Plaid Link / account management
- Rule engine logic (condition matching, sweep)
- MongoDB schema (same documents, just queried differently)

---

## Relationship to database migration (Postgres/Supabase)

This rearchitecture is **independent of and complementary to** the database migration plan in `plans/database-migration.md`. The endpoint split and pagination patterns would carry over directly to Postgres. In fact, Postgres with proper indexes and `LIMIT/OFFSET` (or keyset pagination) would make Phase 3 simpler.

If the database migration happens first, implement this rearchitecture on Postgres directly. If this happens first, the patterns translate cleanly.

---

## Decision points

1. **Month-based vs cursor-based pagination?** Month-based is simpler and matches the UI (BudgetView already has a month picker). Cursor-based is more flexible for the table view. Recommendation: month-based for BudgetView/TrendsView, cursor-based for "Show all" table.

2. **Client-side vs server-side search?** Current text search in "Show all" filters client-side. With pagination, search needs to move server-side (MongoDB `$regex` or text index). Can defer to Phase 3.

3. **How does similarity engine work with partial data?** `findSimilarTransactions` scans all transactions to find matches. With month-based loading, it would only see loaded months. Options: (a) accept reduced accuracy (most similar transactions are recent anyway), (b) add a backend similarity endpoint. Recommend (a) for now, (b) as a future optimization.

4. **Cache invalidation after rule changes?** When a rule is created/edited, the backend sweeps matching transactions. The frontend month cache becomes stale. Options: (a) re-fetch current month after rule changes, (b) apply sweep client-side to loaded months (existing `sweepStore` pattern). Recommend (b) — it's already implemented and works.
