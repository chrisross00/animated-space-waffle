# Production Tech Debt

Technical debt accrued during the MongoDB-to-Postgres migration and initial production
deployment.

---

## Open

### 7. Stale Mongo env vars in root `.env`
`DB_URI` and `DB_NAME` are still defined in the local root `.env`. No code references
them anymore (all database access goes through `DATABASE_URL` to Postgres).

**Fix:** Remove `DB_URI` and `DB_NAME` from root `.env`.

### 8. `FIREBASE_SERVICE_ACCOUNT_JSON` in root `.env`
No longer used. Firebase Admin SDK has been removed — auth is now self-issued JWTs
verified with `jsonwebtoken`.

**Fix:** Remove `FIREBASE_SERVICE_ACCOUNT_JSON` from root `.env`.

### 9. `VUE_APP_FIREBASE_*` vars in root `.env`
Legacy env vars from the old backend Firebase initialization. Not used by any code
(frontend uses `VITE_*` prefix, and Firebase has been fully removed).

**Fix:** Remove all `VUE_APP_FIREBASE_*` entries from root `.env`.

### 11. `mongodb` package residue
`npm install mongodb --no-save` was used locally to run the migration script. The
package may still exist in local `node_modules` but is not in `package.json` and is
not on the server. Harmless, but worth being aware of if `node_modules` is ever
copied or inspected.

**Fix:** `npm prune` locally to remove unlisted packages.

---

## Done

- **#1 Hardcoded Postgres password** — removed fallback from migration script; now
  requires `MIGRATE_PG_URL` or `POSTGRES_PASSWORD` to be set explicitly.
- **#2 Debug `console.log` in `createClientSideUser`** — removed.
- **#3 Generic error messages** — fixed `getcategories` error message (was
  `"Error with /test endpiont"`), added `console.error` for server-side logging.
- **#4 No UNIQUE on `plaid_items`** — added `UNIQUE(user_id, institution)` constraint
  on production and in schema file.
- **#5 No UNIQUE on `balance_snapshots`** — added `UNIQUE(item_id, date)` constraint
  on production and in schema file.
- **#6 Stale columns** — dropped `categories.is_default` and `plaid_items.earliest_date`
  on production; removed from schema file.
- **#10 Legacy `utils/migrateData.js`** — deleted.
- **#12 Deploy script untracked file issue** — added `frontend/.env.production` to
  `.gitignore`.
- **#13 Husky prepare script** — already solved with `--ignore-scripts` in deploy
  workflow. Documented.
- **`trust proxy` not set** — Fixed: `app.set('trust proxy', 1)` in `index.js`.
- **`Date.now()` in `plaidTools.js`** — Fixed: changed to `new Date()`.
- **Missing `fixed` column on categories** — Fixed: `ALTER TABLE`.
- **Duplicate plaid_items** — orphan rows cleaned up manually.
- **Balance snapshot date comparison** — Fixed: normalize to string before comparing.
- **Stale migrated snapshots** — deleted manually.
