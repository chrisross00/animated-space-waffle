require('dotenv').config()

// Main Express app
const express = require('express')
const port = process.env.PORT
const router = require("./api")
const path = require('path')
const { connectToDb } = require('./db/database');
const app = express()
const cors = require('cors');

app.use(cors());
app.use(express.static(path.join(__dirname, 'frontend/dist')))
app.use("/api", router);

const db = connectToDb().then(() => {
    // console.log('Connected to MongoDB');
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
