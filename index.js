require('dotenv').config()

// Main Express app
const express = require('express')
const port = process.env.PORT
const router = require("./api")
const path = require('path')
// const { connectToDb } = require('./db/database');
const app = express()
const cors = require('cors');


const firebaseConfig = {
  apiKey: process.env.VUE_APP_FIREBASE_API_KEY,
  authDomain: process.env.VUE_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VUE_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VUE_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VUE_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VUE_APP_FIREBASE_APP_ID,
};
const admin = require('firebase-admin');
admin.initializeApp(firebaseConfig)

app.use(cors());
app.use(express.static(path.join(__dirname, 'frontend/dist')))
app.use("/api", router);


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
