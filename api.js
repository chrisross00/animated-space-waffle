// This was effectively the API / router for backend stuff
const express = require("express");
const bodyParser = require('body-parser')
const router = express.Router();
const { deduplicateData, updateData, updateManyData, findUnmappedData, cleanPendingTransactions, findUserData, insertData, findDistinctMerchants, findMerchantsWithStats, deleteRemovedData, findRecentTransactions, findUserRules, insertRule, updateCompoundRule, deleteCompoundRule } = require('./db/database');
const { getNewPlaidTransactions, getAllUserTransactions } = require('./utils/plaidTools');
const { getMappingRuleList, mapTransactions } = require('./utils/categoryMapping');
const {validateIdToken} = require('./utils/authentication');
const path = require('path');
const ObjectID = require('mongodb').ObjectId;
const { rateLimit } = require('express-rate-limit');

// Tighter per-endpoint limiter for expensive Plaid sync operations
const plaidSyncLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 10 });

// Admin-only endpoints: uid must be in ADMIN_UIDS env var (comma-separated)
const ADMIN_UIDS = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
function requireAdmin(uid, res) {
  if (!ADMIN_UIDS.includes(uid)) {
    res.status(403).json({ message: 'Forbidden' });
    return false;
  }
  return true;
}

function isStr(val, max = 500) {
  return typeof val === 'string' && val.trim().length > 0 && val.length <= max;
}

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
  { category: 'Payment',        type: 'payment',  monthly_limit: 0, plaid_pfc: ['LOAN_PAYMENTS', 'BANK_FEES'] },
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

