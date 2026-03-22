# Post-Onboarding Nudges & Guided Budget Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add nudge cards on the budget page, a guided budget setup on `/plan`, a three-path onboarding completion screen, and analytics events — all powered by a user preferences JSONB column.

**Architecture:** New `preferences JSONB` column on `users` table stores dismissals and analytics. Budget page evaluates a priority-ordered nudge list based on category state and preferences. `/plan` detects first-time users and offers guided vs manual setup. Onboarding completion screen presents three paths with analytics tracking.

**Tech Stack:** Postgres (migration), Express.js (API route), Vue 3 + Quasar 2 + Vuex 4 (frontend), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-03-22-post-onboarding-nudges-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `db/migrations/009-user-preferences.sql` | Create | Schema: add `preferences JSONB` column to `users` |
| `db/database.js` | Modify | Add `preferences` to `findUser` SELECT, add `updateUserPreferences` helper |
| `api.js` | Modify | Add `POST /updatePreferences` route, add `preferences` to `createClientSideUser` |
| `frontend/src/api.js` | Modify | Add `updatePreferences()` client function |
| `frontend/src/store.js` | Modify | Add `updatePreferences` mutation |
| `frontend/src/views/BudgetView.vue` | Modify | Nudge card section with priority evaluation |
| `frontend/src/views/BudgetPlannerView.vue` | Modify | First-time detection, guided/manual choice, guided setup flow |
| `frontend/src/views/OnboardingView.vue` | Modify | Three-path completion screen with analytics |

---

## Task 1: Schema + DB Helpers

**Files:**
- Create: `db/migrations/009-user-preferences.sql`
- Modify: `db/database.js`

- [ ] **Step 1: Write migration**

```sql
-- 009-user-preferences.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';
```

- [ ] **Step 2: Run migration locally**

Run: `psql $DATABASE_URL -f db/migrations/009-user-preferences.sql`

- [ ] **Step 3: Add `preferences` to `findUser` SELECT**

In `db/database.js`, find the `findUser` function (~line 101). Add `preferences` to the SELECT:

```sql
SELECT id, id AS "userId", email, name, picture,
       is_admin AS "isAdmin", onboarded_at, last_synced_at AS "lastSyncedAt",
       is_test_user AS "isTestUser", created_at, preferences
FROM users WHERE ${where}
```

- [ ] **Step 4: Add `updateUserPreferences` helper**

Add to `db/database.js` near the other user helpers:

```javascript
async function updateUserPreferences(userId, prefs) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE users SET preferences = COALESCE(preferences, '{}') || $2::jsonb
     WHERE id = $1 RETURNING preferences`,
    [userId, JSON.stringify(prefs)]
  );
  return rows[0]?.preferences || {};
}
```

Export it in `module.exports`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add db/migrations/009-user-preferences.sql db/database.js
git commit -m "feat(schema): add preferences JSONB column, updateUserPreferences helper"
```

---

## Task 2: Backend API Route

**Files:**
- Modify: `api.js`

- [ ] **Step 1: Add `preferences` to `createClientSideUser`**

Find `createClientSideUser` (~line 741). Add `preferences` to the return object:

```javascript
preferences: user.preferences || {},
```

- [ ] **Step 2: Add `POST /updatePreferences` route**

Add before `module.exports = router`. Import `updateUserPreferences` from database.js at the top.

```javascript
router.post('/updatePreferences', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { preferences } = req.body;
    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ message: 'preferences object required' });
    }
    const updated = await updateUserPreferences(uid, preferences);
    res.json({ preferences: updated });
  } catch (error) {
    console.error('/updatePreferences error:', error.message);
    res.status(500).json({ message: 'Failed to update preferences' });
  }
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add api.js
git commit -m "feat(api): add preferences to user response, POST /updatePreferences route"
```

---

