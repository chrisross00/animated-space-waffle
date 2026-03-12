# Production Operations Runbook

Quick reference for operating the Basil Budgeting production environment on Hetzner.

---

## VPS Access

| Detail | Value |
|--------|-------|
| IP | `178.156.248.108` |
| Domain | `basilbudgeting.com` |
| SSH | `ssh root@178.156.248.108` |
| App path | `/opt/basil/app/` |
| Docker Compose | `/opt/basil/docker-compose.yml` |
| PM2 process name | `basil` |

---

## Env Var Locations

| File | Contents |
|------|----------|
| `/opt/basil/.env` | `POSTGRES_PASSWORD` (used by Docker Compose) |
| `/opt/basil/app/.env` | `NODE_ENV`, `PORT`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `PLAID_*`, `ALLOWED_ORIGIN`, `SENTRY_DSN`, `ADMIN_UIDS` |
| `/opt/basil/app/frontend/.env.production` | `VITE_SENTRY_DSN` |

---

## Checking App Status

```bash
# Process status
pm2 list

# Recent logs (last 50 lines, no streaming)
pm2 logs basil --lines 50 --nostream

# Stream logs live
pm2 logs basil

# Clear log file (if it gets too large)
pm2 flush basil
```

---

## Restarting the App

```bash
# Normal restart (preserves PM2 process entry)
pm2 restart basil

# Nuclear restart (if PM2 is caching an errored state)
pm2 delete basil && pm2 start index.js --name basil && pm2 save
```

PM2 is configured to survive reboots via `pm2 save` + `pm2 startup`.

---

## Deploying

### Automatic (CI/CD)

Push to `main` triggers `.github/workflows/deploy.yml`:
1. Runs backend + frontend tests on GitHub Actions
2. SSHs into VPS, pulls code, installs deps, builds frontend, restarts PM2

Check deploy status:
```bash
gh run list --limit 3
gh run watch <run-id>
```

### Manual (if CI/CD fails)

SSH into the VPS and run:

```bash
cd /opt/basil/app
git pull origin main

# --ignore-scripts prevents husky prepare from failing in production
npm install --omit=dev --ignore-scripts
npm install --prefix frontend

npm run build --prefix frontend

pm2 restart basil
```

If `git pull` fails due to untracked/modified files on the server:
```bash
# Check what's blocking
git status

# If it's generated files (e.g., frontend/.env.production), stash or reset:
git stash
git pull origin main
git stash pop
```

---

## Querying Production Postgres

### Option 1: Docker exec (from VPS)

```bash
# One-off query
ssh root@178.156.248.108 'docker exec basil-postgres-1 psql -U basil -d basil -c "SELECT COUNT(*) FROM transactions"'

# Interactive psql session
ssh root@178.156.248.108 -t 'docker exec -it basil-postgres-1 psql -U basil -d basil'
```

### Option 2: SSH tunnel (from local machine)

Open a tunnel in one terminal:
```bash
ssh -L 15432:127.0.0.1:5432 root@178.156.248.108 -N
```

Then connect from another terminal:
```bash
psql "postgresql://basil:rg0unwWNKSxSq4iZXSf9A5bgO0scjyRt@localhost:15432/basil"
```

Or use any Postgres GUI client pointed at `localhost:15432`.

---

## Useful SQL Queries

### Table row counts
```sql
SELECT 'users' AS t, COUNT(*) FROM users
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'simple_rules', COUNT(*) FROM simple_rules
UNION ALL SELECT 'compound_rules', COUNT(*) FROM compound_rules
UNION ALL SELECT 'plaid_items', COUNT(*) FROM plaid_items
UNION ALL SELECT 'plaid_accounts', COUNT(*) FROM plaid_accounts
UNION ALL SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL SELECT 'balance_snapshots', COUNT(*) FROM balance_snapshots;
```

### Transactions per user (with email)
```sql
SELECT u.email, COUNT(t.id) AS txn_count
FROM users u
LEFT JOIN transactions t ON t.user_id = u.id
GROUP BY u.email
ORDER BY txn_count DESC;
```