router.get('/getNewAuth', plaidSyncLimiter, async (req, res) => {
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
  try {
    const decodedToken = await validateIdToken(req)
    if(decodedToken){
      const user = await getOrAddUser(decodedToken)
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
    const decodedToken = await validateIdToken(req)
    uid = decodedToken.uid;
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const updateType = req.body.updateType;
  let d = {}
  if (updateType === 'editCategory') {
    if (!ObjectID.isValid(req.body._id)) return res.status(400).json({ message: 'Invalid category id' });
    if (!isStr(req.body.categoryName, 200)) return res.status(400).json({ message: 'Invalid categoryName' });
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
  if (updateType === 'transaction') {
    if (!isStr(req.body.transaction_id)) return res.status(400).json({ message: 'Invalid transaction_id' });
    if (!isStr(req.body.mappedCategory, 200)) return res.status(400).json({ message: 'Invalid mappedCategory' });
    if (req.body.note && typeof req.body.note === 'string' && req.body.note.length > 1000) {
      return res.status(400).json({ message: 'Note exceeds maximum length' });
    }
    d = {
      mappedCategory: req.body.mappedCategory,
      date: req.body.date,
      transaction_id: req.body.transaction_id,
      originalCategoryName: req.body.originalCategoryName,
      note: req.body.note ? req.body.note : '',
      excludeFromTotal: req.body.excludeFromTotal? req.body.excludeFromTotal : false,
      ...(!req.body.ruleMode && { manually_set: true }),
    }
    const filter = { transaction_id: req.body.transaction_id, userId: uid };
    const update = {
      $set: {
        mappedCategory: req.body.mappedCategory,
        date: req.body.date,
        note: req.body.note,
        excludeFromTotal: req.body.excludeFromTotal,
        // Only protect from future sweeps if this is a standalone edit, not part of a rule
        ...(!req.body.ruleMode && { manually_set: true }),
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
        // Also clear any stale name rule for this specific transaction — name rules are higher
        // priority than merchant_name rules, so a leftover name rule would override this one
        if (req.body.name) {
          await updateManyData('Basil-Categories',
            { userId: uid, 'rules.name': req.body.name },
            { $pull: { 'rules.name': req.body.name } }
          );
        }
        await updateData('Basil-Categories', catFilter, { $addToSet: { 'rules.merchant_name': req.body.merchantName } });
        // Move matching transactions, skipping any the user has manually categorized
        await updateManyData('Plaid-Transactions',
          { userId: uid, merchant_name: req.body.merchantName, manually_set: { $ne: true } },
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
        // Move matching transactions, skipping any the user has manually categorized
        await updateManyData('Plaid-Transactions',
          { userId: uid, name: req.body.name, manually_set: { $ne: true } },
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

router.get('/merchantStats', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const merchants = await findMerchantsWithStats(decodedToken.uid);
    res.json(merchants);
  } catch (error) {
    console.error('/merchantStats error:', error);
    res.status(500).json({ message: 'Failed to fetch merchant stats' });
  }
});

router.get('/merchants', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const merchants = await findDistinctMerchants(decodedToken.uid);
    res.json(merchants);
  } catch (error) {
    console.error('/merchants error:', error);
    res.status(500).json({ message: 'Failed to fetch merchants' });
  }
});

router.post('/saveRule', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { categoryId, categoryName, ruleType, ruleValue } = req.body;
    const allowed = ['merchant_name', 'name'];
    if (!allowed.includes(ruleType)) return res.status(400).json({ message: 'Invalid ruleType' });
    if (!ObjectID.isValid(categoryId)) return res.status(400).json({ message: 'Invalid categoryId' });
    if (!isStr(categoryName, 200)) return res.status(400).json({ message: 'Invalid categoryName' });
    if (!isStr(ruleValue, 500)) return res.status(400).json({ message: 'Invalid ruleValue' });
    // Clear this rule value from any other category so it only lives in one place
    await updateManyData('Basil-Categories',
      { userId: uid, [`rules.${ruleType}`]: ruleValue },
      { $pull: { [`rules.${ruleType}`]: ruleValue } }
    );
    // Add to the target category
    await updateData('Basil-Categories',
      { _id: new ObjectID(categoryId), userId: uid },
      { $addToSet: { [`rules.${ruleType}`]: ruleValue } }
    );
    // Re-categorize matching transactions, skipping any the user has manually categorized
    const txnFilter = ruleType === 'merchant_name'
      ? { userId: uid, merchant_name: ruleValue, manually_set: { $ne: true } }
      : { userId: uid, name: ruleValue, manually_set: { $ne: true } };
    await updateManyData('Plaid-Transactions', txnFilter, { $set: { mappedCategory: categoryName } });
    console.log(`saveRule: ${ruleType} "${ruleValue}" -> "${categoryName}"`);
    res.json({ ok: true });
  } catch (error) {
    console.error('/saveRule error:', error);
    res.status(500).json({ message: 'Failed to save rule' });
  }
});

router.post('/deleteRule', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { categoryId, ruleType, ruleValue } = req.body;
    const allowed = ['merchant_name', 'name', 'transaction_type', 'category0', 'category1'];
    if (!allowed.includes(ruleType)) {
      return res.status(400).json({ message: 'Invalid ruleType' });
    }
    const filter = { _id: new ObjectID(categoryId), userId: uid };
    await updateData('Basil-Categories', filter, { $pull: { [`rules.${ruleType}`]: ruleValue } });
    res.json({ ok: true });
  } catch (error) {
    console.error('/deleteRule error:', error);
    res.status(500).json({ message: 'Failed to delete rule' });
  }
});

// ---- Compound rules ----

router.get('/rules', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const rules = await findUserRules(decodedToken.uid);
    res.json(rules);
  } catch (error) {
    console.error('/rules error:', error.message);
    res.status(500).json({ message: 'Failed to fetch rules' });
  }
});

async function sweepCompoundRule(uid, conditions, action) {
  if (action?.type !== 'categorize' || !Array.isArray(conditions)) return;
  const txnFilter = { userId: uid, manually_set: { $ne: true } };
  const amountExprs = [];
  for (const c of conditions) {
    if (c.field === 'amount') {
      if (c.op === 'eq')    amountExprs.push({ $eq: [{ $abs: '$amount' }, c.value] });
      if (c.op === 'range') amountExprs.push({ $gte: [{ $abs: '$amount' }, c.min] }, { $lte: [{ $abs: '$amount' }, c.max] });
    } else if (c.op === 'eq') {
      txnFilter[c.field] = c.value;
    }
  }
  if (amountExprs.length > 0) txnFilter.$expr = amountExprs.length === 1 ? amountExprs[0] : { $and: amountExprs };
  const sweep = { mappedCategory: action.categoryName };
  if (action.note) sweep.note = action.note;
  await updateManyData('Plaid-Transactions', txnFilter, { $set: sweep });
}

