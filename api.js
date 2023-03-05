// This was effectively the API / router for backend stuff
const express = require("express");
const router = express.Router();
const { findData , insertData, deduplicateData, updateData, findUnmappedData } = require('./db/database');
const { plaidTransactionsSync, getAccountData } = require('./utils/plaidTools');
const { migrateData } = require('./utils/migrateData');
const { getMappingRuleList, mapTransactions } = require('./utils/categoryMapping');
const path = require('path');
const cors = require('cors');

router.use(cors());

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'))
});

// Endpoint to retrieve all transactions from the database
router.get('/find', async (req, res) => {
  try {
    // console.log('BE message: starting the Find flow...')
    const transactions = await findData('Plaid-Transactions');
    res.send(transactions);
  } catch (err) {
      console.error(err);
      res.status(500).send('Error getting transactions');
  }
  // console.log('BE message: done')
});

router.get('/getnew' , async (req, res) => {
  const transactions = [];

  try { // Get Account data to set up `tokens` and `next_cursors` for API calls. 
    const responses = await getAccountData()
    const updatedResponses = [];
    
    // For each account, use the `next_cursor` prop to get the latest transactions
    for (let i = 0; i < responses.length; i++) { 
      let token = responses[i].token;
      let next_cursor = responses[i].next_cursor; 
      let hasMore = true;
      const updatedTxns = [];
  
      while (hasMore) { // hasMore is a value set by the Plaid transactionsSync API to handle pagination. When false, you have the final next_cursor
        const newTxns = await plaidTransactionsSync(token, next_cursor); // Pass the `token` and `next_cursor` values to the plaidTransactionsSync() method
        
        // Handle newTxns to end now or continue with flow
        if (typeof(newTxns) === 'string'){ // if newTxns is a string, then plaidTransactionsSync returned no new transactions
          hasMore = false;
          responses[i].newTxns = false
          break;
        }
        responses[i].newTxns = true;
        const additionalData = { // want to know account, and what order each object was made
          account: responses[i].account,
          createdDate: Date.now(),
          lastcursor: next_cursor, // testing setting lastcursor with "newTxns"
        }; 
        const updatedTxn = { ...newTxns, ...additionalData };
        next_cursor = updatedTxn.next_cursor;
        updatedTxns.push(updatedTxn);
        hasMore = updatedTxn.has_more;
      }
    
      updatedResponses.push(...updatedTxns); // Append the updated transactions to the updatedResponses array
      responses[i].next_cursor = next_cursor; // i'm not sure you need this; Update the cursor value in the responses array
    } // end of for loop
  
    transactions.push(...updatedResponses); // Append the updatedResponses array to the responses array

// Need to categorize transactions before inserting to 'Plaid-Transactions'
  const categories = await findData('categories');
  const ruleList = await getMappingRuleList(categories);
  const mappedTxns = await mapTransactions(transactions, ruleList); // insert this to 79 below

  if (mappedTxns.length > 0) {
    insertData('Plaid-Transactions', mappedTxns)
  }

  // Update next_cursor on each account level with the latest next_cursor value for next time
  responses.forEach(element => {  
    // const key1 = 'Accounts.'
    // const key2 = element.account;
    // const key3 = '.token'
    const key = `Accounts.${element.account}.token`;
    let updateObject = { $set: {} };
    let filter = { [key]: element.token };

    // if you're looking at `responses` and you have an account summary object, not a transaction, and it has new Txns
    if(element.next_cursor && element.token && element.newTxns === true){ 
      updateObject.$set[`Accounts.${element.account}.next_cursor`] = element.next_cursor;
      updateData('Plaid-Accounts', filter, updateObject);
      // console.log('forEach(element)', element.next_cursor) // element.next_cursor should update the account.next_cursor
    }
  });
  res.send(mappedTxns); // send responses (all transactions) back to the UI at GetNew.vue
  
  } catch (err) {
      // console.log('error in /getnew', err);
  } // end of try
  // Transform the data into a new format for the app
});

router.post('/dedupe', async (req,res) => {
  try {
    // console.log('BE Message: starting de-dupe transaction flow...')
    await deduplicateData('Plaid-Transactions');
    // console.log('BE Message: de-duplication complete');
    res.send('De-duplication complete');
  } catch (err) {
      console.error(err);
      res.status(500).send('Error de-duping transactions');
  }
})

router.get('/getcategories', async (req, res)=>{
  try {
    console.log('get categories hit and starting')
    const categories = await findData('categories');
    res.send(categories)
  } catch (err){
    console.error(err);
    res.status(500).send('Error getting categories');
  }
})

router.get('/test', function (req, res, next) {
  // console.log('API.js message: hit the /test endpoint')
  const resObj = {
    message: 'hello from api.js /test endpoint... this is a message from the server'
  }
  res.send(resObj)
})

router.get('/mapunmapped', async (req, res) => {
  // console.log('API.js message: hit the /test endpoint')
  try {
    const unmappedTransactions = await findUnmappedData('Plaid-Transactions');
    const categories = await findData('categories');
    const ruleList = await getMappingRuleList(categories);
    const mappedTxns = await mapTransactions(unmappedTransactions, ruleList); // insert this to 79 below

    if(mappedTxns.length > 0){
      mappedTxns.forEach(txn => {
        let updateObject = { $set: {} };
        let filter = { ['transaction_id']: txn.transaction_id } 
        let options = {upsert: true} 
        updateObject.$set["mappedCategory"] = txn.mappedCategory;
        updateData('Plaid-Transactions', filter, updateObject, options);
        console.log(txn._id, txn.mappedCategory)
      });
    }
    // finish
    res.send(mappedTxns)
    
  } catch (err) {
    console.log(err)
  }
})

// Endpoint to insert a transaction into the database
router.post('/insert', async (req, res) => {
  try {
    const { transaction } = req.body;
    const result = await insertData(transaction);
    res.status(201).send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({error: 'Error inserting transaction'});
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