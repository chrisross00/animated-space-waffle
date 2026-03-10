/**
 * Transaction relationship detection engine.
 *
 * Detects two relationship types:
 *   1. Splits — a purchase followed by an incoming P2P payment at a common ratio (1/2, 1/3, 1/4)
 *   2. Returns — a charge followed by a credit from the same merchant for the same amount
 *
 * v1 uses hard filters (pass/fail) rather than weighted scoring.
 * Bonus signals upgrade confidence from medium → high.
 */

// --- P2P account detection ---

const P2P_PATTERNS = [
  /venmo/i, /zelle/i, /cash app/i, /cashapp/i,
  /paypal/i, /apple cash/i,
];

/**
 * Check if a transaction is from a P2P service.
 * Checks account name, merchant_name, and transaction name.
 */
function isP2PTransaction(txn) {
  const sources = [txn.account, txn.merchant_name, txn.name].filter(Boolean);
  return sources.some(s => P2P_PATTERNS.some(p => p.test(s)));
}

// --- PFC tiers for split likelihood (bonus signal) ---

const HIGH_SPLIT_PFCS = new Set([
  'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS', 'FOOD_AND_DRINK_COFFEE',
  'FOOD_AND_DRINK_FAST_FOOD', 'FOOD_AND_DRINK_BAR',
  'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT', 'RENT_AND_UTILITIES_ELECTRICITY',
  'RENT_AND_UTILITIES_GAS', 'RENT_AND_UTILITIES_INTERNET_AND_CABLE', 'RENT_AND_UTILITIES_WATER',
  'ENTERTAINMENT', 'ENTERTAINMENT_SPORTING_EVENTS', 'ENTERTAINMENT_MUSIC',
  'TRAVEL', 'TRAVEL_LODGING',
]);

function isHighSplitCategory(txn) {
  const pfc = txn.personal_finance_category;
  if (!pfc) return false;
  return HIGH_SPLIT_PFCS.has(pfc.detailed) || HIGH_SPLIT_PFCS.has(pfc.primary);
}

// --- Constants ---

const SPLIT_DATE_WINDOW = 7;     // days after purchase
const RETURN_DATE_WINDOW = 30;   // days after charge
const RETURN_AMOUNT_TOLERANCE = 0.50;  // dollars
const RATIO_TOLERANCE = 0.01;    // 1% tolerance for 1/N ratios

// --- Date helpers ---

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA);
  const b = new Date(dateStrB);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// --- Split detection ---

/**
 * Check if an amount ratio is close to 1/N for N in [2, 3, 4].
 * @returns {boolean}
 */
function isCommonSplitRatio(p2pAmount, purchaseAmount) {
  const ratio = Math.abs(p2pAmount) / purchaseAmount;
  for (const n of [2, 3, 4]) {
    const target = 1 / n;
    if (Math.abs(ratio - target) <= RATIO_TOLERANCE) return true;
  }
  return false;
}

/**
 * Check if a P2P transaction has Venmo enrichment that matches the purchase merchant.
 */
function hasMatchingEnrichment(p2pTxn, purchaseTxn) {
  if (!p2pTxn.venmo_note) return false;
  const note = p2pTxn.venmo_note.toLowerCase();
  const merchant = (purchaseTxn.merchant_name || purchaseTxn.name || '').toLowerCase();
  // Check if the note contains part of the merchant name or vice versa
  return merchant.length > 2 && (note.includes(merchant) || merchant.includes(note));
}

/**
 * Detect split relationships.
 *
 * For each incoming P2P transaction, search for a purchase that could be the original
 * expense being split. Returns array of detected relationships.
 *
 * @param {Array} transactions - all loaded transactions
 * @returns {Array<{type: string, confidence: string, p2pTxn: object, purchaseTxn: object}>}
 */
