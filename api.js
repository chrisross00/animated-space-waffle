// This was effectively the API / router for backend stuff
const express = require("express");
const bodyParser = require('body-parser')
const router = express.Router();
const { findUser, insertUser, updateUser, findAllUsers, findCategories, insertCategory, insertCategories, updateCategory, deleteCategory, removePfcFromOtherCategories, removePfcFromAllCategories, addSimpleRule, removeSimpleRule, removeSimpleRuleFromAll, findUserRules, insertRule, updateCompoundRule, deleteCompoundRule, findTransactionsByMonth, findTransactionsPaginated, insertTransactions, updateTransaction, updateTransactionsBulk, updateTransactionsByMerchant, updateTransactionsByName, sweepTransactionsByConditions, renameTransactionCategory, deleteTransactions, findUnmappedTransactions, cleanPendingTransactions, deduplicateTransactions, clearManualOverrides, clearVenmoEnrichment, findPlaidItems, deleteAllPlaidItems, findPlaidItemByInstitution, insertPlaidItem, findMerchantsWithStats, findDistinctMerchants, findHistoricalCategoryMap, nukeAllUserData, deleteBalanceSnapshots, upsertBalanceSnapshot, getPool, findTags, insertTag, deleteTag, tagTransactions, untagTransactions, findTagSummary, findTagCategoryBreakdown, findTagTransactions, insertSplitChildren, deleteSplitChildren, findSplitChildren, TXN_COLUMNS } = require('./db/database');
const { getNewPlaidTransactions, fetchAndStoreBalances, getCachedBalances } = require('./utils/plaidTools');
const { getMappingRuleList, mapTransactions } = require('./utils/categoryMapping');
const {validateIdToken, rejectTestUser} = require('./utils/authentication');
const path = require('path');
const { rateLimit } = require('express-rate-limit');

// Tighter per-endpoint limiter for expensive Plaid sync operations
const plaidSyncLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 10 });

// Admin check: looks up isAdmin flag on the user's Basil-Users document.
// No env vars needed — set isAdmin: true on your user doc in MongoDB once.
async function requireAdmin(uid, res) {
  const users = await findUser(uid);
  if (!users.length || !users[0].isAdmin) {
    res.status(403).json({ message: 'Forbidden' });
    return false;
  }
  return true;
}

// Resolves the target user for admin routes. Defaults to the authenticated
// user's own UID. If targetUserId is provided, requires admin privileges.
async function resolveTargetUser(req, res) {
  const decodedToken = await validateIdToken(req);
  const uid = decodedToken.uid;
  const targetUserId = req.body?.targetUserId || req.query?.targetUserId || uid;
  if (targetUserId !== uid) {
    if (!(await requireAdmin(uid, res))) return null;
  }
  return targetUserId;
}

function isStr(val, max = 500) {
  return typeof val === 'string' && val.trim().length > 0 && val.length <= max;
}

router.use(bodyParser.json({ limit: '1mb' }));

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'))
});


router.post('/dedupe', async (req,res) => {
  try {
    const userId = await resolveTargetUser(req, res);
    if (!userId) return;
    await deduplicateTransactions(userId);
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
    const categories = await findCategories(userId);
    res.send(categories)
    
  } catch (error) {
    console.error('getcategories error:', error);
    res.status(500).send('Error fetching categories');
  }
})

const { DEFAULT_CATEGORIES } = require('./utils/defaultCategories');

router.get('/seedcategories', async (req, res) => {
  try {
    const userId = await resolveTargetUser(req, res);
    if (!userId) return;
    const existing = await findCategories(userId);
    if (existing.length > 0) {
      // Categories already exist — still ensure onboarded_at is stamped
      await updateUser(userId, { onboarded_at: new Date() });
      return res.send(`User already has ${existing.length} categories. Skipping.`);
    }
    const toInsert = DEFAULT_CATEGORIES.map(cat => ({
      ...cat,
      annual_spend: '',
      rules: {},
      showOnBudgetPage: true,
      isDefault: true,
      userId,
    }));
    await insertCategories(toInsert);
    await updateUser(userId, { onboarded_at: new Date() });
    res.send(`Seeded ${toInsert.length} categories.`);
  } catch (error) {
    res.status(500).send('Error seeding categories: ' + error);
  }
});

router.get('/addplaidpfc', async (req, res) => {
  try {
    const userId = await resolveTargetUser(req, res);
    if (!userId) return;
    const categories = await findCategories(userId);
    const pfcByName = Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.category, c.plaid_pfc]));
    let updated = 0;
    for (const cat of categories) {
      if (!cat.plaid_pfc && pfcByName[cat.category] !== undefined) {
        await updateCategory(cat._id, userId, { plaid_pfc: pfcByName[cat.category] });
        updated++;
      }
    }
    res.send(`Added PFC mappings to ${updated} categories.`);
  } catch (error) {
    res.status(500).send('Error adding PFC mappings: ' + error);
  }
});

