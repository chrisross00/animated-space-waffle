# Transaction Relationship Detection

**Status:** Planning

## Problem statement

P2P transactions (Venmo, Zelle, Cash App) carry zero useful data from Plaid — no counterparty, no memo, identical `name` fields. Users can't tell what a $47 Venmo incoming payment was for without checking Venmo separately. Meanwhile, a $94 restaurant charge from the same night sits in a different category. These are obviously related — one is a split — but the app treats them as completely independent.

Beyond splits, other transaction relationships go undetected:
- **Returns/refunds**: identical positive and negative amounts from the same merchant
- **Commonly-split expenses**: rent, utilities, internet — categories where P2P paybacks are expected

The Venmo CSV import (`utils/venmoEnrichment.js`) was the first step, adding counterparty names and notes. This feature builds on that enrichment data and extends detection to all P2P transactions, even without a CSV import.

---

## Relationship types

### 1. Splits (highest value)

A larger purchase followed by a smaller incoming P2P payment within a date window.

**Signals (scored, not binary):**
- **Amount ratio**: incoming / purchase matches common split patterns (50%, 33%, 25%, or close)
- **Date proximity**: closer = higher confidence (same day > 1-3 days > 4-7 days)
- **PFC tier**: purchase category weight — dining/rent/utilities are commonly split, office supplies are not
- **Venmo enrichment**: if `venmo_note` matches merchant name or `venmo_counterparty` is known, much higher confidence
- **Account type**: incoming transaction is from a P2P account (Venmo, Zelle, Cash App)

**Detection logic:**
```
For each incoming P2P transaction (amount < 0, P2P account):
  Search for purchase transactions (amount > 0) where:
    - date is within SPLIT_DATE_WINDOW days before the P2P date
    - amount ratio (abs(p2p) / purchase) is close to 1/N for N in [2,3,4]
    - not already linked to another relationship
  Score each candidate using weighted signals
  If best score > threshold, propose as split
```

### 2. Returns/refunds

Matching positive (charge) and negative (credit) amounts from the same source.

**Signals:**
- **Amount match**: exact or near-exact (within $0.50 for partial refunds)
- **Same merchant**: `merchant_name` or `name` match
- **Date proximity**: returns typically within 1-30 days
- **PFC match**: same `personal_finance_category.primary`

### 3. Recurring splits (future)

Same counterparty + similar amount + monthly cadence = recurring split (rent with roommate, shared utility bill). Builds on split detection + recurring transaction detection already shipped.

---

## PFC tier system

Category weights for split likelihood, stored as a standalone JSON config so tiers can be managed independently.

**File: `frontend/src/config/splitTiers.json`**

```json
{
  "$comment": "PFC tier weights for split detection. Higher weight = more likely to be split.",
  "tiers": {
    "high": {
      "weight": 1.0,
      "categories": [
        "FOOD_AND_DRINK",
        "FOOD_AND_DRINK_RESTAURANTS",
        "FOOD_AND_DRINK_COFFEE",
        "FOOD_AND_DRINK_FAST_FOOD",
        "FOOD_AND_DRINK_BAR",
        "RENT_AND_UTILITIES",
        "RENT_AND_UTILITIES_RENT",
        "RENT_AND_UTILITIES_ELECTRICITY",
        "RENT_AND_UTILITIES_GAS",
        "RENT_AND_UTILITIES_INTERNET_AND_CABLE",
        "RENT_AND_UTILITIES_WATER",
        "ENTERTAINMENT",
        "ENTERTAINMENT_SPORTING_EVENTS",
        "ENTERTAINMENT_MUSIC",
        "TRAVEL",
        "TRAVEL_LODGING"
      ]
    },
    "medium": {
      "weight": 0.5,
      "categories": [
        "TRANSPORTATION",
        "TRANSPORTATION_TAXI",
        "GENERAL_MERCHANDISE",
        "GENERAL_MERCHANDISE_SUPERSTORES",
        "RECREATION",
        "PERSONAL_CARE"
      ]
    },
    "low": {
      "weight": 0.1,
      "categories": []
    }
  },
  "defaultWeight": 0.1
}
```

The `low` tier is the catch-all: any PFC not in `high` or `medium` gets `defaultWeight`. This keeps the config file focused on explicit inclusions rather than exhaustive listings.

**Usage pattern:**
```js
import tiers from '@/config/splitTiers.json';

function getPfcWeight(pfcPrimary) {
  for (const tier of Object.values(tiers.tiers)) {
    if (tier.categories.includes(pfcPrimary)) return tier.weight;
  }
  return tiers.defaultWeight;
}
```

