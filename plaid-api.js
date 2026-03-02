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
    try {
      const decodedToken = await validateIdToken(req);
      const tokenResponse = await client.linkTokenCreate({
        user: { client_user_id: decodedToken.uid },
        client_name: "Your App Name",
        language: "en",
        products: ["auth", "transactions"],
        country_codes: ["US"],
      });
      console.log('tokenResponse.data', tokenResponse)
      res.json(tokenResponse.data);
    } catch (error) {
      console.error('/create_link_token error:', error.message);
      res.status(500).json({ message: 'Failed to create link token' });
    }
});

router.post("/exchange_public_token", async (req, res, next) => {

  // get the user ID from the Firebase session
  console.log('/exchange_public_token starting...');
  const decodedToken = await validateIdToken(req)
  if(decodedToken.uid){
      console.log('exchange_public_token: got the user ID', decodedToken.uid)
  }

  
  // send exchangeResponse.data.access_token to Mongodb
  // check if the user exists in the database first; only create an access_token if the user doesn't exist
  try {
    const user = await findUserData('Plaid-Accounts', decodedToken.uid)
    if(user.length>0){
      console.log('user exists, need to now checkif the institution exists in the accounts object', req.body.metadata.institution.name)
      const accounts = user[0].Accounts;
      const institution = req.body.metadata.institution.name;
      if (accounts.hasOwnProperty(institution)) {
      console.log(`The institution '${institution}' exists in the accounts object. Return now and do not update the account, or you will invalidate the token`);
      return res.json({ alreadyLinked: true });
      } else {
      console.log(`The institution '${institution}' does not exist in the accounts object.`);
        // new function
        await addInstitution(req, decodedToken, 'addToExisting')
      }
    } else {
      console.log('user does not exist, need to insert the user and institution data into the database')
      // new function
      await addInstitution(req, decodedToken)
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
    const userId = decodedToken.uid;
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
    if (type === 'addToExisting'){
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

router.post("/remove_account", async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const userId = decodedToken.uid;
    const { institution } = req.body;
    const filter = { userId };
    const update = { $unset: { [`Accounts.${institution}`]: '' } };
    await updateData('Plaid-Accounts', filter, update);
    res.json({ success: true });
  } catch (error) {
    console.error('/remove_account error:', error);
    res.status(500).json({ message: 'Failed to remove account' });
  }
});

module.exports = router;