// ---- Data layer v2: separate sync from read ----
// POST /api/sync — trigger Plaid transaction sync (expensive, rate-limited)
// Does NOT return transactions — just a summary of what changed.
router.post('/sync', plaidSyncLimiter, async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const userId = decodedToken.uid;
    // No rejectTestUser guard — sandbox items are safe to sync
    const syncResult = await getNewPlaidTransactions(userId);
    // Also refresh balances + snapshot in the same sync
    const balanceResult = await fetchAndStoreBalances(userId);
    const items = await findPlaidItems(userId);
    const allSnapshots = [];
    const itemErrors = {};
    for (const item of items) {
      for (const snap of (item.balanceSnapshots || [])) {
        allSnapshots.push(snap);
      }
      if (item.itemError) itemErrors[item.institution] = item.itemError;
    }
    const balanceSnapshots = aggregateSnapshots(allSnapshots);
    await updateUser(userId, { lastSyncedAt: new Date() });
    res.json({
      syncedAt: new Date().toISOString(),
      balances: balanceResult.balances,
      balanceSnapshots,
      itemErrors: Object.keys(itemErrors).length ? itemErrors : null,
    });
  } catch (error) {
    console.error('/sync error:', error.message);
    res.status(500).json({ message: 'Sync failed' });
  }
});

// POST /api/sync/balances — trigger Plaid balance refresh (separate from transaction sync)
router.post('/sync/balances', plaidSyncLimiter, async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    // No rejectTestUser guard — sandbox items are safe to sync
    const balanceResult = await fetchAndStoreBalances(uid);
    // Read back snapshots for the chart
    const items = await findPlaidItems(uid);
    const allSnapshots = [];
    for (const item of items) {
      for (const snap of (item.balanceSnapshots || [])) {
        allSnapshots.push(snap);
      }
    }
    const balanceSnapshots = aggregateSnapshots(allSnapshots);
    await updateUser(uid, { lastSyncedAt: new Date() });
    res.json({ balances: balanceResult.balances, balanceSnapshots });
  } catch (error) {
    console.error('/sync/balances error:', error.message);
    res.status(500).json({ message: 'Failed to refresh balances' });
  }
});

// GET /api/transactions — read from MongoDB (cheap, no Plaid call)
// Query params: ?month=2026-03 OR ?page=1&limit=100&search=coffee
router.get('/transactions', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const userId = decodedToken.uid;
    const { month, page, limit, search } = req.query;

    if (month) {
      // Month-based fetch (primary use case)
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ message: 'month must be YYYY-MM format' });
      }
      const transactions = await findTransactionsByMonth(userId, month);
      return res.json({ transactions, total: transactions.length });
    }

    // Paginated fetch (for table view / search)
    const result = await findTransactionsPaginated(userId, {
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 100, 500),
      search: search || undefined,
    });
    res.json(result);
  } catch (error) {
    console.error('/transactions error:', error.message);
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

// GET /api/historicalCategoryMap — lightweight merchant→category mapping
// Powers the suggestion engine without loading 12 months of full transactions.
router.get('/historicalCategoryMap', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const map = await findHistoricalCategoryMap(decodedToken.uid);
    res.json(map);
  } catch (error) {
    console.error('/historicalCategoryMap error:', error.message);
    res.status(500).json({ message: 'Failed to fetch historical category map' });
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
    return res.status(401).json({ message: 'Unauthorized' });
  }
});

