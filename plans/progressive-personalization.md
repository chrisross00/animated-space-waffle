# Progressive Personalization

## Problem

We considered asking users about their financial literacy and goals during onboarding,
but upfront questionnaires have problems: they delay getting to the product, users are
bad at self-reporting financial behavior, and the most valuable personalization signal
is their actual transaction data — not their self-image.

## Approach

Instead of asking, observe. The app progressively adapts based on what users do and
what their data shows. No questionnaire, no personas, no "tell us about yourself" step.

---

## Personalization signals

### From transaction data (passive)

| Signal | What it tells us | Possible action |
|--------|-----------------|-----------------|
| Spending concentrated in 3-4 categories | Focused spender, simple budget | Highlight those categories, don't clutter with unused ones |
| High category diversity (8+ active) | Complex financial life | Show all categories, maybe suggest grouping |
| Regular savings transfers | Savings-oriented | Surface savings rate prominently, promote savings goals |
| Frequent small transactions (coffee, fast food) | Daily discretionary spending | "Daily spend" insights could resonate |
| Large recurring payments (rent, loans) | Fixed costs dominant | Show fixed vs variable breakdown, emphasize discretionary budget |
| P2P transactions (Venmo, Zelle) | Social spender | P2P insights, split detection when built |
| Income consistency (same amount monthly) | Salaried | Confident income projections |
| Income variability | Freelance/variable | "Your income varies" messaging, avoid over-committing budgets |
| Credit card payments without CC connected | Incomplete account picture | Nudge to connect credit card |
| Seasonal spending spikes (holidays, travel) | Predictable patterns | "Last December you spent $X on gifts" heads-up |

### From user behavior (active)

| Signal | What it tells us | Possible action |
|--------|-----------------|-----------------|
| Sets budgets on many categories | Budget-focused user | Lean into projections, alerts, progress bars |
| Never sets budgets | Tracker, not budgeter | De-emphasize budget features, surface spending insights and trends |
| Frequently recategorizes transactions | Cares about accuracy | Show rule suggestions more prominently |
| Uses triage flow regularly | Engaged categorizer | Keep triage prominent, maybe auto-open |
| Ignores triage / "To Sort" pile | Hands-off user | Don't nag about uncategorized transactions |
| Views Trends often | Analytics-oriented | Richer chart insights, more data points |
| Never visits Trends | Dashboard-only user | Don't push analytics |
| Creates compound rules | Power user | Surface rule management, show rule coverage stats |
| Connects 4+ accounts | Comprehensive tracker | Cross-account insights, net worth potential |

---

## Progressive timeline

The app adapts over time, not all at once.

### Week 1: Pure tracking
- No budget pressure. Dashboard shows spending by category, no progress bars (since
  limits are $0). This is fine — it's still useful.
- If they completed budget setup during onboarding, progress bars work from day one.
- If they skipped, gentle CTA: "Set up your budgets to track spending goals."

### Week 2-3: First insights
- Enough data to spot patterns. Surface 1-2 observational insights on the dashboard:
  - "You've spent $X on Food & Dining so far this month"
  - "Your biggest expense this month is [category]"
- If no budgets set: "Based on your spending, here's what a budget could look like"
  (link back to budget wizard with pre-filled suggestions).

### Month 2: Trend awareness
- Month-over-month comparisons become possible:
  - "You spent 20% more on dining than last month"
  - "Your transportation costs dropped by $50"
- These are observations, not judgments. No "you overspent" language.
- Recurring transaction detection is reliable now (2+ months of data).

### Month 3+: Mature personalization
- Seasonal awareness: "Last year around this time you spent $X on [category]"
  (requires 12+ months of data, so this is a long-term play)
- Budget accuracy feedback: "Your Food budget of $300 has been over 3 of the last
  4 months. Adjust to $350?" (only if they have budgets set)
- Savings rate trends: "Your savings rate has improved from 8% to 14% over 3 months"

---

## Implementation approach

### Where insights surface

**Dashboard cards** — the primary vehicle. Small, dismissible insight cards that appear
contextually at the top of BudgetView. Max 1-2 at a time. Each has:
- An observation ("You spent 20% more on dining this month")
- An optional action ("Adjust budget" / "View trend" / dismiss)
- A quiet dismiss (×) that teaches the system what the user cares about

**Trends view** — richer, opt-in insights. Annotations on charts, contextual callouts.
Users who visit Trends are already analytics-minded.

**NOT:** Push notifications, emails, or modal interruptions. This is a passive system
that enriches the UI, not an engagement loop.

### Insight generation

A lightweight client-side engine that runs on `store.state.transactionsByMonth` data:

```
insights = generateInsights(transactionsByMonth, categories, user)
```

Returns an array of insight objects:
```js
{
  type: 'spending_increase',        // insight type (for dedup + dismiss tracking)
  category: 'Food & Dining',
  message: 'You spent 20% more on dining than last month',
  action: { label: 'View trend', route: '/trends' },  // optional
  priority: 0.7,                    // 0-1, for ranking when multiple insights exist
  dismissKey: 'spending_increase:Food & Dining:2026-03'  // unique key for dismiss tracking
}
```

Priority ranking ensures only the most relevant 1-2 show. Dismissed insights don't
reappear (tracked in localStorage or user document).

### What NOT to build

- **No ML/AI.** Simple heuristics on transaction data. Averages, comparisons, thresholds.
- **No recommendation engine.** We're not suggesting products, credit cards, or services.
- **No social comparison.** Never "You spend more than average on X." Creepy and unhelpful.
- **No anxiety-inducing language.** Never "You overspent!" or "Warning!" — always
  observational. "You spent more than your budget" not "You failed your budget."
- **No notification infrastructure.** Dashboard-only for now. Alerts/notifications are
  a separate feature with their own delivery mechanism decisions.

---

## Scope

### V1: Dashboard insight cards
- 3-5 insight types (month-over-month change, biggest category, budget accuracy,
  missing budget CTA, recurring cost summary)
- Client-side generation from existing store data
- Dismissible with localStorage tracking
- Max 2 cards shown at a time

### V2: Behavioral adaptation
- Track which insights users engage with vs dismiss
- Adjust priority weights based on behavior
- Add Trends view annotations
- Budget adjustment suggestions ("Your food budget has been over 3 of 4 months")

### V3: Temporal awareness
- Seasonal patterns (requires 12+ months of data)
- "This time last year" comparisons
- Predictive insights ("Based on your pace, you'll spend $X on dining this month")

---

## Relationship to other features

- **Budget Setup Wizard** (onboarding-v2.md): The wizard gets users started; progressive
  personalization keeps the experience improving over time. The "set up your budgets"
  CTA is the first insight card.
- **Recurring transaction detection** (already built): Feeds into personalization signals
  (fixed cost awareness, missing recurring charges).
- **Notification/alerts** (future): If built, insights could graduate to notifications
  for high-priority items (approaching budget limit). But that's a separate decision.
- **Savings category type** (partially built): Savings-oriented insights only surface
  when the user has a savings-type category.
