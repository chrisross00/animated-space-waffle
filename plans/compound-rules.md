# Plan: Compound Rules + Global Rules View

## Context

The current rule engine is a blunt instrument. Rules match on a single field — either
`merchant_name` or transaction `name` — and map that to one category. This works well
for deterministic merchants (Starbucks is always Coffee) but breaks down for peer payment
apps (Venmo, Zelle, Cash App) where the same sender means completely different things
depending on amount, memo, and timing.

The triage flow (Smart To Sort) made this visible: a user who says "Remember for Venmo"
creates a rule that paints every Venmo transaction with a single category, which is almost
always wrong. And beyond Venmo, users have no visibility into what rules are running — they
accumulate silently in category dialogs with no global view.

This plan adds:
1. **Compound rules** — multi-condition rules (merchant + amount range + memo/statement, etc.)
2. **Global rules view** — a dedicated `/rules` page showing all rules, across all categories,
   with edit/delete actions
3. **Updated triage flow** — a second "remember" option: "Remember for transactions like this"
   that creates a compound rule instead of a broad merchant rule

---

## What's broken today

- `merchant_name: ["Venmo"]` rule → all Venmo transactions categorized identically. Wrong.
- Rules live inside `Basil-Categories` documents, buried per-category. No global view.
- Users who've been using the app for months have no idea what rules are running.
- Mistakes (wrong rule created from triage) have no correction path.
- Simple rules have no priority/specificity ordering — evaluation order is implicit.

---

## Terminology

- **Simple rule** — existing behavior. Single field match: `merchant_name` or `name`.
  Stored as arrays in `Basil-Categories.rules`.
- **Compound rule** — new. Multiple conditions (AND logic). Stored in a new `Basil-Rules`
  collection. Always takes priority over simple rules.
- **Routing rule** — a compound rule whose action is "send to To Sort" rather than a
  category. Useful for explicitly flagging ambiguous merchants for triage.

---

## Data model

### New collection: `Basil-Rules`

```json
{
  "_id": "...",
  "userId": "...",
  "label": "Venmo rent",
  "conditions": [
    { "field": "merchant_name", "op": "eq",    "value": "Venmo" },
    { "field": "amount",        "op": "range",  "min": 700, "max": 900 }
  ],
  "action": {
    "type": "categorize",
    "categoryId": "...",
    "categoryName": "Housing"
  },
  "createdAt": 1234567890,
  "createdFrom": "triage"
}
```

**Action types:**
- `categorize` — assign to a category (most rules)
- `route` with `destination: "to-sort"` — send to To Sort regardless of other rules
  (useful for "always review Venmo" without a category assignment)

**Supported condition fields:**
- `merchant_name` — op: `eq` (exact match, case-insensitive)
- `name` — op: `contains` (substring match on transaction name/memo)
- `amount` — op: `range` (min/max, based on absolute value)
- `day_of_month` — op: `range` (min/max, for recurring rent-on-the-1st patterns)

**Rule priority:**
1. Compound rules (Basil-Rules) — evaluated first, most specific match wins
   (specificity = number of conditions; ties broken by `createdAt` desc)
2. Simple rules (Basil-Categories.rules) — evaluated second if no compound rule fires
3. Default — To Sort

### Existing `Basil-Categories.rules` — no migration needed

Simple rules stay where they are. Compound rules layer on top. No breaking change.

---

## Backend changes

### New utility — `evaluateCompoundRules(userId, transaction)`
In `categoryMapping.js` (or a new `utils/ruleEngine.js`):
1. Load user's compound rules from `Basil-Rules`
2. For each rule (sorted by specificity desc), test all conditions against the transaction
3. Return first matching rule's action, or `null` if no match

### Update `categoryMapping.js` — rule evaluation order
Before checking simple rules, call `evaluateCompoundRules`. If it returns a match, use it.

### New API routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/rules` | GET | Fetch all compound rules for user |
| `/api/saveCompoundRule` | POST | Create a new compound rule |
| `/api/updateCompoundRule` | POST | Edit label or conditions on existing rule |
| `/api/deleteCompoundRule` | POST | Delete by rule `_id` |

All follow existing auth + pattern from `api.js`.

---

