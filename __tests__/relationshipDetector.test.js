import { describe, it, expect, beforeEach } from 'vitest'
import {
  isP2PTransaction,
  isCommonSplitRatio,
  detectSplits,
  detectReturns,
  detectRelationships,
} from '../frontend/src/utils/relationshipDetector.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _id = 0
function txn(fields) {
  _id++
  return {
    transaction_id: `txn_${_id}`,
    name: 'Test',
    merchant_name: null,
    amount: 0,
    date: '2025-03-01',
    account: 'Chase',
    mappedCategory: 'To Sort',
    ...fields,
  }
}

function resetIds() { _id = 0 }

// ---------------------------------------------------------------------------
// isP2PTransaction
// ---------------------------------------------------------------------------
describe('isP2PTransaction', () => {
  it('detects Venmo by account name', () => {
    expect(isP2PTransaction(txn({ account: 'Venmo' }))).toBe(true)
  })

  it('detects Zelle by merchant_name', () => {
    expect(isP2PTransaction(txn({ merchant_name: 'Zelle Payment' }))).toBe(true)
  })

  it('detects Cash App by name', () => {
    expect(isP2PTransaction(txn({ name: 'Cash App Transfer' }))).toBe(true)
  })

  it('detects PayPal', () => {
    expect(isP2PTransaction(txn({ name: 'PayPal Transfer' }))).toBe(true)
  })

  it('detects Apple Cash', () => {
    expect(isP2PTransaction(txn({ name: 'Apple Cash Received' }))).toBe(true)
  })

  it('returns false for regular merchants', () => {
    expect(isP2PTransaction(txn({ merchant_name: 'Target', name: 'Target' }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isCommonSplitRatio
// ---------------------------------------------------------------------------
describe('isCommonSplitRatio', () => {
  it('detects 1/2 split', () => {
    expect(isCommonSplitRatio(-50, 100)).toBe(true)
  })

  it('detects 1/3 split', () => {
    expect(isCommonSplitRatio(-33.33, 100)).toBe(true)
  })

  it('detects 1/4 split', () => {
    expect(isCommonSplitRatio(-25, 100)).toBe(true)
  })

  it('allows small tolerance', () => {
    // 50.50 / 100 = 0.505, within 1% of 0.5
    expect(isCommonSplitRatio(-50.50, 100)).toBe(true)
  })

  it('rejects non-standard ratios', () => {
    expect(isCommonSplitRatio(-40, 100)).toBe(false)
  })

  it('rejects very small ratios', () => {
    expect(isCommonSplitRatio(-5, 100)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// detectSplits
// ---------------------------------------------------------------------------
describe('detectSplits', () => {
  beforeEach(resetIds)

  it('detects a basic 1/2 split', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Sushi Palace' }),
      txn({ amount: -50, date: '2025-03-02', name: 'Venmo', account: 'Venmo' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('split')
    expect(results[0].purchaseTxn.transaction_id).toBe('txn_1')
    expect(results[0].p2pTxn.transaction_id).toBe('txn_2')
  })

  it('detects 1/3 split', () => {
    const transactions = [
      txn({ amount: 90, date: '2025-03-01', merchant_name: 'Restaurant' }),
      txn({ amount: -30, date: '2025-03-02', name: 'Zelle', merchant_name: 'Zelle' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(1)
  })

  it('rejects if P2P comes before purchase', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-05', merchant_name: 'Sushi Palace' }),
      txn({ amount: -50, date: '2025-03-01', name: 'Venmo', account: 'Venmo' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(0)
  })

  it('rejects if outside date window (>7 days)', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Sushi Palace' }),
      txn({ amount: -50, date: '2025-03-10', name: 'Venmo', account: 'Venmo' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(0)
  })

  it('rejects non-P2P incoming payments', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Sushi Palace' }),
      txn({ amount: -50, date: '2025-03-02', name: 'Payroll Deposit', account: 'Chase' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(0)
  })

  it('rejects non-standard ratio', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Target' }),
      txn({ amount: -40, date: '2025-03-02', name: 'Venmo', account: 'Venmo' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(0)
  })

  it('skips already linked transactions', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Sushi Palace' }),
      txn({ amount: -50, date: '2025-03-02', name: 'Venmo', account: 'Venmo', linkedTransaction: { transaction_id: 'other' } }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(0)
  })

  it('skips dismissed P2P transactions', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Sushi Palace' }),
      txn({ amount: -50, date: '2025-03-02', name: 'Venmo', account: 'Venmo', dismissedRelationship: '2025-03-03T00:00:00Z' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(0)
  })

  it('assigns 1:1 — each P2P matched to at most one purchase', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Restaurant A' }),
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Restaurant B' }),
      txn({ amount: -50, date: '2025-03-02', name: 'Venmo', account: 'Venmo' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(1)
  })

  it('upgrades confidence to high with Venmo enrichment', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Sushi Palace' }),
      txn({ amount: -50, date: '2025-03-02', name: 'Venmo', account: 'Venmo', venmo_counterparty: 'Jake' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(1)
    expect(results[0].confidence).toBe('high')
  })

  it('upgrades confidence to high with high-split PFC', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Sushi Palace', personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANTS' } }),
      txn({ amount: -50, date: '2025-03-02', name: 'Venmo', account: 'Venmo' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(1)
    expect(results[0].confidence).toBe('high')
  })

  it('medium confidence without bonus signals', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Random Store' }),
      txn({ amount: -50, date: '2025-03-02', name: 'Venmo', account: 'Venmo' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(1)
    expect(results[0].confidence).toBe('medium')
  })

  it('prefers high confidence match over medium', () => {
    const transactions = [
      // Two possible purchases for the same P2P
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Random Store' }),
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Restaurant', personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANTS' } }),
      txn({ amount: -50, date: '2025-03-02', name: 'Venmo', account: 'Venmo' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(1)
    // Should prefer the restaurant (high confidence via PFC)
    expect(results[0].confidence).toBe('high')
    expect(results[0].purchaseTxn.merchant_name).toBe('Restaurant')
  })
})

// ---------------------------------------------------------------------------
// detectReturns
// ---------------------------------------------------------------------------
describe('detectReturns', () => {
  beforeEach(resetIds)

  it('detects a basic return by merchant_name', () => {
    const transactions = [
      txn({ amount: 89.99, date: '2025-03-01', merchant_name: 'Nike' }),
      txn({ amount: -89.99, date: '2025-03-10', merchant_name: 'Nike' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('return')
    expect(results[0].confidence).toBe('high')
    expect(results[0].chargeTxn.transaction_id).toBe('txn_1')
    expect(results[0].refundTxn.transaction_id).toBe('txn_2')
  })

  it('detects return by name with RETURN suffix stripped', () => {
    const transactions = [
      txn({ amount: 50, date: '2025-03-01', name: 'Target' }),
      txn({ amount: -50, date: '2025-03-05', name: 'Target Return' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(1)
  })

  it('detects return by name with REFUND suffix stripped', () => {
    const transactions = [
      txn({ amount: 30, date: '2025-03-01', name: 'Amazon' }),
      txn({ amount: -30, date: '2025-03-15', name: 'Amazon Refund' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(1)
  })

  it('allows amount tolerance of $0.50', () => {
    const transactions = [
      txn({ amount: 89.99, date: '2025-03-01', merchant_name: 'Nike' }),
      txn({ amount: -89.50, date: '2025-03-10', merchant_name: 'Nike' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(1)
  })

  it('rejects if amount difference exceeds tolerance', () => {
    const transactions = [
      txn({ amount: 89.99, date: '2025-03-01', merchant_name: 'Nike' }),
      txn({ amount: -80, date: '2025-03-10', merchant_name: 'Nike' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(0)
  })

  it('rejects if refund is before charge', () => {
    const transactions = [
      txn({ amount: 89.99, date: '2025-03-10', merchant_name: 'Nike' }),
      txn({ amount: -89.99, date: '2025-03-01', merchant_name: 'Nike' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(0)
  })

  it('rejects if outside date window (>30 days)', () => {
    const transactions = [
      txn({ amount: 89.99, date: '2025-01-01', merchant_name: 'Nike' }),
      txn({ amount: -89.99, date: '2025-03-01', merchant_name: 'Nike' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(0)
  })

  it('rejects different merchants', () => {
    const transactions = [
      txn({ amount: 50, date: '2025-03-01', merchant_name: 'Nike' }),
      txn({ amount: -50, date: '2025-03-05', merchant_name: 'Adidas' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(0)
  })

  it('is case-insensitive on merchant matching', () => {
    const transactions = [
      txn({ amount: 50, date: '2025-03-01', merchant_name: 'NIKE' }),
      txn({ amount: -50, date: '2025-03-05', merchant_name: 'nike' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(1)
  })

  it('skips P2P transactions', () => {
    const transactions = [
      txn({ amount: 50, date: '2025-03-01', name: 'Venmo', account: 'Venmo' }),
      txn({ amount: -50, date: '2025-03-05', name: 'Venmo', account: 'Venmo' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(0)
  })

  it('skips already linked transactions', () => {
    const transactions = [
      txn({ amount: 50, date: '2025-03-01', merchant_name: 'Nike' }),
      txn({ amount: -50, date: '2025-03-05', merchant_name: 'Nike', linkedTransaction: { transaction_id: 'other' } }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(0)
  })

  it('skips dismissed credits', () => {
    const transactions = [
      txn({ amount: 50, date: '2025-03-01', merchant_name: 'Nike' }),
      txn({ amount: -50, date: '2025-03-05', merchant_name: 'Nike', dismissedRelationship: '2025-03-06T00:00:00Z' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// detectRelationships (integration)
// ---------------------------------------------------------------------------
describe('detectRelationships', () => {
  beforeEach(resetIds)

  it('returns empty array for null/empty input', () => {
    expect(detectRelationships(null)).toEqual([])
    expect(detectRelationships([])).toEqual([])
  })

  it('detects both returns and splits', () => {
    const transactions = [
      // Return pair
      txn({ amount: 89.99, date: '2025-03-01', merchant_name: 'Nike' }),
      txn({ amount: -89.99, date: '2025-03-10', merchant_name: 'Nike' }),
      // Split pair
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Sushi Palace' }),
      txn({ amount: -50, date: '2025-03-02', name: 'Venmo', account: 'Venmo' }),
    ]
    const results = detectRelationships(transactions)
    expect(results).toHaveLength(2)
    expect(results[0].type).toBe('return')
    expect(results[1].type).toBe('split')
  })

  it('returns come first, then splits', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Sushi Palace' }),
      txn({ amount: -50, date: '2025-03-02', name: 'Venmo', account: 'Venmo' }),
      txn({ amount: 89.99, date: '2025-03-01', merchant_name: 'Nike' }),
      txn({ amount: -89.99, date: '2025-03-10', merchant_name: 'Nike' }),
    ]
    const results = detectRelationships(transactions)
    expect(results[0].type).toBe('return')
    expect(results[1].type).toBe('split')
  })

  it('return-matched transactions are excluded from split detection', () => {
    // A charge + credit from Nike that matches as return
    // The credit should NOT also match as a P2P split candidate
    const transactions = [
      txn({ amount: 50, date: '2025-03-01', merchant_name: 'Nike' }),
      txn({ amount: -50, date: '2025-03-05', merchant_name: 'Nike' }),
      // A purchase that might split-match the Nike credit if it leaked through
      txn({ amount: 100, date: '2025-03-04', merchant_name: 'Restaurant' }),
    ]
    const results = detectRelationships(transactions)
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('return')
  })

  it('handles no matches gracefully', () => {
    const transactions = [
      txn({ amount: 100, date: '2025-03-01', merchant_name: 'Target' }),
      txn({ amount: 75, date: '2025-03-02', merchant_name: 'Costco' }),
    ]
    const results = detectRelationships(transactions)
    expect(results).toHaveLength(0)
  })
})
