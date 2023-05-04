// This was effectively the API / router for backend stuff
const express = require("express");
const bodyParser = require('body-parser')
const router = express.Router();
const { findData, deduplicateData, updateData, findUnmappedData, cleanPendingTransactions, findUserData, insertData, findSimilarTransactionGroupsByName, findSimilarTransactionGroupsByCategory } = require('./db/database');
const { getNewPlaidTransactions, getAllUserTransactions } = require('./utils/plaidTools');
const { getMappingRuleList, mapTransactions } = require('./utils/categoryMapping');
const {validateIdToken} = require('./utils/authentication');
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
    const resObj = {
      message: 'hello from api.js GET /test endpoint... this endpoint has been temporarily disabled'
    }
    res.send(resObj)
    
  } catch (error) {
    res.status(500).send('Error with /test endpiont');
  }
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
    const decodedToken = await validateIdToken(req)
    const userId = decodedToken.user_id;
    console.log('/test userId, ', userId)
    const categories = await findUserData('Basil-Categories', userId);
    res.send(categories)
    
  } catch (error) {
    res.status(500).send('Error with /test endpiont');
  }
})

router.get('/test', async (req, res) => {

  try {
    const decodedToken = await validateIdToken(req)
    const userId = decodedToken.user_id;
    console.log('/test userId, ', userId)
    const txns = await findSimilarTransactionGroupsByCategory(userId)
    const resObj = {
      message: 'hello from api.js GET /test endpoint... this is a message from the server',
      data: txns
    }
    res.send(resObj)
    
  } catch (error) {
    res.status(500).send('Error with /test endpiont');
  }
})

router.get('/getNewAuth', async (req, res) => {
  console.log('/getNewAuth starting...');
  try {
    const decodedToken = await validateIdToken(req)
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

// Requires the ID token from the Authorization header, which you can easily create using firebase.js/getAuthHeaders() on the client side
router.get('/getOrAddUser', async (req, res) => {
  console.log('/getOrAddUser starting...');
  try {
    const decodedToken = await validateIdToken(req)
    console.log('decodedToken: ', decodedToken)
    if(decodedToken){
      const user = await getOrAddUser(decodedToken)
      console.log('received user from getOrAddUser() method', user)
      res.status(200).json(user);
      return user
    } else {
      console.log('Missing or malformed Authorization header');
    }
  } catch (error) {
    console.log(error)
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

router.post('/handleDialogSubmit', async (req, res) => {
  let uid;
  try {
    req.body = JSON.parse(req.body.dialogBody)
    const decodedToken = await validateIdToken(req)
    uid = decodedToken.user_id;
  } catch (error) {
    console.log('handleDialogSubmit error: ', error)
  }

  const updateType = req.body.updateType;
  let d = {}
  if (updateType == 'editCategory') { 
    d = {
      _id: req.body._id,
      categoryNameBEResponse: req.body.categoryName,
      monthlyLimitBEResponse: req.body.monthly_limit,
      showOnBudgetPageBEResponse: req.body.showOnBudgetPage,
      originalCategoryName: req.body.originalCategoryName,
      updateType: req.body.updateType,
    }
      const filter = { _id: new ObjectID(req.body._id), userId: uid };
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
    const filter = { transaction_id: req.body.transaction_id, userId: uid };
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

  if (updateType == 'addCategory') {
    d = {
      client_id: req.body.client_id,
      categoryNameBEResponse: req.body.categoryName,
      monthlyLimitBEResponse: req.body.monthly_limit,
      showOnBudgetPageBEResponse: req.body.showOnBudgetPage,
      updateType: req.body.updateType,
      type: req.body.type,
    }
    const update = {
      category: req.body.categoryName,
      monthly_limit: req.body.monthly_limit,
      annual_spend: "",
      rules: {},
      showOnBudgetPage: true,
      type: req.body.type,
      userId: uid,
      client_id: req.body.client_id,
    }

    // note this should be asyncrhonous later but whatever
    await insertData('Basil-Categories', update)
    const categoriesWithAdded = await findUserData('Basil-Categories', uid);
    categoriesWithAdded.forEach(category => {
      if(category.client_id === d.client_id){
        d._id = category._id
      }
    });
  }

  const resObj = {
    // message: 'Hello from api.js POST /handleDialogSubmit endpoint... your data has now come full circle:',
    ...d
  }
  console.log("api is done handling dialog submit", resObj)
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

async function getOrAddUser(decodedToken) {
  let accounts;
  console.log('getOrAddUser function called and starting...:', decodedToken.uid)
  try {
    const user = await findUserData('Basil-Users', decodedToken.uid);
    if (user.length == 0) {
      const newUser = {
        userId: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture,
        firebase: decodedToken.firebase,
      }
      console.log('User added to database:', newUser)
      await insertData('Basil-Users', newUser);
      console.log('sending newly created client-side user:', clientSideUser)
      const clientSideUser = createClientSideUser(newUser[0])
      return clientSideUser
    } else {
      console.log('User found:', user[0])
        try {
          // call "Plaid-Accounts" with userId to get the user's accounts
          accounts = await findUserData('Plaid-Accounts', user[0].userId);
        } catch (error) {
          console.log('Error getting user accounts:', error)
        }
        
      const clientSideUser = createClientSideUser(user[0], accounts)
      console.log('sending client-side user:', clientSideUser)
      return clientSideUser;
    }
  } catch (error) {
      console.log('getOrAddUser Error:', error)
  }
}

function createClientSideUser(user, accounts=null) {
  const bankAccounts = accounts?.[0]?.Accounts ?? null;
  console.log('createClientSideUser accounts: ', bankAccounts)
  let bankNames = bankAccounts ? Object.keys(bankAccounts) : [];
  return {
    email: user.email,
    name: user.name,
    picture: user.picture,
    accounts: bankNames
  };
}

module.exports = router;