router.get('/cleanPendingTransactions', async (req, res) => {
  try {
    const userId = await resolveTargetUser(req, res);
    if (!userId) return;
    const result = await cleanPendingTransactions(userId);
    res.send(result);
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
    if (!req.body._id) return res.status(400).json({ message: 'Invalid category id' });
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
      fixedBEResponse: !!req.body.fixed,
    }
    // Remove each selected PFC value from any other category so it only maps to one place
    if (plaid_pfc.length > 0) {
      await removePfcFromOtherCategories(uid, req.body._id, plaid_pfc);
    }
    await updateCategory(req.body._id, uid, {
      monthly_limit: req.body.monthly_limit,
      plaid_pfc,
      category: req.body.categoryName,
      fixed: !!req.body.fixed,
    });
    // If the name changed, rename mappedCategory on all matching transactions
    if (req.body.categoryName !== req.body.originalCategoryName) {
      await renameTransactionCategory(uid, req.body.originalCategoryName, req.body.categoryName);
    }
  }

  // Update transaction in database
  if (updateType === 'transaction') {
    if (!isStr(req.body.transaction_id)) return res.status(400).json({ message: 'Invalid transaction_id' });
    if (!isStr(req.body.mappedCategory, 200)) return res.status(400).json({ message: 'Invalid mappedCategory' });
    if (req.body.note && typeof req.body.note === 'string' && req.body.note.length > 1000) {
      return res.status(400).json({ message: 'Note exceeds maximum length' });
    }
    const manualCategoryChange = req.body.mappedCategory !== req.body.originalCategoryName;
    const shouldPin = !req.body.ruleMode && manualCategoryChange;
    // effectiveDate: user-controlled date override for budget month bucketing
    const effectiveDate = req.body.effectiveDate || null;
    d = {
      mappedCategory: req.body.mappedCategory,
      date: req.body.date,
      transaction_id: req.body.transaction_id,
      originalCategoryName: req.body.originalCategoryName,
      note: req.body.note ? req.body.note : '',
      excludeFromTotal: req.body.excludeFromTotal? req.body.excludeFromTotal : false,
      effectiveDate,
      ...(shouldPin && { manually_set: true }),
    }
    const fields = {
      mappedCategory: req.body.mappedCategory,
      date: req.body.date,
      note: req.body.note,
      excludeFromTotal: req.body.excludeFromTotal,
      ...(shouldPin && { manually_set: true }),
      effectiveDate: effectiveDate || null,
    };
    await updateTransaction(uid, req.body.transaction_id, fields);

    // Auto-learn: if user opted in, save rule and re-categorize all matching transactions
    const categoryChanged = req.body.mappedCategory && req.body.originalCategoryName &&
                            req.body.mappedCategory !== req.body.originalCategoryName;
    const notToSort = req.body.mappedCategory !== 'To Sort';
    if (categoryChanged && notToSort && req.body.createRule) {
      const cats = await findCategories(uid);
      const targetCat = cats.find(c => c.category === req.body.mappedCategory);
      if (req.body.merchantName) {
        // Clear this merchant_name from all categories so the rule only lives in one place
        await removeSimpleRuleFromAll(uid, 'merchant_name', req.body.merchantName);
        // Also clear any stale name rule for this specific transaction — name rules are higher
        // priority than merchant_name rules, so a leftover name rule would override this one
        if (req.body.name) {
          await removeSimpleRuleFromAll(uid, 'name', req.body.name);
        }
        if (targetCat) await addSimpleRule(targetCat._id, uid, 'merchant_name', req.body.merchantName);
        // Move matching transactions, skipping any the user has manually categorized
        await updateTransactionsByMerchant(uid, req.body.merchantName, { mappedCategory: req.body.mappedCategory });
        console.log(`Auto-learn: set merchant_name "${req.body.merchantName}" -> "${req.body.mappedCategory}"`);
      } else if (req.body.name) {
        // Clear this name from all categories so the rule only lives in one place
        await removeSimpleRuleFromAll(uid, 'name', req.body.name);
        if (targetCat) await addSimpleRule(targetCat._id, uid, 'name', req.body.name);
        // Move matching transactions, skipping any the user has manually categorized
        await updateTransactionsByName(uid, req.body.name, { mappedCategory: req.body.mappedCategory });
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
      await removePfcFromAllCategories(uid, plaid_pfc);
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

    const inserted = await insertCategory({ ...update, userId: uid });
    d._id = inserted._id;
    const categoriesWithAdded = await findCategories(uid);
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
    if (!categoryId) return res.status(400).json({ message: 'Invalid categoryId' });
    if (!isStr(categoryName, 200)) return res.status(400).json({ message: 'Invalid categoryName' });
    if (!isStr(ruleValue, 500)) return res.status(400).json({ message: 'Invalid ruleValue' });
    // Clear this rule value from any other category so it only lives in one place
    await removeSimpleRuleFromAll(uid, ruleType, ruleValue);
    // Add to the target category
    await addSimpleRule(categoryId, uid, ruleType, ruleValue);
    // Re-categorize matching transactions, skipping any the user has manually categorized
    if (ruleType === 'merchant_name') {
      await updateTransactionsByMerchant(uid, ruleValue, { mappedCategory: categoryName });
    } else {
      await updateTransactionsByName(uid, ruleValue, { mappedCategory: categoryName });
    }
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
    await removeSimpleRule(categoryId, uid, ruleType, ruleValue);
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
  const fields = { mappedCategory: action.categoryName };
  if (action.note) fields.note = action.note;
  return sweepTransactionsByConditions(uid, conditions, fields);
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

    const rule = { userId: uid, label, conditions, action, createdAt: new Date(), createdFrom: createdFrom || 'manual' };
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

// --- Transaction relationship routes ---

router.post('/linkTransactions', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transactionId, partnerId, type, signals, effectiveDate, recategorize } = req.body;

    if (!isStr(transactionId, 100) || !isStr(partnerId, 100)) {
      return res.status(400).json({ message: 'transactionId and partnerId are required' });
    }
    if (type !== 'split' && type !== 'return') {
      return res.status(400).json({ message: 'type must be "split" or "return"' });
    }

    const now = new Date().toISOString();
    const linkData = { type, confirmedAt: now };
    if (signals) linkData.signals = signals;

    // Link both transactions to each other
    await updateTransaction(uid, transactionId, {
      linkedTransaction: { transaction_id: partnerId, ...linkData },
    });
    const partnerFields = {
      linkedTransaction: { transaction_id: transactionId, ...linkData },
    };
    // Optionally set effectiveDate on the secondary transaction to align budget months
    if (effectiveDate) {
      partnerFields.effectiveDate = effectiveDate;
    }
    // Optionally recategorize the secondary transaction (when it was "To Sort")
    if (recategorize) {
      partnerFields.mappedCategory = recategorize;
    }
    await updateTransaction(uid, partnerId, partnerFields);

    res.json({ linked: true, transactionId, partnerId, type, effectiveDate: effectiveDate || null, recategorize: recategorize || null });
  } catch (error) {
    console.error('/linkTransactions error:', error.message);
    res.status(500).json({ message: 'Failed to link transactions' });
  }
});

router.post('/unlinkTransactions', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transactionId, partnerId, revertCategory } = req.body;

    if (!isStr(transactionId, 100) || !isStr(partnerId, 100)) {
      return res.status(400).json({ message: 'transactionId and partnerId are required' });
    }

    await updateTransaction(uid, transactionId, { linkedTransaction: null, effectiveDate: null });
    const partnerFields = { linkedTransaction: null, effectiveDate: null };
    // Revert category if it was auto-recategorized on link
    if (revertCategory) {
      partnerFields.mappedCategory = revertCategory;
    }
    await updateTransaction(uid, partnerId, partnerFields);

    res.json({ unlinked: true, transactionId, partnerId });
  } catch (error) {
    console.error('/unlinkTransactions error:', error.message);
    res.status(500).json({ message: 'Failed to unlink transactions' });
  }
});

