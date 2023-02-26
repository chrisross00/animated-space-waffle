// This was effectively the API / router for backend stuff

const express = require("express");
const router = express.Router();
const { findData , insertData, deduplicateData } = require('./db/database');
const { migrateData } = require('./utils/migrateData');
const path = require('path');
const cors = require('cors');
// const feurl = process.env.FE_SERVER_URL

router.use(cors());

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'))
});

// Endpoint to retrieve all transactions from the database
router.get('/find', async (req, res) => {
  try {
    console.log('BE message: starting the Find flow...')
    const query = {}
    const transactions = await findData('transactions', query);
    console.log('BE message: API got database data, sending back up to FE')    
    res.send(transactions);
  } catch (err) {
      console.error(err);
      res.status(500).send('Error getting transactions');
  }
  console.log('BE message: done')
});

router.post('/dedupe', async (req,res) => {
  try {
    console.log('BE Message: starting de-dupe transaction flow...')
    await deduplicateData('transactions');
    console.log('BE Message: de-duplication complete');
    res.send('De-duplication complete');
  } catch (err) {
      console.error(err);
      res.status(500).send('Error de-duping transactions');
  }
})

router.get('/test', function (req, res, next) {
  console.log('BE message: hit the /test endpoint')
  res.json({msg: 'This is CORS-enabled for all origins!'})
})

// Endpoint to insert a transaction into the database
router.post('/insert', async (req, res) => {
  try {
    const { transaction } = req.body;
    const result = await insertData(transaction);
    res.status(201).send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error inserting transaction');
  }
});

// Endpoint to migrate data from Google Sheets to MongoDB
router.get('/migrate', async (req, res) => {
  try {
    await migrateData();
    res.send('Data migration successful');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error migrating data');
  }
});

module.exports = router;