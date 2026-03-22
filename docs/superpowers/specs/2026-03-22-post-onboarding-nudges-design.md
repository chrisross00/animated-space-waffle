# Post-Onboarding Nudges & Guided Budget Setup — Design Spec

> **Status:** Approved
> **Date:** 2026-03-22
> **Scope:** Nudge cards on budget page, guided budget setup on `/plan`, onboarding completion choice point, analytics events

## Summary

After onboarding, users need guidance toward three actions: sorting transactions,
setting up budgets, and exploring spending. This spec adds nudge cards on the
budget page, a guided budget setup experience on `/plan`, a three-path choice
point on the onboarding completion screen, and analytics events to track user
behavior.

## 1. Schema: User Preferences

Add `preferences JSONB DEFAULT '{}'` column to `users` table. Single column for
all user preferences — avoids per-preference migrations.

```sql
ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}';
```

Keys used by this feature:
- `dismissed_budget_setup` (boolean) — hides guided setup prompt on `/plan`
- `post_onboarding_choice` (string) — which path they took from completion screen
- `budget_setup_mode` (string) — `guided` or `manual`
- `budget_setup_completed_at` (ISO timestamp) — when they finished guided setup

## 2. Nudge Cards on Budget Page

### When to show

Show a nudge card when ALL of these are true:
- User is onboarded
- No unsorted transactions (To Sort count = 0)
- No pending relationship cards

### What to show (priority order, show first match only)

1. **Set up budgets** — if no expense categories have budget limits > 0
   - Card text: "Set spending limits to track your budget."
   - CTA: "Set up budgets" → `/plan`
   - Dismissable: no (goes away naturally once they set any limit)

2. **Explore trends** — if budgets are set, nothing else to do
   - Card text: "See where your money goes each month."
   - CTA: "View trends" → `/trends`
   - Dismissable: yes (store in preferences, don't nag)

### Design

Same card pattern as the existing "To Sort" card — `basil-card-head` +
`basil-card-label` + body + CTA button. Positioned between the hero card and
the category list.

## 3. Guided Budget Setup on `/plan`

### First-time detection

`/plan` checks on mount:
- Do any expense categories have `monthly_limit > 0`?
- Has user dismissed the guided setup? (`preferences.dismissed_budget_setup`)

If no limits AND not dismissed → show choice: "Guided setup" or "Set up manually"

### Choice screen (inline on `/plan`)

Replaces the normal plan content for first-time users:
- Heading: "Set up your budget"
- Body: "Choose how you'd like to get started."
- **"Guided setup"** button → enters guided mode (inline, same page)
- **"I'll do it myself"** link → dismisses prompt, shows normal `/plan`
- Track choice as analytics event

### Guided mode

Inline on `/plan`, replaces the normal category list:

**Step 1: Income**
- Single input: "Monthly income"
- Hint: "You received $X last month" or "$X so far this month" (or no hint)
- "Next" button

**Step 2: Category limits**
- Scrollable list of all expense categories
- Categories with spending shown first, with hint: "You spent $X last month"
  (or "$X so far" if no prior month)
- Categories without spending shown below, no hint, no collapse
- All amount fields blank — user types intentionally
- Sticky footer: "Total: $X / $Y income" showing sum of limits vs income

**Actions:**
- "Start budgeting" → saves all limits, marks setup complete, navigates to `/budget`
- "Skip for now" → dismisses prompt (`preferences.dismissed_budget_setup = true`),
  shows normal `/plan`

### Normal `/plan` behavior

Unchanged for returning users (has limits or dismissed setup). The existing
BudgetPlannerView with editable category rows.

## 4. Onboarding Completion Screen

### Current state

Two actions that both go to `/budget`:
- "Start sorting" / "See your budget" — same destination

### New design

Three distinct paths:
1. **"Sort transactions"** (shown only if toSort > 0) → `/budget?triage=1`
2. **"Set up budgets"** → `/plan`
3. **"Explore your budget"** → `/budget`

Primary CTA: "Sort transactions" if items to sort, otherwise "Set up budgets"
Secondary: the other two as text links below

Track which path the user takes → store in `preferences.post_onboarding_choice`

## 5. Analytics Events

Stored in `preferences` JSONB on the user record. No separate analytics table
for V1 — just write to the user's preferences object.

| Key | When set | Values |
|-----|----------|--------|
| `post_onboarding_choice` | User picks path on completion screen | `sort_first` / `setup_budgets` / `explore` |
| `budget_setup_mode` | User picks guided vs manual on `/plan` | `guided` / `manual` |
| `budget_setup_completed_at` | User saves limits via guided flow | ISO timestamp |

## 6. API Changes

### `POST /api/updatePreferences`

```
Body: { preferences: { key: value, ... } }
Response: { success: true }
```

Merges provided keys into user's `preferences` JSONB. Does not overwrite
existing keys not in the request. Auth required.

### Backend: `updateUserPreferences(userId, prefs)`

DB helper that does a JSONB merge:
```sql
UPDATE users SET preferences = preferences || $2::jsonb WHERE id = $1
```

### Frontend: `updatePreferences(prefs)` in `api.js`

Client function that calls the API.

## Key touchpoints

| Area | File(s) | Change |
|------|---------|--------|
| Schema | `db/migrations/009-user-preferences.sql` | Add `preferences JSONB` column |
| DB helpers | `db/database.js` | `updateUserPreferences` function |
| API | `api.js` | `POST /api/updatePreferences` route |
| Frontend API | `frontend/src/api.js` | `updatePreferences()` function |
| Budget page | `frontend/src/views/BudgetView.vue` | Nudge card component/section |
| Plan page | `frontend/src/views/BudgetPlannerView.vue` | First-time detection, guided mode |
| Onboarding | `frontend/src/views/OnboardingView.vue` | Three-path choice point |
| Store | `frontend/src/store.js` | Expose preferences in user state |

## Not in V1

- ML/AI-based budget suggestions
- YNAB category import
- Multi-month budget history in setup flow
- Category-level benchmarking from aggregate user data
- Separate analytics table / event stream