router.post('/undoDismissRelationship', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transactionId, partnerId } = req.body;

    if (!isStr(transactionId, 100)) {
      return res.status(400).json({ message: 'transactionId is required' });
    }

    await updateTransaction(uid, transactionId, { dismissedRelationship: null });
    if (partnerId) {
      await updateTransaction(uid, partnerId, { dismissedRelationship: null });
    }

    res.json({ undone: true, transactionId, partnerId });
  } catch (error) {
    console.error('/undoDismissRelationship error:', error.message);
    res.status(500).json({ message: 'Failed to undo dismiss' });
  }
});

router.post('/dismissRelationship', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transactionId, partnerId } = req.body;

    if (!isStr(transactionId, 100)) {
      return res.status(400).json({ message: 'transactionId is required' });
    }

    const now = new Date().toISOString();
    await updateTransaction(uid, transactionId, { dismissedRelationship: now });
    if (partnerId) {
      await updateTransaction(uid, partnerId, { dismissedRelationship: now });
    }

    res.json({ dismissed: true, transactionId, partnerId });
  } catch (error) {
    console.error('/dismissRelationship error:', error.message);
    res.status(500).json({ message: 'Failed to dismiss relationship' });
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
    await updateTransactionsBulk(uid, transaction_ids, { mappedCategory, manually_set: true });
    res.json({ updated: transaction_ids.length, mappedCategory });
  } catch (error) {
    res.status(500).send('Error bulk categorizing transactions');
  }
});

router.get('/mapunmapped', async (req, res) => {
  try {
    const userId = await resolveTargetUser(req, res);
    if (!userId) return;
    const unmappedTransactions = await findUnmappedTransactions(userId);
    const categories = await findCategories(userId);
    const ruleList = await getMappingRuleList(categories);
    const compoundRules = await findUserRules(userId);
    const mappedTxns = await mapTransactions(unmappedTransactions, ruleList, compoundRules);

    if(mappedTxns.length > 0){
      await Promise.all(mappedTxns.map(txn => {
        return updateTransaction(userId, txn.transaction_id, { mappedCategory: txn.mappedCategory });
      }));
    }
    // finish
    res.send(mappedTxns)
    
  } catch (err) {
    console.log(err)
  }
})

async function getOrAddUser(decodedToken) {
  console.log('getOrAddUser function called and starting...:', decodedToken.uid)
  try {
    const user = await findUser(decodedToken.uid);
    if (user.length === 0) {
      const adminUids = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
      const newUser = {
        userId: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture,
        isAdmin: adminUids.includes(decodedToken.uid),
      }
      console.log('User added to database:', newUser)
      await insertUser(newUser);
      const clientSideUser = createClientSideUser(newUser)
      console.log('sending newly created client-side user:', clientSideUser)
      return clientSideUser
    } else {
      console.log('User found:', user[0])
        let items;
        try {
          items = await findPlaidItems(user[0].userId);
        } catch (error) {
          console.log('Error getting user accounts:', error)
        }

      const clientSideUser = createClientSideUser(user[0], items)
      console.log('sending client-side user:', clientSideUser)
      return clientSideUser;
    }
  } catch (error) {
      console.log('getOrAddUser Error:', error)
  }
}

