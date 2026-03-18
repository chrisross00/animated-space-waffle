# Direction Condition for Rules Engine

## Problem

P2P merchants (Venmo, Zelle, Cash App) are bidirectional — the same merchant name
appears on both inflows (cashouts, received payments) and outflows (sent payments).
The rules engine currently uses `Math.abs(amount)` for all amount matching, so there's
no way to distinguish direction. A rule like `merchant = Venmo → Income` sweeps both
inflows and outflows, miscategorizing half.

This is a structural gap that incumbent finance apps (Mint, YNAB, Monarch) never
solved — they either don't offer rules for P2P merchants or silently get it wrong.

## Solution: hybrid auto-suggest direction condition

Add a `direction` condition type (`Money In` / `Money Out`) that checks the raw sign
of `amount`. Amount conditions keep using `Math.abs()` for thresholds — direction is
a separate concern.

**Key UX:** When the user picks a target category in the rule editor, auto-add a
visible, deletable direction condition based on the category type + the source
transaction's direction. The condition appears as a normal row — not hidden logic.
The matched transaction count updates reactively, giving immediate feedback.

### Why not infer direction from category type implicitly?
- Silent filtering in rule engines is the worst kind of UX bug
- `payment` and `savings` types are directionally ambiguous
- Changing a category's type would silently change rule behavior
- Prevents legitimate cross-direction rules

### User flow: "Venmo inflows → Income, Venmo outflows → Payments"

1. User triages a Venmo cashout → selects "Income" → rule editor auto-adds
   `Direction = Money In` → "Matches 8 transactions" (not all 15 Venmo txns)
2. User saves. 8 inflows categorized as Income. 7 outflows untouched.
3. User opens a Venmo outflow → selects "Payments" → auto-adds
   `Direction = Money Out` → "Matches 7 transactions"
4. Two clean rules, zero confusion about Plaid's sign convention.

---

## Implementation

### Layer 1: Rule engine (all three must stay in sync)

**`frontend/src/utils/ruleUtils.js` — `matchesCondition()`**
```javascript
case 'direction': {
  if (op === 'eq' && value === 'inflow')  return txn.amount < 0;
  if (op === 'eq' && value === 'outflow') return txn.amount > 0;
  return false;
}
```

**`utils/categoryMapping.js` — `evaluateCondition()`**
Same logic as ruleUtils.js.

**`db/database.js` — `conditionsToSqlWhere()`**
```javascript
} else if (field === 'direction') {
  if (value === 'inflow')  { clauses.push(`amount < 0`); }
  else if (value === 'outflow') { clauses.push(`amount > 0`); }
}
```
No parameterized value needed — it's a fixed comparison.

**`frontend/src/utils/ruleUtils.js` — `formatConditions()`**
```javascript
if (c.field === 'direction') return `direction = ${c.value === 'inflow' ? 'Money In' : 'Money Out'}`;
```

### Layer 2: Rule Editor Dialog

**`frontend/src/components/RuleEditorDialog.vue`**

Add a new condition section between Amount and Institution:

```
<!-- Direction -->
<div class="basil-re__condition">
  <div class="basil-re__condition-head">
    <span class="basil-re__condition-label">Direction</span>
    <q-toggle v-model="form.direction.active" color="primary" dense size="sm" />
  </div>
  <q-select
    v-if="form.direction.active"
    v-model="form.direction.value"
    :options="directionOptions"
    option-value="value" option-label="label"
    emit-value map-options outlined dense
    class="basil-re__condition-input"
  />
</div>
```

Form state:
```javascript
direction: { active: false, value: 'inflow' },
```

Options:
```javascript
const DIRECTION_OPTIONS = [
  { label: 'Money In',  value: 'inflow'  },
  { label: 'Money Out', value: 'outflow' },
];
```

Conditions computed — add:
```javascript
if (this.form.direction.active && this.form.direction.value)
  out.push({ field: 'direction', op: 'eq', value: this.form.direction.value });
```

Populate (edit mode) — add:
```javascript
} else if (c.field === 'direction') {
  this.form.direction = { active: true, value: c.value };
}
```

Auto-label — add direction suffix:
```javascript
if (this.form.direction.active && this.form.direction.value)
  parts.push(this.form.direction.value === 'inflow' ? 'In' : 'Out');
```

### Layer 3: Auto-suggest (the UX magic)

**When:** User selects a target category in the rule editor.

**Watch `form.categoryName`:** When it changes, look up the category type from
`store.state.categories`. Auto-suggest logic:

| Category type | Source txn direction | Auto-set direction to |
|---------------|---------------------|-----------------------|
| `income`      | any                 | `inflow`              |
| `expense`     | any                 | `outflow`             |
| `payment`     | known (from prop)   | match source txn      |
| `savings`     | known (from prop)   | match source txn      |
| `payment`     | unknown             | don't auto-add        |
| `savings`     | unknown             | don't auto-add        |

Only auto-set if `form.direction.active` is currently `false` (user hasn't
manually toggled it). Set `active: true` and `value` to the suggested direction.

**Source transaction:** RuleEditorDialog already receives context via props when
opened from triage or edit-transaction flows. Add an optional `sourceTransaction`
prop so the auto-suggest can check its amount sign. When opened standalone from
RulesView (no source transaction), fall back to category-type-only logic.

### Layer 4: Tests

**`frontend/src/__tests__/ruleUtils.test.js`**
- `matchesCondition` — direction inflow/outflow with positive/negative/zero amounts
- `formatConditions` — direction condition display
- `sweepStore` — direction condition respected during sweep

**`__tests__/categoryMapping.test.js`**
- `evaluateCompoundRules` with direction conditions

**`__tests__/database.test.js`**
- `conditionsToSqlWhere` with direction field

---

## Files to modify

| File | Change |
|------|--------|
| `frontend/src/utils/ruleUtils.js` | `matchesCondition`: add `direction` case; `formatConditions`: add display |
| `utils/categoryMapping.js` | `evaluateCondition`: add `direction` case |
| `db/database.js` | `conditionsToSqlWhere`: add `direction` clause |
| `frontend/src/components/RuleEditorDialog.vue` | Direction condition UI + auto-suggest watcher |
| `frontend/src/views/RulesView.vue` | No changes needed (`formatConditions` handles it) |
| `frontend/src/__tests__/ruleUtils.test.js` | Direction tests for matchesCondition + formatConditions |
| `__tests__/categoryMapping.test.js` | Direction tests for evaluateCompoundRules |
| `__tests__/database.test.js` | Direction tests for conditionsToSqlWhere |

## No migration needed

Direction is a virtual condition — it maps to the existing `amount` column's sign.
No new DB columns or schema changes required.

## Scope

- **No changes to stored rules schema.** Direction is stored as a normal condition
  object: `{ field: 'direction', op: 'eq', value: 'inflow' }` in the JSONB
  `conditions` array on `compound_rules`.
- **Backward compatible.** Existing rules have no direction condition and continue
  to match regardless of sign (same as today).
- **Amount conditions unchanged.** `Math.abs()` / `ABS()` stays for amount
  matching. Direction is orthogonal.

## Priority

After UAT tier work. Standalone branch, self-contained feature.
