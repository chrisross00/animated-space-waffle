# PFC Detail Spending Breakdown — Design Spec

## Goal

Add a "Breakdown" tab to TrendsView showing a donut chart of spending by Plaid PFC
detail code for the selected month. Gives users a granular view of where their money
goes without requiring any budget setup.

## Architecture

**New file:** `frontend/src/utils/pfcDisplayLabels.js`
- ~127-entry object mapping PFC detail codes to friendly display labels
- Labels written in Basil voice (plain, warm, no jargon)
- Separate from `pfcDetailMapping.js` (which maps to Basil categories for the engine)
- Exported as `PFC_DISPLAY_LABELS`

**Modified file:** `frontend/src/views/TrendsView.vue`
- Add `PieChart` to ECharts `use()` registration (currently only BarChart + LineChart)
- Add `'breakdown'` to the chart toggle options
- Add `breakdownChartOptions` computed property
- Add single-month navigator (prev/next arrows + month label) shown when
  `activeChart === 'breakdown'`, replacing the 3/6/12 month toggle
- Uses existing `CHART_PALETTE`, `ANIMATION`, custom HTML legend patterns

## Data Flow

```
store.state.transactions
  → filter: selected month (using effectiveDate || date)
  → filter: expense-type categories only (build name set from
    (store.state.categories || []).filter(c => c.type === 'expense'),
    same pattern as existing incomeNames/expenseNames at line ~243)
  → filter: !txn.excludeFromTotal
  → group by: txn.plaidPfcDetail (null/undefined → "Other spending")
  → map labels: PFC_DISPLAY_LABELS[code] || code
  → sort: descending by total
  → collapse: slices < 2% of total into "Other"
  → output: ECharts pie/donut option
```

## Chart Spec

- **Type:** Donut (`pie` with `radius: ['40%', '70%']`)
- **Colors:** `CHART_PALETTE` (existing 15-color warm editorial palette)
- **Legend:** Custom HTML below chart (`.basil-chart-legend` pattern).
  "Other" appears as a single legend entry.
- **Tooltip:** Shows label, dollar amount, and percentage
- **Animation:** Spread `ANIMATION` constant
- **Center label:** Total spending for the month, formatted as `$X,XXX`
  (define `formatDollar` locally or extract from BudgetView if trivial)
- **"Other" bucket:** Slices below 2% of total collapsed into single slice
- **Dark mode:** Series colors from `CHART_PALETTE` work in both themes.
  Center label text uses `var(--basil-text)` for theme awareness.

## Month Navigation

When `activeChart === 'breakdown'`, hide the 3/6/12 month toggle and show a
single-month navigator instead: `◀ March 2026 ▶`. Track as a separate reactive
`breakdownMonth` (defaults to current month). Reuses `dayjs` already imported.

## Display Labels

Friendly, plain-language labels for each PFC detail code. Examples:

| PFC Detail Code | Display Label |
|---|---|
| `FOOD_AND_DRINK_COFFEE` | Coffee |
| `FOOD_AND_DRINK_RESTAURANT` | Restaurants |
| `FOOD_AND_DRINK_GROCERIES` | Groceries |
| `FOOD_AND_DRINK_FAST_FOOD` | Fast food |
| `FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR` | Beer, wine & liquor |
| `ENTERTAINMENT_TV_AND_MOVIES` | TV & movies |
| `ENTERTAINMENT_VIDEO_GAMES` | Video games |
| `ENTERTAINMENT_MUSIC_AND_AUDIO` | Music |
| `GENERAL_MERCHANDISE_ONLINE_MARKETPLACES` | Online shopping |
| `GENERAL_MERCHANDISE_ELECTRONICS` | Electronics |
| `GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES` | Clothing |
| `TRANSPORTATION_TAXIS_AND_RIDE_SHARES` | Rides & taxis |
| `TRANSPORTATION_GAS` | Gas |
| `TRANSPORTATION_PARKING` | Parking |
| `RENT_AND_UTILITIES_RENT` | Rent |
| `RENT_AND_UTILITIES_GAS_AND_ELECTRICITY` | Electric & gas |
| `RENT_AND_UTILITIES_INTERNET_AND_CABLE` | Internet |
| `PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS` | Gym |
| `MEDICAL_PHARMACIES_AND_SUPPLEMENTS` | Pharmacy |
| `GENERAL_SERVICES_INSURANCE` | Insurance |
| `GOVERNMENT_AND_NON_PROFIT_DONATIONS` | Donations |
| `TRAVEL_FLIGHTS` | Flights |
| `TRAVEL_LODGING` | Hotels |

Full table covers all ~127 v2 codes. Unmapped codes fall back to the raw code
string (should never happen since we maintain full coverage).

## Exclusions

- **Income transactions** (`category.type === 'income'`) — not spending
- **Payment/transfer transactions** (`category.type === 'payment'`) — not spending
- **Savings transactions** (`category.type === 'savings'`) — not spending
- **`excludeFromTotal` transactions** — consistent with all other charts
- **To Sort transactions** — included (they're still spending, just uncategorized;
  To Sort has `type: 'expense'` so it passes the filter naturally)
- **Transactions with null `plaidPfcDetail`** — grouped under "Other spending"

## What This Doesn't Do

- No drill-down (tap slice → see transactions)
- No grouping by Basil category (could add as a toggle later)
- No new API calls
- No store changes
- No backend changes
