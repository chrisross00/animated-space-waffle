// This was effectively the API / router for backend stuff
const express = require("express");
const bodyParser = require('body-parser')
const router = express.Router();
const { deduplicateData, updateData, updateManyData, findUnmappedData, cleanPendingTransactions, findUserData, insertData } = require('./db/database');
const { getNewPlaidTransactions, getAllUserTransactions } = require('./utils/plaidTools');
const { getMappingRuleList, mapTransactions } = require('./utils/categoryMapping');
const {validateIdToken} = require('./utils/authentication');
const path = require('path');
const ObjectID = require('mongodb').ObjectId;

router.use(bodyParser.json());

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'))
});


router.post('/dedupe', async (req,res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const userId = decodedToken.uid;
    await deduplicateData('Plaid-Transactions', userId);
    res.send('De-duplication complete');
  } catch (err) {
      console.error(err);
      res.status(500).send('Error de-duping transactions');
  }
})

router.get('/getcategories', async (req, res)=>{  
  try {
    const decodedToken = await validateIdToken(req)
    const userId = decodedToken.uid;
    console.log('/test userId, ', userId)
    const categories = await findUserData('Basil-Categories', userId);
    res.send(categories)
    
  } catch (error) {
    res.status(500).send('Error with /test endpiont');
  }
})

const DEFAULT_CATEGORIES = [
  { category: 'Income',         type: 'income',   monthly_limit: 0, plaid_pfc: ['INCOME', 'TRANSFER_IN'] },
  { category: 'Housing',        type: 'expense',  monthly_limit: 0, plaid_pfc: ['HOME_IMPROVEMENT'] },
  { category: 'Food & Dining',  type: 'expense',  monthly_limit: 0, plaid_pfc: ['FOOD_AND_DRINK'] },
  { category: 'Transportation', type: 'expense',  monthly_limit: 0, plaid_pfc: ['TRANSPORTATION'] },
  { category: 'Entertainment',  type: 'expense',  monthly_limit: 0, plaid_pfc: ['ENTERTAINMENT', 'TRAVEL'] },
  { category: 'Shopping',       type: 'expense',  monthly_limit: 0, plaid_pfc: ['GENERAL_MERCHANDISE'] },
  { category: 'Health',         type: 'expense',  monthly_limit: 0, plaid_pfc: ['MEDICAL', 'PERSONAL_CARE'] },
  { category: 'Utilities',      type: 'expense',  monthly_limit: 0, plaid_pfc: ['RENT_AND_UTILITIES'] },
  { category: 'To Sort',        type: 'expense',  monthly_limit: 0, plaid_pfc: [] },
  { category: 'Payment',        type: 'payment',  monthly_limit: 0, plaid_pfc: ['TRANSFER_OUT', 'LOAN_PAYMENTS', 'BANK_FEES'] },
];

router.get('/seedcategories', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const userId = decodedToken.uid;
    const existing = await findUserData('Basil-Categories', userId);
    if (existing.length > 0) {
      return res.send(`User already has ${existing.length} categories. Skipping.`);
    }
    const toInsert = DEFAULT_CATEGORIES.map(cat => ({
      ...cat,
      annual_spend: '',
      rules: {},
      showOnBudgetPage: true,
      userId,
    }));
    await insertData('Basil-Categories', toInsert);
    res.send(`Seeded ${toInsert.length} categories.`);
  } catch (error) {
    res.status(500).send('Error seeding categories: ' + error);
  }
});

router.get('/addplaidpfc', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const userId = decodedToken.uid;
    const categories = await findUserData('Basil-Categories', userId);
    const pfcByName = Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.category, c.plaid_pfc]));
    let updated = 0;
    for (const cat of categories) {
      if (!cat.plaid_pfc && pfcByName[cat.category] !== undefined) {
        const filter = { _id: new ObjectID(cat._id), userId };
        const update = { $set: { plaid_pfc: pfcByName[cat.category] } };
        await updateData('Basil-Categories', filter, update);
        updated++;
      }
    }
    res.send(`Added PFC mappings to ${updated} categories.`);
  } catch (error) {
    res.status(500).send('Error adding PFC mappings: ' + error);
  }
});

