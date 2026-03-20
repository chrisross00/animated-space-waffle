# Onboarding Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce time-to-value for new users by replacing the empty-dashboard cold start with an active sync screen, a "here's what we found" summary, auto-learn feedback in triage, and a pace indicator on the budget hero card.

**Architecture:** Restructure OnboardingView from a 3-step wizard (connect → seed → done) to a 2-step flow (connect → active sync+summary). The sync screen shows real progress, seeds categories silently, runs the first Plaid sync inline (not in background), and transitions to a summary showing categorization results. Triage gains a toast after each sort. BudgetView's budgetSummary computed gains pace tracking.

**Tech Stack:** Vue 3, Quasar 2, Vuex 4, Express.js, Plaid API

**Mockup:** `docs/mockups/onboarding-flow.html` — 5 screens, approved

**Key files:**
- `frontend/src/views/OnboardingView.vue` — main changes (steps 2-3 become sync+summary)
- `frontend/src/views/BudgetView.vue` — pace indicator + triage toast
- `frontend/src/api.js` — triggerSync, ensureAppData

---

### Task 1: Pace indicator on hero card

Smallest change, highest impact. Add an "On track" / "Spending faster than usual" badge below the hero number.

**Files:**
- Modify: `frontend/src/views/BudgetView.vue` (budgetSummary computed + template)
- Modify: `frontend/src/styles/BudgetView.css` (badge styles)

- [ ] **Step 1: Add pace calculation to budgetSummary computed**

In the `budgetSummary()` computed, after calculating `remaining`, add pace logic:

```javascript
// Pace: compare spending rate to days elapsed in month
const now = new Date();
const sel = this.selectedDate.actual;
const daysInMonth = sel.daysInMonth();
const dayOfMonth = sel.month() === dayjs().month() && sel.year() === dayjs().year()
  ? now.getDate() : daysInMonth;
const expectedSpendRate = dayOfMonth / daysInMonth;
const actualSpendRate = pool > 0 ? spent / pool : 0;
// "on track" if actual rate is within 15% of expected rate, or under
const pace = actualSpendRate <= expectedSpendRate + 0.15 ? 'on-track' : 'caution';
```

Add `pace` to the return object.

- [ ] **Step 2: Add pace badge to template**

After the "left to spend this month" line in the hero card template, add:

```html
<div v-if="budgetSummary.pace" :class="['basil-pace-badge', `basil-pace-badge--${displayedSummary.pace || budgetSummary.pace}`]">
  <q-icon :name="budgetSummary.pace === 'on-track' ? 'trending_flat' : 'trending_up'" size="14px" />
  {{ budgetSummary.pace === 'on-track' ? 'On track' : 'Spending faster than usual' }}
</div>
```

Note: pace doesn't animate (it's a string, not a number), so use `budgetSummary.pace` directly.

- [ ] **Step 3: Add CSS**

```css
.basil-pace-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--basil-space-1);
  font-size: 0.75rem;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 12px;
  margin-top: var(--basil-space-2);
}
.basil-pace-badge--on-track {
  background: var(--basil-green-subtle);
  color: var(--basil-green);
}
.basil-pace-badge--caution {
  background: var(--basil-warning-bg);
  color: var(--basil-warning);
}
```

- [ ] **Step 4: Build and test**

```bash
cd frontend && npm run build
```

Verify: hero card shows "On track" or "Spending faster than usual" based on where you are in the month.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/BudgetView.vue frontend/src/styles/BudgetView.css
git commit -m "feat: add pace indicator badge to budget hero card"
```

---

### Task 2: Auto-learn toast in triage

After the user categorizes their first transaction in triage, show a brief toast: "Got it — future [merchant] transactions go to [category] automatically"

**Files:**
- Modify: `frontend/src/views/BudgetView.vue` (triage section + triageAccept method)

- [ ] **Step 1: Add toast state to data**

```javascript
triageLearnToast: null,  // { merchant, category } or null
```

- [ ] **Step 2: Show toast after first triage accept that creates a rule**

In `triageAccept()` (around line 1866), after the `handleDialogSubmit` call succeeds, if a rule was created (check `triageCreateRule` or the response), set the toast:

```javascript
// After successful save, show auto-learn toast on first rule creation
if (this.triageCreateRule && !this._triageToastShown) {
  const merchantName = this.triageItems[0]?.merchant_name || this.triageItems[0]?.name;
  this.triageLearnToast = { merchant: merchantName, category: this.triageCategory };
  this._triageToastShown = true;
  setTimeout(() => { this.triageLearnToast = null; }, 4000);
}
```

- [ ] **Step 3: Add toast template**

In the triage dialog template (around line 816, after the triage card), add:

```html
<div v-if="triageLearnToast" class="basil-triage-learn-toast">
  <q-icon name="auto_awesome" size="16px" />
  Got it — future {{ triageLearnToast.merchant }} transactions go to {{ triageLearnToast.category }}
