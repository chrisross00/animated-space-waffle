# Basil Agent Memory

Active working memory for the Basil budgeting app (`animated-space-waffle`). Read at
every session start. Shipped/resolved work lives in `HISTORY.md`.

> **Migrated 2026-05-23** from the project auto-memory system
> (`~/.claude/projects/-Users-chris-Projects-animated-space-waffle/memory/`). That
> directory is preserved untouched as a backup. Status notes below are point-in-time —
> verify against current code / `git log` before asserting as fact.

---

## Working Agreements (how to work with this user)

### Who the user is
- **Not an engineer by trade.** Builds, ships, and makes architecture calls in
  production, but doesn't have a formal engineering background. Understands concepts
  when explained — doesn't need dumbed-down answers, but does need: jargon defined the
  first time it appears; plain-language summaries with outcomes/tradeoffs before
  implementation detail; focus on the *goal* they describe, not their exact words
  (don't anchor on a term like "hash"); analogies over acronyms. Not condescending.

### Process discipline
- **Architecture-first (MANDATORY).** Search before building. Grep/glob for existing
  implementations; state what you found; extend existing abstractions over parallel
  ones; extract reusable logic to shared utilities; follow established patterns; show
  your reasoning.
- **Verify before concluding.** Don't pattern-match to a root cause. Present findings
  as observations until verified with data. If disproven, say "I was wrong" and keep
  investigating — don't immediately swap in a new theory. (User once: "I just don't
  trust you right now because you keep coming to a conclusion and then I give you one
  more fact and you suddenly have a new conclusion.")
- **Debug from the trigger event.** User action → handler → trace data/render path →
  find divergence → only then fix. No speculative fixes.
- **Two-try rule.** If a fix fails twice, STOP and rethink — you're probably treating
  a symptom / hacking.
- **Stop guessing at CSS.** Understand the exact DOM nesting and root cause before
  writing a fix. Revert cleanly and re-investigate rather than layering guesses.
- **Stop guessing at iOS.** iOS Safari/PWA touch & scroll differ fundamentally from
  desktop. Read the actual library source, build a minimal test, verify on a real
  device, then integrate. Never push blind iOS fixes. Port complete systems, not pieces.
- **Consistency over hacks.** When a UI element misbehaves, check where the same
  interaction works correctly and reuse that Basil component. Fix broken components
  once in the component, never at call sites. No tabindex/blur/inert/setTimeout
  workarounds.
- **Incremental diagnosis over monolithic rewrites** (Vaul retro): read real source not
  summaries; prove the root cause before fixing; fix structure not workarounds; commit
  in small phases with clean rollback points; code review before shipping.
- **Never overwrite memory files.** Read first, Edit specific sections, append don't
  replace. (A detailed plan was once lost permanently this way.)
- **E2E tests are expensive — only on request.** `npm run test:e2e` in `frontend/`
  (Playwright). Never run proactively or as a verification step.

### Dev environment & deployment
- **Never use the production account in dev.** Use `test-user-active` (or other test
  IDs). For local admin, add the test ID to `ADMIN_UIDS` — don't switch to the real
  account. Local `DATABASE_URL`: `postgresql://chris@localhost/basil`.
- **Never scp/rsync to prod.** Manual copies leave the working dir dirty and silently
  block the CI/CD `git pull`. Always deploy via `git push origin main`.
- **Always run new migrations against local DB immediately** after creating them:
  `psql "postgresql://chris@localhost/basil" -f db/migrations/XXX.sql`. A committed-but-
  unapplied migration that references a missing column breaks *all* queries using that
  constant (cascading 500s).
- **Check deployment artifacts when adding/moving directories.** Dockerfile COPY (build
  + runtime stages), `.dockerignore`, CI workflow. `shared/` once broke the Docker build
  because it wasn't in the COPY list.

---

## Document Map

- `CLAUDE.md` — operational rules, key-file table, large-file navigation maps, full
  backlog. Auto-loads. **The backlog lives here — don't duplicate it into memory.**
- `.claude/rules/` — 5 path-scoped rule files, auto-load by file touched.
- `DESIGN.md` — design system; read before UI work. `BRAND.md` — brand voice.
- `plans/`, `docs/superpowers/{specs,plans}/` — specs and implementation plans.
- `HISTORY.md` — shipped/resolved threads (this directory).

### Reference & fragile areas (handle with care)
- **PFC detail mapping** (2026-03-21): `utils/categoryMapping.js` uses Plaid *detail*-
  level PFC codes via `utils/pfcDetailMapping.js` (~96 codes → Basil categories), not
  primary codes. `TRANSFER_IN` → Payments & Transfers (not Income). P2P
  (Venmo/Zelle/Cash App/PayPal/Apple Cash) always → To Sort via `isP2PTransaction()`,
  regardless of PFC. Primary `plaid_pfc` column is legacy/unused. When debugging
  miscategorization, check `plaid_pfc_detail`.
- **Plaid transaction ID reconciliation**: Mongo→Postgres migration left stale Plaid
  IDs. `insertTransactions` (`db/database.js`) reconciles by matching
  (name, amount, date, account) and adopting Plaid's current IDs to avoid sync
  duplicates; returns a `reconciled` count. Tags preserved via delete/re-insert.
  ⚠️ **Name-exact match does NOT dedupe across providers** — Plaid vs Teller spell the
  same transaction differently and record different dates, so the Teller cutover overlap
  had to be deduped separately by amount+account+nearest-date (5/24 decisions log).
- **Mobile transaction table** (`BudgetView.vue` "Show all"): flex `div` rows + virtual
  scroll, NOT `<table>`. `.basil-txn-row__name` uses `flex:1; min-width:0` (the key
  truncation fix); `.basil-txn-row__amount` is `flex-shrink:0; width:100px`.
  `display:inline-flex` on `__primary` is load-bearing for inline badges. Test on a
  real device when changing layout CSS.
- **CSS gotchas (learned the hard way):**
  - `text-overflow: ellipsis` only works on **block containers**, not flex/grid. For
    flex layout + truncation, wrap the text in a block `<span>` (`display:block;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap`); give the flex parent
    `max-width:100%`. Putting ellipsis directly on a flex element is silently ignored.
  - `border-radius` is a **shorthand** — a later rule replaces all four corners, it does
    not merge. When an element matches multiple radius rules (e.g. `:first-child` AND
    before an expanded sibling), use one compound selector setting the combined rounding.

### Production infrastructure (live)
- Hetzner VPS (Ubuntu 24.04, `178.156.248.108`), domain `basilbudgeting.com`.
- Postgres 16 in Docker (localhost:5432); Node 24 + PM2; Nginx reverse proxy + Let's
  Encrypt. CI/CD: GitHub Actions, push to main → test → SSH deploy. App at `/opt/basil/app`.
- Architecture decisions: no Supabase; Google OAuth2 + self-issued JWTs (7-day);
  manual userId filtering (RLS deferred); direct cutover (no dual-write). Full detail:
  `plans/production-go-live.md` and `HISTORY.md`.
- Dev auth bypass: "Login as test user" button + backend `Bearer dev-bypass` when
  `DEV_AUTH_BYPASS_UID` set; both gated by env vars, absent from prod builds.

---

## Open Threads → Active

- **[SHIPPED to prod 5/23–24] Plaid → Teller migration.** Off Plaid → Teller.io (free
  `development` tier). Built (subagent-driven, TDD), smoke-tested (sandbox + real bank),
  cutover complete: real Chase + Citizens linked via Teller Connect, ~2yr history,
  auto-sync forward. Spec/plan: `docs/superpowers/specs/2026-04-22-plaid-teller-migration-design.md`,
  `docs/superpowers/plans/2026-05-23-plaid-teller-migration.md`. Bugs caught+fixed in
  flight: mTLS (axios not fetch — Node fetch ignores `agent`), credit-card amount sign
  (account-type-aware: negate depository, keep credit), Dockerfile missing `bank-api.js`,
  prod's unique constraint had a custom name the migration's DROP missed, CSP needed
  `teller.io`. Cutover overlap dupes cleaned 5/24 (decisions log). Teller env = free
  `development` (≤100 connections); move to `production` (paid, needs KYB) only if >100
  total connections or going properly live. **Remaining open:**
  - **Phase 3 cleanup (not started):** rename `plaid_items`→`bank_connections`,
    `plaid_accounts`→`bank_accounts`; drop `next_cursor`/`prev_cursor`; delete Plaid code
    (`plaid-api.js`, `utils/plaidTools.js`, `utils/plaidClient.js`, `PlaidLinkHandler.vue`);
    remove `plaid` dep. See plan Task 12.
  - **⚠️ CLAUDE.md doc drift:** still says the app uses Plaid; key-files table lacks
    `bank-api.js` / `utils/tellerTools.js` / `utils/tellerClient.js` /
    `utils/tellerCategoryMapping.js`. Update during Phase 3.
  - **Other real users stranded on frozen Plaid:** prod users `11113264179369…` (463 txns)
    & `M7LLwqBRhgSx3m…` (76 txns) have Plaid data, no Teller — if real people, their
    accounts can't sync (Plaid frozen). Decide re-onboarding / messaging.
  - **Optional housekeeping:** purge `test-user-*` seed data from prod (invisible to the
    real user, just DB clutter). Two minor follow-ups: bank-api 401-vs-500 on auth fail;
    `sync_log.added_count` = total pulled not newly-inserted.
- **[SHIPPED to prod 5/24] Teller auto-categorization.** Replaced dead Plaid PFC layer
  with a general `TELLER_CATEGORY_TO_BASIL` map (`utils/tellerCategoryMapping.js`) + new
  `category_source` column (migration 011: `rule`/`teller_category`/`manual`/null). No
  history mining (don't overfit one user). Guessed categories show a quiet "auto-sorted"
  note in the edit modal only — NO row badge / review filter (removed per UX call; backend
  field retained). general/missing/P2P → To Sort. **No backfill** — only newly-synced
  transactions get auto-sorted; existing cutover "To Sort" stay. Spec/plan in
  `docs/superpowers/`.
- **[On ice 4/9] Recurring patterns detection engine.** Branch
  `feature/recurring-patterns` (~28 commits ahead). Backend complete & tested
  (`recurring_patterns` table, `utils/recurringDetection.js`, API, sync hook). Frontend
  built (`SubscriptionsView.vue`, budget committed-spend bars, `BasilProgress`
  `committedValue`). Paused to focus on prod bugs; income nudge removed (redundant with
  triage). Remaining UAT: committed-spend bar visuals, sync-triggered detection, mobile
  layout. Plan: `plans/recurring-patterns-engine.md`. Test user:
  `test-user-subscriptions`.
- **[Brainstorm 3/21] PFC-aware smart suggestions.** Use PFC detail to improve
  suggestion confidence and "Also categorize N similar" counts — NOT silent
  auto-overrides; user always sees/accepts. Rejected: user-facing PFC overrides
  (overfitting) and silent auto-learning (app fights the user). Needs a spec for how
  `findSimilarTransactions` + triage incorporate PFC detail. Not built.
- **DialogComponent prop reactivity (tech debt).** `DialogComponent.vue` inits
  `dialogBody` from `this.item` in `data()` only — no watcher on `item`, so a reused
  instance shows stale data. Current workaround: `:key="...transaction_id"` forces
  recreate. Proper fix: watch `item`, reinit `dialogBody`/`originalDialogBody`/
  `initialData` + reset form state. Touches every edit/category/rule/split flow — test
  thoroughly.
- **BasilTray `shouldDrag` gesture handoff.** The one remaining BasilTray piece (high
  in CLAUDE.md backlog). Vaul's `shouldDrag` decision tree + `isAllowedToDrag` latch for
  continuous tray-drag ↔ content-scroll handoff (Apple Maps behavior). Spec:
  `plans/basil-tray-vaul.md` "shouldDrag decision tree".
- **Scroll-into-view smoothness (tech debt).** `smoothScrollBy` in `basilKeyboard.js`
  uses RAF-based JS scrolling (low FPS on ProMotion). Replace with
  `scrollParent.scrollTo({ top, behavior: 'smooth' })`.
- **Blur-swallows-tap (open, minor).** Pre-existing mobile issue: tapping submit while a
  dropdown has focus needs two taps. Not caused by keyboard work. Investigate when
  tackling form interactions.
- **[Native app — backend LIVE on prod 5/25; mobile UNMERGED on `native-app-phase-0`]**
  Native Basil app (Expo / React Native) is on TestFlight (ASC App ID 6773154406, build
  v1.0.0(2)). Its sign-in backend (`/auth/native/google` + `/auth/native/apple`) is now
  deployed to prod (see Decisions Log 5/25). The full thread — 8 parity tracks, post-parity
  fixes, EAS/TestFlight setup, the `mobile/src/shared` build fix — lives in
  `native-app-phase-0`'s MEMORY.md (that branch is UNMERGED; do not merge to main without
  approval). Sign-in VERIFIED on the signed build 5/25 (Google + Apple both work, same
  account). NEXT: real prod use / device feedback; biggest gap before a PUBLIC release is the
  onboarding flow (still DEFERRED — new-user blocker), then listing rename / screenshots /
  privacy questionnaire.

### Status to reconcile on next real session (memory conflicts)
- **Basil library UAT.** The auto-memory index (4/22) says UAT in progress with "many
  fixes uncommitted" (Accounts/Plan/Profile/mobile/dark mode untested); the older UAT
  note (3/28) and recent `main` commits say the library shipped to production. Verify
  current state against `git log` / branches before acting. Full shipped detail in
  `HISTORY.md`.
- **BasilDatePicker.** `custom_date_picker` note says "needs building" (cosmetic, low
  priority); the 3/28 UAT note lists BasilDatePicker as completed. Verify whether it
  exists before treating either as true. Also see `docs/superpowers/specs/2026-03-26-basil-date-picker-design.md`.

---

## Decisions Log

- **2026-05-25: Native app sign-in backend DEPLOYED to prod (main `e3f17cb`).** The
  TestFlight build was 404ing on both sign-in buttons because the native auth routes lived
  only on the unmerged `native-app-phase-0`. Cherry-picked the backend-only surface to main:
  `POST /auth/native/google` + `/auth/native/apple` (auth-routes.js), `utils/googleUser.js`,
  `utils/appleUser.js`, db helpers `findUserByAppleSub`/`setAppleSub` (+ `findUser` now
  returns `appleSub`), migration `012-apple-sub.sql`, deps `apple-signin-auth` +
  `google-auth-library`. Made it ship with **zero manual prod steps**: (a) hardcoded the
  *public* iOS Google client id as a default audience in auth-routes.js so prod needed no
  new env var (the native Google token's `aud` is the iOS client, not the web client);
  (b) `ensureNativeAuthSchema()` runs at boot in index.js to idempotently add `users.apple_sub`
  — because the deploy pipeline (deploy.yml: SSH → git pull → `docker compose up --build`)
  has **no migration runner**. 187 backend tests green; CI deploy succeeded; routes verified
  live (400/401, not 404/500). Account merge: Apple matches an existing account by EMAIL on
  first sign-in, then stamps `apple_sub` for return sign-ins → Google + Apple with the same
  email = one account, BUT only if the user picks "Share My Email" (Hide My Email → relay
  addr → not whitelisted → waitlisted). **VERIFIED 5/25 on the signed TestFlight build:**
  both Google and Apple sign-in succeed and resolve to the SAME account (merge confirmed) —
  which also confirms the boot-time `ensureNativeAuthSchema` created `apple_sub` on prod. FOLLOW-UPS: (1) the 3 deploy tweaks live on main
  only — when `native-app-phase-0` later merges, expect minor conflicts in auth-routes.js /
  db/database.js / index.js. (2) Prod has no real migration runner — boot-ensure is a
  stopgap; a proper one (with a `schema_migrations` table, baselining 001–011) is the right
  fix. (3) Optional: delete merged local branch `deploy/native-auth-backend`.
- **2026-05-24: Shipped 4 post-migration UI fixes (prod, branch `fix/post-migration-ui`).**
  (1) Triage "Done" button set a nonexistent `showBulkTagDialog` → now `triageOpen=false`.
  (2) Spending breakdown detailed view showed only "Other" (grouped by Plaid PFC detail,
  null on Teller) → now groups by `merchant_name` (works both eras; SpendingBreakdown.vue
  + TransactionDrillDown.vue, drill query param `pfc`→`merchant`). (3) Cumulative Trends
  chart plummeted when saving (subtracted savings from net) → added savings-neutral
  `monthlyCashFlow` (income−expenses; payment-type already excluded by `freeCashFlow`) for
  the cumulative only + guarded degenerate `visualMap` (min===max → invisible line). Cash
  Flow chart's free-cash-flow definition left as-is. (4) Show All multi-select: row tap now
  toggles the checkbox on desktop too (was `isMobile`-gated). #1/#3/#4 pre-existing; #2 Teller regression.
- **2026-05-24: Cleaned up Plaid↔Teller cutover duplicate transactions (prod).** The
  Teller pull (~2yr) overlapped real Plaid history (Dec 2025→May); the cutover
  reconciliation matches on transaction *name*, but Plaid & Teller spell names
  differently AND record different dates (Plaid clustered some on one day) → ~428
  cross-provider dupes Dec–April. Fixed with a one-off greedy dedup (match by
  amount+account+nearest-date ≤7d, count-balanced; keep the live Teller copy, migrate
  the Plaid copy's category, delete Plaid). Backed up first; ran in a transaction inside
  the `web` container. One-time artifact (Plaid frozen → no new dupes). Categorization
  preserved + improved (59%→78%).

- **2026-05-23: Teller migration SHIPPED to prod.** Cutover done: migration 010 applied
  to prod (caught a custom-named unique constraint the DROP missed — fixed), Teller cert
  mounted into the Docker `web` container (added compose volume), TELLER_* env + frontend
  VITE_TELLER_* (in `frontend/.env.production` on VPS), CSP updated for `cdn/connect/api
  teller.io`. Real Chase linked (3 cards, ~2yr history, signs correct). Citizens not yet
  linked. Branch `teller-migration` merged to main. Legacy Plaid sandbox/test data still
  polluting prod (cleanup pending). Plaid Phase 3 cleanup (rename tables, drop cursors,
  remove Plaid code) still pending.
- **2026-05-23: Teller auto-categorization built (branch `teller-autocategorization`,
  NOT merged).** Replaces dead PFC layer with a general `TELLER_CATEGORY_TO_BASIL` map
  (`utils/tellerCategoryMapping.js`); auto-applies as a flagged "guess" via new
  `category_source` column (migration 011); user rules still win + stamp 'rule';
  general/missing/P2P → To Sort. No history mining (don't overfit to one user). 173 tests
  pass. **UX revised (commit `8c084c1`):** removed always-on "Guess" badge and "Review
  guesses" filter (too noisy — 384 txns badged); replaced with quiet muted hint inside
  the edit-transaction dialog (DialogComponent) shown only when `categorySource ===
  'teller_category'`, reads directly from the `item` prop (no threading needed).
  Backend `category_source` untouched. **Remaining: plan Task 9 — local smoke test,
  then prod rollout (run migration 011 on prod BEFORE deploy).**
- **2026-05-23: Teller migration validated end-to-end (sandbox + real bank).** Real-bank
  pass confirmed the amount sign on real credit-card data. Hidden frozen (active=false)
  connections from the Accounts UI (`createClientSideUser` → active+manual only; snapshots
  still aggregate all) — closes spec §7 archived-display question. Branch `teller-migration`,
  not merged; cutover (Task 11) + Phase 3 cleanup remain.
- **2026-05-23: Teller amount sign is account-type-aware.** Teller signs by effect on
  the account's own balance (depository purchase negative, credit-card purchase
  positive). `tellerToInternal` negates depository, keeps credit → positive=spend
  (matches app/Plaid convention). Caught in sandbox smoke test (credit charges were
  inverted to income). Sandbox data is random so merchant semantics don't validate
  signs — confirmed via raw-Teller-vs-DB comparison instead.
- **2026-05-23: Teller migration Tasks 1–9 built** (branch `teller-migration`, subagent-driven).
  Migration 010 (additive), tellerClient (axios mTLS), tellerTools (transforms + sync),
  bank-api routes, frontend BankLinkHandler, env/Docker. Caught + fixed during build:
  fetch-ignores-`agent` mTLS bug, Dockerfile missing bank-api.js, reconnect enrollmentId
  gap, unlink-deletes-Plaid-history. Awaiting Task 10 smoke test. Branch not merged.
- **2026-05-23: Teller migration spec finalized + implementation plan written.** Verified
  bank coverage via Teller's institution API (Chase + Citizens ✅; Citizens Access folds
  into citizens login). Amended spec Section 4 (reuse `insertTransactions` reconciliation
  + pending-sweep, since Teller lacks `pending_transaction_id`). Decided: free `development`
  env, flip amount sign, defer table rename/cursor-drops to Phase 3, add `enrollment_id`.
  Plan: `docs/superpowers/plans/2026-05-23-plaid-teller-migration.md`. Commits `5459f53`,
  `dfc0977`.
- **2026-05-23: Migrated to agent memory; disabled auto-memory.** Stood up the `basil`
  agent with manual memory in `.claude/agent-memory/basil/`; set
  `autoMemoryEnabled: false` in `.claude/settings.json`. Old auto-memory dir kept as
  backup. Spec: `docs/superpowers/specs/2026-05-23-basil-agent-and-memory-migration-design.md`.
- **2026-04-22: Migrate Plaid → Teller (cost).** See active thread above.
- **2026-04-05: Shared utility extraction shipped + convention enforcement.** Extracted
  `shared/categoryTypes.js`, `shared/p2pDetection.js`, `formatDollar.js`,
  `transactionDate.js`, `budgetMath.js`. Added `.claude/rules/` (5 path-scoped files),
  trimmed CLAUDE.md, added compact + stop hooks. `shared/` needs Dockerfile COPY in
  build + runtime stages. (Detail in `HISTORY.md`.)
- **2026-03-29: Monospace removed; transaction drill-down shipped.** (Detail in `HISTORY.md`.)
- **2026-03-28: BasilTray Vaul rewrite shipped; Quasar fully removed.** (Detail in `HISTORY.md`.)
- **2026-03-24: Custom keyboard merged to main.** 123-button dismiss fix later shipped
  (commit `94024c5`). (Detail in `HISTORY.md`.)
- **2026-03-21: Categorization engine switched to PFC detail codes; P2P → To Sort.**
  See Reference above.
