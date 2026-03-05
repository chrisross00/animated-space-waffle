# Plan: Accounts & Balances

## Context
Today the app is purely transaction-focused. Plaid accounts are stored only as access
tokens + sync cursors — no balance data is fetched or displayed. This feature adds:
(1) a dedicated Accounts view showing linked institutions, account types, and live
balances, and (2) a Cash Runway card that combines balance data with historical
spending to answer "how long can I cover my expenses?".

---

## What Plaid gives us

Plaid's `accountsBalanceGet` endpoint returns per-account data:
- `account_id`, `name`, `official_name`, `mask` (last 4 digits)
- `type` — `depository`, `credit`, `loan`, `investment`, `other`
- `subtype` — `checking`, `savings`, `credit card`, `mortgage`, etc.
- `balances.current` — current balance
- `balances.available` — available balance (current minus pending for depository;
  credit limit minus balance for credit)
- `balances.limit` — credit limit (credit accounts only)

**Important:** This is a live call, not a cached feed like `transactionsSync`. Each
call hits Plaid's servers in real time. Call on-demand (when user opens Accounts view
or manually refreshes), not on every transaction sync.

---

## Data model

Store balance snapshots in `Plaid-Accounts`, nested under each institution:

```json
{
  "Accounts": {
    "Chase": {
      "token": "...",
      "next_cursor": "...",
      "balances": [
        {
          "account_id": "abc123",
          "name": "Total Checking",
          "mask": "1234",
          "type": "depository",
          "subtype": "checking",
          "current": 4821.50,
          "available": 4721.50,
          "limit": null,
          "fetchedAt": 1772482136528
        }
      ]
    }
  }
}
```

`fetchedAt` timestamp lets the UI show "last updated X minutes ago" and decide
whether to offer a refresh.

---

## Backend changes

### New Plaid utility — `fetchAndStoreBalances(userId)`
In `utils/plaidTools.js`:
1. Load all accounts for the user from `Plaid-Accounts`
2. For each institution, call `plaidClient.accountsBalanceGet({ access_token })`
3. Map response accounts to the schema above
4. `$set` the `Accounts.<institution>.balances` array in MongoDB

### New API route — `POST /api/refreshBalances`
- Auth + admin guard (same pattern as other routes)
- Calls `fetchAndStoreBalances(uid)`
- Returns the updated balance data

### Update `GET /api/getOrAddUser` (or new `GET /api/getBalances`)
Return balance data alongside the existing user/account info so the frontend can
display it without a separate fetch on load. If last `fetchedAt` is < 1 hour old,
return cached data. If stale, return cached data + a `stale: true` flag so the UI
can prompt a refresh.

---

## Frontend: Accounts View (`/accounts`)

New route and view file: `frontend/src/views/AccountsView.vue`

### Layout

```
┌─────────────────────────────────────────┐
│ ACCOUNTS                   [Refresh ↻]  │
│                                         │
│ Chase                                   │
│  ├─ Total Checking  ••••1234   $4,821   │
│  └─ Savings         ••••5678   $12,400  │
│                                         │
│ American Express                        │
│  └─ Gold Card       ••••9012  -$1,240   │
│     Credit limit: $10,000               │
│     Utilization: 12%                    │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ NET WORTH                           │ │
│ │  Assets    $17,221                  │ │
│ │  Liabilities  -$1,240               │ │
│ │  Net         $15,981                │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ CASH RUNWAY              see below  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Last updated 4 minutes ago              │
└─────────────────────────────────────────┘
```

### Key behaviors
- Depository accounts: show `available` balance (reflects pending transactions)
- Credit accounts: show balance as negative, show utilization % and limit
- Loan accounts: show outstanding balance as negative
- Net Worth card: sum of all depository/investment (positive) minus credit/loan
  (negative). Use display font for the net number, green/red based on sign.
- Refresh button calls `POST /api/refreshBalances`, updates UI reactively
- "Last updated X ago" — computed from `fetchedAt` timestamp

### Design tokens / patterns
- Follow `basil-card-head` / `basil-card-label` pattern
- Account rows: institution as section header, sub-accounts indented
- Amount in `basil-mono` class (tabular nums)
- Credit utilization: thin progress bar, warning color if > 30%, negative if > 70%

---

## Feature: Cash Runway

The standout feature. Answers: *"Given what's in my accounts today, how long can I
cover my monthly expenses?"*

### Calculation
```
liquid_balance   = sum of depository account `available` balances
monthly_burn     = average monthly expense spend (last 3 complete months,
                   excluding income, savings, and payment categories)
cash_runway_months = liquid_balance / monthly_burn
```

### Display — card on Accounts view

```
┌───────────────────────────────────────┐
│ CASH RUNWAY                           │
│                                       │
│         6.2 months                    │
│                                       │
│  $17,221 liquid  ÷  $2,780/mo avg    │
│                                       │
│  Based on your last 3 months of       │
│  expenses (excl. savings & income).   │
└───────────────────────────────────────┘
```

- Runway number in display font, large
- Color signal: > 6 months → green, 3–6 → yellow/warning, < 3 → red/negative
- Subtitle shows the two inputs (liquid balance ÷ monthly avg) so the number
  is transparent and trustworthy
- `monthly_burn` reuses the same aggregation already computed in TrendsView —
  no new backend logic needed

### Edge cases
- No depository accounts linked → show empty state, explain what's needed
- Zero or near-zero burn (e.g., new user with little history) → show "—" rather
  than a misleading large number, with a note that more transaction history is needed
- Investment accounts: exclude from liquid balance by default (not accessible
  without penalty). Could be a toggle ("include investments") in v2.

---

## Future ideas (not in scope for v1)

- **Net worth over time** — snapshot balances periodically (weekly?) and chart the
  trend. Requires a balance history collection rather than overwriting latest.
- **Savings goal progress** — tie a savings account balance to a user-defined goal
  amount and surface progress. Pairs with the existing savings category type.
- **Low balance alerts** — warn when a checking account falls below a threshold.
  Needs the notification/alert delivery mechanism (in-app or email) to be decided
  first — see notification alerts item in CLAUDE.md backlog.
- **Budget vs balance context** — show remaining checking balance alongside monthly
  budget progress to make budgets feel grounded in reality.
- **Credit utilization history** — track utilization over time, surface trends.

---

## Open questions

1. **Refresh frequency** — 1-hour cache seems right but needs validation. Plaid
   charges per `accountsBalanceGet` call, so aggressive refreshing has a cost.
2. **Investment accounts** — include in net worth but exclude from runway liquid
   balance by default? Needs a decision.
3. **Nav placement** — new `/accounts` route needs a nav tab. Long-term solution is
   a customizable nav where users pick which views appear in the toolbar and the rest
   go in a hamburger menu (tracked in CLAUDE.md backlog). For v1, can default-include
   Accounts and defer the customization work.
