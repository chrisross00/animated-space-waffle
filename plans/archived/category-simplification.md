# Category System Simplification

## Problem

PFC mapping complexity cascades through every surface that touches categories:
onboarding needs a custom editor with PFC chips and reassignment-on-delete,
the Plan view deletes categories without handling orphaned PFCs, and
DialogComponent exposes PFC mapping UI that most users will never need.
The custom onboarding flow adds significant code for marginal user value.

## Principles (decided)

1. **PFC mappings are system-managed and invisible.** Locked to default
   categories at seed time. Never shown in UI, never editable by users.
2. **Default categories cannot be deleted.** Can be renamed and budgeted.
   Marked with `isDefault: true` at seed time (replaces fragile name-matching).
3. **User-created categories have no PFC mapping.** Populated only by rules
   (auto-learn, compound rules, manual moves).
4. **Budget tab visibility is dynamic.** Show a category if
   `monthly_limit > 0` OR it has transactions in the selected month.
   Drop persisted `showOnBudgetPage` field.

## What changes

### Remove

| What | Where | Why |
|------|-------|-----|
| Onboarding custom flow | `OnboardingView.vue` step 1 picker, step 2 custom hub, step 3 custom seed | One flow (quick setup) covers everyone |
| `OnboardingCategoryEditor.vue` | `frontend/src/components/` | No longer needed |
| `seedCustomCategories` endpoint | `api.js` lines 86-127 | One seed path |
| `seedCustomCategories` frontend fn | `firebase.js` | Dead code |
| PFC select in edit category dialog | `DialogComponent.vue` lines 119-133 (edit), 259-270 (add) | PFCs are system-managed |
| PFC select in add category dialog | `DialogComponent.vue` | Same |
| `showOnBudgetPage` field reads | `BudgetView.vue` line 163 v-show, line 999 stats calc | Replaced by computed visibility |
| `showOnBudgetPage` writes | `api.js` seed endpoints, `BudgetView.vue`, `DialogComponent.vue` | No longer stored |
| `plaidPfcOptions` / `PLAID_PFC_OPTIONS` in DialogComponent | `DialogComponent.vue` lines ~480-497 | No UI for PFC selection |

### Add / Change

| What | Where | Detail |
|------|-------|--------|
| `isDefault: true` flag | `api.js` seed endpoint, `utils/seedCategories.js` | Stamp on every default category at seed time |
| Dynamic budget visibility | `BudgetView.vue` | Replace `v-show="showOnBudgetPage"` with computed: `monthly_limit > 0 \|\| categorySum !== 0` |
| Plan view delete guard | `BudgetPlannerView.vue` | Use `cat.isDefault` instead of `DEFAULT_NAMES.has(cat.category)` |
| Simplify onboarding | `OnboardingView.vue` | Remove flow picker (step 1), go straight to connect bank. Remove all custom flow data/methods |

### Keep (no changes)

- Quick setup seed flow (becomes the only flow)
- Plan view: add categories, rename, set budgets
- Plan view: delete user-created categories (transactions → To Sort)
- `deleteCategory` backend endpoint (works as-is for user-created)
- `categories.json` / `defaultCategories.js` data files (still define defaults + PFC mappings)
- Backend `categoryMapping.js` PFC evaluation (still uses stored `plaid_pfc` on categories)

## Onboarding after simplification

```
Step 1: Welcome → Connect your bank (was step 2 quick flow)
Step 2: Seed default categories + done summary (was step 3)
Step 3: You're all set → Go to Budget Planner
```

No flow picker, no custom editor, no PFC reassignment. Three steps.

## Budget tab visibility logic

```js
// In BudgetView, replace:
v-show="this.groupedTransactions[category].showOnBudgetPage"

// With:
v-show="shouldShowCategory(category)"

// Method:
shouldShowCategory(category) {
  const group = this.groupedTransactions[category];
  if (!group) return false;
  // Always show To Sort if it has transactions
  // Show any category with a budget limit OR current-month transactions
  const hasLimit = Number(group.monthly_limit) > 0;
  const hasActivity = this.categorySum(category) !== 0;
  return hasLimit || hasActivity;
}
```

## `isDefault` flag

Stamped at seed time. Replaces name-matching (`DEFAULT_NAMES`) which breaks
when users rename categories. Backend sets it; frontend reads it for:
- Plan view: hide delete icon on `isDefault` categories
- Future: any logic that needs to distinguish system vs user categories

```js
// In seed endpoint, add to each category object:
{ ...cat, isDefault: true, userId: uid, showOnBudgetPage: true, ... }
```

Existing users: backfill via a one-time migration script or add to
`/addplaidpfc`-style admin endpoint. Or just check both `isDefault`
and `DEFAULT_NAMES` during transition.

## Migration / backward compat

- **`showOnBudgetPage`:** Stop reading it. Don't bother removing from DB;
  it becomes inert. New categories won't have it.
- **`isDefault`:** Existing categories won't have it. Plan view falls back
  to `DEFAULT_NAMES` check if `isDefault` is absent. New seeds include it.
- **Existing custom onboarding users:** Their categories already work fine.
  They just won't have `isDefault: true`. The fallback handles this.
- **PFC fields on categories:** Stay in DB, still used by `categoryMapping.js`
  for auto-categorization. Just hidden from UI.

## Implementation order

1. Add `isDefault` flag to seed endpoint + Plan view guard
2. Remove PFC UI from DialogComponent
3. Remove `showOnBudgetPage`, add dynamic visibility
4. Simplify onboarding (remove custom flow, simplify to 3 steps)
5. Delete `OnboardingCategoryEditor.vue` + `seedCustomCategories`
6. Clean up imports and dead code
