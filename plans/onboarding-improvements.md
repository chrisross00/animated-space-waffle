# Onboarding Improvements Plan

## User Research Summary

Simulated interviews with 9 users across 3 segments (YNAB switchers, privacy-first
self-hosters, casual budgeters). Full transcripts in session history.

### Universal findings:
1. **Show value before asking for work.** Every persona said the same thing.
2. **The hero number needs a verdict.** "$3,200 left" means nothing without "on track" or "watch out."
3. **Auto-learn is the killer feature** but it's invisible in onboarding. Make it unmissable.
4. **Bank-linking anxiety is real** — one trust line resolves it for most users.
5. **Never show a $0 dashboard.** Show sync progress, then a summary.

### Segment-specific insights:

**YNAB switchers:** Want to see that auto-categorization works and that the app learns.
"Got it — future Starbucks transactions go to Dining" is the moment they decide to stay.
Category import is nice-to-have (paste a list of names), not critical.

**Privacy-first users:** Want one sentence about data flow at each step. Google OAuth
is accepted if explained. Plaid is accepted if scopes and data residency are clear.
Sentry should be audited for PII in breadcrumbs.

**Casual budgeters:** Will give the app 5 minutes. Need one "wow" moment on day one.
The summary screen ("Here's what we found") is that moment. Sorting must feel like
helping, not homework. Pace indicator on the hero card answers "am I okay?"

---

## Proposed Flow

**Current:** Sign in → Connect bank → Seed categories → "You're all set" → Empty dashboard → Background sync → Transactions appear

**Proposed:**

### Step 1: Connect bank(s)
- Same Plaid Link flow
- Trust line below CTA: "Your bank sends data directly to this server. Nothing is shared with anyone else."
- After connecting: "Connected. Add another account?" loop
- "That's all" proceeds to sync
- "Skip for now" goes to dashboard with empty state

### Step 2: Active sync screen (replaces spinner + "You're all set")
- Real progress steps with checkmarks:
  - Connected to [Institution]
  - Found N accounts
  - Importing N transactions
  - Sorting into categories
- Categories seeded silently during this step (no separate step)
- Transitions to summary when complete

### Step 3: "Here's what we found" summary (NEW — the aha moment)
- "We sorted [189] of [224] transactions"
- Top 3-4 categories with totals and transaction counts (smell test)
- "35 transactions need your help — about 5 minutes. Basil learns from every one."
- CTA: "Start sorting" → triage flow
- Secondary: "Go to dashboard" → skip sorting

### Step 4: Triage flow (existing, with one addition)
- After first sort: inline toast "Got it — future [merchant] transactions go to [category] automatically"
- On completion: "All caught up. Basil created N rules."

### Step 5: Dashboard
- Hero card with pace indicator: "On track" (green) or "Spending faster than usual" (amber)
- Everything else as shipped

---

## What changes from today:
- Steps 2 and 3 of current onboarding merge (no separate "seed categories" step)
- Spinner/"You're all set" screen becomes active sync progress screen
- NEW summary screen between sync and dashboard (the aha moment)
- Auto-learn feedback toast during first triage
- Pace indicator on hero card
- Trust copy on bank connection screen

## What doesn't change:
- Google OAuth
- Plaid Link mechanics
- Default categories (12, with PFC mappings)
- Triage flow mechanics
- Dashboard structure / hero card

---

## Implementation scope

### Small (do first):
- Trust line on connect bank screen (copy change)
- Pace indicator on hero card (computed property + badge)
- Auto-learn toast in triage (one-liner in handler)

### Medium:
- Active sync progress screen (replace OnboardingView step 2-3)
- "Here's what we found" summary screen (new component or view)

### Larger:
- "Add another account" loop in onboarding
- Sync progress with real-time step updates (needs backend → frontend progress events)

---

## Mockup
`docs/mockups/onboarding-flow.html` — 5 screens showing the complete flow

## Research
`plans/onboarding-research.md` — competitive analysis and best practices
