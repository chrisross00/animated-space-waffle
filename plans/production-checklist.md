# Production Readiness Checklist (SUPERSEDED)
**Status:** Superseded by `plans/production-go-live.md`. App is live in production.

## Blockers (can't ship without)

- [ ] **Strip sensitive console.logs** — `firebase.js` leaks auth objects and Plaid
  public tokens (lines 166, 184-186, 209, 213, 227). Quick cleanup pass, remove or
  replace with non-sensitive debug messages.

- [ ] **Privacy policy** — Required by Plaid for production API access, required by law
  for handling financial data. Needs a `/privacy` route with a real policy page. Doesn't
  need to be lawyer-written for initial launch but must exist.

- [ ] **Account deletion** — Admin-only `nukeAllData` exists but nothing user-facing.
  At minimum: "Delete my account" button in ProfileView that calls existing nuke logic
  scoped to the authenticated user, then signs them out. Confirm dialog required.

- [ ] **Vue error boundary** — No `app.config.errorHandler` or `errorCaptured` hook.
  A single component crash = white screen with no recovery. Add a root-level error
  handler with a "Something went wrong — reload" fallback UI.

- [ ] **Error logging service** — Console-only today. Production errors are invisible
  unless a user reports them. Set up Sentry free tier or equivalent. Especially important
  with Plaid in the mix where failures can be silent and intermittent.

- [ ] **MongoDB → Postgres migration** — Data model is relational but stored in a
  document DB. Missing referential integrity, manual `userId` filtering on every query.
  Full plan with schema, migration strategy, and auth consolidation (Firebase → Supabase)
  in `plans/database-migration.md`.

## Should do before launch

- [ ] **Body parser limit** — One line fix in api.js and plaid-api.js:
  `bodyParser.json({ limit: '1mb' })`. Prevents unbounded request bodies.

- [ ] **CSV export** — Not built. Low effort, high trust signal for users ("I can get
  my data out"). Already in CLAUDE.md backlog.

- [ ] **Onboarding v2** — Budget setup wizard after account connection. Users currently
  land on a dashboard with 12 categories at $0 budgets and no guidance. Full plan in
  `plans/onboarding-v2.md`.

## Nice to have at launch

- [ ] **"Last synced" indicator** — `lastSyncedAt` is tracked in store state but never
  rendered in the UI. Showing "Last synced 2 hours ago" near the sync button or in the
  header builds trust that data is fresh.

- [ ] **Post-sync notification** — Toast showing "12 new transactions" after sync
  completes. Right now the spinner stops silently and data updates in place with no
  acknowledgment.

## Already done

- [x] **Plaid reconnect flow** — Item error detection, update link token creation,
  reconnect banner in AccountsView with per-institution reconnect button.
- [x] **Sync failure visibility** — Error toast on sync failure, orange warning badge
  on sync button when Plaid items have errors.
- [x] **Rate limiting** — Global 200 req/15min, stricter 10 req/5min on Plaid sync.
- [x] **CORS + CSP** — Helmet CSP enabled, CORS with origin whitelist.
- [x] **Auth security** — Bearer token auth (not cookies), so CSRF is not applicable.
  Firebase admin verifies tokens server-side.
- [x] **Input validation** — String length limits, ObjectID validation, regex escaping
  in search, MongoDB injection prevention, array limits on bulk operations.