router.post('/saveCompoundRule', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { label, conditions, action, createdFrom } = req.body;
    // Duplicate check — same conditions (field+op+value/min/max), order-independent
    const existing = await findUserRules(uid);
    const condKey = c => `${c.field}|${c.op}|${c.value ?? ''}|${c.min ?? ''}|${c.max ?? ''}`;
    const incomingKey = conditions.map(condKey).sort().join(',');
    const isDuplicate = existing.some(r =>
      Array.isArray(r.conditions) && r.conditions.map(condKey).sort().join(',') === incomingKey
    );
    if (isDuplicate) return res.status(409).json({ message: 'Duplicate rule' });

    const rule = { userId: uid, label, conditions, action, createdAt: Date.now(), createdFrom: createdFrom || 'manual' };
    const result = await insertRule(rule);

    await sweepCompoundRule(uid, conditions, action);

    res.json({ ...rule, _id: result.insertedId });
  } catch (error) {
    console.error('/saveCompoundRule error:', error.message);
    res.status(500).json({ message: 'Failed to save compound rule' });
  }
});

router.post('/updateCompoundRule', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { ruleId, label, conditions, action, reapply } = req.body;
    const updates = { label, conditions };
    if (action) updates.action = action;
    await updateCompoundRule(uid, ruleId, updates);

    if (reapply) await sweepCompoundRule(uid, conditions, action);

    res.json({ ok: true });
  } catch (error) {
    console.error('/updateCompoundRule error:', error.message);
    res.status(500).json({ message: 'Failed to update compound rule' });
  }
});

router.post('/deleteCompoundRule', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const { ruleId } = req.body;
    await deleteCompoundRule(decodedToken.uid, ruleId);
    res.json({ ok: true });
  } catch (error) {
    console.error('/deleteCompoundRule error:', error.message);
    res.status(500).json({ message: 'Failed to delete compound rule' });
  }
});

router.post('/bulkCategorize', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transaction_ids, mappedCategory } = req.body;
    if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return res.status(400).json({ message: 'transaction_ids must be a non-empty array' });
    }
    if (transaction_ids.length > 500) {
      return res.status(400).json({ message: 'Cannot bulk categorize more than 500 transactions at once' });
    }
    if (typeof mappedCategory !== 'string' || !mappedCategory.trim()) {
      return res.status(400).json({ message: 'mappedCategory must be a non-empty string' });
    }
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
    const compoundRules = await findUserRules(userId);
    const mappedTxns = await mapTransactions(unmappedTransactions, ruleList, compoundRules);

    if(mappedTxns.length > 0){
      await Promise.all(mappedTxns.map(txn => {
        const filter = { transaction_id: txn.transaction_id, userId };
        const updateObject = { $set: { mappedCategory: txn.mappedCategory } };
        return updateData('Plaid-Transactions', filter, updateObject);
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

router.post('/nukeTransactions', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    if (!requireAdmin(uid, res)) return;
    const result = await deleteRemovedData('Plaid-Transactions', { userId: uid });
    res.json({ deletedCount: result.deletedCount });
  } catch (error) {
    console.error('/nukeTransactions error:', error);
    res.status(500).json({ message: 'Failed to delete transactions' });
  }
});

router.post('/clearManualOverrides', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    if (!requireAdmin(uid, res)) return;
    const result = await updateManyData('Plaid-Transactions', { userId: uid, manually_set: true }, { $unset: { manually_set: '' } });
    res.json({ clearedCount: result.modifiedCount });
  } catch (error) {
    console.error('/clearManualOverrides error:', error);
    res.status(500).json({ message: 'Failed to clear manual overrides' });
  }
});

