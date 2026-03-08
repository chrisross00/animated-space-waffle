# Admin Rework Plan

## Status: COMPLETE

## Problem
- `ADMIN_UIDS` env var requires server restarts to change admin identity
- Plaid credentials require commenting/uncommenting in .env to switch sandbox/production
- No way to run admin tools against other test users without logging out/in
- ApiDir has no user picker — tools always run against authenticated user

## Implementation Phases

### Phase 1: Dual Plaid Credentials ✅ DONE
- Create shared `utils/plaidClient.js` factory
- Reads `PLAID_ENV` and picks `PLAID_{SANDBOX|PRODUCTION}_CLIENT_ID` + `SECRET`
- Falls back to `PLAID_CLIENT_ID`/`PLAID_SECRET` for backward compat
- Both `plaid-api.js` and `plaidTools.js` import from shared module
- **Files:** `utils/plaidClient.js` (new), `utils/plaidTools.js`, `plaid-api.js`

### Phase 2: `isAdmin` in MongoDB ✅ DONE
- Add `isAdmin: true` field on user doc in `Basil-Users`
- Refactor `requireAdmin` in `api.js` to async DB lookup
- All 6 call sites become `await requireAdmin(uid, res)`
- Expose `isAdmin` in `createClientSideUser` return object
- Add `findAllUsers` helper to `db/database.js`
- Drop `ADMIN_UIDS` const from `api.js`
- Seed with: `db.getCollection('Basil-Users').updateOne({ userId: '<uid>' }, { $set: { isAdmin: true } })`
- **Files:** `api.js`, `db/database.js`

### Phase 3: `targetUserId` on Admin Routes ✅ DONE
- New `resolveTargetUser(req, res)` helper in `api.js`
  - Extracts `targetUserId` from `req.body` (POST) or `req.query` (GET)
  - Defaults to authenticated user's own UID
  - Calls `requireAdmin` only when targeting another user
  - Returns null if unauthorized (response already sent)
- Update ALL admin-gated routes to use `resolveTargetUser`
- Also update non-admin tools shown in ApiDir (dedupe, cleanPending, etc.)
  so the user picker works across all tools
- **Files:** `api.js`

### Phase 4: User Picker in ApiDir ✅ DONE
- New `GET /api/users` route (admin only) — returns `[{ userId, email, name }]`
- New `fetchUsers()` helper in `firebase.js`
- All admin tool fetch helpers accept optional `targetUserId` parameter
  - POST routes: add to request body
  - GET routes: add as query param
- ApiDir changes:
  - On mount, if `user.isAdmin`, fetch users and populate `q-select` dropdown
  - Track `selectedUserId` in component data (null = self)
  - Pass `selectedUserId` to each tool's `fn` call
  - Gate view on `isAdmin` (redirect non-admins)
- **Files:** `api.js`, `frontend/src/firebase.js`, `frontend/src/views/ApiDir.vue`

### Phase 5: Cleanup ✅ DONE
- Remove `ADMIN_UIDS` from .env documentation
- Leave `DEV_AUTH_BYPASS_UID` as-is (different purpose — auth bypass for local dev)
- Update CLAUDE.md architecture notes
- **Files:** `CLAUDE.md`

## Key Decisions
- Non-admin tools (dedupe, seedCategories, cleanPending, mapUnmapped) also get
  `resolveTargetUser` so the admin user picker works for ALL tools in ApiDir
- Frontend route guard: component-level `isAdmin` check, redirect if not admin
- Dev auth bypass unchanged — orthogonal to admin identity
- `isAdmin` flows through existing `setUser` mutation, available as `store.state.user.isAdmin`

## Files Summary
| File | Changes |
|------|---------|
| `utils/plaidClient.js` | **New** — shared Plaid client factory |
| `utils/plaidTools.js` | Replace inline Plaid init with shared import |
| `plaid-api.js` | Replace inline Plaid init with shared import |
| `api.js` | Async `requireAdmin`, `resolveTargetUser`, `/api/users` route, update all routes |
| `db/database.js` | Add `findAllUsers` helper |
| `frontend/src/firebase.js` | Add `fetchUsers`, update admin tool helpers for `targetUserId` |
| `frontend/src/views/ApiDir.vue` | User picker dropdown, pass targetUserId, isAdmin gate |
| `CLAUDE.md` | Update admin/env docs |

## Branching
- Branch: `feat/admin-rework` off `main`
- Merge to `main` when done
- Rebase `feat/accounts-balances` on top