## Frontend: Global Rules View (`/rules`)

New route and view file: `frontend/src/views/RulesView.vue`

### Layout

```
┌─────────────────────────────────────────┐
│ RULES                                   │
│                                         │
│ Compound rules                          │
│ ┌─────────────────────────────────────┐ │
│ │ Venmo rent               Housing  ✕ │ │
│ │ Venmo · $700–$900                   │ │
│ ├─────────────────────────────────────┤ │
│ │ Spotify               Subscriptions │ │
│ │ Venmo · contains "spotify"        ✕ │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Merchant & name rules                   │
│ ┌─────────────────────────────────────┐ │
│ │ Starbucks              Coffee     ✕ │ │
│ │ merchant rule                       │ │
│ ├─────────────────────────────────────┤ │
│ │ ...                                 │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

- Two sections: compound rules (new) on top, simple merchant/name rules below
- Each compound rule row: label + conditions summary + target category + delete button
- Each simple rule row: merchant or name value + target category + delete button
  (same delete action as the existing chip × in Edit Category dialog, just surfaced globally)
- Empty state if no rules yet
- Tap a compound rule row → inline edit (label + conditions). Keep it simple for v1.
- Add to nav: drawer link. Defer bottom nav tab — nav is already crowded.

---

## Frontend: Updated Triage Flow

Two "remember" options instead of one:

```
○  Remember for Venmo
   All Venmo transactions → Food & Dining

○  Remember for transactions like this
   Venmo · ~$42 → Food & Dining
   ▾ Advanced  (expandable: shows editable conditions)
```

- "Remember for Venmo" — existing behavior, creates a simple `merchant_name` rule
- "Remember for transactions like this" — creates a compound rule. Pre-fills:
  - `merchant_name eq <merchant>` (if merchant_name exists)
  - `amount range <bucket_min>–<bucket_max>` (based on amount bucket)
  - Label auto-generated: `"<Merchant> ~$<amount>"`
- "Advanced" expander — shows the conditions that will be created, lets user
  adjust before saving. Scope this carefully — keep it readable, not a full rule editor.
- Only one option can be selected at a time. Neither is pre-selected (explicit opt-in).

**Saving a compound rule from triage:**
1. POST `/api/saveCompoundRule` with conditions + action
2. On success: locally sweep matching To Sort transactions (same as existing merchant rule sweep)
3. Store: add rule to a new `rules` state slice (or refetch on next load)

---

## Store changes

Add a `rules` slice to Vuex store:
```js
state: {
  rules: [],  // compound rules from Basil-Rules
  ...
}
```
Mutations: `setRules`, `addRule`, `removeRule`, `updateRule`
Loaded on session init alongside transactions and categories.

---

## Open questions

1. **Rule editing UX** — v1 plan is inline edit on the rules view. Is that enough, or do
   users need a dedicated edit dialog? Defer until we see how complex the conditions get.

2. **`name` field matching for Venmo memos** — Plaid sometimes puts the payment memo in
   `transaction.name` (e.g., "Venmo - rent"). Need to audit actual Venmo transaction data
   before designing around this. Could be a strong signal; could be inconsistent.

3. **Routing rules ("always send to To Sort")** — the data model supports it, but should
   this be exposed in the triage flow or only in the rules view? Triage flow might be
   confusing ("remember to keep reviewing this?"). Rules view seems cleaner.

4. **Simple rule migration** — existing simple rules stay in `Basil-Categories`. Long-term,
   should they migrate to `Basil-Rules` for a unified model? Probably yes, but not in v1.
   Keep backward compat for now.

5. **`day_of_month` condition** — useful for recurring payments (rent on the 1st–5th).
   Include in v1 or defer? It's a strong signal but adds UI complexity to the condition editor.

6. **Retroactive sweep on compound rule creation** — when a user creates a compound rule,
   should it sweep historical To Sort transactions matching those conditions (same as simple
   rules do today)? Almost certainly yes, but confirm before implementing.

---

## What's out of scope for v1

- Rule import/export
- Rule priority manual ordering (specificity-based auto-ordering is sufficient)
- Regex or complex string matching
- OR logic between conditions (AND only for now)
- Compound rules created outside of triage (proactive rule creation)
