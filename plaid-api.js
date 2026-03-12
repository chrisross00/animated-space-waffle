// plaid-api.js
const express = require("express");
const bodyParser = require('body-parser')
const { findUser, findPlaidItems, findPlaidItemByInstitution, insertPlaidItem, updatePlaidItem, deletePlaidItem } = require('./db/database');
const {validateIdToken, rejectTestUser} = require('./utils/authentication');

const { forUser } = require('./utils/plaidClient');

const router = express.Router();
router.use(bodyParser.json({ limit: '1mb' }));

// Resolve Plaid environment for the user.
// In production: everyone uses production Plaid (real banks).
// In dev: admins use production, others use sandbox.
async function getUserPlaidEnv(uid) {
  const users = await findUser(uid);
  const isAdmin = !!(users.length && users[0].isAdmin);
  const plaidEnv = process.env.NODE_ENV === 'production' ? 'production'
    : isAdmin ? 'production' : 'sandbox';
  return { isAdmin, plaidEnv };
}

router.get("/create_link_token", async (req, res, next) => {
    try {
      const decodedToken = await validateIdToken(req);
      if (await rejectTestUser(decodedToken.uid, res)) return;
      const { isAdmin } = await getUserPlaidEnv(decodedToken.uid);
      const client = forUser(isAdmin);
      const tokenResponse = await client.linkTokenCreate({
        user: { client_user_id: decodedToken.uid },
        client_name: "Basil Budgeting",
        language: "en",
        products: ["transactions"],
        country_codes: ["US"],
      });
      res.json(tokenResponse.data);
    } catch (error) {
      console.error('/create_link_token error:', error.message);
      if (error.response) {
        console.error('Plaid error details:', JSON.stringify(error.response.data, null, 2));
      }
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
  if (await rejectTestUser(decodedToken.uid, res)) return;

  try {
    const institution = req.body?.metadata?.institution?.name;
    if (!institution || typeof institution !== 'string' || /[.$]/.test(institution)) {
      return res.status(400).json({ message: 'Invalid institution name' });
    }
    const existingItem = await findPlaidItemByInstitution(decodedToken.uid, institution);
    if (existingItem) {
      return res.json({ alreadyLinked: true });
    }
    await addInstitution(req, decodedToken);
  } catch (error) {
    console.error('/exchange_public_token error:', error.message);
    return res.status(500).json({ message: 'Failed to exchange token' });
  }
  res.json(true);
});

async function addInstitution(req, decodedToken){
  const { isAdmin, plaidEnv } = await getUserPlaidEnv(decodedToken.uid);
  const client = forUser(isAdmin);

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
    await insertPlaidItem({
      userId,
      institution: institutionName,
      accessToken: exchangeResponseData.access_token,
    });
    return;
  } catch (error) {
    console.log(error)
  }
}

// Update-mode link token for reconnecting a stale institution
router.get("/create_update_link_token", async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    // No rejectTestUser guard — reconnecting is safe (read-only from Plaid's perspective)
    const institution = req.query.institution;
    if (!institution) return res.status(400).json({ message: 'institution required' });

    const item = await findPlaidItemByInstitution(uid, institution);
    if (!item?.accessToken) return res.status(404).json({ message: 'Institution not found' });

    const { isAdmin } = await getUserPlaidEnv(uid);
    const client = forUser(isAdmin);
    const tokenResponse = await client.linkTokenCreate({
      user: { client_user_id: uid },
      client_name: "Basil Budgeting",
      language: "en",
      country_codes: ["US"],
      access_token: item.accessToken,
    });
    res.json(tokenResponse.data);
  } catch (error) {
    console.error('/create_update_link_token error:', error.message);
    res.status(500).json({ message: 'Failed to create update link token' });
  }
});

// Clear a persisted item error after successful reconnect
router.post("/clear_item_error", async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { institution } = req.body;
    if (!institution) return res.status(400).json({ message: 'institution required' });
    await updatePlaidItem(uid, institution, { errorCode: null, errorMessage: null, errorDetectedAt: null });
    res.json({ ok: true });
  } catch (error) {
    console.error('/clear_item_error error:', error.message);
    res.status(500).json({ message: 'Failed to clear item error' });
  }
});

router.post("/remove_account", async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const userId = decodedToken.uid;
    if (await rejectTestUser(userId, res)) return;
    const { institution } = req.body;
    await deletePlaidItem(userId, institution);
    res.json({ success: true });
  } catch (error) {
    console.error('/remove_account error:', error);
    res.status(500).json({ message: 'Failed to remove account' });
  }
});

// DEV ONLY: Force a sandbox item into an error state for testing reconnect flow
if (process.env.NODE_ENV !== 'production') {
  router.post("/sandbox_reset_login", async (req, res) => {
    try {
      const decodedToken = await validateIdToken(req);
      const uid = decodedToken.uid;
      const { institution } = req.body;
      if (!institution) return res.status(400).json({ message: 'institution required' });

      const item = await findPlaidItemByInstitution(uid, institution);
      if (!item?.accessToken) return res.status(404).json({ message: 'Institution not found' });
      // Note: plaidEnv check removed — sandbox items won't exist in production Postgres

      const { sandbox } = require('./utils/plaidClient');
      await sandbox.sandboxItemResetLogin({ access_token: item.accessToken });

      // Persist a synthetic item error so UI shows it immediately
      await updatePlaidItem(uid, institution, {
        errorCode: 'ITEM_LOGIN_REQUIRED',
        errorMessage: 'Sandbox login reset for testing',
        errorDetectedAt: new Date(),
      });

      res.json({ ok: true, message: `Reset login for ${institution}. Next sync will fail with ITEM_LOGIN_REQUIRED.` });
    } catch (error) {
      console.error('/sandbox_reset_login error:', error.message);
      res.status(500).json({ message: 'Failed to reset login' });
    }
  });
}

module.exports = router;