</div>
```

- [ ] **Step 4: Add CSS**

```css
.basil-triage-learn-toast {
  margin: var(--basil-space-3) var(--basil-space-4);
  padding: var(--basil-space-3) var(--basil-space-4);
  background: var(--basil-green-subtle);
  border-radius: var(--basil-radius-md);
  font-size: 0.8125rem;
  color: var(--basil-green);
  display: flex;
  align-items: center;
  gap: var(--basil-space-2);
  animation: basil-toast-in 200ms var(--basil-ease);
}
@keyframes basil-toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 5: Build and test**

Open triage, categorize a transaction with "also categorize similar" checked. Toast should appear briefly.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/BudgetView.vue frontend/src/styles/BudgetView.css
git commit -m "feat: auto-learn toast in triage flow"
```

---

### Task 3: Trust copy on connect bank screen

Add one line below the "Connect account" CTA in OnboardingView.

**Files:**
- Modify: `frontend/src/views/OnboardingView.vue`

- [ ] **Step 1: Add trust line**

Find the "Connect account" button in Step 1. Below the "Skip for now" link, add:

```html
<div style="font-size: 0.75rem; color: var(--basil-text-muted); max-width: 260px; text-align: center; margin-top: var(--basil-space-3); line-height: 1.5">
  Your bank sends data directly to this server. Nothing is shared with anyone else.
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/OnboardingView.vue
git commit -m "feat: add trust copy to bank connection screen"
```

---

### Task 4: Active sync progress screen

Replace OnboardingView steps 2-3 with an active sync screen that shows real progress, then transitions to a summary.

**Files:**
- Modify: `frontend/src/views/OnboardingView.vue` (major template + methods rewrite)
- Modify: `frontend/src/api.js` (need sync to return transaction counts)

- [ ] **Step 1: Read OnboardingView.vue fully**

Understand the current step logic, Plaid success handler, and seed flow.

- [ ] **Step 2: Restructure steps**

Replace the current 3-step model with:
- Step 1: Connect bank (mostly unchanged, add "add another" loop)
- Step 2: Active sync + summary (combines old steps 2 and 3)

After Plaid success (or "that's all"):
1. Show sync progress screen with step checklist
2. Silently seed categories
3. Call triggerSync (inline, not background)
4. Call fetchMonthRange for current + 3 months
5. Compute summary stats
6. Transition to summary view

- [ ] **Step 3: Add sync progress template**

```html
<!-- Step 2a: Syncing -->
<div v-if="currentStep === 2 && !syncDone" class="basil-sync-progress">
  <div class="basil-sync-spinner"></div>
  <div class="basil-sync-status">{{ syncStatusText }}</div>
  <div class="basil-sync-detail">This takes a moment the first time</div>
  <div class="basil-sync-steps">
    <div v-for="step in syncSteps" :key="step.label"
      :class="['basil-sync-step', `basil-sync-step--${step.status}`]">
      <div class="basil-sync-step__icon">
        <q-icon :name="step.status === 'done' ? 'check' : step.status === 'active' ? 'more_horiz' : 'circle'" :size="step.status === 'pending' ? '8px' : '14px'" />
      </div>
      <span>{{ step.label }}</span>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Add summary template**

```html
<!-- Step 2b: Summary -->
<div v-if="currentStep === 2 && syncDone" class="basil-summary">
  <div class="basil-summary-hero">
    <div class="basil-summary-icon">
      <q-icon name="check_circle" size="28px" color="primary" />
    </div>
    <div class="basil-summary-heading">Here's what we found</div>
    <div class="basil-summary-sub">
      We sorted {{ summaryStats.categorized }} of {{ summaryStats.total }} transactions
    </div>
  </div>
  <!-- Top categories list -->
  <!-- To sort nudge -->
  <!-- CTAs: Start sorting / Go to dashboard -->
</div>
```

- [ ] **Step 5: Add sync orchestration method**

