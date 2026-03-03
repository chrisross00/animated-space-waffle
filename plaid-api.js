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
    try {
      const decodedToken = await validateIdToken(req);
      const tokenResponse = await client.linkTokenCreate({
        user: { client_user_id: decodedToken.uid },
        client_name: "Basil Budgeting",
        language: "en",
        products: ["auth", "transactions"],
        country_codes: ["US"],
      });
      res.json(tokenResponse.data);
    } catch (error) {
      console.error('/create_link_token error:', error.message);
      res.status(500).json({ message: 'Failed to create link token' });
    }
});

router.post("/exchange_public_token", async (req, res, next) => {
  let decodedToken;
  try {
    decodedToken = await validateIdToken(req);
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const institution = req.body?.metadata?.institution?.name;
    if (!institution || typeof institution !== 'string' || /[.$]/.test(institution)) {
      return res.status(400).json({ message: 'Invalid institution name' });
    }
    const user = await findUserData('Plaid-Accounts', decodedToken.uid);
    if (user.length > 0) {
      const accounts = user[0].Accounts;
      if (accounts.hasOwnProperty(institution)) {
        return res.json({ alreadyLinked: true });
      } else {
        await addInstitution(req, decodedToken, 'addToExisting');
      }
    } else {
      await addInstitution(req, decodedToken);
    }
  } catch (error) {
    console.error('/exchange_public_token error:', error.message);
    return res.status(500).json({ message: 'Failed to exchange token' });
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
      await updateData('Plaid-Accounts', filter, update);
    } else {
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

