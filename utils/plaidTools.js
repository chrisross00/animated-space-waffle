const { forEnv } = require('./plaidClient');
const { findUserData, updateData, insertData, deleteRemovedData, findUserRules } = require('../db/database');
const { getMappingRuleList, mapTransactions } = require('./categoryMapping');

async function getAccountData (uid) {
  const userId = uid.toString();
  const response = [];
  // Look at the plaid-transactions collection and get the most recent 'next_cursor'
  try {
    const currentAccounts = await findUserData('Plaid-Accounts', userId);
    if (!currentAccounts?.length || !currentAccounts[0].Accounts) return response;
    for (const account in currentAccounts[0].Accounts) { // `currentAccounts[0].Accounts` has what we need
      if (Object.hasOwnProperty.call(currentAccounts[0].Accounts, account)) { 
        const element = currentAccounts[0].Accounts[account];
        response.push({'token': element.token, 'next_cursor': element.next_cursor, 'account': account, 'plaidEnv': element.plaidEnv || 'production'})
      }
    }
  } catch (error) {
    console.log(error)
  }
    return response;
}
  
  async function getPlaidCategories() {
    try {
      const response = await forEnv('sandbox').categoriesGet({});
      const categories = response.data.categories;
      return categories
    } catch (error) {
      console.log('getPlaidCategories error:', error)
    }
  }

async function plaidTransactionsSync (access_token, cursor=null, uid, plaidEnv='production'){
  const userId = uid.toString();
  try {
    const client = forEnv(plaidEnv);
    const response = await client.transactionsSync({
      access_token,
      cursor,
    })
    const data = response.data;
    // console.log( '   plaidTransactionsSync internal: data = \n', data)
    
    // apply userId to each transaction in response.data
    const newTxns = data.added.map(txn => ({ ...txn, userId }));
    data.added = newTxns

    if (data.added.length === 0 && data.modified.length === 0 && data.removed.length === 0) {
      console.log(newTxns, "\nplaidTransactionsSync(): All transactions up to date for this account")
      let data = "All transactions up to date for this account"
      return data;
    } else {
      console.log(newTxns, "\nplaidTransactionsSync(): new Transactions and userId mapped")
        return data;
    }
    } 
  catch (err) {
      const plaidError = err?.response?.data;
      if (plaidError?.error_type === 'ITEM_ERROR') {
        return { itemError: true, error_code: plaidError.error_code, error_message: plaidError.error_message };
      }
      console.error('plaidTransactionsSync error:', plaidError || err.message);
    }
}

async function getNewPlaidTransactions(uid) {
  const userId = uid? uid : null;
  const itemErrors = {};
  try {
    console.log('     /getnew: checking for new transactions for userId...', userId);
    const responses = await getAccountData(userId);
    console.log(`accounts received for userId: ${userId} \n, ${responses}`);
    const updatedResponses = [];

    for (const response of responses) {
      let token = response.token;
      let next_cursor = response.next_cursor;
      let hasMore = true;
        const updatedTxns = [];

        while (hasMore) {
          const newTxns = await plaidTransactionsSync(token, next_cursor, userId, response.plaidEnv);

          // Item error — persist on the account doc, skip this institution
          if (newTxns?.itemError) {
            const errorData = { error_code: newTxns.error_code, error_message: newTxns.error_message, detectedAt: new Date() };
            await updateData('Plaid-Accounts', { userId },
              { $set: { [`Accounts.${response.account}.itemError`]: errorData } });
            itemErrors[response.account] = errorData;
            hasMore = false;
            break;
          }

          if (typeof newTxns === 'string' || !newTxns) {
            hasMore = false;
            response.newTxns = false;
            break;
          }

          // Successful sync — clear any previous item error
          await updateData('Plaid-Accounts', { userId },
            { $unset: { [`Accounts.${response.account}.itemError`]: '' } });

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
          await updatePlaidAccounts(response, userId);
        }
      }
      console.log('getting user data.... userId = ', userId);
      const categories = await findUserData('Basil-Categories', userId);
    const ruleList = await getMappingRuleList(categories);
    const compoundRules = await findUserRules(userId);
    const addedTxns = updatedResponses.flatMap(r => (r.added || []).map(t => ({ ...t, account: r.account })));
    const mappedTxns = await mapTransactions(addedTxns, ruleList, compoundRules);

    if (mappedTxns.length > 0) {
      await insertData('Plaid-Transactions', mappedTxns);
    }

    // Handle modified transactions — update mutable fields without touching mappedCategory
    const modifiedTxns = updatedResponses.flatMap(r => r.modified || []);
    for (const txn of modifiedTxns) {
      await updateData('Plaid-Transactions',
        { transaction_id: txn.transaction_id, userId },
        { $set: {
          amount: txn.amount,
          date: txn.date,
          name: txn.name,
          merchant_name: txn.merchant_name,
          pending: txn.pending,
          category: txn.category,
          personal_finance_category: txn.personal_finance_category,
        }}
      );
    }

    let filter = { $or: [] };
    updatedResponses.forEach((block) => {
      if (block.removed && block.removed.length > 0) {
        block.removed.forEach(r => {
          filter.$or.push({ transaction_id: r.transaction_id, userId });
        });
      }
    });

    if (filter.$or.length > 0) {
      const deletedPendingResponse = await deleteRemovedData('Plaid-Transactions', filter);
      console.log('deletedPendingResponse', deletedPendingResponse);
    }

    console.log('/getnew: done checking for new Plaid transactions...');
    return { errors: Object.keys(itemErrors).length ? itemErrors : null };
  } catch (err) {
      console.log('error in /getnew', err);
      return { errors: Object.keys(itemErrors).length ? itemErrors : null };
  }
}