/** Aggregate balance snapshots by date across institutions. */
function aggregateSnapshots(snapshots) {
  if (!snapshots?.length) return null;
  const byDate = {};
  for (const snap of snapshots) {
    if (!byDate[snap.date]) byDate[snap.date] = 0;
    byDate[snap.date] += snap.net;
  }
  const result = Object.entries(byDate)
    .map(([date, net]) => ({ date, net: Math.round(net * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return result.length ? result : null;
}

function createClientSideUser(user, items=null) {
  const hasItems = items && items.length > 0;
  let bankNames = hasItems ? items.map(item => item.institution) : [];
  const manualInstitutions = new Set(hasItems ? items.filter(i => i.manual).map(i => i.institution) : []);
  const itemIdByInstitution = hasItems ? Object.fromEntries(items.map(i => [i.institution, i.id])) : {};

  // Extract cached balance data, snapshots, and item errors per institution
  let accountBalances = null;
  let balanceSnapshots = null;
  let itemErrors = null;
  if (hasItems) {
    accountBalances = {};
    balanceSnapshots = [];
    for (const item of items) {
      if (item.balances) {
        accountBalances[item.institution] = item.balances;
      }
      if (item.balanceSnapshots) {
        for (const snap of item.balanceSnapshots) {
          balanceSnapshots.push(snap);
        }
      }
      if (item.itemError) {
        if (!itemErrors) itemErrors = {};
        itemErrors[item.institution] = item.itemError;
      }
    }
    balanceSnapshots = aggregateSnapshots(balanceSnapshots);
  }

  return {
    email: user.email,
    name: user.name,
    picture: user.picture,
    accounts: bankNames,
    accountBalances,
    manualInstitutions: manualInstitutions.size ? [...manualInstitutions] : null,
    itemIdByInstitution: hasItems ? itemIdByInstitution : null,
    balanceSnapshots: balanceSnapshots?.length ? balanceSnapshots : null,
    itemErrors,
    onboarded_at: user.onboarded_at || null,
    isAdmin: !!user.isAdmin,
    lastSyncedAt: user.lastSyncedAt || null,
  };
}

// Admin-only: list all users for the user picker in ApiDir
router.get('/users', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    if (!(await requireAdmin(decodedToken.uid, res))) return;
    const users = await findAllUsers();
    res.json(users);
  } catch (error) {
    console.error('/users error:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// Shared admin helpers — used by nuke routes below
async function nukeTransactions(uid) {
  return deleteTransactions(uid);
}

router.post('/nukeTransactions', async (req, res) => {
  try {
    const uid = await resolveTargetUser(req, res);
    if (!uid) return;
    const result = await nukeTransactions(uid);
    res.json({ deletedCount: result.deletedCount });
  } catch (error) {
    console.error('/nukeTransactions error:', error);
    res.status(500).json({ message: 'Failed to delete transactions' });
  }
});

router.post('/clearManualOverrides', async (req, res) => {
  try {
    const uid = await resolveTargetUser(req, res);
    if (!uid) return;
    const result = await clearManualOverrides(uid);
    res.json({ clearedCount: result.modifiedCount });
  } catch (error) {
    console.error('/clearManualOverrides error:', error);
    res.status(500).json({ message: 'Failed to clear manual overrides' });
  }
});

router.post('/clearVenmoEnrichment', async (req, res) => {
  try {
    const uid = await resolveTargetUser(req, res);
    if (!uid) return;
    const result = await clearVenmoEnrichment(uid);
    res.json({ clearedCount: result.modifiedCount });
  } catch (error) {
    console.error('/clearVenmoEnrichment error:', error);
    res.status(500).json({ message: 'Failed to clear Venmo enrichment' });
  }
});

router.post('/resetBalanceSnapshots', async (req, res) => {
  try {
    const uid = await resolveTargetUser(req, res);
    if (!uid) return;
    await deleteBalanceSnapshots(uid);
    res.json({ cleared: true });
  } catch (error) {
    console.error('/resetBalanceSnapshots error:', error);
    res.status(500).json({ message: 'Failed to reset snapshots' });
  }
});

router.post('/nukeAllData', async (req, res) => {
  try {
    const uid = await resolveTargetUser(req, res);
    if (!uid) return;
    const result = await nukeAllUserData(uid);
    res.json(result);
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
    const uid = await resolveTargetUser(req, res);
    if (!uid) return;

    const ts = Date.now();
    const categories = await findCategories(uid);
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
    await insertTransactions(mapped);
    res.json({ inserted: mapped.length, foodCat, housingCat });
  } catch (error) {
    console.error('/addVenmoTransactions error:', error);
    res.status(500).json({ message: 'Failed to add Venmo test transactions' });
  }
});

router.post('/addTestTransactions', async (req, res) => {
  try {
    const uid = await resolveTargetUser(req, res);
    if (!uid) return;
    const today = new Date().toISOString().slice(0, 10);
    const ts = Date.now();
    const categories = await findCategories(uid);
    const ruleList = await getMappingRuleList(categories);
    const txns = SYNTHETIC_TRANSACTIONS.map((t, i) => ({
      ...t,
      transaction_id: `synthetic-${ts}-${i}`,
      date: today,
      pending: false,
      userId: uid,
    }));
    const mapped = await mapTransactions(txns, ruleList);
    await insertTransactions(mapped);
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
    if (!categoryId) return res.status(400).json({ message: 'Invalid categoryId' });
    await deleteCategory(categoryId, uid);
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
    if (!categoryId) return res.status(400).json({ message: 'Invalid categoryId' });
    await updateCategory(categoryId, uid, { monthly_limit: Number(monthly_limit) });
    res.json({ ok: true });
  } catch (error) {
    console.error('/updateBudgetLimit error:', error);
    res.status(500).json({ message: 'Failed to update budget limit' });
  }
});

// ---- Manual accounts ----

const crypto = require('crypto');

async function recomputeItemSnapshot(itemId) {
  const pool = getPool();
  const { rows: accounts } = await pool.query(
    `SELECT type, balance FROM plaid_accounts WHERE item_id = $1`,
    [itemId]
  );
  const net = accounts.reduce((sum, a) => {
    const isLiability = a.type === 'credit' || a.type === 'loan';
    return isLiability ? sum - Math.abs(a.balance) : sum + Number(a.balance);
  }, 0);
  const now = new Date();
  await upsertBalanceSnapshot(itemId, {
    date: now.toISOString().slice(0, 10),
    net: Math.round(net * 100) / 100,
    fetchedAt: now,
  });
}

router.post('/manualAccount', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { institution, accountName, accountType, accountSubtype, balance } = req.body;
    if (!institution || !accountName || !accountType || balance == null) {
      return res.status(400).json({ message: 'institution, accountName, accountType, and balance are required' });
    }
    // Check if institution already exists (Plaid-linked or manual)
    let existing = await findPlaidItemByInstitution(uid, institution);
    let itemId;
    if (existing) {
      // Add account under existing institution
      itemId = existing.id;
    } else {
      // Create new manual institution
      const item = await insertPlaidItem({ userId: uid, institution, accessToken: null });
      itemId = item.id;
    }
    // Create plaid_accounts row
    const accountId = crypto.randomUUID();
    const pool = getPool();
    const now = new Date();
    await pool.query(
      `INSERT INTO plaid_accounts (account_id, item_id, user_id, name, type, subtype, balance, balance_fetched_at, manual)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
      [accountId, itemId, uid, accountName, accountType, accountSubtype || null, balance, now]
    );
    await recomputeItemSnapshot(itemId);
    res.json({
      item: { id: itemId, institution, manual: !existing },
      account: { accountId, name: accountName, type: accountType, balance, balanceFetchedAt: now, manual: true },
    });
  } catch (error) {
    console.error('/manualAccount create error:', error);
    res.status(500).json({ message: 'Failed to create manual account' });
  }
});

router.put('/manualAccount/:accountId', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { accountId } = req.params;
    const { balance, accountName } = req.body;
    if (balance == null) {
      return res.status(400).json({ message: 'balance is required' });
    }
    // Verify account belongs to user and is manual
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT account_id, item_id, manual FROM plaid_accounts
       WHERE account_id = $1 AND user_id = $2`,
      [accountId, uid]
    );
    if (!rows.length) return res.status(404).json({ message: 'Account not found' });
    if (!rows[0].manual) {
      return res.status(400).json({ message: 'Cannot manually update a Plaid-linked account' });
    }
    const itemId = rows[0].item_id;
    // Update account balance (and name if provided)
    const now = new Date();
    const setClauses = ['balance = $1', 'balance_fetched_at = $2'];
    const params = [balance, now];
    if (accountName) {
      setClauses.push(`name = $${params.length + 1}`);
      params.push(accountName);
    }
    params.push(accountId);
    await pool.query(
      `UPDATE plaid_accounts SET ${setClauses.join(', ')} WHERE account_id = $${params.length}`,
      params
    );
    await recomputeItemSnapshot(itemId);
    res.json({ ok: true, balance, balanceFetchedAt: now });
  } catch (error) {
    console.error('/manualAccount update error:', error);
    res.status(500).json({ message: 'Failed to update manual account' });
  }
});

router.delete('/manualAccount/:accountId', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { accountId } = req.params;
    const pool = getPool();
    // Verify account belongs to user and is manual
    const { rows } = await pool.query(
      `SELECT pa.account_id, pa.item_id, pa.manual,
              pi.access_token AS "accessToken"
       FROM plaid_accounts pa JOIN plaid_items pi ON pa.item_id = pi.id
       WHERE pa.account_id = $1 AND pa.user_id = $2`,
      [accountId, uid]
    );
    if (!rows.length) return res.status(404).json({ message: 'Account not found' });
    const { item_id: itemId, accessToken } = rows[0];
    if (!rows[0].manual) {
      return res.status(400).json({ message: 'Cannot delete a Plaid-linked account' });
    }
    // Delete the account row
    await pool.query(`DELETE FROM plaid_accounts WHERE account_id = $1`, [accountId]);
    // Check if the item has any remaining accounts
    const { rows: remaining } = await pool.query(
      `SELECT account_id FROM plaid_accounts WHERE item_id = $1`,
      [itemId]
    );
    if (remaining.length === 0 && !accessToken) {
      // Manual-only institution with no accounts left — remove the item entirely
      await pool.query(`DELETE FROM plaid_items WHERE id = $1`, [itemId]);
    } else {
      await recomputeItemSnapshot(itemId);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('/manualAccount delete error:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

// ---- Tags ----

router.get('/tags', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const tags = await findTags(uid);
    res.json(tags);
  } catch (error) {
    console.error('/tags error:', error);
    res.status(500).json({ message: 'Failed to fetch tags' });
  }
});

router.post('/tags', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'name is required' });
    }
    const tag = await insertTag(uid, name.trim());
    res.json(tag);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Tag already exists' });
    }
    console.error('/tags create error:', error);
    res.status(500).json({ message: 'Failed to create tag' });
  }
});

