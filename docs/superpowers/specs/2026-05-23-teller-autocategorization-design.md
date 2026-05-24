# Teller Auto-Categorization — Design

**Status:** Design approved (brainstorm). Ready for spec review → implementation plan.

## Problem

The Plaid → Teller migration removed Plaid's Personal Finance Category (PFC) taxonomy
(~96 detail codes), which was the engine's automatic first-pass categorizer
(`PFC_DETAIL_TO_CATEGORY` in `categoryMapping.js`). New Teller transactions arrive with
`personal_finance_category = null`, so that layer never fires — and **every new merchant
falls straight to "To Sort"** until the user manually triages it. We need to restore an
automatic first pass without it.

## What Teller actually gives us (verified on prod data, 2026-05-23)

Each Teller transaction carries:
- `details.category` — a **coarse category** (`shopping`, `dining`, `entertainment`, …;
  ~25 documented values). Coverage is **partial**: some transactions have no category,
  and `general` is a useless catch-all.
- `details.counterparty.name` — a **clean merchant name** (`AMAZON`), already mapped onto
  `transactions.merchant_name` by `tellerToInternal`. Good for user-built merchant rules.

## Decisions locked in (from brainstorm)

1. **Replace the dead PFC layer with a Teller-category layer.** Everything else in
   `categoryMapping.js` stays.
2. **No history mining.** We deliberately do NOT bootstrap rules from the user's past
   categorizations — that would overfit the engine to one user and not generalize to
   other users. The map is a **general** taxonomy, like the old PFC map was.
3. **Auto-apply Teller's category, but flag it as a guess.** Guessed categories are
   applied (least To Sort) but visibly marked low-confidence so the user can review —
   matching the standing "never silently override me" preference.
4. **Only specific Teller categories become guesses.** `general`, missing category, and
   P2P transactions (Venmo/Zelle/…) → **To Sort** (no bad guesses).
5. **Guess surfacing:** a passive **badge** everywhere a transaction shows, **plus** a
   non-blocking **"review guesses" filter/count** in the Show All table.
6. **Recategorizing a guess clears the flag** (source flips to `manual`/`rule`).

## Architecture

### Engine layering (`categoryMapping.js` `mapTransactions`)

Order is unchanged except the PFC layer is replaced. Each layer that assigns
`mappedCategory` now also stamps `category_source`:

| Priority | Layer | `category_source` |
|----------|-------|-------------------|
| 1 | Compound rules (user-defined) | `rule` |
| 2 | Name / merchant rules (user-defined, built via triage) | `rule` |
| 3 | **Teller category → Basil** (specific categories only) | `teller_category` (guess) |
| 4 | P2P detection (`isP2PTransaction`) → To Sort | `null` |
| 5 | `general` / no category / nothing matched → To Sort | `null` |

P2P still routes to To Sort regardless of any Teller category (unchanged behavior). The
legacy PFC block stays in place for now (harmless — never fires for Teller's null PFC;
removed in the Plaid Phase 3 cleanup).

### `category_source` field

New nullable column on `transactions`. Values:
- `rule` — matched a user-defined compound/name/merchant rule (confident).
- `teller_category` — auto-applied from Teller's category map (the **guess**).
- `manual` — the user explicitly set/confirmed the category.
- `null` — uncategorized (To Sort) or pre-existing rows.

This single field powers the guess badge today and the "confidence reason chips"
backlog item later.

### The Teller category map (`utils/tellerCategoryMapping.js`)

A new module exporting `TELLER_CATEGORY_TO_BASIL`, analogous to `pfcDetailMapping.js`.
Maps Teller's category enum → Basil category names (the 12 default categories: Income,
Rent & Utilities, Food & Dining, Transportation, Entertainment, Travel, Shopping,
Health, Services, Taxes & Giving, Payments & Transfers, To Sort).

**Proposed mapping** (Teller's documented enum → Basil; verify the full enum against
Teller's docs at build time and add any missing values):

| Teller category | Basil category |
|---|---|
| `accommodation` | Travel |
| `bar`, `dining`, `groceries` | Food & Dining |
| `clothing`, `electronics`, `office`, `home`, `shopping` | Shopping |
| `entertainment`, `sport` | Entertainment |
| `fuel`, `transport`, `transportation` | Transportation |
| `health` | Health |
| `phone`, `utilities` | Rent & Utilities |
| `charity`, `tax` | Taxes & Giving |
| `income` | Income |
| `loan`, `investment` | Payments & Transfers |
| `insurance`, `service`, `software`, `education`, `advertising` | Services |
| `general`, anything unmapped, missing | **(omit → To Sort)** |

Omitting a key (not mapping it) means it falls through to To Sort — no guess. Keep the
map conservative: when a Teller category doesn't map cleanly to a single Basil category,
omit it rather than guess wrong.

## Data flow

1. **Sync** (`pullTellerTransactions` → `tellerToInternal`): add
   `teller_category: t.details?.category || null` to the internal shape.
2. **Categorize** (`mapTransactions`): the layer table above assigns `mappedCategory` +
   `category_source`.
3. **Insert** (`insertTransactions`): persist `category_source` (new column in the INSERT
   + the `ON CONFLICT DO UPDATE` leaves it alone on conflict — pending/date only).
4. **Read** (`TXN_COLUMNS` / transaction selects): include `category_source` so the
   frontend can render the badge.
5. **Recategorize** (`handleDialogSubmit` / `updateTransaction`): a pure manual edit sets
   `category_source = 'manual'`; creating a rule (merchant/compound) sets `rule` on the
   swept transactions. Either way the guess badge clears.

## Frontend

- **Guess badge:** where `category_source === 'teller_category'`, render a small badge
  (reuse the existing badge pattern, e.g. `basil-txn-pending`-style) on the transaction
  in budget category rows, the Show All table, and the drill-down. Read `DESIGN.md`
  before building; use a Basil token-based style, no one-offs.
- **Review-guesses filter:** in the Show All table, a non-blocking filter + count
  (e.g. "N guessed") that filters to `category_source === 'teller_category'`. Lets the
  user batch-review on demand; never blocks the normal flow.

## Edge cases & risks

- **Partial Teller coverage:** ~some transactions have no category or `general` → they
  go to To Sort. Expected; still far better than 100% To Sort.
- **Wrong guesses:** coarse categories will occasionally mis-file (e.g. `shopping` for a
  grocery run at a big-box store). The badge + review filter are the mitigation; user
  correction creates a rule that wins next time.
- **Map drift:** if Teller adds/renames categories, unmapped values silently → To Sort
  (safe degradation). Revisit the map if To Sort volume climbs.
- **Backfill:** existing rows have `category_source = null`. We do NOT re-run mapping on
  historical rows; the field is informational and only populated going forward.

## Out of scope

- Re-categorizing historical transactions.
- Per-user / history-based personalization of the map (explicitly rejected).
- Confidence chips beyond the single guess badge (future; the field supports it).
- Income-detection nudge (separate backlog item).

## Testing

Per the codebase's pure-function test convention (Vitest, no live DB/API):
- Unit-test the new Teller-category layer in `categoryMapping.js`: a specific category
  maps + stamps `teller_category`; `general`/missing → To Sort with `null` source; P2P →
  To Sort even with a category; user rules still win and stamp `rule`.
- Unit-test `TELLER_CATEGORY_TO_BASIL` shape (every value is a real Basil category name).
- I/O pieces (column, persistence, frontend badge/filter) verified by smoke test.
