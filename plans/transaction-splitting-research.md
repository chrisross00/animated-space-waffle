# Transaction Splitting Research

## User Need

Two use cases:
1. **Multi-category purchase** — $200 Costco run = $120 groceries + $50 household + $30 clothing
2. **P2P lump reimbursement** — friend Venmos $85 for dinner ($45) + concert ($40)

## Competitive Landscape

| Feature | YNAB | Monarch | Copilot | Lunch Money |
|---------|------|---------|---------|-------------|
| Amount-based splits | Yes | Yes | Yes | Yes |
| Percentage-based | No | Yes | No | No |
| More than 2 splits | Yes | Yes | Yes | Yes |
| Auto split rules | No (3rd party) | Yes (Smart Split) | No | Yes |
| Unsplit / undo | Delete + recreate | Yes | Yes | Yes |
| Split across months | No | No | Yes | Yes |

**Key insights:**
- YNAB: parent + subtransactions array. Parent category becomes null.
- Monarch: Smart Split rules (auto-split by merchant/amount/account). Amazon browser extension.
- Copilot: unique "split across months" for amortizing annual payments.
- Lunch Money: clean split indicator UX (icon in amount field, hover for context).

## Recommended Data Model

Parent + child rows in same `transactions` table:

```sql
ALTER TABLE transactions ADD COLUMN parent_transaction_id UUID REFERENCES transactions(id);
ALTER TABLE transactions ADD COLUMN is_split_parent BOOLEAN DEFAULT false;
```

- Parent: `is_split_parent = true`, excluded from budget totals
- Children: `parent_transaction_id` points to parent, own amount + category
- Children inherit date, account, user_id from parent
- Sum of children must equal parent amount (app-layer enforcement)

**Why same table:** Every query, store mutation, and component operates on `transactions`. A separate table would require changes everywhere.

## What Changes Across the Stack

| Layer | Change | Complexity |
|-------|--------|------------|
| Schema | 2 new columns + index | Low |
| Plaid sync | Preserve children when parent re-syncs | Medium |
| API queries | Add `WHERE is_split_parent IS NOT TRUE` | Medium |
| Store/frontend | Filter parents, new split UI | Medium |
| Budget calcs | Exclude parents, include children | Low |
| Rules engine | Skip split children in sweeps | Low |
| Recurring detection | Use parents only | Medium |
| Search | Include children, show indicator | Low |

## MVP Scope

**Ship:** Manual amount-based splitting from transaction detail
- "Split" action on transaction detail
- Split editor: rows with amount + category picker
- Live "Remaining" counter, save disabled until $0.00
- Creates child rows, marks parent as split
- "Unsplit" restores original
- Split indicator icon on children in all views

**Defer to V2:**
- Percentage-based splits (amount + "split evenly" covers 95%)
- Auto split rules (Smart Split) — observe usage patterns first
- Split across months (niche)
- Pre-populated split templates
- Split from triage flow (interrupts rapid categorization)

## Highest Risk: Plaid Sync

Plaid can update parent amount (pending → posted). If user has split, children no longer sum correctly. **Mitigation:** Flag for user review when parent amount changes, rather than silently breaking.

## Other Risks

- Every sum query must exclude parents (`is_split_parent IS NOT TRUE`)
- Rules should not sweep split children (user intentionally categorized them)
- Recurring detection must use parents, not children
- Split children should be implicitly `manually_set = true`

## Sources

- [YNAB: Split Transactions Guide](https://support.ynab.com/en_us/split-transactions-a-guide-SJLEKwY0q)
- [Monarch: Splitting Transactions](https://help.monarch.com/hc/en-us/articles/360050178492)
- [Copilot: Splitting Transactions](https://help.copilot.money/en/articles/5325255)
- [Lunch Money: Transaction Types](https://support.lunchmoney.app/finances/transactions/transaction-types)
