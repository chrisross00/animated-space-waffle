// This was effectively the API / router for backend stuff
const express = require("express");
const router = express.Router();
const { findData , insertData, deduplicateData, updateData } = require('./db/database');
const { plaidTransactionsSync, getAccountData } = require('./utils/plaidTools');
const { migrateData } = require('./utils/migrateData');
const path = require('path');
const cors = require('cors');

router.use(cors());

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'))
});

// Endpoint to retrieve all transactions from the database
router.get('/find', async (req, res) => {
  try {
    console.log('BE message: starting the Find flow...')
    const transactions = await findData('transactions');
    console.log('BE message: API got database data, sending back up to FE')    
    res.send(transactions);
  } catch (err) {
      console.error(err);
      res.status(500).send('Error getting transactions');
  }
  console.log('BE message: done')
});

router.get('/getnew' , async (req, res) => {
// Top to do:
// v update responses so it's grouping getAccountData response with transactionSync response -- right now everything gets pushed to this responses array that starts out as the getAccountData response
  // v alt approach is to not store the account info in the txn table, make a new table for the txn stuff and only us the account stuff as the loop mechanic
// v update so you don't always insert transactions; should only insert if `newTxns` = true

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

// IS IT POSSIBLE TO NOT CALL PLAID-TRANSACTIONS IF THE API RESPONSE WAS EMPTY
    if (transactions.length > 0) {
      insertData('Plaid-Transactions', transactions)
    }

    // Update next_cursor on each account level with the latest next_cursor value for next time
    responses.forEach(element => {  
      const key1 = 'Accounts.'
      const key2 = element.account;
      const key3 = '.token'
      const key = key1 + key2 + key3
      let updateObject = { $set: {} };
      let filter = { [key]: element.token };

      // if you're looking at `responses` and you have an account summary object, not a transaction, and it has new Txns
      if(element.next_cursor && element.token && element.newTxns === true){ 
        updateObject.$set[`Accounts.${element.account}.next_cursor`] = element.next_cursor;
        updateData('Plaid-Accounts', filter, updateObject);
        // console.log('forEach(element)', element.next_cursor) // element.next_cursor should update the account.next_cursor
      }
    });
    res.send(transactions); // send responses (all transactions) back to the UI at GetNew.vue
    
    } catch (err) {
        console.log('error in /getnew', err);

// end of try        
  } 
  console.log('     /getnew: end of try statement');


  // Transform the data into a new format for the app

  console.log('     /getNew done')
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