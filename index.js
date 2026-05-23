require('dotenv').config()
const Sentry = require('@sentry/node')

// Initialize Sentry before anything else
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.2,
  });
}

// Main Express app
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const { rateLimit } = require('express-rate-limit')
const path = require('path')
const app = express()
app.set('trust proxy', 1) // Trust first proxy (Nginx)
const port = process.env.PORT

// JWT_SECRET is required for auth token signing/verification
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET env var is not set');
  process.exit(1);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:       ["'self'"],
      scriptSrc:        ["'self'", "cdn.plaid.com"],
      styleSrc:         ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc:          ["'self'", "fonts.gstatic.com"],
      imgSrc:           ["'self'", "data:", "lh3.googleusercontent.com"],
      connectSrc:       ["'self'", "*.ingest.us.sentry.io", "*.plaid.com"],
      frameSrc:         ["'self'", "*.plaid.com"],
      frameAncestors:   ["'none'"],
      baseUri:          ["'self'"],
      formAction:       ["'self'", "https://accounts.google.com"],
      upgradeInsecureRequests: [],
    },
  },
}))

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.ALLOWED_ORIGIN, process.env.ADMIN_ORIGIN].filter(Boolean)
  : [/^http:\/\/(localhost|192\.168\.\d+\.\d+)(:\d+)?$/];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // same-origin requests have no Origin header
    const allowed = allowedOrigins.some(o =>
      o instanceof RegExp ? o.test(origin) : o === origin
    );
    allowed ? callback(null, true) : callback(new Error('Not allowed by CORS'));
  }
}))
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 200,
  standardHeaders: true,
  legacyHeaders: false,
}))

app.use(express.static(path.join(__dirname, 'frontend/dist')))

const authRouter = require("./auth-routes");
const router = require("./api")
const plaidApiRouter = require("./plaid-api");
const adminRouter = require("./admin-api");
app.use("/auth", authRouter);
app.use("/api", router);
app.use("/plaid-api", plaidApiRouter);
const bankApiRouter = require("./bank-api");
app.use("/bank-api", bankApiRouter);
app.use("/admin", adminRouter);

// Sentry error handler — must be after routes, before SPA fallback
Sentry.setupExpressErrorHandler(app);

// SPA fallback — serve index.html for all unmatched routes so Vue Router
// handles client-side navigation (e.g. /budget, /trends, /profile)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})
