# Performance Optimizations

## Done

### Nginx gzip compression
Uncommented gzip type list in `/etc/nginx/nginx.conf`. JS bundle went from 1.3MB → 412KB, CSS from 247KB → 43KB (71% reduction).

### Static asset cache headers
Added `Cache-Control: public, immutable` with 1-year expiry for `/assets/` (Vite hashed files). Repeat visits download 0 bytes for JS/CSS. Icons and manifest cached 7 days.

---

## To do

### 1. Vite code splitting (high impact, medium effort)
**Problem:** Entire app ships as one 1.3MB JS bundle. Users loading the budget page also download ECharts, RuleEditorDialog, MerchantBrowser, etc.

**Fix:** Change static route imports in `frontend/src/routes.js` to dynamic imports:
```js
// Before
import TrendsView from './views/TrendsView.vue'
// After
const TrendsView = () => import('./views/TrendsView.vue')
```

Do this for all routes except BudgetView (most common landing page — keep it in the main bundle). ECharts is the biggest win since it's a large library only used by TrendsView.

**Files:** `frontend/src/routes.js`
**Risk:** Low. Vue Router supports this natively. Users see a brief loading moment on first visit to a lazy route.

### 2. Cloudflare free tier (high impact, no code changes)
**Problem:** Server is in Europe; US users have ~250ms round-trip latency on every request. Static assets are served from origin every time for new visitors.

**Fix:** Put basilbudgeting.com behind Cloudflare's free plan:
1. Create Cloudflare account
2. Add basilbudgeting.com
3. Change nameservers at domain registrar to Cloudflare's
4. Enable "Full (strict)" SSL mode (we already have Let's Encrypt)
5. Cloudflare auto-caches static assets at edge, adds Brotli compression (~15-20% smaller than gzip)

**Risk:** Low. Cloudflare proxies transparently. Let's Encrypt renewal may need a DNS challenge instead of HTTP — check after switching. The free tier is generous and covers everything we need.

### 3. Self-host Google Fonts (small impact, low effort)
**Problem:** Two external requests to fonts.googleapis.com on every first visit. Blocks rendering until fonts load.

**Fix:** Download DM Sans, DM Serif Display, and JetBrains Mono. Add woff2 files to `frontend/public/fonts/`. Replace the Google Fonts `<link>` tags in `index.html` with local `@font-face` declarations. Use `font-display: swap` to prevent blocking.

**Files:** `frontend/index.html`, new `frontend/src/styles/fonts.css`, font files in `frontend/public/fonts/`
**Risk:** None. Fonts are open source (OFL license).

### 4. Postgres connection pooling (low priority, investigate first)
**Problem (maybe):** If database connections aren't being reused efficiently under load.

**Fix:** Check `db/database.js` pool config. If needed, add PgBouncer as a Docker sidecar in `docker-compose.yml`.

**Skip unless:** We see slow API responses or connection errors under real usage.
