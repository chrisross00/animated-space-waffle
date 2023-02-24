// This was effectively the API / router for backend stuff


const express = require('express');
const { findData , insertData } = require('../../db/database');
const { migrateData } = require('./utils/migrateData');
const path = require('path');
const app = express();

app.use(express.json());

// Set the path to your Vue application files
const vuePath = path.join(__dirname, 'public');

// Configure Vue to serve as the entry point for your application
app.use(express.static(vuePath));

// Route for your homepage
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint to insert a transaction into the database
app.post('/insert', async (req, res) => {
  try {
    const { transaction } = req.body;
    const result = await insertData(transaction);
    res.status(201).send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error inserting transaction');
  }
});

// Endpoint to retrieve all transactions from the database
app.get('/find', async (req, res) => {
  try {
    const query = {
      query: {}, // Empty query object to retrieve all documents
      orderby: { Date: -1 }, // Sort documents in descending order based on Date field
      limit: 5 // Return only the first 5 documents
    }
    const transactions = await findData('transactions',query);
    res.send(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error getting transactions');
  }
});

// Endpoint to migrate data from Google Sheets to MongoDB
app.get('/migrate', async (req, res) => {
  try {
    await migrateData();
    res.send('Data migration successful');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error migrating data');
  }
});

module.exports = app;