Both `primary` and `detailed` PFC values can appear in the tiers — the lookup checks both, preferring the more specific `detailed` match.

---

## Detection approach

### v1: Simple heuristic filters (ship first, tune later)

Start with hard filters rather than a weighted scoring model. This lets us validate
against real data before investing in tuning knobs.

### Splits

**Hard filters (all must pass):**
1. Incoming transaction is from a P2P account (`isP2PTransaction()`)
2. Amount ratio (`abs(p2p) / purchase`) is within 5% of 1/N for N in [2, 3, 4]
3. Date proximity: P2P date is within 7 days after the purchase date

**Bonus signals (upgrade confidence from medium → high):**
- Venmo enrichment: `venmo_note` matches merchant name, or `venmo_counterparty` is known
- PFC tier: purchase is in a commonly-split category (dining, entertainment, travel, rent/utilities)

**Confidence levels:**
- `high`: passes hard filters + at least one bonus signal
- `medium`: passes hard filters only
- Below: no suggestion

### Returns

**Hard filters (all must pass):**
1. Same merchant (`merchant_name` match, or `name` match if no merchant_name)
2. Amount match: exact or within $0.50
3. Date proximity: return is within 30 days after the charge

**Confidence:** returns are high-confidence only — if all three filters pass, it's `high`. No medium tier.

### Future: weighted scoring model

Once we have real data on false positive rates, we can introduce weighted scoring
with tunable parameters. The PFC tier JSON config and signal weights from the original
design are preserved below for reference but not implemented in v1.

<details>
<summary>Deferred scoring model (reference)</summary>

Each candidate relationship gets a confidence score (0-1):

```
score = (ratioScore * RATIO_WEIGHT)
      + (dateScore * DATE_WEIGHT)
      + (pfcScore * PFC_WEIGHT)
      + (venmoScore * VENMO_WEIGHT)
      + (merchantScore * MERCHANT_WEIGHT)
```

#### Splits

| Signal | Weight | Scoring |
|--------|--------|---------|
| Amount ratio | 0.30 | 1.0 if within 2% of 1/N; 0.5 if within 5%; 0 otherwise |
| Date proximity | 0.25 | 1.0 same day; linear decay to 0 at SPLIT_DATE_WINDOW |
| PFC tier | 0.15 | tier weight from splitTiers.json |
| Venmo enrichment | 0.20 | 1.0 if note matches merchant; 0.5 if counterparty known; 0 otherwise |
| P2P account match | 0.10 | 1.0 if incoming from known P2P account; 0 otherwise |

**Thresholds:** `high` >= 0.7, `medium` >= 0.45, below = no suggestion

#### Returns

| Signal | Weight | Scoring |
|--------|--------|---------|
| Amount match | 0.40 | 1.0 exact; 0.7 within $0.50; 0 otherwise |
| Merchant match | 0.35 | 1.0 merchant_name match; 0.7 name match; 0 otherwise |
| Date proximity | 0.15 | 1.0 within 3 days; linear decay to 0 at 30 days |
| PFC match | 0.10 | 1.0 if same primary PFC; 0 otherwise |

**Threshold:** `high` >= 0.8 (returns should be high-confidence only)

</details>

---

## Effective date

New field on transactions: `effectiveDate` (string, YYYY-MM-DD format, optional).

**Purpose:** When a user confirms a split, offer to align the P2P repayment date with the original purchase date. This handles cross-month delays (friend pays you back 3 days into the new month, but the dinner was last month).

**Rules:**
- `effectiveDate` defaults to `null` (uses `date` as-is)
- When set, budget month calculations use `effectiveDate` instead of `date`
- Original `date` (from Plaid) is never mutated — `effectiveDate` is the user-controlled override
- Plaid sync never touches `effectiveDate` — it persists across syncs
- Display: transaction shows original date with a small indicator if effectiveDate differs

**Schema change:**
- MongoDB: new optional field on `Plaid-Transactions`
- Store: `updateTransaction` mutation already updates `date` — extend to handle `effectiveDate`
- Month filtering: `(txn.effectiveDate || txn.date).substring(0, 7)` replaces `txn.date.substring(0, 7)`

**Impact radius for effectiveDate:**
- `store.js`: `setTransactions`, `setMonthTransactions` — month bucketing logic
- `firebase.js`: `fetchMonthRange` — month key derivation
- `BudgetView.vue`: month filtering, grouping, stats
- `TrendsView.vue`: all chart aggregations
- `App.vue`: header stats
- Backend: `findUserTransactionsByMonth` query — needs to consider effectiveDate

This is a significant change. The `effectiveDate` field is simple to add, but updating all
month-filtering consumers is a medium-sized refactor. Worth doing in a dedicated pass.