async function updatePlaidAccounts(response, userId){
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

async function fetchAndStoreBalances(uid) {
  const userId = uid.toString();
  const currentAccounts = await findUserData('Plaid-Accounts', userId);
  if (!currentAccounts?.length || !currentAccounts[0].Accounts) return {};

  const accountsObj = currentAccounts[0].Accounts;
  const results = {};
  const balanceErrors = {};

  for (const institution of Object.keys(accountsObj)) {
    const { token } = accountsObj[institution];
    if (!token) continue;
    try {
      const plaidEnv = accountsObj[institution].plaidEnv || 'production';
      const client = forEnv(plaidEnv);
      const response = await client.accountsBalanceGet({ access_token: token });
      const fetchedAt = Date.now();
      const balances = response.data.accounts.map(acct => ({
        account_id: acct.account_id,
        name: acct.name,
        official_name: acct.official_name,
        mask: acct.mask,
        type: acct.type,
        subtype: acct.subtype,
        current: acct.balances.current,
        available: acct.balances.available,
        limit: acct.balances.limit,
        fetchedAt,
      }));

      // Compute institution net for snapshot dedup
      const institutionNet = balances.reduce((sum, acct) => {
        const isLiability = acct.type === 'credit' || acct.type === 'loan';
        const bal = isLiability ? (acct.current ?? 0) : (acct.available ?? acct.current ?? 0);
        if (isLiability) return sum - Math.abs(bal);
        return sum + bal;
      }, 0);

      // One snapshot per calendar day (even if value unchanged — keeps the graph continuous)
      const existingSnapshots = accountsObj[institution].balanceSnapshots || [];
      const lastSnapshot = existingSnapshots[existingSnapshots.length - 1];
      const today = new Date().toISOString().slice(0, 10);
      const shouldSnapshot = !lastSnapshot || lastSnapshot.date !== today;

      const update = { $set: { [`Accounts.${institution}.balances`]: balances } };
      if (shouldSnapshot) {
        update.$push = {
          [`Accounts.${institution}.balanceSnapshots`]: {
            date: new Date().toISOString().slice(0, 10),
            net: Math.round(institutionNet * 100) / 100,
            fetchedAt,
          },
        };
      }

      await updateData('Plaid-Accounts', { userId }, update);

      results[institution] = balances;
    } catch (error) {
      const plaidError = error?.response?.data;
      if (plaidError?.error_type === 'ITEM_ERROR') {
        const errorData = { error_code: plaidError.error_code, error_message: plaidError.error_message, detectedAt: new Date() };
        await updateData('Plaid-Accounts', { userId },
          { $set: { [`Accounts.${institution}.itemError`]: errorData } });
        balanceErrors[institution] = errorData;
      } else {
        console.error(`fetchAndStoreBalances error for ${institution}:`, error.message);
      }
      // Return cached balances if available
      if (accountsObj[institution].balances) {
        results[institution] = accountsObj[institution].balances;
      }
    }
  }

  return { balances: results, errors: Object.keys(balanceErrors).length ? balanceErrors : null };
}

async function getCachedBalances(uid) {
  const userId = uid.toString();
  const currentAccounts = await findUserData('Plaid-Accounts', userId);
  if (!currentAccounts?.length || !currentAccounts[0].Accounts) return {};

  const accountsObj = currentAccounts[0].Accounts;
  const results = {};
  for (const institution of Object.keys(accountsObj)) {
    if (accountsObj[institution].balances) {
      results[institution] = accountsObj[institution].balances;
    }
  }
  return results;
}

module.exports = {
  plaidTransactionsSync,
  getAccountData,
  getNewPlaidTransactions,
  getPlaidCategories,
  fetchAndStoreBalances,
  getCachedBalances,
}