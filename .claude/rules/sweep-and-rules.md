---
paths: frontend/src/utils/ruleUtils.js, utils/categoryMapping.js, api.js, db/database.js, frontend/src/components/RuleEditorDialog.vue
---
# Sweep & Condition Matching Rules

1. **All client-side sweeps go through `sweepStore` in `ruleUtils.js`.**
   All backend sweeps go through `sweepCompoundRule` in `api.js`.

2. **Condition matching has one implementation per layer:**
   - Client: `matchesCondition` in `ruleUtils.js`
   - Server (in-memory): `matchesCondition` in `categoryMapping.js`
   - Server (SQL): `conditionsToSqlWhere` in `db/database.js`
   - UI: `RuleEditorDialog.vue`

3. **When adding a new condition field or operator, update all four** locations above.
   Fields: `merchant_name`, `name`, `amount`, `account`.
   Operators: `eq`, `contains`, `range`, `gt`, `lt`.
