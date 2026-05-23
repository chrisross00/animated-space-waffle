// utils/tellerClient.js
const https = require('https');
const fs = require('fs');

const BASE = 'https://api.teller.io';

// One shared mTLS agent for the whole process. Sandbox needs no cert, so only
// build the agent when both paths are configured.
let agent = null;
if (process.env.TELLER_CERT_PATH && process.env.TELLER_KEY_PATH) {
  agent = new https.Agent({
    cert: fs.readFileSync(process.env.TELLER_CERT_PATH),
    key: fs.readFileSync(process.env.TELLER_KEY_PATH),
  });
}

async function request(accessToken, path) {
  const auth = Buffer.from(`${accessToken}:`).toString('base64');
  const res = await fetch(`${BASE}${path}`, {
    agent,
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (res.status === 401) {
    const err = new Error('Teller enrollment disconnected');
    err.status = 401;
    err.tellerDisconnected = true;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`Teller ${res.status} on ${path}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function client(accessToken) {
  return {
    getAccounts: () => request(accessToken, '/accounts'),

    getBalance: (accountId) => request(accessToken, `/accounts/${accountId}/balances`),

    // Teller paginates via ?from_id=<last id>&count=<n>. Walk until a short page.
    getTransactions: async (accountId, count = 250) => {
      const all = [];
      let fromId = null;
      // Safety cap: 20 pages (5,000 txns) is far beyond a ~90-day window.
      for (let page = 0; page < 20; page++) {
        const qs = `count=${count}` + (fromId ? `&from_id=${fromId}` : '');
        const batch = await request(accessToken, `/accounts/${accountId}/transactions?${qs}`);
        if (!Array.isArray(batch) || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < count) break;
        fromId = batch[batch.length - 1].id;
      }
      return all;
    },
  };
}

module.exports = { client };
