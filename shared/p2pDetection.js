// shared/p2pDetection.js
// Dual CJS/ESM export so both backend (require) and frontend (import) can consume this.
const P2P_PATTERNS = [
  /venmo/i, /zelle/i, /cash app/i, /cashapp/i, /paypal/i, /apple cash/i,
];

function isP2PTransaction(txn) {
  const sources = [txn.account, txn.merchant_name, txn.name].filter(Boolean);
  return sources.some(s => P2P_PATTERNS.some(p => p.test(s)));
}

// CJS (Node/backend)
if (typeof module !== 'undefined') {
  module.exports = { P2P_PATTERNS, isP2PTransaction };
}

// ESM (Vite/frontend)
export { P2P_PATTERNS, isP2PTransaction };