function detectSplits(transactions) {
  // Incoming P2P payments (negative amount = money coming in from Plaid's perspective)
  const p2pIncoming = transactions.filter(t =>
    t.amount < 0 && isP2PTransaction(t) && !t.linkedTransaction && !t.dismissedRelationship
  );

  // Potential purchase transactions (positive amount = expense)
  const purchases = transactions.filter(t =>
    t.amount > 0 && !isP2PTransaction(t) && !t.linkedTransaction
  );

  // Build all candidate pairs that pass hard filters, scored for ranking
  const candidates = [];

  for (const p2p of p2pIncoming) {
    for (const purchase of purchases) {
      // Hard filter 1: amount ratio must be close to 1/N
      if (!isCommonSplitRatio(p2p.amount, purchase.amount)) continue;

      // Hard filter 2: P2P date must be within SPLIT_DATE_WINDOW days after purchase
      const gap = daysBetween(purchase.date, p2p.date);
      if (gap < 0 || gap > SPLIT_DATE_WINDOW) continue;

      // Passed hard filters — at least medium confidence
      let confidence = 'medium';

      // Bonus signals upgrade to high
      const hasEnrichment = p2p.venmo_counterparty || hasMatchingEnrichment(p2p, purchase);
      const hasHighPfc = isHighSplitCategory(purchase);

      if (hasEnrichment || hasHighPfc) {
        confidence = 'high';
      }

      candidates.push({
        p2p,
        purchase,
        confidence,
        gap,
      });
    }
  }

  // Sort candidates: high confidence first, then by closer date gap
  candidates.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
    return a.gap - b.gap;
  });

  // Assign matches greedily — each purchase and P2P claimed at most once (1:1)
  const claimedPurchases = new Set();
  const claimedP2P = new Set();
  const results = [];

  for (const c of candidates) {
    if (claimedPurchases.has(c.purchase.transaction_id)) continue;
    if (claimedP2P.has(c.p2p.transaction_id)) continue;

    claimedPurchases.add(c.purchase.transaction_id);
    claimedP2P.add(c.p2p.transaction_id);
    results.push({
      type: 'split',
      confidence: c.confidence,
      p2pTxn: c.p2p,
      purchaseTxn: c.purchase,
    });
  }

  return results;
}

// --- Return detection ---

/**
 * Detect return/refund relationships.
 *
 * Matches a charge (positive amount) with a credit (negative amount) from the same
 * merchant within the return date window. Returns are high-confidence only.
 *
 * @param {Array} transactions - all loaded transactions
 * @returns {Array<{type: string, confidence: string, chargeTxn: object, refundTxn: object}>}
 */
function detectReturns(transactions) {
  const results = [];

  // Credits (negative amount, not P2P)
  const credits = transactions.filter(t =>
    t.amount < 0 && !isP2PTransaction(t) && !t.linkedTransaction && !t.dismissedRelationship
  );

  // Charges (positive amount, not P2P)
  const charges = transactions.filter(t =>
    t.amount > 0 && !isP2PTransaction(t) && !t.linkedTransaction
  );

  for (const credit of credits) {
    const creditMerchant = (credit.merchant_name || credit.name || '').toLowerCase();
    if (!creditMerchant) continue;

    for (const charge of charges) {
      const chargeMerchant = (charge.merchant_name || charge.name || '').toLowerCase();

      // Hard filter 1: same merchant
      if (credit.merchant_name && charge.merchant_name) {
        if (credit.merchant_name.toLowerCase() !== charge.merchant_name.toLowerCase()) continue;
      } else {
        // Fall back to name-based matching — extract base name (remove suffixes like RETURN, REFUND)
        const creditBase = creditMerchant.replace(/\s*(return|refund|credit|reversal)\s*/gi, '').trim();
        const chargeBase = chargeMerchant.replace(/\s*(return|refund|credit|reversal)\s*/gi, '').trim();
        if (!creditBase || !chargeBase || creditBase !== chargeBase) continue;
      }

      // Hard filter 2: amount match (exact or within tolerance)
      const amountDiff = Math.abs(Math.abs(credit.amount) - charge.amount);
      if (amountDiff > RETURN_AMOUNT_TOLERANCE) continue;

      // Hard filter 3: refund within date window after charge
      const gap = daysBetween(charge.date, credit.date);
      if (gap < 0 || gap > RETURN_DATE_WINDOW) continue;

      results.push({
        type: 'return',
        confidence: 'high',
        chargeTxn: charge,
        refundTxn: credit,
      });
      break; // One refund per credit
    }
  }

  return results;
}

// --- Main entry point ---

/**
 * Detect all transaction relationships from loaded transactions.
 * @param {Array} transactions - all loaded transactions from store
 * @returns {Array<{type: string, confidence: string, ...}>}
 */
function detectRelationships(transactions) {
  if (!transactions || transactions.length === 0) return [];

  // Detect returns first — higher confidence, simpler signal
  const returns = detectReturns(transactions);

  // Exclude transactions already matched as returns from split detection
  const returnTxnIds = new Set();
  for (const r of returns) {
    returnTxnIds.add(r.chargeTxn.transaction_id);
    returnTxnIds.add(r.refundTxn.transaction_id);
  }
  const remaining = transactions.filter(t => !returnTxnIds.has(t.transaction_id));

  const splits = detectSplits(remaining);
  return [...returns, ...splits];
}

export {
  isP2PTransaction,
  isHighSplitCategory,
  isCommonSplitRatio,
  detectSplits,
  detectReturns,
  detectRelationships,
  // Constants (exported for testing)
  SPLIT_DATE_WINDOW,
  RETURN_DATE_WINDOW,
  RETURN_AMOUNT_TOLERANCE,
  RATIO_TOLERANCE,
  P2P_PATTERNS,
};
