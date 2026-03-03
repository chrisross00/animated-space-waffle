require('dotenv').config()

// Node.js 24 + Windows: c-ares (used for DNS SRV lookups by the MongoDB driver)
// prefers TCP for SRV queries, but home routers typically only accept DNS over UDP.
// Using public DNS servers that support both UDP and TCP resolves this.
require('dns').setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

// Main Express app
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const { rateLimit } = require('express-rate-limit')
const path = require('path')
const app = express()
const port = process.env.PORT

const admin = require('firebase-admin');
// FIREBASE_SERVICE_ACCOUNT_JSON must be set in your environment.
// Generate it from: Firebase Console → Project Settings → Service Accounts → Generate new private key
// Store the entire JSON as a single-line string in the env var.
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON env var is not set');
  process.exit(1);
}
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:       ["'self'"],
      scriptSrc:        ["'self'", "cdn.plaid.com"],
      styleSrc:         ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc:          ["'self'", "fonts.gstatic.com"],
      imgSrc:           ["'self'", "data:", "lh3.googleusercontent.com"],
      connectSrc:       ["'self'",
                         "https://*.googleapis.com",
                         "https://*.firebaseapp.com",
                         "wss://*.firebaseio.com"],
      frameAncestors:   ["'none'"],
      baseUri:          ["'self'"],
      formAction:       ["'self'"],
    },
  },
}))

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.ALLOWED_ORIGIN].filter(Boolean)
  : [/^http:\/\/localhost(:\d+)?$/];

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
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}))

app.use(express.static(path.join(__dirname, 'frontend/dist')))

const router = require("./api")
const plaidApiRouter = require("./plaid-api");
app.use("/api", router);
app.use("/plaid-api", plaidApiRouter);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})
