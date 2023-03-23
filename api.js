// This was effectively the API / router for backend stuff
const express = require("express");
const bodyParser = require('body-parser')
const router = express.Router();
const { findData , insertData, deduplicateData, updateData, findUnmappedData, deleteRemovedData, findFilterData, cleanPendingTransactions } = require('./db/database');
const { plaidTransactionsSync, getAccountData } = require('./utils/plaidTools');
const { migrateData } = require('./utils/migrateData');
const { getMappingRuleList, mapTransactions } = require('./utils/categoryMapping');
const path = require('path');
const cors = require('cors');
const ObjectID = require('mongodb').ObjectId;

router.use(cors());
router.use(bodyParser.json());

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
  
    // TODO DELETE THIS
   // transactions.push(...updatedResponses); // Append the updatedResponses array to the responses array

// Need to categorize transactions before inserting to 'Plaid-Transactions'
  const categories = await findData('categories');
  const ruleList = await getMappingRuleList(categories);
  const mappedTxns = await mapTransactions(updatedResponses, ruleList); // insert this to 79 below
  // console.log('mapped Transactions = ', mappedTxns)
  // UPDATE TRANSACTIONS
  if (mappedTxns.length > 0) {
    await insertData('Plaid-Transactions', mappedTxns)
  }
  // console.log('done inserting data... checking accounts Logic...', element.next_cursor && element.token && element.newTxns === true)

  // REMOVE TRANSACTIONS
  let filter = { $or: [] };
  updatedResponses.forEach(block => {
    if(block.removed && block.removed.length > 0) {
      filter.$or.push(...block.removed);
    }
  });
  if ( filter.$or.length > 0 ) {
    const deletedPendingResponse = await deleteRemovedData('Plaid-Transactions', filter);
    console.log('deletedPendingResponse', deletedPendingResponse);
  }
  
    // UPDATE ACCOUNT TOKENS AND CURSORS - update next_cursor on each account level with the latest next_cursor value for next time
  responses.forEach(element => {  
    const key = `Accounts.${element.account}.token`;
    let updateObject = { $set: {} };
    let filter = { [key]: element.token };

    // if you're looking at `responses` and you have an account summary object, not a transaction, and it has new Txns
    if(element.next_cursor && element.token && element.newTxns === true){ 
      updateObject.$set[`Accounts.${element.account}.next_cursor`] = element.next_cursor;
      
      // UPDATE ACCOUNT WITH NEXT_CURSOR
      updateData('Plaid-Accounts', filter, updateObject); 
      
    }
  });
  
  let resObj = {
      transactions: mappedTxns,
      message: 'New transactions found and mapped, no updates made to database.'
    
    }
  
  console.log('Done and sending response to client')
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
    // console.log('get categories hit and starting')
    const categories = await findData('categories');
    res.send(categories)
  } catch (err){
    console.error(err);
    res.status(500).send('Error getting categories');
  }
})

router.get('/test', async (req, res) => {

  try {
    const resObj = {
      message: 'hello from api.js GET /test endpoint... this is a message from the server'
    }
    res.send(resObj)
    
  } catch (error) {
    res.status(500).send('Error with /test endpiont');
  }
})

router.get('/cleanPendingTransactions', async (req, res) => {

  try {
    const transactions = await cleanPendingTransactions('Plaid-Transactions');
    res.send(transactions);
    
  } catch (error) {
    res.status(500).send('Error with /test endpiont');
  }
})

router.post('/testCategoryUpdate', function(req, res){
  const updateType = req.body.updateType;
  // if updateType == 'transaction' ...
  // if updateType == 'category' ...
  let d = {}
  if (updateType == 'category') {
    d = {
      _id: req.body._id,
      categoryNameBEResponse: req.body.categoryName,
      monthlyLimitBEResponse: req.body.monthly_limit,
      showOnBudgetPageBEResponse: req.body.showOnBudgetPage,
      originalCategoryName: req.body.originalCategoryName,
      updateType: req.body.updateType,
    }
    const filter = { _id: new ObjectID(req.body._id) };
    const update = {
      $set: {
        monthly_limit: req.body.monthly_limit,
        // category: req.body.categoryName // for now, only allowing monthly_limit changes through, name changes require mapping changes
      }
    };
    updateData('categories', filter, update)
  }

  // Call updateData function to update Mongo Db
  if (updateType == 'transaction'){
    d = { 
      mappedCategory: req.body.mappedCategory,
      date: req.body.date,
      transaction_id: req.body.transaction_id,
      originalCategoryName: req.body.originalCategoryName
    }
    const filter = { transaction_id: req.body.transaction_id };
    const update = {
      $set: {
        mappedCategory: req.body.mappedCategory,
        date: req.body.date
      }
    };
    updateData('Plaid-Transactions', filter, update)
  }

  const resObj = {
    message: 'Hello from api.js POST /testCategoryUpdate endpoint... your data has now come full circle:',
    ...d
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