```javascript
async runSync() {
  this.syncSteps = [
    { label: `Connected to ${this.connectedInstitutions.join(', ')}`, status: 'done' },
    { label: `Found ${this.accountCount} accounts`, status: 'done' },
    { label: 'Importing transactions', status: 'active' },
    { label: 'Sorting into categories', status: 'pending' },
  ];

  // Seed categories silently
  await seedCategories();
  const cats = await fetchCategories();
  if (cats) store.commit('setCategories', cats);

  // Sync with Plaid
  this.syncSteps[2].status = 'active';
  await triggerSync();
  this.syncSteps[2].status = 'done';

  // Fetch transactions
  this.syncSteps[3].status = 'active';
  await ensureAppData(store);
  this.syncSteps[3].status = 'done';

  // Compute summary
  this.computeSummary();
  this.syncDone = true;
},
```

- [ ] **Step 6: Add summary computation**

```javascript
computeSummary() {
  const txns = store.state.transactions || [];
  const total = txns.length;
  const categorized = txns.filter(t => t.mappedCategory && t.mappedCategory !== 'To Sort').length;
  const toSort = total - categorized;

  // Top categories by spend
  const catSpend = {};
  txns.forEach(t => {
    if (t.mappedCategory && t.mappedCategory !== 'To Sort' && t.amount > 0) {
      catSpend[t.mappedCategory] = (catSpend[t.mappedCategory] || 0) + Math.abs(t.amount);
    }
  });
  const topCategories = Object.entries(catSpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, amount]) => ({
      name,
      amount: Math.round(amount),
      count: txns.filter(t => t.mappedCategory === name).length,
    }));

  this.summaryStats = { total, categorized, toSort, topCategories };
},
```

- [ ] **Step 7: Add "add another account" loop to Step 1**

After Plaid success, instead of immediately advancing to Step 2:
```html
<div v-if="linkedAccounts.length > 0 && !linking">
  <div>{{ linkedAccounts[linkedAccounts.length - 1] }} connected</div>
  <button @click="showPlaidLink = true">Add another account</button>
  <button @click="currentStep = 2; runSync()">That's all</button>
</div>
```

- [ ] **Step 8: Handle "skip" path**

If user skips bank linking, skip sync entirely:
- Seed categories
- Set `onboarded_at`
- Navigate to `/` (dashboard shows empty state)

- [ ] **Step 9: Add CSS for sync progress and summary**

Style the sync steps, summary hero, category list, and sort nudge. Follow the mockup closely. Use design tokens.

- [ ] **Step 10: Build and test**

Test scenarios:
1. Connect one bank → sync → summary → sort → dashboard
2. Connect two banks → sync → summary → dashboard (skip sort)
3. Skip bank → empty dashboard

- [ ] **Step 11: Commit**

```bash
git add frontend/src/views/OnboardingView.vue frontend/src/api.js
git commit -m "feat: active sync progress + summary screen in onboarding"
```

---

### Task 5: Integration test and cleanup

- [ ] **Step 1: Full end-to-end test with test user**

1. Create a fresh test user (admin portal)
2. Walk through the full onboarding
3. Verify sync progress shows real steps
4. Verify summary shows correct counts
5. Verify triage toast appears
6. Verify dashboard pace indicator works
7. Check mobile layout
8. Check dark mode

- [ ] **Step 2: Verify backward compatibility**

Existing users who are already onboarded should see no changes except:
- Pace indicator on hero card (new)
- Triage toast on first sort (new)

- [ ] **Step 3: Build frontend**

```bash
npm test && cd frontend && npm run build
```

- [ ] **Step 4: Commit cleanup**

```bash
git add -A
git commit -m "chore: onboarding improvements cleanup and polish"
```

---

## Notes for implementer

- **Do NOT push to main.** Test locally first.
- **OnboardingView rewrite is the big task.** Tasks 1-3 are small independent wins.
- **The sync must run inline during onboarding** (not background). New users need to see their data before landing on the dashboard. This is different from the background sync for returning users.
- **Summary stats are computed client-side** from `store.state.transactions` after sync. No new backend endpoint needed.
- **The "add another account" loop** tracks `linkedAccounts` as an array of institution names. Each Plaid success pushes to it.
- **Design tokens only.** `var(--basil-*)` for all colors/spacing.
- **Brand voice.** Read BRAND.md. No exclamation marks. Plain language. "Got it" not "Awesome!"
- **Test with dev auth bypass** — set `VITE_DEV_AUTH_BYPASS=true` in `frontend/.env` temporarily.