## Task 3: Frontend API + Store

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/store.js`

- [ ] **Step 1: Add `updatePreferences` function to `frontend/src/api.js`**

Add near the other exported API functions:

```javascript
export async function updatePreferences(preferences) {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/updatePreferences', {
    method: 'POST',
    headers,
    body: JSON.stringify({ preferences }),
  });
  if (response.ok) {
    return response.json();
  } else {
    _notify({ type: 'negative', message: `Failed to save preferences (${response.status})` });
  }
}
```

- [ ] **Step 2: Add `updatePreferences` mutation to store**

In `frontend/src/store.js`, add a mutation:

```javascript
updatePreferences(state, preferences) {
    state.user = { ...state.user, preferences: { ...(state.user?.preferences || {}), ...preferences } };
},
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js frontend/src/store.js
git commit -m "feat: add updatePreferences API client and store mutation"
```

---

## Task 4: Nudge Cards on Budget Page

**Files:**
- Modify: `frontend/src/views/BudgetView.vue`

Read BudgetView before making changes. Key areas: "To Sort" card (~line 213), "Detected Relationships" card (~line 236), category list start (~line 268).

- [ ] **Step 1: Add `nudgeCard` computed property**

In the `computed` section, add:

```javascript
nudgeCard() {
  const user = this.$store.state.user;
  if (!user?.onboarded_at) return null;
  if (this.toSortSuggestionStats.total > 0) return null;
  if (this.pendingRelationships?.length > 0) return null;
  const prefs = user.preferences || {};
  const categories = this.$store.state.categories || [];
  const expenseWithLimit = categories.filter(c => c.type === 'expense' && Number(c.monthly_limit) > 0);

  // Nudge A: no expense categories have limits
  if (expenseWithLimit.length === 0 && !prefs.dismissed_budget_nudge) {
    return { type: 'budget', text: 'Set spending limits to track your budget.', cta: 'Set up budgets', to: '/plan' };
  }

  // Nudge B: some categories have limits, but at least one with spending doesn't
  if (expenseWithLimit.length > 0) {
    const dismissedCats = prefs.dismissed_category_nudges || [];
    const candidates = categories
      .filter(c => c.type === 'expense' && (!c.monthly_limit || Number(c.monthly_limit) === 0) && !dismissedCats.includes(c.category))
      .map(c => ({ name: c.category, spend: Math.abs(this.categorySum(c.category) || 0) }))
      .filter(c => c.spend > 0)
      .sort((a, b) => b.spend - a.spend);
    if (candidates.length > 0) {
      const top = candidates[0];
      return {
        type: 'category',
        category: top.name,
        text: `You spent $${Math.round(top.spend).toLocaleString()} on ${top.name} this month. Set a limit?`,
        cta: 'Set limit',
      };
    }
  }

  // Nudge C: all active categories budgeted
  if (expenseWithLimit.length > 0 && !prefs.dismissed_trends_nudge) {
    return { type: 'trends', text: 'See where your money goes each month.', cta: 'View trends', to: '/trends' };
  }

  return null;
},
```

- [ ] **Step 2: Add nudge card template**

After the "Detected Relationships" card section (~line 264) and before the "Show all" toggle, add:

```html
<!-- Post-onboarding nudge card -->
<div
  v-if="nudgeCard && !showAll && !isLoading && !isRefreshing"
  class="q-pa-md"
  style="max-width: 800px; margin: 0 auto; padding-top: 0;"
>
  <q-card class="basil-tosort-card">
    <div class="basil-card-head">
      <span class="basil-card-label">{{ nudgeCard.type === 'budget' ? 'Get started' : nudgeCard.type === 'category' ? 'Budget tip' : 'Next step' }}</span>
      <q-btn flat round dense icon="close" size="sm" @click.stop="dismissNudge()" />
    </div>
    <div class="basil-tosort-card__body" style="cursor: default;">
      <div>
        <div class="basil-tosort-card__headline">{{ nudgeCard.text }}</div>
      </div>
    </div>
    <q-btn
      unelevated color="primary"
      :label="nudgeCard.cta"
      class="q-mx-md q-mb-md"
      @click="handleNudgeCta()"
    />
  </q-card>
