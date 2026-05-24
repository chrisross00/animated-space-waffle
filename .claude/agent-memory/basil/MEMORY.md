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

- **[Tasks 1–9 built 5/23, awaiting smoke test] Plaid → Teller migration.** Migrating off Plaid (cost: ~$50
  for March) to Teller.io (free `development` tier, ≤100 connections). **Spec complete**
  (`docs/superpowers/specs/2026-04-22-plaid-teller-migration-design.md`) and **implementation
  plan written** (`docs/superpowers/plans/2026-05-23-plaid-teller-migration.md`).
  Locked: keep auto-sync; Teller not SimpleFIN; Vanguard → manual account; freeze &
  forward historical Plaid data; ignore Teller categorization; fingerprint early-exit.
  **Off-ramp cleared this session** (research): Chase ✅ + Citizens ✅ confirmed in
  Teller's institution API; Citizens Access folds into the `citizens` login (manual
  fallback if not) — confirm at first live link. Key plan decisions: use `development`
  env (free, no dual-client); **reuse `insertTransactions` reconciliation + pending-sweep**
  (Teller has no `pending_transaction_id`); **amount sign must be flipped** (Teller ledger
  sign is opposite Plaid's — highest-risk transform, TDD'd); **table rename + cursor-column
  drops deferred to Phase 3** (cutover migration 010 is additive-only for safe rollback);
  added `enrollment_id` column for reconnect. **Tasks 1–9 are built + committed on branch
  `teller-migration`** (14 commits, 157 backend tests pass, frontend builds). User's
  Teller dev cert/key placed at `~/.teller/`; `app_psllaoddj7dq02pb1m000`, env
  `development`, wired into root `.env` + `frontend/.env`. Build-time fixes (in plan
  "Build session notes"): axios (not fetch) for mTLS — Node fetch ignores `agent`;
  `deleteActiveBankConnection` so unlinking doesn't nuke frozen Plaid rows; backend
  `enrollmentIdByInstitution` for reconnect; `bank-api.js` added to Dockerfile COPY.
  **Task 10 sandbox smoke test PASSED** (5/23): linked Teller sandbox Chase (checking
  + savings + credit card) as test-user-active, mTLS works, 331 txns synced, fingerprint
  short-circuit + balance snapshot OK. **Found + fixed a real bug:** credit-card charges
  were inverted to income — Teller signs by account-balance effect (depository purchase
  negative, credit purchase positive), so `tellerToInternal` is now account-type-aware
  (negate depository, keep credit). `frontend/.env` left on `sandbox` — now on
  `development`. **Real-bank (`development`) pass also PASSED** (5/23):
  linked real Chase (3 credit cards), 560 real txns, mTLS to real bank works; amount
  sign validated on real data (Airbnb/Amazon = +spend, card "Payment Thank You" =
  inflow). Reconnect/disconnect flow verified. **Archived-account display fixed**
  (`createClientSideUser` shows active+manual connections only; snapshots still aggregate
  ALL → Trends history safe; closes spec §7 open question, commit `ffaaff4`). A real Chase
  connection + 560 txns now live in the LOCAL dev DB for test-user-active (frozen Plaid
  test connections remain but are hidden). **Next:** populate `INSTITUTION_NAME_OVERRIDES`
  from prod `SELECT DISTINCT account` (Task 10 Step 8); Task 11 cutover (verify constraint
  drop + cert mount on prod); Task 12 Phase 3 cleanup (rename tables, drop cursors, remove
  Plaid, update CLAUDE.md which still describes Plaid). Two minor follow-ups open (bank-api
  401-vs-500, sync_log added_count). **Branch `teller-migration` NOT merged.**
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