---

## Data model additions

### Transaction fields (new)

```js
{
  // ... existing fields ...
  effectiveDate: "2026-03-07",      // optional, user-set date override
  linkedTransaction: {               // optional, set when user confirms relationship
    transaction_id: "abc123",        // the related transaction
    type: "split" | "return",       // relationship type
    confirmedAt: "2026-03-09T...",  // when user confirmed
  },
}
```

### P2P account detection

Rather than hardcoding Venmo/Zelle/Cash App, detect P2P accounts by name patterns:

```js
const P2P_PATTERNS = [
  /venmo/i, /zelle/i, /cash app/i, /cashapp/i,
  /paypal/i, /apple cash/i,
];

function isP2PTransaction(txn) {
  const sources = [txn.account, txn.merchant_name, txn.name].filter(Boolean);
  return sources.some(s => P2P_PATTERNS.some(p => p.test(s)));
}
```

This already exists partially in `venmoEnrichment.js` — should be extracted to a shared utility.

---

## UI design (two surfaces)

### 1. Passive: relationship indicators on transactions

Visual indicators on transaction rows in both the "Show All" table and expanded category lists in BudgetView.

When a transaction has a detected (but unconfirmed) relationship:
- Small icon/badge on the transaction row (e.g., `link` icon, muted)
- Tooltip: "Possible split with [merchant] ($94.00)"

When a relationship is confirmed:
- Icon changes to solid/filled
- Tooltip: "Split with [merchant] ($94.00) · confirmed"

**Future (v2):** Tapping the indicator could open a dedicated split management view — for now, the triage flow is the primary path to confirm/dismiss. Multi-way split indicators (e.g., "Split 3 ways") also deferred to v2.

### 2. Active: triage integration

Detected relationships appear as items within the existing triage flow, not a separate card. When the user enters triage ("Sort Transactions"), relationship suggestions are interleaved or shown after uncategorized transactions.

**Triage card for a detected split:**
- Shows both transactions (the purchase + the P2P payment) side-by-side or stacked
- Confidence badge (high/medium)
- Actions: "Yes, it's a split" / "Not related" / "Skip"
- On confirm: auto-categorize the P2P transaction to match the purchase; optionally set effective date (Phase 3)
- "Not related" sets `dismissedRelationship` on the transaction — won't be re-suggested

**Future (backlog):** Retroactive suggestions — on confirming a split, detect similar historical patterns and add them as additional triage items.

---

## Implementation phases

### Phase 1: Detection + indicators + triage + persistence (single PR)

Shipping detection without a way to act on it creates dead ends. Merge the detection
engine, passive indicators, triage integration, and persistence into one deliverable.

**Detection engine:**
- Create `frontend/src/utils/relationshipDetector.js` — hard-filter heuristics (not weighted scoring)
- Extract `isP2PTransaction()` to shared utility (partially exists in `venmoEnrichment.js`)
- Client-side: runs on loaded transactions in store, produces relationship suggestions

**Passive indicators:**
- Relationship badges on transaction rows (Show All table + expanded category lists)
- Muted icon for unconfirmed, solid for confirmed
- Tooltip shows matched transaction details

**Triage integration:**
- Detected relationships appear as triageable items in the existing triage flow
- Triage card shows both transactions (purchase + P2P payment)
- Actions: "Yes, it's a split" / "Not related" / "Skip"
- On confirm: auto-categorize the P2P transaction to match the purchase

**Persistence:**
- Add `linkedTransaction` field to transaction schema
- Add `dismissedRelationship` field to transaction schema (boolean or timestamp)
- Backend: `POST /api/linkTransactions` — persist confirmed relationships
- Backend: `POST /api/dismissRelationship` — set `dismissedRelationship` on transaction

**Test personas:**
- Add `splits` persona to `scripts/test-data/personas.js` (see Test Personas section)

### Phase 2: Effective date (standalone PR)
- Add `effectiveDate` field to schema
- Update all month-filtering consumers (store, views, backend query)
- Offer date alignment on split confirmation
- Display indicator when effectiveDate differs from date

### Phase 3: Venmo enrichment integration
- Cross-reference `venmo_note` against merchant names for higher-confidence matches
- Show enrichment data in triage card
- Counterparty name displayed on confirmed splits

---

## Test personas

Two new personas for `scripts/test-data/personas.js`, following existing patterns
(deterministic seeding, idempotent, same field structure).

### `splits` (test-user-splits)

**Purpose:** Validate split detection across confidence levels and edge cases.

**Accounts:**
- Chase Checking ($6,000)
- Venmo (P2P account, $500)