</div>
```

- [ ] **Step 3: Add nudge methods**

Import `updatePreferences` from `@/api` at the top of the script section (add to existing import).

Add methods:

```javascript
async dismissNudge() {
  const card = this.nudgeCard;
  if (!card) return;
  let prefs = {};
  if (card.type === 'budget') {
    prefs.dismissed_budget_nudge = true;
  } else if (card.type === 'category') {
    const existing = this.$store.state.user.preferences?.dismissed_category_nudges || [];
    prefs.dismissed_category_nudges = [...existing, card.category];
  } else if (card.type === 'trends') {
    prefs.dismissed_trends_nudge = true;
  }
  const result = await updatePreferences(prefs);
  if (result) this.$store.commit('updatePreferences', prefs);
},
handleNudgeCta() {
  const card = this.nudgeCard;
  if (!card) return;
  if (card.type === 'category') {
    // Open edit category dialog for the specific category
    const group = this.groupedTransactions[card.category];
    if (group) this.buildEditCategoryDialog(group);
  } else if (card.to) {
    this.$router.push(card.to);
  }
},
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/BudgetView.vue
git commit -m "feat: add nudge cards on budget page (budget setup, category-specific, trends)"
```

---

## Task 5: Guided Budget Setup on `/plan`

**Files:**
- Modify: `frontend/src/views/BudgetPlannerView.vue`

Read BudgetPlannerView.vue in full before making changes. The file is ~450 lines.

- [ ] **Step 1: Add guided setup data properties**

In `data()`, add:

```javascript
showGuidedChoice: false,
guidedMode: false,
guidedStep: 1, // 1 = income, 2 = categories
guidedIncome: null,
guidedLimits: {}, // { categoryName: amount }
```

- [ ] **Step 2: Add `isFirstTimeSetup` computed**

```javascript
isFirstTimeSetup() {
  const categories = this.$store.state.categories || [];
  const hasAnyLimit = categories.some(c => c.type === 'expense' && Number(c.monthly_limit) > 0);
  const dismissed = this.$store.state.user?.preferences?.dismissed_budget_setup;
  return !hasAnyLimit && !dismissed;
},
incomeHint() {
  const categories = this.$store.state.categories || [];
  const incomeCat = categories.find(c => c.type === 'income');
  if (!incomeCat) return null;
  // Check last month's income from transactions
  const now = new Date();
  const lastMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
  const txns = this.$store.state.transactionsByMonth[lastMonth] || [];
  const incomeTotal = txns.filter(t => t.mappedCategory === incomeCat.category).reduce((sum, t) => sum + Math.abs(t.amount), 0);
  if (incomeTotal > 0) return `You received $${Math.round(incomeTotal).toLocaleString()} last month`;
  // Fall back to current month
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentTxns = this.$store.state.transactionsByMonth[currentMonth] || [];
  const currentIncome = currentTxns.filter(t => t.mappedCategory === incomeCat.category).reduce((sum, t) => sum + Math.abs(t.amount), 0);
  if (currentIncome > 0) return `$${Math.round(currentIncome).toLocaleString()} received so far this month`;
  return null;
},
guidedCategories() {
  const categories = this.$store.state.categories || [];
  const expense = categories.filter(c => c.type === 'expense' && c.category !== 'To Sort');
  const txns = this.$store.state.transactions || [];
  // Calculate spending per category
  const spending = {};
  txns.forEach(t => {
    if (t.amount > 0 && t.mappedCategory) {
      spending[t.mappedCategory] = (spending[t.mappedCategory] || 0) + t.amount;
    }
  });
  const withSpending = expense.filter(c => spending[c.category] > 0)
    .sort((a, b) => (spending[b.category] || 0) - (spending[a.category] || 0))
    .map(c => ({ ...c, spendingHint: `$${Math.round(spending[c.category]).toLocaleString()} spent recently` }));
  const withoutSpending = expense.filter(c => !spending[c.category])
    .map(c => ({ ...c, spendingHint: null }));
  return [...withSpending, ...withoutSpending];
},
guidedTotal() {
  return Object.values(this.guidedLimits).reduce((sum, v) => sum + (Number(v) || 0), 0);
},
```

- [ ] **Step 3: Add guided setup template**

At the top of the onboarded section (after the `v-if="isOnboarded"` check), add a conditional that shows guided choice or guided mode instead of normal content:

```html
<!-- First-time setup choice -->
<template v-if="isFirstTimeSetup && !guidedMode">
  <div style="text-align: center; padding: var(--basil-space-7) var(--basil-space-5);">
    <h2 class="basil-display" style="font-size: 1.75rem; margin: 0 0 var(--basil-space-3);">Set up your budget</h2>
    <p style="color: var(--basil-text-secondary); margin: 0 0 var(--basil-space-5);">Choose how you'd like to get started.</p>
    <q-btn unelevated color="primary" label="Guided setup" class="q-mb-md" style="min-width: 200px;" @click="startGuidedSetup()" />
    <div>
      <a href="#" style="color: var(--basil-text-muted); font-size: 0.875rem;" @click.prevent="dismissGuidedSetup()">I'll do it myself</a>
    </div>
  </div>
</template>