router.post('/nukeAllData', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    if (!requireAdmin(uid, res)) return;
    const [txnResult, catResult, accResult] = await Promise.all([
      deleteRemovedData('Plaid-Transactions', { userId: uid }),
      deleteRemovedData('Basil-Categories', { userId: uid }),
      deleteRemovedData('Plaid-Accounts', { userId: uid }),
    ]);
    res.json({
      transactions: txnResult.deletedCount,
      categories: catResult.deletedCount,
      accounts: accResult.deletedCount,
    });
  } catch (error) {
    console.error('/nukeAllData error:', error);
    res.status(500).json({ message: 'Failed to delete user data' });
  }
});

const SYNTHETIC_TRANSACTIONS = [
  { name: 'Whole Foods Market',    merchant_name: 'Whole Foods Market',    amount:    87.43, personal_finance_category: { primary: 'FOOD_AND_DRINK' } },
  { name: 'Starbucks',             merchant_name: 'Starbucks',             amount:     6.50, personal_finance_category: { primary: 'FOOD_AND_DRINK' } },
  { name: 'Chipotle Mexican Grill',merchant_name: 'Chipotle Mexican Grill',amount:    12.75, personal_finance_category: { primary: 'FOOD_AND_DRINK' } },
  { name: 'Shell',                 merchant_name: 'Shell',                 amount:    45.00, personal_finance_category: { primary: 'TRANSPORTATION' } },
  { name: 'Uber',                  merchant_name: 'Uber',                  amount:    18.50, personal_finance_category: { primary: 'TRANSPORTATION' } },
  { name: 'Amazon.com',            merchant_name: 'Amazon',                amount:    34.99, personal_finance_category: { primary: 'GENERAL_MERCHANDISE' } },
  { name: 'Target',                merchant_name: 'Target',                amount:    67.23, personal_finance_category: { primary: 'GENERAL_MERCHANDISE' } },
  { name: 'Netflix',               merchant_name: 'Netflix',               amount:    15.99, personal_finance_category: { primary: 'ENTERTAINMENT' } },
  { name: 'AT&T',                  merchant_name: 'AT&T',                  amount:    89.00, personal_finance_category: { primary: 'RENT_AND_UTILITIES' } },
  { name: 'CVS Pharmacy',          merchant_name: 'CVS',                   amount:    23.47, personal_finance_category: { primary: 'PERSONAL_CARE' } },
  { name: 'Planet Fitness',        merchant_name: 'Planet Fitness',        amount:    24.99, personal_finance_category: { primary: 'PERSONAL_CARE' } },
  { name: 'Direct Deposit',        merchant_name: null,                    amount: -2500.00, personal_finance_category: { primary: 'INCOME' } },
  { name: 'Transfer to Savings',   merchant_name: null,                    amount:   500.00, personal_finance_category: { primary: 'TRANSFER_OUT' } },
  { name: 'Vanguard Contribution', merchant_name: 'Vanguard',              amount:   250.00, personal_finance_category: { primary: 'TRANSFER_OUT' } },
];

