import { describe, it, expect } from 'vitest'
import {
  isP2PTransaction,
  isCommonSplitRatio,
  detectSplits,
  detectReturns,
  detectRelationships,
} from '@/utils/relationshipDetector'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0
function txn(fields) {
  return {
    transaction_id: `txn-${++idCounter}`,
    name: 'TEST TXN',
    merchant_name: null,
    amount: 10,
    date: '2026-03-05',
    account: 'Chase',
    personal_finance_category: { primary: 'GENERAL', detailed: '' },
    ...fields,
  }
}

// ---------------------------------------------------------------------------
// isP2PTransaction
// ---------------------------------------------------------------------------

describe('isP2PTransaction', () => {
  it('detects Venmo by account name', () => {
    expect(isP2PTransaction(txn({ account: 'Venmo' }))).toBe(true)
  })

  it('detects Zelle by transaction name', () => {
    expect(isP2PTransaction(txn({ name: 'ZELLE PAYMENT FROM' }))).toBe(true)
  })

  it('detects Cash App by merchant name', () => {
    expect(isP2PTransaction(txn({ merchant_name: 'Cash App' }))).toBe(true)
  })

  it('detects PayPal', () => {
    expect(isP2PTransaction(txn({ name: 'PAYPAL TRANSFER' }))).toBe(true)
  })

  it('does not flag regular transactions', () => {
    expect(isP2PTransaction(txn({ name: 'STARBUCKS', merchant_name: 'Starbucks', account: 'Chase' }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isCommonSplitRatio
// ---------------------------------------------------------------------------

describe('isCommonSplitRatio', () => {
  it('detects 50/50 split', () => {
    const result = isCommonSplitRatio(-47, 94)
    expect(result).toBeTruthy()
    expect(result.n).toBe(2)
    expect(result.exact).toBe(true)
  })

  it('rejects 3-way split (only 1/2 supported)', () => {
    const result = isCommonSplitRatio(-50, 150)
    expect(result).toBeNull()
  })

  it('rejects 4-way split (only 1/2 supported)', () => {
    const result = isCommonSplitRatio(-100, 400)
    expect(result).toBeNull()
  })

  it('allows 1% tolerance', () => {
    // 50.50/100 = 0.505, target 0.50, diff 0.005 < 0.01
    const result = isCommonSplitRatio(-50.50, 100)
    expect(result).toBeTruthy()
    expect(result.n).toBe(2)
    expect(result.exact).toBe(false)
  })

  it('rejects ratios outside tolerance', () => {
    // 15/100 = 0.15, not close to 1/2 (0.50), 1/3 (0.333), or 1/4 (0.25)
    expect(isCommonSplitRatio(-15, 100)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// detectSplits
// ---------------------------------------------------------------------------

describe('detectSplits', () => {
  it('detects high-confidence same-day dining split with enrichment', () => {
    const transactions = [
      txn({ name: 'SUSHI PALACE', merchant_name: 'Sushi Palace', amount: 94, date: '2026-03-05',
        personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANTS' } }),
      txn({ name: 'VENMO PAYMENT', amount: -47, date: '2026-03-05', account: 'Venmo',
        venmo_counterparty: 'Jake', venmo_note: 'sushi' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('split')
    expect(results[0].confidence).toBe('high')
    expect(results[0].purchaseTxn.merchant_name).toBe('Sushi Palace')
  })

  it('detects high-confidence split from high-PFC category alone', () => {
    const transactions = [
      txn({ name: 'BAR TAB', merchant_name: 'Pub', amount: 80, date: '2026-03-01',
        personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_BAR' } }),
      txn({ name: 'ZELLE PAYMENT FROM', amount: -40, date: '2026-03-02', account: 'Chase' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(1)
    expect(results[0].confidence).toBe('high')
  })

  it('detects medium-confidence split when no bonus signals', () => {
    const transactions = [
      txn({ name: 'SOME STORE', merchant_name: 'Store', amount: 80, date: '2026-03-01',
        personal_finance_category: { primary: 'GENERAL_MERCHANDISE', detailed: '' } }),
      txn({ name: 'VENMO PAYMENT', amount: -40, date: '2026-03-03', account: 'Venmo' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(1)
    expect(results[0].confidence).toBe('medium')
  })

  it('rejects split when ratio does not match 1/N', () => {
    const transactions = [
      txn({ name: 'AMAZON', merchant_name: 'Amazon', amount: 100, date: '2026-03-01' }),
      txn({ name: 'VENMO PAYMENT', amount: -15, date: '2026-03-02', account: 'Venmo' }),
    ]
    expect(detectSplits(transactions)).toHaveLength(0)
  })

  it('rejects split when date gap exceeds window', () => {
    const transactions = [
      txn({ name: 'DINNER', merchant_name: 'Restaurant', amount: 60, date: '2026-02-01' }),
      txn({ name: 'VENMO PAYMENT', amount: -30, date: '2026-02-15', account: 'Venmo' }),
    ]
    expect(detectSplits(transactions)).toHaveLength(0)
  })

  it('rejects split when P2P date is before purchase', () => {
    const transactions = [
      txn({ name: 'DINNER', merchant_name: 'Restaurant', amount: 60, date: '2026-03-10' }),
      txn({ name: 'VENMO PAYMENT', amount: -30, date: '2026-03-08', account: 'Venmo' }),
    ]
    expect(detectSplits(transactions)).toHaveLength(0)
  })

  it('only matches one P2P payment per purchase (1:1)', () => {
    const transactions = [
      txn({ name: 'CONCERT', merchant_name: 'Ticketmaster', amount: 100, date: '2026-03-02',
        personal_finance_category: { primary: 'ENTERTAINMENT', detailed: '' } }),
      txn({ name: 'VENMO PAYMENT', amount: -50, date: '2026-03-03', account: 'Venmo' }),
      txn({ name: 'ZELLE PAYMENT FROM', amount: -50, date: '2026-03-04', account: 'Chase' }),
    ]
    const results = detectSplits(transactions)
    expect(results).toHaveLength(1)
    expect(results[0].p2pTxn.name).toBe('VENMO PAYMENT')
  })

  it('skips already-linked transactions', () => {
    const transactions = [
      txn({ name: 'DINNER', amount: 100, date: '2026-03-01',
        linkedTransaction: { transaction_id: 'other', type: 'split' } }),
      txn({ name: 'VENMO PAYMENT', amount: -50, date: '2026-03-01', account: 'Venmo' }),
    ]
    expect(detectSplits(transactions)).toHaveLength(0)
  })

  it('skips dismissed P2P transactions', () => {
    const transactions = [
      txn({ name: 'DINNER', amount: 100, date: '2026-03-01' }),
      txn({ name: 'VENMO PAYMENT', amount: -50, date: '2026-03-01', account: 'Venmo',
        dismissedRelationship: true }),
    ]
    expect(detectSplits(transactions)).toHaveLength(0)
  })

  it('does not match non-P2P incoming transactions', () => {
    const transactions = [
      txn({ name: 'DINNER', amount: 100, date: '2026-03-01' }),
      txn({ name: 'SOME CREDIT', amount: -50, date: '2026-03-01', account: 'Chase' }),
    ]
    expect(detectSplits(transactions)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// detectReturns
// ---------------------------------------------------------------------------

describe('detectReturns', () => {
  it('detects exact refund from same merchant', () => {
    const transactions = [
      txn({ name: 'TARGET #5678', merchant_name: 'Target', amount: 45.67, date: '2026-03-02' }),
      txn({ name: 'TARGET #5678 RETURN', merchant_name: 'Target', amount: -45.67, date: '2026-03-05' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('return')
    expect(results[0].confidence).toBe('high')
  })

  it('detects refund within $0.50 tolerance', () => {
    const transactions = [
      txn({ name: 'BEST BUY', merchant_name: 'Best Buy', amount: 149.99, date: '2026-02-20' }),
      txn({ name: 'BEST BUY RETURN', merchant_name: 'Best Buy', amount: -149.50, date: '2026-02-25' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(1)
  })

  it('rejects when amount diff exceeds tolerance', () => {
    const transactions = [
      txn({ name: 'NORDSTROM', merchant_name: 'Nordstrom', amount: 200, date: '2026-02-10' }),
      txn({ name: 'NORDSTROM REFUND', merchant_name: 'Nordstrom', amount: -185, date: '2026-02-18' }),
    ]
    expect(detectReturns(transactions)).toHaveLength(0)
  })

  it('rejects when merchants differ', () => {
    const transactions = [
      txn({ name: 'UNIQLO', merchant_name: 'Uniqlo', amount: 50, date: '2026-03-01' }),
      txn({ name: 'H&M ONLINE', merchant_name: 'H&M', amount: -50, date: '2026-03-03' }),
    ]
    expect(detectReturns(transactions)).toHaveLength(0)
  })

  it('rejects when refund is too late', () => {
    const transactions = [
      txn({ name: 'REI', merchant_name: 'REI', amount: 120, date: '2026-01-05' }),
      txn({ name: 'REI RETURN', merchant_name: 'REI', amount: -120, date: '2026-02-20' }),
    ]
    expect(detectReturns(transactions)).toHaveLength(0)
  })

  it('matches by name when merchant_name is null', () => {
    const transactions = [
      txn({ name: 'SOME STORE #123', merchant_name: null, amount: 30, date: '2026-03-01' }),
      txn({ name: 'SOME STORE #123', merchant_name: null, amount: -30, date: '2026-03-05' }),
    ]
    const results = detectReturns(transactions)
    expect(results).toHaveLength(1)
  })

  it('does not match P2P transactions as returns', () => {
    const transactions = [
      txn({ name: 'VENMO', merchant_name: 'Venmo', amount: 50, date: '2026-03-01' }),
      txn({ name: 'VENMO', merchant_name: 'Venmo', amount: -50, date: '2026-03-03' }),
    ]
    expect(detectReturns(transactions)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// detectRelationships (integration)
// ---------------------------------------------------------------------------

describe('detectRelationships', () => {
  it('returns empty for empty input', () => {
    expect(detectRelationships([])).toEqual([])
    expect(detectRelationships(null)).toEqual([])
  })

  it('excludes return-matched transactions from split detection', () => {
    const transactions = [
      // Nike charge + refund (should be detected as return)
      txn({ name: 'NIKE', merchant_name: 'Nike', amount: 89.99, date: '2026-03-03' }),
      txn({ name: 'NIKE REFUND', merchant_name: 'Nike', amount: -89.99, date: '2026-03-07' }),
      // Orphan Venmo that happens to be ~1/4 of Nike charge (25/89.99 ≈ 0.278)
      txn({ name: 'VENMO PAYMENT', amount: -25, date: '2026-03-08', account: 'Venmo' }),
    ]
    const results = detectRelationships(transactions)
    // Should only find the return, not a false split with Nike
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('return')
  })

  it('detects both splits and returns in one pass', () => {
    const transactions = [
      // Split pair
      txn({ name: 'DINNER', amount: 100, date: '2026-03-01',
        personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: '' } }),
      txn({ name: 'VENMO PAYMENT', amount: -50, date: '2026-03-01', account: 'Venmo' }),
      // Return pair
      txn({ name: 'NIKE', merchant_name: 'Nike', amount: 89.99, date: '2026-03-03' }),
      txn({ name: 'NIKE REFUND', merchant_name: 'Nike', amount: -89.99, date: '2026-03-07' }),
    ]
    const results = detectRelationships(transactions)
    expect(results).toHaveLength(2)
    expect(results.find(r => r.type === 'split')).toBeTruthy()
    expect(results.find(r => r.type === 'return')).toBeTruthy()
  })
})
