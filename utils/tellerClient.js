// utils/tellerClient.js
const https = require('https');
const fs = require('fs');
const axios = require('axios');

const BASE = 'https://api.teller.io';

// One shared mTLS agent for the whole process. Node's global fetch (undici) does
// NOT honor a client cert passed via the `agent` option — verified with a local
// mutual-TLS handshake (fetch+agent failed to present the cert; axios+httpsAgent
// succeeded). So we use axios, which sends the client cert via `httpsAgent`.
// Sandbox needs no cert, so only build the agent when both paths are configured.
let httpsAgent = null;
if (process.env.TELLER_CERT_PATH && process.env.TELLER_KEY_PATH) {
  httpsAgent = new https.Agent({
    cert: fs.readFileSync(process.env.TELLER_CERT_PATH),
    key: fs.readFileSync(process.env.TELLER_KEY_PATH),
  });
}

async function request(accessToken, path) {
  const auth = Buffer.from(`${accessToken}:`).toString('base64');
  try {
    const res = await axios.get(`${BASE}${path}`, {
      httpsAgent,
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    return res.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 401) {
      const err = new Error('Teller enrollment disconnected');
      err.status = 401;
      err.tellerDisconnected = true;
      throw err;
    }
    const err = new Error(`Teller ${status || ''} on ${path}: ${error.message}`);
    err.status = status;
    throw err;
  }
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
