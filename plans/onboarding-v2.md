# Onboarding V2

Consolidates the full onboarding redesign: account linking, category selection, and
budget setup into one cohesive flow.

## Current state

Three steps: connect one bank → seed 12 default categories → done. User lands on a
dashboard with $0 budgets, no guidance, and no prompt to connect additional accounts.
The flow gets them *in* but doesn't set them up for success.

## Proposed flow

### Overview

```
Welcome → Connect Accounts (repeatable) → Account Summary
        → Pick Categories → Set Budgets → Dashboard
```

Still skippable at every step. Still never blocks the dashboard. But each step builds
on the last so users who complete the flow land on something that works.

---

### Step 1: Connect accounts

**Current:** Single Plaid Link, one institution, done.

**Proposed:** After first Plaid Link completes, show a **post-link summary** of what
came back, then offer to add more.

```
┌─────────────────────────────────────┐
│  Connected: Chase                   │
│  ✓ Chase Checking  ···4521         │
│  ✓ Chase Savings   ···7803         │
│                                     │
│  Most people connect 3-4 accounts   │
│  for a complete picture.            │
│                                     │
│  [+ Connect another institution]    │
│                                     │
│  That's everything → Next           │
└─────────────────────────────────────┘
```

Each "Connect another" opens a new Plaid Link session. Summary updates with each
institution added. User decides when they're done.

**Key decisions:**
- **No checklist of account types.** Don't ask "do you have a checking? savings? credit
  card?" — it implies you *need* all of them, which scares people off. Just show what
  connected and let them add more.
- **No investment/401k nudge.** These don't generate useful transaction data (just
  balance tracking, which we haven't built). Don't suggest connecting accounts we can't
  do anything with yet.
- **Soft social proof.** "Most people connect 3-4 accounts" is gentler than a checklist
  and more effective than nothing. Can pull actual average from our user base later.
- **"That's everything" not "Skip."** Framing matters — exiting isn't skipping, it's a
  positive confirmation that they're done.

**Future enhancement (post-Accounts view):** Smart nudges on the dashboard when we
detect signals of missing accounts. E.g., credit card payment transactions showing up
as outflows with no matching credit card account → "You have credit card payments but
no credit card connected. Connect it to see itemized spending."

### Step 2: Pick your categories (~10 seconds)

Chip grid showing all default categories as toggleable pills.

**Smart pre-selection:**
- Categories WITH spending history → pre-toggled ON, show monthly average badge ("~$340/mo")
- Categories WITHOUT spending history → toggled OFF, dimmed
- Payment-type categories filtered out (not discretionary spending)
- Income shown separately (not a toggle — always tracked)

**UI pattern:** 2-3 chips per row on mobile, wrapping naturally. Active chips use category
accent color. Inactive chips use `--basil-surface-alt` with muted text.

**Actions:**
- "Next" (requires ≥1 category selected)
- "I'll do this later" (small text link — skips to dashboard)
- "Add custom category" link at bottom for power users

**What "toggling off" means:** Category still exists, still categorizes transactions via
Plaid PFC mapping and rules, but is hidden from the budget dashboard (no progress bar,
no projections). Can be re-enabled anytime from Plan view.

### Step 3: Set your budgets (~30-60 seconds)

Scrollable vertical list of selected categories. Each row:

```
[Icon] Food & Dining              [$300]
       You spent $287 last month
```

- Pre-filled budget amount (editable, tap to open number keyboard)
- Context line showing actual spending data
- Sticky footer: total budget vs total income ("$3,200 / $5,100 income")

**Actions:**
- "Start budgeting" (saves all limits, completes setup)
- "Back" to category selection
- "Skip for now" (saves category visibility but leaves limits at $0)

User lands on a functional dashboard.

---

## Suggestion engine

### Data tiers

| History available | Suggestion | Context shown |
|-------------------|-----------|---------------|
| 2+ months | Monthly average, rounded up | "Avg $340/mo over 3 months" |
| 1 month | That month's spend, rounded up aggressively | "You spent $287 last month" |
| High variance (CV > 0.8) | None — leave blank | "You spent $0–$3,000/mo" |
| < 3 transactions total | None — leave blank | "Set a limit" placeholder |
| No history | None — leave blank | "Set a limit" placeholder |

### Rounding logic