<!-- Guided setup flow -->
<template v-else-if="guidedMode">
  <!-- Step 1: Income -->
  <div v-if="guidedStep === 1" style="max-width: 500px; margin: 0 auto; padding: var(--basil-space-5);">
    <h2 class="basil-display" style="font-size: 1.5rem; margin: 0 0 var(--basil-space-3);">What's your monthly income?</h2>
    <q-input
      v-model="guidedIncome"
      outlined
      type="number"
      prefix="$"
      label="Monthly income"
      :hint="incomeHint"
    />
    <div style="display: flex; justify-content: flex-end; margin-top: var(--basil-space-4);">
      <q-btn unelevated color="primary" label="Next" :disable="!guidedIncome || guidedIncome <= 0" @click="guidedStep = 2" />
    </div>
  </div>

  <!-- Step 2: Category limits -->
  <div v-if="guidedStep === 2" style="max-width: 500px; margin: 0 auto; padding: var(--basil-space-5);">
    <h2 class="basil-display" style="font-size: 1.5rem; margin: 0 0 var(--basil-space-3);">Set your spending limits</h2>
    <div style="display: flex; flex-direction: column; gap: var(--basil-space-3);">
      <div v-for="cat in guidedCategories" :key="cat.category">
        <q-input
          v-model="guidedLimits[cat.category]"
          outlined
          type="number"
          prefix="$"
          :label="cat.category"
          :hint="cat.spendingHint"
        />
      </div>
    </div>

    <!-- Sticky footer -->
    <div style="position: sticky; bottom: 0; background: var(--basil-bg); padding: var(--basil-space-4) 0; border-top: 1px solid var(--basil-border); margin-top: var(--basil-space-4);">
      <div style="display: flex; justify-content: space-between; font-size: 0.875rem; color: var(--basil-text-secondary); margin-bottom: var(--basil-space-3);">
        <span>Total limits</span>
        <span class="basil-mono">${{ guidedTotal.toLocaleString() }} / ${{ Number(guidedIncome || 0).toLocaleString() }} income</span>
      </div>
      <div style="display: flex; gap: var(--basil-space-2); justify-content: flex-end;">
        <q-btn flat label="Skip for now" @click="dismissGuidedSetup()" />
        <q-btn unelevated color="primary" label="Start budgeting" @click="saveGuidedSetup()" />
      </div>
    </div>
  </div>
</template>

<!-- Normal plan view (existing content) -->
<template v-else>
  <!-- ... existing BudgetPlannerView content ... -->
</template>
```

**Important:** Wrap the existing onboarded content in the `<template v-else>` block. Read the current template to identify the exact start and end.

- [ ] **Step 4: Add guided setup methods**

Import `updatePreferences` and `handleDialogSubmit` from `@/api`.

```javascript
async startGuidedSetup() {
  this.guidedMode = true;
  this.guidedStep = 1;
  this.guidedLimits = {};
  await updatePreferences({ budget_setup_mode: 'guided' });
  this.$store.commit('updatePreferences', { budget_setup_mode: 'guided' });
},
async dismissGuidedSetup() {
  const prefs = { dismissed_budget_setup: true };
  if (!this.$store.state.user.preferences?.budget_setup_mode) {
    prefs.budget_setup_mode = 'manual';
  }
  await updatePreferences(prefs);
  this.$store.commit('updatePreferences', prefs);
  this.guidedMode = false;
},
async saveGuidedSetup() {
  // Save income limit
  const categories = this.$store.state.categories || [];
  const incomeCat = categories.find(c => c.type === 'income');
  if (incomeCat && this.guidedIncome > 0) {
    await handleDialogSubmit(JSON.stringify({
      updateType: 'editCategory',
      _id: incomeCat._id || incomeCat.id,
      categoryName: incomeCat.category,
      monthly_limit: Number(this.guidedIncome),
    }));
  }

  // Save category limits
  for (const [catName, limit] of Object.entries(this.guidedLimits)) {
    if (limit > 0) {
      const cat = categories.find(c => c.category === catName);
      if (cat) {
        await handleDialogSubmit(JSON.stringify({
          updateType: 'editCategory',
          _id: cat._id || cat.id,
          categoryName: catName,
          monthly_limit: Number(limit),
        }));
      }
    }
  }

  // Mark setup complete
  const prefs = { budget_setup_completed_at: new Date().toISOString(), dismissed_budget_setup: true };
  await updatePreferences(prefs);
  this.$store.commit('updatePreferences', prefs);

  // Refresh categories in store and navigate to budget
  const updatedCats = await fetchCategories();
  if (updatedCats) this.$store.commit('setCategories', updatedCats);
  this.$router.push('/budget');
},
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/BudgetPlannerView.vue
git commit -m "feat: guided budget setup on /plan — first-time detection, income + category steps"
```

---

## Task 6: Onboarding Completion Screen — Three Paths

**Files:**
- Modify: `frontend/src/views/OnboardingView.vue`

- [ ] **Step 1: Replace single CTA with three-path choice**

Find the completion screen CTA section (~line 157). Replace:

```html
<q-btn
  unelevated
  color="primary"
  :label="summaryStats.toSort > 0 ? 'Start sorting' : 'See your budget'"
  class="basil-onboarding-cta q-mt-md"
  @click="$router.push(summaryStats.toSort > 0 ? '/budget?triage=1' : '/budget')"
