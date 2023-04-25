const { Configuration, PlaidApi, PlaidEnvironments } = require( 'plaid');
const { findUserData } = require('../db/database');
const { getMappingRuleList, mapTransactions } = require('./categoryMapping')


// maybe put this in an internal function to initialize the client object

const configuration = new Configuration({
  basePath: PlaidEnvironments.development,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(configuration);

async function getAccountData (uid) {
  const userId = uid.toString();
  const response = [];
  // Look at the plaid-transactions collection and get the most recent 'next_cursor'
  try {
    const currentAccounts = await findUserData('Plaid-Accounts', userId);
    for (const account in currentAccounts[0].Accounts) { // `currentAccounts[0].Accounts` has what we need
      if (Object.hasOwnProperty.call(currentAccounts[0].Accounts, account)) { 
        const element = currentAccounts[0].Accounts[account];
        response.push({'token': element.token, 'next_cursor': element.next_cursor, 'account': account})
      }
    }
  } catch (error) {
      console.log(error)
  }
    return response;
}

async function plaidTransactionsSync (access_token, cursor=null, uid){
  const userId = uid.toString();
  // console.log('access_token and cursor = ', access_token, cursor)
  try {
    // console.log('plaidTransactionsSync() Messages:\n     Access Token:', access_token, '\n     Cursor:', cursor, '\n');
    const response = await plaidClient.transactionsSync({
      access_token,
      cursor,
    })
    const data = response.data;
    // console.log( '   plaidTransactionsSync internal: data = \n', data)
    
    // apply userId to each transaction in response.data
    const newTxns = data.added.map(txn => ({ ...txn, userId }));
    data.added = newTxns

    if (data.added.length === 0 && data.modified.length === 0 && data.removed.length === 0) {
      let data = "All transactions up to date for this account"
      return data;
    } else {
      console.log(newTxns, "\nplaidTransactionsSync(): new Transactions and userId mapped")
        return data;
    }
    } 
  catch (err) {
      // console.log('error with plaidTransactionsSync, `err.response.data`: ', err.response.data)
    }
}

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
          await updatePlaidAccounts(response, userId);
        }
      }
      console.log('getting user data.... userId = ', userId);
      const categories = await findUserData('Basil-Categories', userId); 
      console.log('getting mapping rule list.... categories = ', categories);
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

async function getAllUserTransactions(uid) {
  const userId = uid? uid : null;
  if(userId){
    try {
      const transactions = await findUserData('Plaid-Transactions', userId);
      return transactions;
    } catch (err) {
        console.error(err);
        // res.status(500).send('Error getting transactions');
    }
  } else {
    console.log('getAllUserTransactions(): no userId provided')
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

module.exports = {
  plaidTransactionsSync,
  getAccountData,
  getNewPlaidTransactions,
  getAllUserTransactions
}