router.post('/deleteTag', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { tagId } = req.body;
    if (!tagId) return res.status(400).json({ message: 'tagId is required' });
    await deleteTag(tagId, uid);
    res.json({ ok: true });
  } catch (error) {
    console.error('/deleteTag error:', error);
    res.status(500).json({ message: 'Failed to delete tag' });
  }
});

router.post('/tagTransactions', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transactionIds, tagIds } = req.body;
    if (!Array.isArray(transactionIds) || !Array.isArray(tagIds)) {
      return res.status(400).json({ message: 'transactionIds and tagIds must be arrays' });
    }
    const tagged = await tagTransactions(uid, transactionIds, tagIds);
    res.json({ tagged });
  } catch (error) {
    console.error('/tagTransactions error:', error);
    res.status(500).json({ message: 'Failed to tag transactions' });
  }
});

router.post('/untagTransactions', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transactionIds, tagIds } = req.body;
    if (!Array.isArray(transactionIds) || !Array.isArray(tagIds)) {
      return res.status(400).json({ message: 'transactionIds and tagIds must be arrays' });
    }
    const untagged = await untagTransactions(uid, transactionIds, tagIds);
    res.json({ untagged });
  } catch (error) {
    console.error('/untagTransactions error:', error);
    res.status(500).json({ message: 'Failed to untag transactions' });
  }
});