router.post('/addVenmoTransactions', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    if (!requireAdmin(uid, res)) return;

    const ts = Date.now();
    const categories = await findUserData('Basil-Categories', uid);
    const ruleList = await getMappingRuleList(categories);

    // Resolve real category names from the user's data so historical seeding works
    const foodCat = categories.find(c => /food|dining|restaurant/i.test(c.category))?.category
      || categories.find(c => c.type === 'expense' && c.category !== 'To Sort')?.category
      || 'Food & Dining';
    const housingCat = categories.find(c => /hous|rent|home/i.test(c.category))?.category || foodCat;

    const today = new Date(ts).toISOString().slice(0, 10);
    const daysBack = (n) => new Date(ts - n * 86400000).toISOString().slice(0, 10);

    const txns = [
      // Historical (categorized) — seeds the suggestion engine
      // Small amounts: food/social split territory → foodCat
      { name: 'Venmo', merchant_name: 'Venmo', amount:  14.50, mappedCategory: foodCat,    date: daysBack(38) },
      { name: 'Venmo', merchant_name: 'Venmo', amount:  18.25, mappedCategory: foodCat,    date: daysBack(44) },
      { name: 'Venmo', merchant_name: 'Venmo', amount:  21.00, mappedCategory: foodCat,    date: daysBack(52) },
      // Large amounts: rent territory → housingCat
      { name: 'Venmo', merchant_name: 'Venmo', amount: 825.00, mappedCategory: housingCat, date: daysBack(68) },
      { name: 'Venmo', merchant_name: 'Venmo', amount: 825.00, mappedCategory: housingCat, date: daysBack(98) },
      // Current month — To Sort, for triage + suggestion testing
      // These should receive suggestions based on the history above:
      { name: 'Venmo',    merchant_name: 'Venmo',    amount:  16.00, date: today }, // → suggest foodCat (bucket sm, 3 matches)
      { name: 'Venmo',    merchant_name: 'Venmo',    amount:  19.50, date: today }, // → suggest foodCat (bucket sm, 3 matches)
      { name: 'Venmo',    merchant_name: 'Venmo',    amount: 825.00, date: today }, // → suggest housingCat (bucket xl, 2 matches)
      { name: 'Venmo',    merchant_name: 'Venmo',    amount:  55.00, date: today }, // → merchant-only fallback (no bucket match)
      { name: 'Cash App', merchant_name: 'Cash App', amount:  30.00, date: today }, // → no history, no suggestion
    ].map((t, i) => ({
      ...t,
      transaction_id: `synthetic-venmo-${ts}-${i}`,
      pending: false,
      userId: uid,
      personal_finance_category: { primary: 'TRANSFER_IN_ACCOUNT_TRANSFER' },
    }));

    const mapped = await mapTransactions(txns, ruleList);
    await insertData('Plaid-Transactions', mapped);
    res.json({ inserted: mapped.length, foodCat, housingCat });
  } catch (error) {
    console.error('/addVenmoTransactions error:', error);
    res.status(500).json({ message: 'Failed to add Venmo test transactions' });
  }
});

router.post('/addTestTransactions', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    if (!requireAdmin(uid, res)) return;
    const today = new Date().toISOString().slice(0, 10);
    const ts = Date.now();
    const categories = await findUserData('Basil-Categories', uid);
    const ruleList = await getMappingRuleList(categories);
    const txns = SYNTHETIC_TRANSACTIONS.map((t, i) => ({
      ...t,
      transaction_id: `synthetic-${ts}-${i}`,
      date: today,
      pending: false,
      userId: uid,
    }));
    const mapped = await mapTransactions(txns, ruleList);
    await insertData('Plaid-Transactions', mapped);
    res.json({ inserted: mapped.length });
  } catch (error) {
    console.error('/addTestTransactions error:', error);
    res.status(500).json({ message: 'Failed to add test transactions' });
  }
});

router.post('/deleteCategory', async (req, res) => {
  let uid;
  try {
    const decodedToken = await validateIdToken(req);
    uid = decodedToken.uid;
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    const { categoryId } = req.body;
    if (!ObjectID.isValid(categoryId)) return res.status(400).json({ message: 'Invalid categoryId' });
    await deleteRemovedData('Basil-Categories', { _id: new ObjectID(categoryId), userId: uid });
    res.json({ ok: true });
  } catch (error) {
    console.error('/deleteCategory error:', error);
    res.status(500).json({ message: 'Failed to delete category' });
  }
});

router.post('/updateBudgetLimit', async (req, res) => {
  let uid;
  try {
    const decodedToken = await validateIdToken(req);
    uid = decodedToken.uid;
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    const { categoryId, monthly_limit } = req.body;
    if (!ObjectID.isValid(categoryId)) return res.status(400).json({ message: 'Invalid categoryId' });
    await updateData('Basil-Categories',
      { _id: new ObjectID(categoryId), userId: uid },
      { $set: { monthly_limit: Number(monthly_limit) } }
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('/updateBudgetLimit error:', error);
    res.status(500).json({ message: 'Failed to update budget limit' });
  }
});

module.exports = router;