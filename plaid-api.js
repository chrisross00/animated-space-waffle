// plaid-api.js
const express = require("express");
const bodyParser = require('body-parser')
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
    console.log('/exchange_public_token starting...', req.body)
  const exchangeResponse = await client.itemPublicTokenExchange({
    public_token: req.body.public_token,
  });

  console.log('/exchange_public_token, exchangeResponse.data.access_token', exchangeResponse.data.access_token)

  // send exchangeResponse.data.access_token to mongodb
  
  res.json(true);
});

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

