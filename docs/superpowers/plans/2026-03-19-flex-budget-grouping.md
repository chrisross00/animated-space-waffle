# Flex Budget Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure BudgetView to lead with a flex spending card ("$X left to spend"), collapse fixed categories, and show a compact 3-column Actuals card. Gives users one actionable number for discretionary spending while keeping full detail accessible.

**Architecture:** The `fixed` boolean column already exists on the `categories` Postgres table. When any expense category has `fixed: true`: (1) a flex spending card appears at the top showing remaining discretionary budget with summary lines for fixed costs, savings, and recurring expected; (2) fixed categories collapse into an expandable group row; (3) the Actuals card becomes a compact 3-column layout (earned | spent | free cash flow). When no categories are fixed, the view looks exactly like today.

**Tech Stack:** Vue 3, Quasar 2, Vuex 4, Express.js, Postgres

**Key references:**
- `DESIGN.md` — card patterns, tokens, component checklist
- `BRAND.md` — voice guidelines
- `docs/mockups/flex-budget-3col.html` — approved mockup (interactive, collapsible fixed group)
- `plans/flex-budgets-research.md` — product research

**Onboarding connection:** This is a structural prerequisite for the onboarding insight card (pre-release project #1). The flex card must work without user configuration — `Rent & Utilities` is seeded as `fixed: true`, and the flex computed falls back to actual spending when no budget limits are set.

**Task dependencies:** Tasks 1 and 6 are independent (can parallelize). Tasks 2-5 are sequential and depend on Task 1. Task 7 is final integration.

**Line numbers are approximate** — use method/function names as primary anchors.

---

### Task 1: Backend — Pass `fixed` through category update

The `fixed` column exists in Postgres and is read/inserted, but `handleDialogSubmit` for `editCategory` doesn't include `fixed` in its update payload.

**Files:**
- Modify: `api.js` — `handleDialogSubmit` editCategory branch and response object

- [ ] **Step 1: Add `fixed` to the updateCategory call**

In `api.js`, find the `editCategory` branch of `handleDialogSubmit`. Add `fixed` to the `updateCategory()` call:
```javascript
fixed: !!req.body.fixed,
```

- [ ] **Step 2: Add `fixed` to the response object**

Add to the response:
```javascript
fixedBEResponse: !!req.body.fixed,
```

- [ ] **Step 3: Verify `CAT_FIELD_MAP` in `db/database.js`**

Confirm `fixed: 'fixed'` is in the map so `buildSetClause` handles it.

- [ ] **Step 4: Commit**

```bash
git add api.js
git commit -m "feat: pass fixed flag through category update route"
```

---

### Task 2: Full data flow — dialog toggle + submit payload + store mutation

**Files:**
- Modify: `frontend/src/components/DialogComponent.vue` (add toggle)
- Modify: `frontend/src/views/BudgetView.vue` (`buildEditCategoryDialog`, `onSubmit`, `groupTransactions`)
- Modify: `frontend/src/store.js` (`updateCategory` mutation)

- [ ] **Step 1: Add `fixed` toggle to DialogComponent.vue category edit form**

After the `monthly_limit` input, add (expense categories only):
```html
<q-toggle
  v-if="item.type === 'expense'"
  v-model="dialogBody.fixed"
  label="Fixed expense (rent, subscriptions, bills)"
  class="q-mt-sm"
/>
```

- [ ] **Step 2: Initialize `fixed` in `buildEditCategoryDialog` (BudgetView.vue)**

Add to dialogBody assignments:
```javascript
this.dialogBody.fixed = this.groupedTransactions[category].fixed || false;
```

- [ ] **Step 3: Add `fixed` to the submit payload in `onSubmit` (BudgetView.vue)**

**Critical:** `onSubmit` manually constructs payload `d`, cherry-picking fields. Add:
```javascript
'fixed': e.fixed || false,
```

- [ ] **Step 4: Update store `updateCategory` mutation (store.js)**

The mutation does field-by-field updates. Add to the `if (category._id === updatedCategory._id)` block:
```javascript
if (updatedCategory.fixedBEResponse !== undefined) category.fixed = updatedCategory.fixedBEResponse;
```

- [ ] **Step 5: Store `fixed` in `groupTransactions` (BudgetView.vue)**

In `groupTransactions()` metadata block, add:
```javascript
this.groupedTransactions[category.category].fixed = category.fixed || false;
```

- [ ] **Step 6: Test full round-trip**

Toggle fixed on/off, save, reload — verify persistence.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/DialogComponent.vue frontend/src/views/BudgetView.vue frontend/src/store.js
git commit -m "feat: add fixed expense toggle with full data flow"
```

---

### Task 3: Flex spending card

Add the flex card as the first card in BudgetView when fixed categories exist. This replaces the Projections card — its content (recurring forecast, budget remaining) is absorbed into the flex card's summary lines.

**Files:**
- Modify: `frontend/src/views/BudgetView.vue` (template + computed)

**Reference mockup:** `docs/mockups/flex-budget-3col.html`

- [ ] **Step 1: Add computed properties**

```javascript
hasFixedCategories() {
  if (!this.groupedTransactions) return false;
  return Object.values(this.groupedTransactions).some(g => g.fixed && g.type === 'expense');
},

flexBudget() {
  if (!this.hasFixedCategories || !this.monthlyStats) return null;

  // Income: prefer budget limit, fall back to actual
  const incomeCategory = Object.values(this.groupedTransactions).find(g => g.type === 'income');
  const incomeBudget = Number(incomeCategory?.monthly_limit) || 0;
  const income = incomeBudget > 0 ? incomeBudget : (this.monthlyStats.incomeAmount || 0);
  if (income <= 0) return null;

  // Fixed: prefer limits, fall back to actual spending (key for onboarding)
  let fixedCosts = 0;
  for (const [name, g] of Object.entries(this.groupedTransactions)) {
    if (g.fixed && g.type === 'expense') {
      const limit = Number(g.monthly_limit) || 0;
      if (limit > 0) {
        fixedCosts += limit;
      } else {
        const actual = this.categorySum(name);
        fixedCosts += isNaN(actual) ? 0 : Math.abs(actual);
      }
    }
  }

  // Fixed actual spending (for the "X of Y" display)
  let fixedSpent = 0;
  for (const [name, g] of Object.entries(this.groupedTransactions)) {
    if (g.fixed && g.type === 'expense') {
      const actual = this.categorySum(name);
      fixedSpent += isNaN(actual) ? 0 : Math.abs(actual);
    }
  }

  const savingsLimit = Object.values(this.groupedTransactions).reduce(
    (sum, g) => g.type === 'savings' ? sum + (Number(g.monthly_limit) || 0) : sum, 0
  );

  const pool = income - fixedCosts - savingsLimit;
  if (pool <= 0) return null;

  const spent = Object.entries(this.groupedTransactions).reduce((sum, [name, g]) => {
    if (g.type === 'expense' && !g.fixed) {
      const catSpend = this.categorySum(name);
      return sum + (isNaN(catSpend) ? 0 : Math.abs(catSpend));
    }
    return sum;
  }, 0);

  return {
    pool: Math.round(pool),
    spent: Math.round(spent),
    remaining: Math.round(pool - spent),
    ratio: pool > 0 ? spent / pool : 0,
    fixedSpent: Math.round(fixedSpent),
    fixedBudget: Math.round(fixedCosts),
    savingsAmount: Math.round(this.monthlyStats.savingsAmount || 0),
    savingsBudget: Math.round(savingsLimit),
  };
},
```

- [ ] **Step 2: Add flex card template**

Insert before the Actuals card. Show only when `flexBudget` is non-null and `!showAll`. Follow the card pattern from the mockup:

- Hero: `$X` left to spend (display font, green)
- Sublabel: "left to spend this month"
- Progress bar (green, 8px, rounded)
- Spent of pool text
- Divider
- Summary detail rows: Fixed costs (X of Y), Savings (X of Y), Recurring expected (~$X)

Use `basil-card` class. Progress bar track uses dark-mode-aware color: `:track-color="$store.state.theme === 'dark' ? 'grey-8' : 'grey-3'"` or CSS approach.

- [ ] **Step 3: Hide Projections card when flex is active**

Wrap the existing Projections card with `v-if="!flexBudget"` so it only shows in traditional mode. The flex card absorbs its content.

- [ ] **Step 4: Test**

1. Mark a category as fixed → flex card appears
2. Verify math: income - fixed - savings = pool
3. Verify summary lines show correct values
4. Verify Projections card disappears
5. Unmark all fixed → flex card disappears, Projections returns
6. Dark mode check

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/BudgetView.vue
git commit -m "feat: add flex spending card, absorb Projections"
```

---

### Task 4: Compact 3-column Actuals card

When flex is active, restructure the Actuals card to show earned | spent | free cash flow in a single row with vertical dividers.

**Files:**
- Modify: `frontend/src/views/BudgetView.vue` (Actuals template)
- Modify: `frontend/src/styles/BudgetView.css` (3-column layout)

**Reference mockup:** `docs/mockups/flex-budget-3col.html` — use vertical dividers between columns, not −/= operators.

- [ ] **Step 1: Add 3-column layout when flex is active**

Wrap the existing Actuals template with `v-if="!flexBudget"` (traditional mode). Add a new `v-else` block with the 3-column layout:

```html
<!-- Compact actuals (flex mode) -->
<div v-else class="basil-actuals-3col">
  <div class="basil-actuals-col">
    <div class="basil-stat-value" style="color: var(--basil-income)">
      ${{ displayedStats.incomeAmountFmt }}
    </div>
    <div class="basil-stat-label">earned</div>
  </div>
  <div class="basil-stat-divider"></div>
  <div class="basil-actuals-col">
    <div class="basil-stat-value">
      ${{ displayedStats.expenseSpendFmt }}
    </div>
    <div class="basil-stat-label">spent</div>
  </div>
  <div class="basil-stat-divider"></div>
  <div class="basil-actuals-col">
    <div class="basil-stat-value" :style="{ color: netPositive ? 'var(--basil-income)' : 'var(--basil-expense)' }">
      {{ netPositive ? '+' : '' }}${{ displayedStats.netPositionFmt }}
    </div>
    <div class="basil-stat-label">free cash flow</div>
  </div>
</div>
```

Keep the unsorted warning below in both modes.

- [ ] **Step 2: Add CSS for 3-column layout**

```css
.basil-actuals-3col {
  display: flex;
  align-items: flex-start;
  margin-top: var(--basil-space-3);
}
.basil-actuals-col {
  flex: 1;
  text-align: center;
}
.basil-actuals-col:first-child { text-align: left; }
.basil-actuals-col:last-child { text-align: right; }
```

The `.basil-stat-divider` class already exists.

- [ ] **Step 3: Test**

1. Verify 3-column layout appears when flex is active
2. Verify traditional 2-column + hero appears when no flex
3. Check mobile — 3 columns should fit at 375px width
4. Verify unsorted warning shows in both modes

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/BudgetView.vue frontend/src/styles/BudgetView.css
git commit -m "feat: compact 3-column Actuals card in flex mode"
```

---

### Task 5: Collapsible fixed categories group

Fixed categories collapse into a single expandable row in the category list.

**Files:**
- Modify: `frontend/src/views/BudgetView.vue` (template + data + methods)
- Modify: `frontend/src/styles/BudgetView.css` (collapse styles)

**Reference mockup:** `docs/mockups/flex-budget-3col.html` — interactive, tap the "Fixed costs" row to expand/collapse.

- [ ] **Step 1: Add `fixedExpanded` to data**

```javascript
fixedExpanded: false,
```

- [ ] **Step 2: Sort `groupedTransactions` so fixed come first**

At the end of `groupTransactions()`, reorder so fixed expense categories come first:

```javascript
if (Object.values(this.groupedTransactions).some(g => g.fixed)) {
  const sorted = {};
  Object.entries(this.groupedTransactions)
    .filter(([, g]) => g.fixed && g.type === 'expense')
    .forEach(([k, v]) => { sorted[k] = v; });
  Object.entries(this.groupedTransactions)
    .filter(([, g]) => !g.fixed || g.type !== 'expense')
    .forEach(([k, v]) => { sorted[k] = v; });
  this.groupedTransactions = sorted;
}
```

- [ ] **Step 3: Add collapsible group row template**

Before the category `v-for`, insert the fixed costs collapse row (only when `hasFixedCategories`):

- Pin icon in a circle avatar
- "Fixed costs" label + "N categories" sublabel
- Total amount + chevron
- Tap toggles `fixedExpanded`

- [ ] **Step 4: Conditionally show/hide fixed categories**

Inside the existing `v-for`, add `v-show` to hide fixed expense categories when collapsed:

```html
v-show="shouldShowCategory(category) && (!hasFixedCategories || !groupedTransactions[category]?.fixed || fixedExpanded)"
```

When expanded, show them with indented/muted styling (alt background, no avatar — they're nested under the group row).

- [ ] **Step 5: Add collapse styles**

Reference the mockup CSS for `.basil-fixed-collapse`, `.basil-fixed-items`, chevron rotation animation.

- [ ] **Step 6: Test**

1. Fixed categories collapse by default
2. Tap to expand — individual categories show with progress bars
3. Tap to collapse — categories hide, total shows
4. Tapping a fixed category row when expanded still opens the edit dialog
5. No fixed categories → no collapse row at all

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/BudgetView.vue frontend/src/styles/BudgetView.css
git commit -m "feat: collapsible fixed categories group"
```

---

### Task 6: Default categories — seed Rent & Utilities as fixed

Independent task, can be done in parallel with Tasks 1-5.

**Files:**
- Modify: `utils/defaultCategories.js`

- [ ] **Step 1: Add `fixed: true` to Rent & Utilities**

```javascript
{ category: 'Rent & Utilities', type: 'expense', monthly_limit: 0, plaid_pfc: ['HOME_IMPROVEMENT', 'RENT_AND_UTILITIES'], fixed: true },
```

Conservative — only this one is unambiguously fixed.

- [ ] **Step 2: Commit**

```bash
git add utils/defaultCategories.js
git commit -m "feat: seed Rent & Utilities as fixed by default"
```

---

### Task 7: Final integration test and cleanup

- [ ] **Step 1: End-to-end test**

1. No fixed categories → view looks exactly like today (flex card hidden, Projections shows, traditional Actuals layout, no collapse row)
2. Mark "Rent & Utilities" as fixed → flex card appears at top, Projections disappears, Actuals becomes 3-column, fixed collapse row appears
3. Expand/collapse fixed group
4. Mark another category fixed → group updates, flex card recalculates
5. Unmark all → everything reverts to traditional
6. Mobile layout check (375px) — 3-column Actuals fits, flex card readable
7. Dark mode — progress bars, card backgrounds, text colors all correct
8. Month picker still works, "Show all" toggle still works
9. Flex card hides when "Show all" is active

**Onboarding test:**
10. Set Rent & Utilities to fixed with monthly_limit = $0
11. Verify flex card appears using actual income and actual rent spending
12. This validates new user experience without configuration

- [ ] **Step 2: Build and test**

```bash
npm test
cd frontend && npm run build
```

- [ ] **Step 3: Commit and push**

```bash
git add -A
git commit -m "chore: flex budget integration test and polish"
git push origin feature/flex-budget-grouping
```

---

## Notes for implementer

- **Backward compatible.** When no categories have `fixed: true`, the UI must look exactly like today.
- **Projections is absorbed, not deleted.** Wrap Projections with `v-if="!flexBudget"`. Its content (budget remaining, recurring forecast) lives in the flex card's summary lines.
- **The category card template is NOT duplicated.** Fixed categories use the same `v-for` loop with a `v-show` gate. The collapse row is a separate element before the loop.
- **Design tokens only.** `var(--basil-*)` for all colors/spacing. See `DESIGN.md`.
- **No emoji in copy.** See `BRAND.md`.
- **`fixed` is nullable.** Treat `null` and `false` the same.
- **Only expense categories can be fixed.** Income, savings, payment excluded.
- **`onSubmit` manually constructs payload** — `fixed` must be explicitly added.
- **Store mutation is field-by-field** — `fixed` must be explicitly handled.
- **Flex pool uses income budget limit** with fallback to actual income. Fixed costs use budget limits with fallback to actual spending. This ensures the card works for unconfigured new users.
- **Hide flex card when pool <= 0** — bad config or no income data yet.
- **Month picker and "Show all" toggle** remain in their current positions, unaffected by flex mode.
