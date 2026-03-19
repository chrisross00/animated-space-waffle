# Flex Budgets Research

## What Are Flex Budgets?

Monarch Money's flex budgeting divides spending into three buckets:

| Bucket | Examples | Behavior |
|--------|----------|----------|
| **Fixed** | Rent, insurance, subscriptions, loans | Predictable, budgeted per-category |
| **Non-Monthly** | Car repairs, annual insurance, gifts | Sinking funds with rollover |
| **Flexible** | Groceries, dining, shopping, gas | Pooled into a single "flex number" |

**The core innovation:** Fixed and non-monthly categories get individual budgets. All flexible categories share a single pooled budget. Individual flex categories exist for tracking but don't have individual limits.

**Flex number = Income - Fixed - Non-Monthly - Savings**

## Why Category Budgets Fail

1. **Cognitive overload** — tracking 15-25 categories monthly is exhausting
2. **Category boundary anxiety** — "$20 over on dining but $30 under on entertainment — did I fail?"
3. **Variable spending defies prediction** — fixed limits for inherently variable categories guarantees "failure"
4. **All-or-nothing thinking** — one over-budget category makes users feel the whole budget failed

## What Flex Solves

- Reduces tracking to one number instead of 15+
- Eliminates inter-category guilt
- Accepts that variable spending is variable
- Separates controllable from uncontrollable costs

## Flex Failure Modes

- Hides category-level problems (spending $800/mo on dining looks fine if shopping is $0)
- Reduced accountability — flexibility itself can enable drift
- Doesn't help tight budgets — when money is scarce, you need per-category discipline

## Fit for Basil

Basil already has:
- `categories.fixed` boolean column (exists, never used in frontend)
- Category types: income, expense, payment, savings
- Per-category `monthly_limit`

**Can fixed/variable flags get 80% of the way?** Yes.

| Flex Feature | Fixed/Variable Covers It? |
|---|---|
| Visual separation | Yes — group by flag |
| "Your fixed costs are $X" | Yes — sum limits for fixed categories |
| Single flex number | Partially — can compute, need to display |
| **Pooled flex budget** | **No — this is the paradigm shift** |
| Categories without individual budgets | **No** — Basil requires monthly_limit |

**Pragmatic middle ground:** Add flag, show "Flexible spending remaining" summary, keep per-category limits as optional. Users who set limits on every variable category get traditional budgeting with grouping. Users who leave limits at $0 effectively get flex.

## MVP: Phase 1

1. Edit Category dialog: "Fixed expense" toggle (on/off, default off)
2. BudgetView: split categories into "Fixed" and "Flexible" sections
3. Flex summary card above flexible section
4. Categories with `fixed: false` and `monthly_limit: 0` show no progress bar

**Effort:** Small. Schema exists. Backend already passes the field. Pure frontend.

## Sources

- [Using Flex Budgeting - Monarch](https://help.monarch.com/hc/en-us/articles/32125337244052)
- [Flex Budgeting: One Number - Monarch Blog](https://www.monarch.com/blog/flex-budgeting-simplify-your-spending-with-just-one-number)
- [Flex vs Category Budgeting - Monarch](https://www.monarch.com/blog/flex-vs-category-budgeting-how-to-choose-whats-right-for-you)
- [YNAB vs Monarch - Rob Berger](https://robberger.com/ynab-vs-monarch-money/)
- [Why Budgets Fail - Future Focused Wealth](https://www.futurefocusedwealth.com/blog/psychology-of-budgeting-dallas-financial-planner/)