router.get('/getNewAuth', async (req, res) => {
  console.log('/getNewAuth starting...');
  try {
    const decodedToken = await validateIdToken(req)
    if(decodedToken.uid){
      try {
        console.log('   beginning IdToken Verification...');
        const userId = decodedToken.uid;

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
    const decodedToken = await validateIdToken(req);
    const userId = decodedToken.uid;
    const transactions = await cleanPendingTransactions('Plaid-Transactions', userId);
    res.send(transactions);
  } catch (error) {
    res.status(500).send('Error cleaning pending transactions');
  }
})

router.post('/handleDialogSubmit', async (req, res) => {
  let uid;
  try {
    req.body = JSON.parse(req.body.dialogBody)
    const decodedToken = await validateIdToken(req)
    uid = decodedToken.uid;
  } catch (error) {
    console.log('handleDialogSubmit error: ', error)
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const updateType = req.body.updateType;
  let d = {}
  if (updateType ==='editCategory') {
    const plaid_pfc = req.body.plaid_pfc || [];
    d = {
      _id: req.body._id,
      categoryNameBEResponse: req.body.categoryName,
      monthlyLimitBEResponse: req.body.monthly_limit,
      showOnBudgetPageBEResponse: req.body.showOnBudgetPage,
      originalCategoryName: req.body.originalCategoryName,
      updateType: req.body.updateType,
      plaid_pfcBEResponse: plaid_pfc,
    }
    // Remove each selected PFC value from any other category so it only maps to one place
    if (plaid_pfc.length > 0) {
      await updateManyData('Basil-Categories',
        { userId: uid, _id: { $ne: new ObjectID(req.body._id) } },
        { $pull: { plaid_pfc: { $in: plaid_pfc } } }
      );
    }
    const filter = { _id: new ObjectID(req.body._id), userId: uid };
    const update = {
      $set: {
        monthly_limit: req.body.monthly_limit,
        plaid_pfc,
        category: req.body.categoryName,
      }
    };
    await updateData('Basil-Categories', filter, update);
    // If the name changed, rename mappedCategory on all matching transactions
    if (req.body.categoryName !== req.body.originalCategoryName) {
      await updateManyData('Plaid-Transactions',
        { userId: uid, mappedCategory: req.body.originalCategoryName },
        { $set: { mappedCategory: req.body.categoryName } }
      );
    }
  }

  // Call updateData function to update Mongo Db
  if (updateType ==='transaction'){
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
    await updateData('Plaid-Transactions', filter, update);

    // Auto-learn: if user opted in, save rule and re-categorize all matching transactions
    const categoryChanged = req.body.mappedCategory && req.body.originalCategoryName &&
                            req.body.mappedCategory !== req.body.originalCategoryName;
    const notToSort = req.body.mappedCategory !== 'To Sort';
    if (categoryChanged && notToSort && req.body.createRule) {
      const catFilter = { category: req.body.mappedCategory, userId: uid };
      if (req.body.merchantName) {
        // Clear this merchant_name from all categories so the rule only lives in one place
        await updateManyData('Basil-Categories',
          { userId: uid, 'rules.merchant_name': req.body.merchantName },
          { $pull: { 'rules.merchant_name': req.body.merchantName } }
        );
        await updateData('Basil-Categories', catFilter, { $addToSet: { 'rules.merchant_name': req.body.merchantName } });
        // Move ALL matching transactions, not just To Sort (they may already be in a wrong category)
        await updateManyData('Plaid-Transactions',
          { userId: uid, merchant_name: req.body.merchantName },
          { $set: { mappedCategory: req.body.mappedCategory } }
        );
        console.log(`Auto-learn: set merchant_name "${req.body.merchantName}" -> "${req.body.mappedCategory}"`);
      } else if (req.body.name) {
        // Clear this name from all categories so the rule only lives in one place
        await updateManyData('Basil-Categories',
          { userId: uid, 'rules.name': req.body.name },
          { $pull: { 'rules.name': req.body.name } }
        );
        await updateData('Basil-Categories', catFilter, { $addToSet: { 'rules.name': req.body.name } });
        // Move ALL matching transactions, not just To Sort
        await updateManyData('Plaid-Transactions',
          { userId: uid, name: req.body.name },
          { $set: { mappedCategory: req.body.mappedCategory } }
        );
        console.log(`Auto-learn: set name "${req.body.name}" -> "${req.body.mappedCategory}"`);
      }
    }
  }

  if (updateType ==='addCategory') {
    const plaid_pfc = req.body.plaid_pfc || [];
    d = {
      client_id: req.body.client_id,
      categoryNameBEResponse: req.body.categoryName,
      monthlyLimitBEResponse: req.body.monthly_limit,
      showOnBudgetPageBEResponse: req.body.showOnBudgetPage,
      updateType: req.body.updateType,
      type: req.body.type,
      plaid_pfcBEResponse: plaid_pfc,
    }
    // Remove each selected PFC value from any other category so it only maps to one place
    if (plaid_pfc.length > 0) {
      await updateManyData('Basil-Categories',
        { userId: uid },
        { $pull: { plaid_pfc: { $in: plaid_pfc } } }
      );
    }
    const update = {
      category: req.body.categoryName,
      monthly_limit: req.body.monthly_limit,
      annual_spend: "",
      rules: {},
      plaid_pfc,
      showOnBudgetPage: true,
      type: req.body.type,
      userId: uid,
      client_id: req.body.client_id,
    }

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

router.post('/bulkCategorize', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transaction_ids, mappedCategory } = req.body;
    await updateManyData('Plaid-Transactions',
      { transaction_id: { $in: transaction_ids }, userId: uid },
      { $set: { mappedCategory } }
    );
    res.json({ updated: transaction_ids.length, mappedCategory });
  } catch (error) {
    res.status(500).send('Error bulk categorizing transactions');
  }
});

router.get('/mapunmapped', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const userId = decodedToken.uid;
    const unmappedTransactions = await findUnmappedData('Plaid-Transactions', userId);
    const categories = await findUserData('Basil-Categories', userId);
    const ruleList = await getMappingRuleList(categories);
    const mappedTxns = await mapTransactions(unmappedTransactions, ruleList);

    if(mappedTxns.length > 0){
      await Promise.all(mappedTxns.map(txn => {
        const filter = { transaction_id: txn.transaction_id };
        const updateObject = { $set: { mappedCategory: txn.mappedCategory } };
        console.log(txn._id, txn.mappedCategory);
        return updateData('Plaid-Transactions', filter, updateObject, { upsert: true });
      }));
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
    if (user.length === 0) {
      const newUser = {
        userId: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture,
        firebase: decodedToken.firebase,
      }
      console.log('User added to database:', newUser)
      await insertData('Basil-Users', newUser);
      const clientSideUser = createClientSideUser(newUser)
      console.log('sending newly created client-side user:', clientSideUser)
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