Always round UP (slightly generous feels achievable; tight on day one feels punishing):

| Actual spend | Round to nearest | Example |
|-------------|-----------------|---------|
| Under $50 | $10 | $37 → $40 |
| $50–$500 | $25 | $287 → $300 |
| $500–$2,000 | $50 | $1,847 → $1,850 |
| Over $2,000 | $100 | $2,340 → $2,400 |

### Special cases

- **Income:** "Expected income" not "Budget limit." Pre-fill from average if consistent.
  If variable, leave blank: "Your income varies — you can set this monthly."
- **Payment type:** Exclude from the flow entirely.
- **Savings type:** Show as "Savings goal" instead of "Budget limit."

---

## Container & presentation

- **Mobile:** Full-height bottom sheet (`q-dialog` position="bottom" full-height)
- **Desktop:** Centered dialog, 480px wide
- **Progress:** Dots for each step (not a full progress bar)
- **Step transitions:** Horizontal slide animation
- Account summary is part of step 1 (same screen), so the dot count is 3, not 4

---

## Entry points

1. **Post-onboarding** — triggers automatically after account connection and category
   seeding. If no transaction data yet (sync still running), start at category selection
   with no pre-selections and defer budget suggestions to dashboard CTA.
2. **Dashboard CTA** — persistent but dismissible card at top of BudgetView:
   "Set up your budgets to track spending goals" + "Get started" button.
   After 3 dismissals or 30 days, stop showing.
3. **Plan view** — "Budget setup wizard" link. Re-entry mode: pre-fills with current
   limits, pre-selects currently visible categories.

---

## State changes

- **User document:** `budget_setup_completed_at` timestamp (like `onboarded_at`).
  Determines whether to show post-onboarding trigger and dashboard CTA.
- **Category visibility:** Need a mechanism for "budgeted" vs "tracking only."
  Options: (a) `budgeted: true/false` field, (b) infer from `monthly_limit > 0`,
  (c) `hidden_from_budget: true`. **Decision needed** — (b) is simplest but conflates
  "$0 budget intentionally" with "not configured yet."
- **Budget limits:** Written to existing `monthly_limit` field on `Basil-Categories`.
- **CTA dismissal:** `budget_cta_dismissed_count` + `budget_cta_dismissed_at` on user
  document (or localStorage if we don't want to persist server-side).

---

## Design principles

- **Data-driven, not questionnaire.** Never ask what you can infer from transactions.
- **Observational framing.** "You typically spend $X" — mirror, not parent.
- **Never block the dashboard.** App works without budgets; every step is skippable.
- **No gamification.** No confetti, no completion percentages, no badges.
- **No per-category deep dives.** Everything on one scrollable screen per step.
- **No sliders.** Imprecise on mobile. Tap-to-edit number inputs only.
- **Positive exit framing.** "That's everything" not "Skip." Users aren't failing by
  choosing to stop — they're confirming a decision.

---

## Scope

### V1 (MVP)
- Account summary after first Plaid Link ("Connect another" loop)
- Two-panel category + budget dialog component
- Suggestion utility (query `transactionsByMonth`, compute averages, apply rounding)
- Post-onboarding trigger + dashboard CTA
- `budget_setup_completed_at` flag
- Batch update category limits API endpoint

### V2 (Polish)
- Income-vs-budget running total footer in budget step
- Variance detection (don't suggest for volatile categories)
- Re-entry from Plan view with current values
- Dismissible CTA with counter/expiry logic
- Smart nudges for missing accounts (detect credit card payments without CC connected)

### V3 (Delight)
- Dashboard "coming alive" animation after setup — staggered progress bar fills
- Outlier detection ("includes $800 furniture purchase" context notes)
- Social proof with real data ("Most Basil users connect 3-4 accounts")

---

## Inspiration

| App | What to steal | What to skip |
|-----|--------------|-------------|
| **Monarch Money** | Data-driven defaults, actual spending as context alongside inputs | Per-category flow (do it all on one screen) |
| **Copilot** | Chip selection for categories, app useful without budgets | Over-reliance on AI summaries |
| **YNAB** | "Money available to budget" running counter concept | Mandatory allocation model (too heavy) |
| **Lunch Money** | Simplicity — a list of inputs is honestly fine | Total lack of data-driven suggestions |
