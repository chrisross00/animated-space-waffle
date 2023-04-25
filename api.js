// This was effectively the API / router for backend stuff
const express = require("express");
const bodyParser = require('body-parser')
const router = express.Router();
const { findData , insertData, deduplicateData, updateData, findUnmappedData, deleteRemovedData, findFilterData, cleanPendingTransactions, findUserData } = require('./db/database');
const { plaidTransactionsSync, getAccountData } = require('./utils/plaidTools');
const { migrateData } = require('./utils/migrateData');
const { getMappingRuleList, mapTransactions } = require('./utils/categoryMapping');
const path = require('path');
const cors = require('cors');
const ObjectID = require('mongodb').ObjectId;
const admin = require('firebase-admin');
const http = require('http')

router.use(cors());
router.use(bodyParser.json());

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'))
});

// Endpoint to retrieve all transactions from the database
router.get('/find', async (req, res) => {
  getAllTransactions(req, res);
});

router.get('/getnew' , async (req, res) => {
  getNewPlaidTransactions(req, res);
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
    console.log('/getcategories: getting categories...')
    const categories = await findData('Basil-Categories');
    console.log('/getcategories: done getting categories...')
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

router.get('/getNewAuth', async (req, res) => {
  try {
    console.log('/getNewAuth starting...');
    
    // Verify the Firebase ID token
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const idToken = header.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      if(decodedToken.user_id){
        try {
          console.log('   beginning IdToken Verification...');
          const userId = decodedToken.user_id;
  
          await getNewPlaidTransactions(userId);
          const transactions = await getAllUserTransactions(userId);
                  
          // Send a response back to the client
          console.log('/getNewAuth complete, sending status 200 and returning transactions...');
          res.status(200).json({ message: 'Authorization successful', transactions: transactions });
          return transactions;
        } catch (error) {
          // Handle invalid ID token
          console.error('Error verifying ID token:', error);
          res.status(401).json({ message: 'Authorization failed' });
        }
      }
    } else {
      // Handle missing or malformed Authorization header
      console.error('Missing or malformed Authorization header');
      res.status(400).json({ message: 'Bad request' });
    }
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/cleanPendingTransactions', async (req, res) => {

  try {
    const transactions = await cleanPendingTransactions('Plaid-Transactions');
    res.send(transactions);
    
  } catch (error) {
    res.status(500).send('Error with /test endpiont');
  }
})

router.post('/categoryUpdate', function(req, res){
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
    updateData('Basil-Categories', filter, update)
  }

  // Call updateData function to update Mongo Db
  if (updateType == 'transaction'){
    d = { 
      mappedCategory: req.body.mappedCategory,
      date: req.body.date,
      transaction_id: req.body.transaction_id,
      originalCategoryName: req.body.originalCategoryName,
      note: req.body.note ? req.body.note : '',
      excludeFromTotal: req.body.excludeFromTotal? req.body.excludeFromTotal : false,
    }
    const filter = { transaction_id: req.body.transaction_id };
    const update = {
      $set: {
        mappedCategory: req.body.mappedCategory,
        date: req.body.date,
        note: req.body.note,
        excludeFromTotal: req.body.excludeFromTotal
      }
    };
    updateData('Plaid-Transactions', filter, update)
  }

  const resObj = {
    message: 'Hello from api.js POST /categoryUpdate endpoint... your data has now come full circle:',
    ...d
  }

  res.send(resObj)
})

router.get('/mapunmapped', async (req, res) => {
  // console.log('API.js message: hit the /test endpoint')
  try {
    const unmappedTransactions = await findUnmappedData('Plaid-Transactions');
    const categories = await findData('Basil-Categories');
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

async function getNewPlaidTransactions(uid) {
  const userId = uid? uid : null;
  try { 
    console.log('     /getnew: checking for new transactions for userId...', userId);
    const responses = await getAccountData(userId);
    console.log(`accounts received for userId: ${userId} \n, ${responses}`);
    const updatedResponses = [];
    
    for (const response of responses) {
      let token = response.token;
      let next_cursor = response.next_cursor;
      let hasMore = true;
      // console.log(`response.token and response.next_cursor: ${response.token} \n, ${response.next_cursor}`);
        const updatedTxns = [];
        
        while (hasMore) {
          const newTxns = await plaidTransactionsSync(token, next_cursor, userId);
          // console.log(' api.js: plaidTransactionsSync : \n', newTxns, '\nnewTxns end');
          if (typeof newTxns === 'string') {
            hasMore = false;
            response.newTxns = false;
            break;
          }

          response.newTxns = true;
          const additionalData = {
            account: response.account,
            createdDate: Date.now(),
            lastcursor: next_cursor,
            userId,
          };
          const updatedTxn = { ...newTxns, ...additionalData };
          next_cursor = updatedTxn.next_cursor;
          updatedTxns.push(updatedTxn);
          hasMore = updatedTxn.has_more;
        }

        updatedResponses.push(...updatedTxns);
        response.prev_cursor = response.next_cursor;
        response.next_cursor = next_cursor;

        if (response.next_cursor && response.token && response.newTxns === true) {
          await updateAccounts(response, userId);
        }
      }
      console.log('getting user data.... userId = ', userId);
    const categories = await findUserData('Basil-Categories', userId); 
    const ruleList = await getMappingRuleList(categories);
    const mappedTxns = await mapTransactions(updatedResponses, ruleList);

    if (mappedTxns.length > 0) {
      await insertData('Plaid-Transactions', mappedTxns);
    }

    let filter = { $or: [] };
    updatedResponses.forEach((block) => {
      if (block.removed && block.removed.length > 0) {
        filter.$or.push(...block.removed); // add user id here? not sure if it needs to be added to match or not
      }
    });

    if (filter.$or.length > 0) {
      const deletedPendingResponse = await deleteRemovedData('Plaid-Transactions', filter);
      console.log('deletedPendingResponse', deletedPendingResponse);
    }

    console.log('/getnew: done checking for new Plaid transactions...');
    return;
  } catch (err) {
      console.log('error in /getnew', err);
  } 
}

async function getAllTransactions() {
  try {
    console.log('getAllTransactions(): searching Plaid-Transactions...')
    const transactions = await findData('Plaid-Transactions');
    console.log('getAllTransactions(): done searching Plaid-Transactions...')
    return transactions;
  } catch (err) {
      console.error(err);
      // res.status(500).send('Error getting transactions');
  }
  // console.log('BE message: done')
}

async function getAllUserTransactions(uid) {
  const userId = uid? uid : null;
  if(userId){
    try {
      console.log('getAllUserTransactions(): searching Plaid-Transactions for userId...', userId)
      const transactions = await findUserData('Plaid-Transactions', userId);
      console.log('getAllUserTransactions(): done searching Plaid-Transactions...')
      return transactions;
    } catch (err) {
        console.error(err);
        // res.status(500).send('Error getting transactions');
    }
  } else {
    console.log('getAllUserTransactions(): no userId provided')
  }
}

async function updateAccounts(response, userId){
  const key = `Accounts.${response.account}.token`;
  const filter = { 
    [key]: response.token, 
    userId: userId
  };
  const updateObject = {
    $set: {
      [`Accounts.${response.account}.next_cursor`]: response.next_cursor,
      [`Accounts.${response.account}.prev_cursor`]: response.prev_cursor,
    },
  };
  await updateData('Plaid-Accounts', filter, updateObject);
  return;
}

module.exports = router;