router.get('/tags/:id/summary', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const summary = await findTagSummary(req.params.id, uid);
    if (!summary) return res.status(404).json({ message: 'Tag not found' });
    const categoryBreakdown = await findTagCategoryBreakdown(req.params.id, uid);
    res.json({
      tag: { id: summary.id, name: summary.tagName },
      totalSpend: Number(summary.totalSpend),
      transactionCount: Number(summary.transactionCount),
      dateRange: { earliest: summary.earliest, latest: summary.latest },
      categoryBreakdown,
    });
  } catch (error) {
    console.error('/tags/:id/summary error:', error);
    res.status(500).json({ message: 'Failed to fetch tag summary' });
  }
});

router.get('/tags/:id/transactions', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const transactions = await findTagTransactions(req.params.id, uid);
    res.json({ transactions });
  } catch (error) {
    console.error('/tags/:id/transactions error:', error);
    res.status(500).json({ message: 'Failed to fetch tag transactions' });
  }
});

// ---- Venmo CSV enrichment ----

const { parseVenmoCsv, matchVenmoRows } = require('./utils/venmoEnrichment');

router.post('/venmoEnrichment/preview', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { csvText } = req.body;
    if (typeof csvText !== 'string' || csvText.length === 0) {
      return res.status(400).json({ message: 'csvText must be a non-empty string' });
    }
    if (csvText.length > 1024 * 1024) {
      return res.status(400).json({ message: 'CSV file too large (max 1MB)' });
    }
    const venmoRows = parseVenmoCsv(csvText);
    if (venmoRows.length === 0) {
      return res.status(400).json({ message: 'No valid Venmo transactions found in CSV' });
    }
    const txnResult = await findTransactionsPaginated(uid, { page: 1, limit: 10000 });
    const result = matchVenmoRows(venmoRows, txnResult.transactions);
    res.json(result);
  } catch (error) {
    console.error('/venmoEnrichment/preview error:', error.message);
    res.status(500).json({ message: 'Failed to preview Venmo enrichment' });
  }
});

router.post('/venmoEnrichment/apply', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { enrichments } = req.body;
    if (!Array.isArray(enrichments) || enrichments.length === 0) {
      return res.status(400).json({ message: 'enrichments must be a non-empty array' });
    }
    if (enrichments.length > 500) {
      return res.status(400).json({ message: 'Cannot enrich more than 500 transactions at once' });
    }
    let enriched = 0;
    for (const e of enrichments) {
      if (!e.transaction_id || !e.venmo_id) continue;
      await updateTransaction(uid, e.transaction_id, {
        venmo_id: e.venmo_id,
        venmo_note: e.venmo_note || '',
        venmo_counterparty: e.venmo_counterparty || '',
      });
      enriched++;
    }
    res.json({ enriched });
  } catch (error) {
    console.error('/venmoEnrichment/apply error:', error.message);
    res.status(500).json({ message: 'Failed to apply Venmo enrichment' });
  }
});