### Check for orphaned plaid_items (no accounts linked)
```sql
SELECT pi.id, pi.institution, pi.user_id
FROM plaid_items pi
WHERE NOT EXISTS (
  SELECT 1 FROM plaid_accounts pa WHERE pa.item_id = pi.id
);
```

### Check for orphaned transactions (user doesn't exist)
```sql
SELECT COUNT(*) FROM transactions t
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id);
```

### Recent transactions for a user
```sql
SELECT date, name, merchant_name, amount, mapped_category
FROM transactions
WHERE user_id = '<uid>'
ORDER BY date DESC
LIMIT 20;
```

### Categories with budget usage this month
```sql
SELECT c.name, c.monthly_limit,
  COALESCE(SUM(t.amount), 0) AS spent
FROM categories c
LEFT JOIN transactions t
  ON t.user_id = c.user_id
  AND t.mapped_category = c.name
  AND t.date >= date_trunc('month', CURRENT_DATE)
  AND t.date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
WHERE c.user_id = '<uid>' AND c.type = 'expense'
GROUP BY c.name, c.monthly_limit
ORDER BY spent DESC;
```

### Check Plaid item errors
```sql
SELECT pi.institution, pi.error_code, pi.error_message, pi.error_detected_at, u.email
FROM plaid_items pi
JOIN users u ON u.id = pi.user_id
WHERE pi.error_code IS NOT NULL;
```

### Duplicate balance snapshots (same item + date)
```sql
SELECT item_id, date, COUNT(*) AS cnt
FROM balance_snapshots
GROUP BY item_id, date
HAVING COUNT(*) > 1;
```

### Compound rules with match counts
```sql
SELECT cr.label, cr.conditions::text, cr.action::text,
  (SELECT COUNT(*) FROM transactions t
   WHERE t.user_id = cr.user_id
   AND t.mapped_category = (cr.action->>'categoryName')) AS matched_txns
FROM compound_rules cr
WHERE cr.user_id = '<uid>';
```

---

## Nginx

Nginx handles SSL termination and reverse proxying to the Node app on port 3000.

```bash
# Check config
nginx -t

# Reload after config change
systemctl reload nginx

# View Nginx logs
tail -50 /var/log/nginx/access.log
tail -50 /var/log/nginx/error.log
```

SSL certs are from Let's Encrypt with automatic renewal via certbot.

---

## Docker (Postgres)

```bash
# Check container status
docker ps

# Restart Postgres
docker compose -f /opt/basil/docker-compose.yml restart

# View Postgres logs
docker logs basil-postgres-1 --tail 50

# Postgres data volume is persistent — survives container restarts
```

---

## Backups

No automated backup system is in place yet. To take a manual Postgres dump:

```bash
# From VPS
docker exec basil-postgres-1 pg_dump -U basil -d basil > /opt/basil/backups/basil-$(date +%Y%m%d).sql

# From local machine (via tunnel)
ssh root@178.156.248.108 'docker exec basil-postgres-1 pg_dump -U basil -d basil' > basil-backup.sql
```

---

## Troubleshooting

### App returns 500 / won't start
1. Check PM2 logs: `pm2 logs basil --lines 100 --nostream`
2. Check if Postgres is running: `docker ps`
3. Check if the app can reach Postgres: the `DATABASE_URL` in `/opt/basil/app/.env` should point to `localhost:5432`
4. Try a nuclear restart: `pm2 delete basil && pm2 start /opt/basil/app/index.js --name basil && pm2 save`

### Rate limiting / 429 errors
Express rate-limit is configured with `trust proxy` set to 1 (trusts Nginx's `X-Forwarded-For`). If you see unexpected 429s, check that Nginx is forwarding the real client IP correctly.

### Deploy fails on `git pull`
Usually caused by untracked files on the server that conflict with new files in the repo. Check `git status` on the VPS, stash or remove the conflicting files, then pull again.

### Stale PM2 state
If PM2 shows the process as "errored" even after fixing the issue, `pm2 restart` may re-use the cached error state. Use `pm2 delete basil && pm2 start index.js --name basil && pm2 save` instead.
