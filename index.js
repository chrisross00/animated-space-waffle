require('dotenv').config()

// Main Express app
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const { rateLimit } = require('express-rate-limit')
const path = require('path')
const app = express()
const port = process.env.PORT

const admin = require('firebase-admin');
admin.initializeApp({
  apiKey: process.env.VUE_APP_FIREBASE_API_KEY,
  authDomain: process.env.VUE_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VUE_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VUE_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VUE_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VUE_APP_FIREBASE_APP_ID,
});

app.use(helmet())
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
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
