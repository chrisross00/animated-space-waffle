// bank-api.js — Teller Connect server endpoints (replaces plaid-api.js)
const express = require('express');
const bodyParser = require('body-parser');
const {
  findPlaidItems, insertPlaidItem,
  updatePlaidItem, deleteActiveBankConnection, upsertPlaidAccounts,
} = require('./db/database');
const { validateIdToken, rejectTestUser } = require('./utils/authentication');
const { client: tellerClient } = require('./utils/tellerClient');

const router = express.Router();
router.use(bodyParser.json({ limit: '1mb' }));

// Teller Connect returns the access token + enrollment to the browser; the client
// forwards them here. We insert an active connection and fetch accounts immediately.
router.post('/store_enrollment', async (req, res) => {
  let decodedToken;
  try {
    decodedToken = await validateIdToken(req);
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  if (await rejectTestUser(decodedToken.uid, res)) return;

  try {
    const userId = decodedToken.uid;
    const { accessToken, enrollment } = req.body || {};
    const institution = enrollment?.institution?.name;
    const enrollmentId = enrollment?.id || null;
    if (!accessToken || !institution || typeof institution !== 'string' || /[.$]/.test(institution)) {
      return res.status(400).json({ message: 'Invalid enrollment payload' });
    }

    // Only block if there is already an ACTIVE connection for this institution.
    const existing = (await findPlaidItems(userId))
      .find((c) => c.active && c.institution === institution);
    if (existing) return res.json({ alreadyLinked: true });

    const { id: connectionId } = await insertPlaidItem({ userId, institution, accessToken, enrollmentId });

    try {
      const accounts = await tellerClient(accessToken).getAccounts();
      await upsertPlaidAccounts(connectionId, userId, accounts.map((a) => ({
        account_id: a.id, name: a.name || null, official_name: a.name || null,
        mask: a.last_four || null, type: a.type || null, subtype: a.subtype || null,
        balances: { current: null, available: null, limit: null },
      })));
    } catch (err) {
      console.error('store_enrollment: account fetch failed (non-fatal):', err.message);
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('/store_enrollment error:', error.message);
    return res.status(500).json({ message: 'Failed to store enrollment' });
  }
});

router.post('/clear_connection_error', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const { institution } = req.body;
    if (!institution) return res.status(400).json({ message: 'institution required' });
    await updatePlaidItem(decodedToken.uid, institution, {
      errorCode: null, errorMessage: null, errorDetectedAt: null,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('/clear_connection_error error:', error.message);
    res.status(500).json({ message: 'Failed to clear connection error' });
  }
});

router.post('/remove_account', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    if (await rejectTestUser(decodedToken.uid, res)) return;
    const { institution } = req.body;
    await deleteActiveBankConnection(decodedToken.uid, institution);
    res.json({ success: true });
  } catch (error) {
    console.error('/remove_account error:', error.message);
    res.status(500).json({ message: 'Failed to remove account' });
  }
});

module.exports = router;