**Categories:** Food & Dining ($600/mo), Entertainment ($200/mo), Rent & Utilities ($2,200/mo), Shopping ($300/mo)

**Transactions (4 months, normal density + injected split scenarios):**

| Scenario | Purchase | P2P Payment | Expected |
|----------|----------|-------------|----------|
| **High confidence: same-day 50/50 dining** | Sushi Palace $94, Mar 5 | Venmo +$47, Mar 5 (venmo_note: "sushi") | High — exact ratio + same day + enrichment + high-tier PFC |
| **High confidence: 3-way split** | Concert tickets $150, Mar 2 | Venmo +$50, Mar 3 | High — exact 1/3 + next day + high-tier PFC |
| **Medium confidence: close ratio, no enrichment** | Bar tab $80, Feb 28 | Zelle +$38, Mar 2 | Medium — ratio ~47.5% (close to 50%) + no enrichment |
| **Medium confidence: 4-way split** | Airbnb $400, Feb 15 | Venmo +$100, Feb 18 | Medium — exact 1/4 + 3 day gap |
| **No match: wrong ratio** | Amazon $67, Mar 1 | Venmo +$20, Mar 2 | No match — ratio 29.8% (not close to any 1/N) |
| **No match: too far apart** | Dinner $60, Feb 1 | Venmo +$30, Feb 15 | No match — 14 days apart (outside 7-day window) |
| **Return: exact refund** | Nike Store $89.99, Mar 3 | Nike Store -$89.99, Mar 7 | High return — exact amount + same merchant |
| **Return: partial refund** | Best Buy $149.99, Feb 20 | Best Buy -$149.50, Feb 25 | High return — within $0.50 + same merchant |
| **Edge: P2P with no matching purchase** | (none) | Venmo +$25, Mar 8 (venmo_note: "lunch") | No match — nothing to link to |
| **Edge: already-linked transaction** | Dinner $100, Mar 1 (pre-linked) | Venmo +$50, Mar 1 (pre-linked) | Should not re-suggest |

**Compound rules:** 1 rule (Venmo → To Sort)

**Venmo enrichment:** 60% of Venmo transactions have `venmo_counterparty` + `venmo_note`

### `returns` (test-user-returns)

**Purpose:** Validate return/refund detection specifically.

**Accounts:**
- BofA Checking ($4,000)
- BofA Credit Card ($1,200 balance, $5k limit)

**Categories:** Shopping ($400/mo), Food & Dining ($500/mo)

**Transactions (3 months, normal density + injected return scenarios):**

| Scenario | Charge | Refund | Expected |
|----------|--------|--------|----------|
| **Exact refund, same merchant** | Target $45.67, Mar 2 | Target -$45.67, Mar 5 | High return |
| **Partial refund** | Nordstrom $200, Feb 10 | Nordstrom -$185, Feb 18 | No match — $15 diff exceeds $0.50 |
| **Same merchant, wrong amount** | Whole Foods $92, Mar 1 | Whole Foods -$12.50, Mar 3 | No match — not a refund pattern |
| **Same amount, different merchant** | $50 charge from Store A, Mar 1 | $50 credit from Store B, Mar 3 | No match — different merchants |
| **Refund too late** | REI $120, Jan 5 | REI -$120, Feb 20 | No match — 46 days apart |

---

## Decisions (resolved)

1. **Dismissed relationships** — use a `dismissedRelationship` field on the transaction, not a list on the user doc. Scales better and translates cleanly to a column in SQL when we migrate off MongoDB.

2. **Relationship review card placement** — integrate into the existing triage flow. Detected relationships should appear as a subset of triageable items (e.g., after uncategorized transactions, or interleaved by confidence). No separate card or view.

3. **Retroactive detection** — not in initial implementation. Future backlog item: when confirming a split, suggest similar historical patterns as additional triage items ("You split dinner here last month too").

4. **Multi-way splits** — 1:1 linking for now. Multi-way splits (e.g., $120 dinner with 3×$40 paybacks) are a backlog item — would extend `linkedTransaction` to an array. Start simple.

5. **Phase 3 scope** — `effectiveDate` is a standalone PR, separate from Phase 1. The month-filtering refactor touches too many consumers to bundle.

6. **Detection approach** — start with simple hard filters (pass/fail), not a weighted scoring model. Validate against real data first, then introduce tunable weights if false positive rates warrant it. Phases 1+2 merged into a single deliverable to avoid shipping detection with no way to act on it.

7. **Transaction row indicators** — ship passive indicators (badges/tooltips) in Phase 1. Tapping them doesn't do anything yet — triage flow is the primary interaction. A dedicated split management view (tap to expand, multi-way display) is v2 alongside multi-way splits.
