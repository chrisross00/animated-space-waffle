# Post-Onboarding Nudges & Budget Setup Flow

> **Status:** Decisions finalized — ready to spec/build
> **Date:** 2026-03-22

## Problem

After onboarding (connect bank → sync), users land on the budget page with no
guidance on what to do next. There's no step where users set up budget limits,
and no nudge to do so once they're on the dashboard.

## Decisions

### 1. Onboarding completion screen → choice point

After sync summary, show three distinct paths:
1. **"Sort transactions"** (X to sort) → opens triage flow directly
2. **"Set up budgets"** → navigates to `/plan` (guided experience for first-timers)
3. **"Explore your budget"** → navigates to `/budget`

Track which path the user takes (analytics — understand user priorities).
Store as event on user record: `sort_first`, `setup_budgets`, or `explore`.

### 2. Post-onboarding nudge cards on budget page

When a user has no actionable items (no unsorted txns, no pending relationships),
show a nudge card. Priority order:

1. **Set up income** — if no income budget limit set
   - Already handled by hero card CTA ("Set your income")
2. **Set up budget limits** — if no expense categories have limits set
   - "Set spending limits to track your budget" → link to `/plan`
3. **Explore your spending** — if budgets are set, nothing to sort
   - "Check out your spending trends" → link to `/trends`

Nudges are dismissable and behavior-triggered (not time-based).

### 3. Guided budget setup on `/plan`

No separate route. `/plan` detects first-time visitors and shows a choice:
"Guided setup" or "Set up manually". Both live on `/plan` as inline states.

**First-time detection:** No expense categories have budget limits set AND user
hasn't dismissed the guided setup prompt.

**Dismissal:** Stored in `preferences JSONB` column on `users` table.
`preferences->>'dismissed_budget_setup'`. One column for all future preferences.

**Guided flow:**
- Step 1: Set income (hint from actual deposits if available)
- Step 2: Set category limits
  - Categories with spending shown first (with "You spent $X last month" hint,
    or "Spent $X so far" if no prior month)
  - Categories without spending shown below (no collapse, just no hint)
  - All amounts blank — user types intentionally, hint is context only
- Sticky footer: total budget vs total income
- "Start budgeting" saves all limits
- "Skip for now" dismisses prompt, goes to normal `/plan`

Track "Guided" vs "Manual" choice as analytics event.

### 4. User preferences column

Add `preferences JSONB DEFAULT '{}' ` to `users` table. Single column for all
user preferences — avoids per-preference migrations. Keys so far:
- `dismissed_budget_setup` — boolean, hides guided setup prompt on `/plan`

### 5. Analytics events to capture

| Event | When | Value |
|-------|------|-------|
| `post_onboarding_choice` | User picks path on completion screen | `sort_first` / `setup_budgets` / `explore` |
| `budget_setup_mode` | User picks guided vs manual on `/plan` | `guided` / `manual` |
| `budget_setup_dismissed` | User clicks "Skip for now" | timestamp |
| `budget_setup_completed` | User saves limits via guided flow | timestamp + category count |

## Implementation order

1. **Schema:** Add `preferences JSONB DEFAULT '{}'` to `users` table
2. **Nudge cards:** Budget page nudge when no limits set → link to `/plan`
3. **`/plan` guided mode:** First-time detection, guided/manual choice, step flow
4. **Onboarding completion:** Three-path choice point with analytics
5. **Analytics events:** Track choices across all touchpoints

## Not in scope (V1)

- ML/AI-based budget suggestions
- YNAB category import
- Multi-month budget history in setup flow
- Category-level benchmarking from aggregate user data
