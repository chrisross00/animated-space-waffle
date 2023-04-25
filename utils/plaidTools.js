const { Configuration, PlaidApi, PlaidEnvironments } = require( 'plaid');
const { findData, findUserData } = require('../db/database');


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
  module.exports = {
    plaidTransactionsSync,
    getAccountData
}