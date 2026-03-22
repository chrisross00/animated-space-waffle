# Post-Onboarding Nudges & Budget Setup Flow

> **Status:** In progress — brainstorming
> **Date:** 2026-03-22

## Problem

After onboarding (connect bank → sync), users land on the budget page with no
guidance on what to do next. The onboarding completion screen has "Start sorting"
and "Go to budget" but both go to the same place. There's no step where users
set up budget limits, and no nudge to do so once they're on the dashboard.

## Current state

**Onboarding completion screen:**
- Shows spending summary after first sync
- "Start sorting" button → navigates to `/budget` (should open triage directly)
- "See your budget" link → navigates to `/budget` (same destination)
- No mention of budget setup / planning

**Budget page (new user, post-onboarding):**
- Hero card shows "spent so far" with CTA to set income (if no income budget set)
- To Sort card shows if unsorted transactions exist
- Relationship card shows if detected matches exist
- No nudge to set up budget limits on `/plan`
- No nudge to set up budget limits if nothing else to do

## What needs to happen

### 1. Fix onboarding completion screen (quick)

- "Start sorting" → should open triage flow directly, not just navigate to budget
- "See your budget" → navigates to `/budget` (keep as-is)
- Consider: third action to go to `/plan` for budget setup

### 2. Post-onboarding nudges on budget page (design needed)

When a user has no actionable items (no unsorted txns, no pending relationships),
show a nudge card. Priority order:

1. **Set up income** — if no income budget limit set
   - Already handled by hero card CTA ("Set your income")
2. **Set up budget limits** — if no expense categories have limits set
   - "Set spending limits to track your budget" → link to `/plan`
3. **Explore your spending** — if budgets are set, nothing to sort
   - Maybe: "Check out your spending trends" → link to `/trends`

These should be dismissable (don't nag forever) and behavior-triggered (not
time-based). Per onboarding research: behavior-triggered nudges outperform
scheduled ones.

### 3. Budget Planner improvements (future)

The `/plan` page exists but doesn't guide first-time users. Ideas from
`onboarding-v2.md`:
- Pre-fill suggested budget amounts from last month's actual spending
- Show "You spent $X last month" context on each category row
- Sticky footer: total budget vs total income
- Income row at top with same suggested amount

## Open questions

- Should "Start sorting" appear on the completion screen if there are 0 unsorted
  transactions? (Could happen if all synced transactions were auto-categorized)
- Should the nudge card be a new component or reuse EmptyState?
- How persistent should nudges be? Dismiss once and never show again? Or re-show
  after N days if they still haven't set up budgets?
- Should we add a "quick setup" flow that's lighter than `/plan` — e.g., just
  income + top 3 categories?
