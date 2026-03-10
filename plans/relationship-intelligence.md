# Relationship Intelligence — Learning from Confirm/Dismiss Signals

## Context

The transaction relationship detection system (splits, returns) captures user feedback:
confirmations (`linkedTransaction`) and dismissals (`dismissedRelationship`). Today this
data drives UI state only — showing/hiding suggestions. There's an opportunity to use
these signals to improve detection accuracy over time and eventually discover new
relationship patterns.

## Current signal capture

### What's captured
- Confirm/dismiss decision per suggestion
- Relationship type (split/return)
- Confidence level (high/medium) at detection time
- Hard filter criteria that matched (ratio, date proximity, merchant, amount)

### What's NOT captured (gap to close first)
- The full detection signals that produced the suggestion (the `signals` field on
  `linkedTransaction` exists but isn't actively populated)
- Dismiss reason (wrong match? not a split? don't care?)
- Which bonus signals fired (Venmo enrichment, PFC tier)
- The feature vector: ratio closeness, day gap, amount, PFC category, etc.

**Priority zero:** Populate the `signals` field on every confirm AND dismiss with the
full detection context. Can't learn from data you didn't collect.

---

## Tier 1: Heuristic tuning (no ML needed)

The highest-value, lowest-effort application. Use confirm/dismiss rates to tune the
existing hard filters.

### Global threshold tuning

Run periodic aggregations on confirm/dismiss data to answer:

| Question | Action if answer is clear |
|----------|--------------------------|
| What's the confirm rate for medium vs high confidence? | If medium confirms < 40%, stop showing medium or tighten filters |
| Does date gap correlate with dismiss rate? | If 5-7 day gap dismisses at 70%+, tighten to 3-day window |
| Which PFC categories have highest confirm rate for splits? | Weight high-confirm categories more in confidence scoring |
| Do exact-amount returns confirm more than partial? | If partial refunds dismiss often, tighten the $0.50 tolerance |
| What split ratios confirm most? | If 1/4 splits rarely confirm, consider dropping them |

Implementation: a Mongo aggregation script or admin tool query. No model, no
infrastructure — just data-informed threshold changes applied manually.

### Per-user adaptation

Track per-user confirm/dismiss rates. Adapt behavior:

| User pattern | Adaptation |
|-------------|------------|
| Dismisses 5+ split suggestions in a row | Stop showing splits (or raise to high-only) |
| Confirms most splits | Show medium-confidence matches too |
| Confirms returns but dismisses splits | Show returns only |
| Confirms splits from specific P2P provider | Boost confidence for that provider |

Storage: lightweight counters on user document or derived at query time.

```js
// Example user-level stats (computed, not stored)
{
  splitConfirmRate: 0.8,      // 8 of 10 confirmed
  returnConfirmRate: 0.95,    // 19 of 20 confirmed
  lastDismissStreak: 0,       // no consecutive dismissals
  totalDecisions: 30
}
```

### Merchant/counterparty learning

If "Venmo from Jake" has been confirmed as a split 4 times, the 5th time Jake sends
money it should be high confidence even without a perfect amount ratio match. Learning
relationships between *people*, not just transaction patterns.

Requires Venmo enrichment (`venmo_counterparty` field) to identify the person. Without
enrichment, P2P transactions are anonymous and this doesn't apply.

---

## Tier 2: Lightweight statistical model (ML-adjacent)

### When to consider this

When you have 200+ confirm/dismiss decisions across users. For a single active user,
this might take 6-12 months. With multiple users, faster.

### Approach: logistic regression on confirmation probability

**Features:**

| Feature | Type | Source |
|---------|------|--------|
| Amount ratio closeness to 1/N | float | Detection engine |
| Days between transactions | int | Detection engine |
| Same merchant (return) / P2P provider (split) | bool | Detection engine |
| Venmo enrichment available | bool | Transaction data |
| Venmo note matches merchant | bool | Enrichment cross-ref |
| PFC category tier | categorical | Transaction data |
| User's historical confirm rate | float | Aggregated feedback |
| User's confirm rate for this counterparty | float | Aggregated feedback |
| Purchase amount (absolute) | float | Transaction |

**Output:** Probability of confirmation (0-1). Replaces binary high/medium with a
continuous score. Set a display threshold (e.g., show if > 0.6).

**Implementation:** Train in a Jupyter notebook with scikit-learn. Export the ~10
coefficients and hardcode them in `relationshipDetector.js`. No model serving, no
infrastructure. Retrain quarterly by pulling data.

**Why not a neural net / deep learning?** ~10 features, hundreds of data points,
binary classification. Logistic regression is the right tool. Anything more complex
would overfit immediately.

---

## Tier 3: Pattern discovery (future, needs data volume)

### New relationship types

Beyond splits and returns, patterns that could emerge from clustering transaction pairs:

| Pattern | Signal |
|---------|--------|
| **Recurring splits** | Same counterparty + same merchant + regular interval (Friday dinners with Jake) |
| **Reimbursements** | Expense → employer deposit, different amounts and merchants, 2-4 week lag |
| **Subscription refunds** | Annual charge → partial credit for unused months |
| **Installment payments** | One large purchase → N equal charges over subsequent months |
| **Delayed paybacks** | Split pattern but 2-4 week gap (friend pays back late) |

Discovery approach: unsupervised clustering on transaction pair features, then manual
labeling of interesting clusters. Not automatable until data volume is significant.

### Counterparty graph (requires Venmo enrichment)

With enriched P2P data, build a social spending graph:
- Who does the user split with most?
- What categories do they split on?
- What's the typical ratio per counterparty?
- How quickly does each person pay back?

Feeds into "Venmo Wrapped" / P2P intelligence ideas (see CLAUDE.md). Graph analysis,
not ML per se.

---

## Implementation roadmap

### Now (next PR after relationships ship)
- **Populate `signals` field** on every confirm and dismiss with full detection context:
  ratio, day gap, PFC category, bonus signals fired, confidence score
- This is a small code change to `relationshipDetector.js` and the confirm/dismiss
  handlers. Critical for everything downstream.

### Short term (V1 intelligence)
- **Admin aggregation query** — confirm/dismiss rates by confidence tier, relationship
  type, date gap bucket, PFC category. Could be a script or admin portal tool.
- **Manual threshold tuning** — adjust hard filters based on real data. Document changes
  and the data that motivated them.
- **Per-user confirm rate** — track on user document. Use to suppress suggestions for
  users who consistently dismiss.

### Medium term (V2 intelligence)
- **Counterparty learning** — boost confidence for known split partners (requires Venmo
  enrichment).
- **Logistic regression model** — if data volume warrants (200+ decisions). Export
  coefficients, no serving infrastructure.
- **Recurring split detection** — same counterparty + same merchant + regular interval.

### Long term (V3 intelligence)
- **Counterparty graph** — social spending analysis from enriched P2P data.
- **New relationship type discovery** — unsupervised clustering on transaction pairs.
- **Cross-user learning** — if user base grows, aggregate patterns across users to
  improve suggestions for new users (cold start problem).

---

## Key principles

- **Heuristic tuning will outperform ML for a long time** with a small user base. Don't
  build infrastructure until the data demands it.
- **Capture signals now, learn later.** The most important thing is recording the full
  feature vector on every decision. Can't train on data you didn't collect.
- **Per-user adaptation > global model** for a personal finance app. Individual behavior
  varies too much for a one-size-fits-all model to help early on.
- **No black boxes.** Any model output should be explainable — "We suggested this because
  Jake has paid you back for dining 4 times before" not "our algorithm thinks..."
- **Observational, not prescriptive.** Show the user what the system learned ("You and
  Jake split dinners often"), don't tell them what to do with that information.