// ---- Transaction splitting ----

router.post('/split', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transaction_id, splits } = req.body;

    // Validate splits array
    if (!Array.isArray(splits) || splits.length < 2) {
      return res.status(400).json({ message: 'At least 2 splits required' });
    }
    if (splits.length > 20) {
      return res.status(400).json({ message: 'Maximum 20 splits allowed' });
    }

    // Find parent transaction
    const pool = getPool();
    const parentResult = await pool.query(
      `SELECT ${TXN_COLUMNS} FROM transactions WHERE transaction_id = $1 AND user_id = $2`,
      [transaction_id, uid]
    );
    if (parentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    const parent = parentResult.rows[0];

    // Gate checks
    if (parent.pending) {
      return res.status(400).json({ message: 'Cannot split pending transactions' });
    }
    if (parent.amount < 0) {
      return res.status(400).json({ message: 'Cannot split income transactions' });
    }
    if (parent.parentTransactionId) {
      return res.status(400).json({ message: 'Cannot split a split child' });
    }
    if (parent.isSplitParent) {
      return res.status(400).json({ message: 'Transaction is already split. Unsplit first.' });
    }

    // Validate split amounts
    for (const s of splits) {
      if (typeof s.amount !== 'number' || s.amount <= 0) {
        return res.status(400).json({ message: 'All split amounts must be positive numbers' });
      }
      if (!s.categoryName || typeof s.categoryName !== 'string') {
        return res.status(400).json({ message: 'All splits must have a categoryName' });
      }
    }

    const splitSum = splits.reduce((sum, s) => sum + s.amount, 0);
    if (Math.abs(splitSum - parent.amount) > 0.01) {
      return res.status(400).json({
        message: `Split amounts ($${splitSum.toFixed(2)}) must equal transaction amount ($${Number(parent.amount).toFixed(2)})`
      });
    }

    // Validate categories exist
    const categories = await findCategories(uid);
    const categoryNames = new Set(categories.map(c => c.category));
    for (const s of splits) {
      if (!categoryNames.has(s.categoryName)) {
        return res.status(400).json({ message: `Category "${s.categoryName}" not found` });
      }
    }

    // Execute split (parent UPDATE + child INSERTs are wrapped in a DB transaction inside insertSplitChildren)
    const parentFields = {
      userId: uid,
      date: parent.date,
      effectiveDate: parent.effectiveDate,
      account: parent.account,
      accountId: parent.account_id,
      name: parent.name,
      merchantName: parent.merchant_name,
      plaidPfc: parent.plaid_pfc,
      plaidPfcDetail: parent.plaidPfcDetail,
      excludeFromTotal: parent.excludeFromTotal,
    };

    const children = await insertSplitChildren(
      parent.id, parent.transaction_id, parentFields, splits
    );

    // Return updated parent
    const updatedParent = await pool.query(
      `SELECT ${TXN_COLUMNS} FROM transactions WHERE id = $1`,
      [parent.id]
    );

    res.json({ parent: updatedParent.rows[0], children });
  } catch (error) {
    console.error('/split error:', error.message);
    res.status(500).json({ message: 'Failed to split transaction' });
  }
});

router.post('/unsplit', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transaction_id } = req.body;

    // Find the transaction (could be parent or child)
    const pool = getPool();
    const txnResult = await pool.query(
      `SELECT ${TXN_COLUMNS} FROM transactions WHERE transaction_id = $1 AND user_id = $2`,
      [transaction_id, uid]
    );
    if (txnResult.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const txn = txnResult.rows[0];

    // Resolve to parent (ownership already verified by user_id in initial query)
    let parentId;
    if (txn.isSplitParent) {
      parentId = txn.id;
    } else if (txn.parentTransactionId) {
      // Verify the parent also belongs to this user
      const parentCheck = await pool.query(
        'SELECT id, user_id FROM transactions WHERE id = $1',
        [txn.parentTransactionId]
      );
      if (!parentCheck.rows[0] || parentCheck.rows[0].user_id !== uid) {
        return res.status(403).json({ message: 'Not authorized' });
      }
      parentId = txn.parentTransactionId;
    } else {
      return res.status(400).json({ message: 'Transaction is not split' });
    }

    // Get children before deleting (for undo data in response)
    const children = await findSplitChildren(parentId);

    // Delete children and unflag parent
    const parent = await deleteSplitChildren(parentId);

    res.json({ parent, previousSplits: children });
  } catch (error) {
    console.error('/unsplit error:', error.message);
    res.status(500).json({ message: 'Failed to unsplit transaction' });
  }
});

module.exports = router;