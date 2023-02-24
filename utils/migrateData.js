// migrateData.js

const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

async function migrateData() {
  try {
    const url = process.env.DB_URI;   
    const dbName = process.env.DB_NAME;
    const client = await MongoClient.connect(url);
    console.log('Connected to database');

    const db = client.db(dbName);
    const categories = db.collection('categories');
    const transactions = db.collection('transactions');
    const accounts = db.collection('accounts');

    // Migrate Categories
    console.log('Migrating Categories...');
    const categoriesData = [];

    fs.createReadStream(path.join(__dirname, 'data', 'categories.csv'))
      .pipe(csv())
      .on('data', (data) => {
        categoriesData.push(data);
      })
      .on('end', async () => {
        await categories.insertMany(categoriesData);
        console.log('Categories migrated successfully');
      });

    // Migrate Transactions
    console.log('Migrating Transactions...');
    const transactionsData = [];

    fs.createReadStream(path.join(__dirname, 'data', 'transactions.csv'))
      .pipe(csv())
      .on('data', (data) => {
        transactionsData.push(data);
      })
      .on('end', async () => {
        await transactions.insertMany(transactionsData);
        console.log('Transactions migrated successfully');
      });

    // Migrate Accounts
    console.log('Migrating Accounts...');
    const accountsData = [];

    fs.createReadStream(path.join(__dirname, 'data', 'accounts.csv'))
      .pipe(csv())
      .on('data', (data) => {
        accountsData.push(data);
      })
      .on('end', async () => {
        await accounts.insertMany(accountsData);
        console.log('Accounts migrated successfully');
      });

    // client.close();
    console.log('Disconnected from database');
  } catch (err) {
    console.error('Failed to migrate data:', err);
  }
}

module.exports = { migrateData };