/>
<div v-if="summaryStats.toSort > 0" class="basil-onboarding-skip">
  <a href="#" @click.prevent="$router.push('/budget')">See your budget →</a>
</div>
```

With:

```html
<!-- Primary CTA -->
<q-btn
  unelevated color="primary"
  :label="summaryStats.toSort > 0 ? 'Start sorting' : 'Set up budgets'"
  class="basil-onboarding-cta q-mt-md"
  @click="onboardingChoice(summaryStats.toSort > 0 ? 'sort_first' : 'setup_budgets')"
/>

<!-- Secondary links -->
<div class="basil-onboarding-skip" style="display: flex; flex-direction: column; gap: var(--basil-space-2);">
  <a v-if="summaryStats.toSort > 0" href="#" @click.prevent="onboardingChoice('setup_budgets')">Set up budgets →</a>
  <a href="#" @click.prevent="onboardingChoice('explore')">Explore your budget →</a>
</div>
```

- [ ] **Step 2: Add `onboardingChoice` method**

Import `updatePreferences` from `@/api`.

```javascript
async onboardingChoice(choice) {
  // Track analytics
  await updatePreferences({ post_onboarding_choice: choice });
  store.commit('updatePreferences', { post_onboarding_choice: choice });

  // Navigate
  if (choice === 'sort_first') {
    this.$router.push('/budget?triage=1');
  } else if (choice === 'setup_budgets') {
    this.$router.push('/plan');
  } else {
    this.$router.push('/budget');
  }
},
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/OnboardingView.vue
git commit -m "feat: three-path onboarding completion screen with analytics tracking"
```

---

## Task 7: Run Migration on Prod + E2E Testing

- [ ] **Step 1: Run migration on prod**

```bash
ssh ktrlabs "docker exec basil-postgres-1 psql -U basil -d basil -c \"ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';\""
```

- [ ] **Step 2: Run all tests locally**

```bash
npx vitest run
cd frontend && npx vitest run
```

- [ ] **Step 3: Manual E2E test — nudge cards**

1. Use test-user-active with no budget limits set
2. Sort all transactions (triage until 0 unsorted)
3. Verify "Set up budgets" nudge card appears
4. Dismiss it, verify it doesn't come back
5. Set one category's limit, verify category-specific nudge appears for highest-spend unconfigured category
6. Set all category limits, verify "Explore trends" nudge appears

- [ ] **Step 4: Manual E2E test — guided setup**

1. Nuke test user, re-seed with no limits
2. Navigate to `/plan`
3. Verify guided/manual choice appears
4. Choose "Guided setup"
5. Set income, verify hint shows
6. Set some category limits, verify sticky footer totals
7. Click "Start budgeting", verify limits saved and navigated to `/budget`
8. Return to `/plan`, verify normal view (no guided prompt)

- [ ] **Step 5: Manual E2E test — onboarding completion**

1. Nuke test user, re-onboard
2. After sync, verify three-path choice
3. Test each path navigates correctly
4. Verify analytics preference saved

- [ ] **Step 6: Commit any fixes**

---

## Future iteration: Polished guided setup UX

The V1 guided setup is a basic two-step form (income → category list). The
next iteration should feel more like a conversation:

- Show only the user's top 3-4 spending categories as cards (not a full list)
- Each card shows actual spending and asks "Want to set a limit?"
- User makes 3-4 decisions instead of 12
- Remaining categories can be set up later from the normal `/plan` page
- The key differentiator: "here are the decisions that matter" vs "fill in all these numbers"

This is a UX/design task, not infrastructure — all the plumbing (preferences,
analytics, first-time detection) ships in V1.
