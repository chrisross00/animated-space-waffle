const { forEnv } = require('./plaidClient');
const { findPlaidItems, findCategories, updatePlaidItem, updatePlaidItemByToken, insertTransactions, updateTransaction, deleteTransactionsByIds, findUserRules, upsertPlaidAccounts, updatePlaidAccountBalances, upsertBalanceSnapshot } = require('../db/database');
const { getMappingRuleList, mapTransactions } = require('./categoryMapping');

async function getAccountData(uid) {
  const userId = uid.toString();
  try {
    const items = await findPlaidItems(userId);
    return items.map(item => ({
      token: item.accessToken,
      next_cursor: item.nextCursor || '',
      account: item.institution,
      plaidEnv: 'production',
      itemId: item.id,
    }));
  } catch (error) {
    console.log(error);
    return [];
  }
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
      // Return the cursor even when no changes — caller needs it to persist
      return { added: [], modified: [], removed: [], next_cursor: data.next_cursor, has_more: false };
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
      if (!token) continue; // skip manual accounts (no Plaid access token)
      let next_cursor = response.next_cursor;
      let hasMore = true;
        const updatedTxns = [];

        while (hasMore) {
          const newTxns = await plaidTransactionsSync(token, next_cursor, userId, response.plaidEnv);

          // Item error — persist on the account doc, skip this institution
          if (newTxns?.itemError) {
            await updatePlaidItem(userId, response.account, {
              errorCode: newTxns.error_code,
              errorMessage: newTxns.error_message,
              errorDetectedAt: new Date(),
            });
            itemErrors[response.account] = { error_code: newTxns.error_code, error_message: newTxns.error_message, detectedAt: new Date() };
            hasMore = false;
            break;
          }

          if (typeof newTxns === 'string' || !newTxns) {
            hasMore = false;
            response.newTxns = false;
            break;
          }

          // Successful sync — clear any previous item error
          await updatePlaidItem(userId, response.account, {
            errorCode: null,
            errorMessage: null,
            errorDetectedAt: null,
          });

          response.newTxns = true;
          const additionalData = {
            account: response.account,
            createdDate: new Date(),
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

        if (response.next_cursor && response.token) {
          await updatePlaidCursors(response, userId);
        }
      }
      console.log('getting user data.... userId = ', userId);
      const categories = await findCategories(userId);
    const ruleList = await getMappingRuleList(categories);
    const compoundRules = await findUserRules(userId);
    const addedTxns = updatedResponses.flatMap(r => (r.added || []).map(t => ({ ...t, account: r.account })));
    const mappedTxns = await mapTransactions(addedTxns, ruleList, compoundRules);

    if (mappedTxns.length > 0) {
      await insertTransactions(mappedTxns);
    }

    // Handle modified transactions — update mutable fields without touching mappedCategory
    const modifiedTxns = updatedResponses.flatMap(r => r.modified || []);
    for (const txn of modifiedTxns) {
      await updateTransaction(userId, txn.transaction_id, {
        amount: txn.amount,
        date: txn.date,
        name: txn.name,
        merchant_name: txn.merchant_name,
        pending: txn.pending,
        category: txn.category,
        plaidPfcDetail: txn.personal_finance_category?.detailed || null,
      });
    }

    const removedIds = updatedResponses
      .flatMap(block => (block.removed || []).map(r => r.transaction_id));
    if (removedIds.length > 0) {
      const deleteResult = await deleteTransactionsByIds(userId, removedIds);
      console.log('deletedRemovedTransactions', deleteResult);
    }

    console.log('/getnew: done checking for new Plaid transactions...');
    return { errors: Object.keys(itemErrors).length ? itemErrors : null };
  } catch (err) {
      console.log('error in /getnew', err);
      return { errors: Object.keys(itemErrors).length ? itemErrors : null };
  }
}

async function updatePlaidCursors(response, userId) {
  await updatePlaidItemByToken(response.token, {
    nextCursor: response.next_cursor,
    prevCursor: response.prev_cursor,
  });
}

function toManualBalance(a) {
  return {
    account_id: a.accountId,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    current: a.balance,
    available: a.available,
    limit: a.limit,
    fetchedAt: a.balanceFetchedAt,
    manual: a.manual || false,
  };
}

async function fetchAndStoreBalances(uid) {
  const userId = uid.toString();
  const items = await findPlaidItems(userId);
  if (!items.length) return {};

  const results = {};
  const balanceErrors = {};

  for (const item of items) {
    const { accessToken, institution, id: itemId } = item;
    if (!accessToken) {
      // Manual account — include cached balances
      if (item.accounts?.length) {
        results[institution] = item.accounts.map(toManualBalance);
      }
      continue;
    }
    try {
      const client = forEnv('production');
      const response = await client.accountsBalanceGet({ access_token: accessToken });
      const fetchedAt = new Date();
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

      // Upsert accounts — creates rows on first sync, updates on subsequent
      await upsertPlaidAccounts(itemId, userId, response.data.accounts);

      // Append any manual accounts under this institution (not returned by Plaid)
      const plaidAccountIds = new Set(response.data.accounts.map(a => a.account_id));
      if (item.accounts?.length) {
        for (const a of item.accounts) {
          if (!plaidAccountIds.has(a.accountId)) {
            balances.push(toManualBalance(a));
          }
        }
      }

      // Compute institution net for snapshot
      const institutionNet = balances.reduce((sum, acct) => {
        const isLiability = acct.type === 'credit' || acct.type === 'loan';
        const bal = isLiability ? (acct.current ?? 0) : (acct.available ?? acct.current ?? 0);
        if (isLiability) return sum - Math.abs(bal);
        return sum + bal;
      }, 0);

      // Upsert snapshot: one per calendar day, updated if net changes
      const today = new Date().toISOString().slice(0, 10);
      await upsertBalanceSnapshot(itemId, {
        date: today,
        net: Math.round(institutionNet * 100) / 100,
        fetchedAt,
      });

      results[institution] = balances;
    } catch (error) {
      const plaidError = error?.response?.data;
      if (plaidError?.error_type === 'ITEM_ERROR') {
        const errorData = { error_code: plaidError.error_code, error_message: plaidError.error_message, detectedAt: new Date() };
        await updatePlaidItem(userId, institution, {
          errorCode: plaidError.error_code,
          errorMessage: plaidError.error_message,
          errorDetectedAt: new Date(),
        });
        balanceErrors[institution] = errorData;
      } else {
        console.error(`fetchAndStoreBalances error for ${institution}:`, error.message);
      }
      // Return cached balances from the item's accounts
      if (item.accounts?.length) {
        results[institution] = item.accounts.map(a => ({
          account_id: a.accountId,
          name: a.name,
          current: a.balance,
          available: a.available,
          limit: a.limit,
          fetchedAt: a.balanceFetchedAt,
          manual: a.manual || false,
        }));
      }
    }
  }

  return { balances: results, errors: Object.keys(balanceErrors).length ? balanceErrors : null };
}

async function getCachedBalances(uid) {
  const userId = uid.toString();
  const items = await findPlaidItems(userId);
  if (!items.length) return {};
  const results = {};
  for (const item of items) {
    if (item.accounts?.length) {
      results[item.institution] = item.accounts.map(a => ({
        account_id: a.accountId,
        name: a.name,
        official_name: a.officialName,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        current: a.balance,
        available: a.available,
        limit: a.limit,
        fetchedAt: a.balanceFetchedAt,
        manual: a.manual || false,
      }));
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