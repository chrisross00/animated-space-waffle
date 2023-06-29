// plaid-api.js
const express = require("express");
const bodyParser = require('body-parser')
const { findUserData, insertData, updateData } = require('./db/database');
const {validateIdToken} = require('./utils/authentication');

const { Configuration, PlaidApi, PlaidEnvironments } = require("plaid");

const router = express.Router();
router.use(bodyParser.json());

const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
      "Plaid-Version": "2020-09-14",
    },
  },
});

const client = new PlaidApi(config);

router.get("/create_link_token", async (req, res, next) => {
    console.log('/create_link_token starting...');
    const tokenResponse = await client.linkTokenCreate({
      user: { client_user_id: "user-" + Math.floor(Math.random() * 10000) },
      client_name: "Your App Name",
      language: "en",
      products: ["auth"],
    country_codes: ["US"],
  });
  console.log('tokenResponse.data', tokenResponse)
  res.json(tokenResponse.data);
});

router.post("/exchange_public_token", async (req, res, next) => {

  // get the user ID from the Firebase session
  console.log('/exchange_public_token starting...');
  const decodedToken = await validateIdToken(req)
  if(decodedToken.user_id){
      console.log('exchange_public_token: got the user ID', decodedToken.user_id)
      console.log('by the way, req.body = ', req)
  }

  
  // send exchangeResponse.data.access_token to Mongodb
  // check if the user exists in the database first; only create an access_token if the user doesn't exist
  try {
    const user = await findUserData('Plaid-Accounts', decodedToken.user_id)
    if(user.length>0){
      console.log('user exists, need to now checkif the institution exists in the accounts object', req.body.metadata.institution.name)
      const accounts = user[0].Accounts;
      const institution = req.body.metadata.institution.name;
      if (accounts.hasOwnProperty(institution)) {
      console.log(`The institution '${institution}' exists in the accounts object. Return now and do not update the account, or you will invalidate the token`);
      return;
      } else {
      console.log(`The institution '${institution}' does not exist in the accounts object.`);
        // new function
        addInstitution(req, decodedToken, 'addToExisting')
      }
    } else {
      console.log('user does not exist, need to insert the user and institution data into the database')
      // new function
      addInstitution(req, decodedToken)
    }
  } catch (error) {
    console.log(error)
  }
  res.json(true);
});

async function addInstitution(req, decodedToken, type='new'){
  let exchangeResponse;
  try {
    exchangeResponse = await client.itemPublicTokenExchange({
      public_token: req.body.public_token,
    });
  } catch (error) {
    console.log(error,'\nerror getting exchangeResponse')
  }
  try {
    console.log('inserting institution data into the database')
    const exchangeResponseData = exchangeResponse.data;
    const institutionName = req.body.metadata.institution.name;
    const userId = decodedToken.user_id;
    const earliestDate = '2022-07-29';
    const updateObject = {
      Accounts: {
        [institutionName]: {
          token: exchangeResponseData.access_token,
          next_cursor: '',
          earliestDate: earliestDate,
        }
      },
      userId: userId,
    };
    if (type == 'addToExisting'){
      const filter = { 
        userId: userId
      };
      const update = {
        $set: { [`Accounts.${institutionName}`]: {
          token: exchangeResponseData.access_token,
          next_cursor: '',
          earliestDate: earliestDate,
        } },
      };
      console.log('addInstitution(): inserting only institution data since type == ', type)
      await updateData('Plaid-Accounts', filter, update);
    } else { // new user and data
      console.log('addInstitution(): inserting user and institution data == ', type)
      await insertData('Plaid-Accounts', updateObject);
    }
    return;
  } catch (error) {
    console.log(error)
  }
}

router.get("/data", async (req, res, next) => {
  const access_token = req.session.access_token;
  const balanceResponse = await client.accountsBalanceGet({ access_token });
  res.json({
    Balance: balanceResponse.data,
  });
});

router.get("/is_account_connected", async (req, res, next) => {
  return req.session.access_token
    ? res.json({ status: true })
    : res.json({ status: false });
});

module.exports = router;

