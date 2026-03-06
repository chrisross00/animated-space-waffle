import { describe, it, expect, vi } from 'vitest'
import { matchesCondition, sweepStore } from '@/utils/ruleUtils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function txn(fields) {
  return { name: 'Test', merchant_name: null, amount: 10, account: null, ...fields }
}

function cond(field, op, extras = {}) {
  return { field, op, ...extras }
}

// ---------------------------------------------------------------------------
// matchesCondition — merchant_name
// ---------------------------------------------------------------------------

describe('matchesCondition — merchant_name', () => {
  it('matches exact value', () => {
    expect(matchesCondition(txn({ merchant_name: 'Starbucks' }), cond('merchant_name', 'eq', { value: 'Starbucks' }))).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(matchesCondition(txn({ merchant_name: 'starbucks' }), cond('merchant_name', 'eq', { value: 'Starbucks' }))).toBe(true)
    expect(matchesCondition(txn({ merchant_name: 'STARBUCKS' }), cond('merchant_name', 'eq', { value: 'starbucks' }))).toBe(true)
  })

  it('does not match null merchant_name', () => {
    expect(matchesCondition(txn({ merchant_name: null }), cond('merchant_name', 'eq', { value: 'Starbucks' }))).toBe(false)
  })

  it('does not match wrong value', () => {
    expect(matchesCondition(txn({ merchant_name: 'Uber' }), cond('merchant_name', 'eq', { value: 'Starbucks' }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// matchesCondition — name
// ---------------------------------------------------------------------------

describe('matchesCondition — name', () => {
  it('matches exact value', () => {
    expect(matchesCondition(txn({ name: 'Zelle Payment' }), cond('name', 'eq', { value: 'Zelle Payment' }))).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(matchesCondition(txn({ name: 'VENMO' }), cond('name', 'eq', { value: 'Venmo' }))).toBe(true)
  })

  it('does not match wrong value', () => {
    expect(matchesCondition(txn({ name: 'Zelle' }), cond('name', 'eq', { value: 'Venmo' }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// matchesCondition — amount
// ---------------------------------------------------------------------------

describe('matchesCondition — amount (eq)', () => {
  it('matches exact amount', () => {
    expect(matchesCondition(txn({ amount: 12.50 }), cond('amount', 'eq', { value: 12.50 }))).toBe(true)
  })

  it('matches negative amount by absolute value', () => {
    expect(matchesCondition(txn({ amount: -12.50 }), cond('amount', 'eq', { value: 12.50 }))).toBe(true)
  })

  it('does not match wrong amount', () => {
    expect(matchesCondition(txn({ amount: 10 }), cond('amount', 'eq', { value: 12.50 }))).toBe(false)
  })
})

describe('matchesCondition — amount (range)', () => {
  it('matches amount within range', () => {
    expect(matchesCondition(txn({ amount: 50 }), cond('amount', 'range', { min: 10, max: 100 }))).toBe(true)
  })

  it('matches amount at range boundaries', () => {
    expect(matchesCondition(txn({ amount: 10 }), cond('amount', 'range', { min: 10, max: 100 }))).toBe(true)
    expect(matchesCondition(txn({ amount: 100 }), cond('amount', 'range', { min: 10, max: 100 }))).toBe(true)
  })

  it('does not match amount outside range', () => {
    expect(matchesCondition(txn({ amount: 5 }), cond('amount', 'range', { min: 10, max: 100 }))).toBe(false)
    expect(matchesCondition(txn({ amount: 101 }), cond('amount', 'range', { min: 10, max: 100 }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// matchesCondition — account
// ---------------------------------------------------------------------------

describe('matchesCondition — account', () => {
  it('matches institution name', () => {
    expect(matchesCondition(txn({ account: 'Chase' }), cond('account', 'eq', { value: 'Chase' }))).toBe(true)
  })

  it('does not match null account', () => {
    expect(matchesCondition(txn({ account: null }), cond('account', 'eq', { value: 'Chase' }))).toBe(false)
  })

  it('does not match wrong institution', () => {
    expect(matchesCondition(txn({ account: 'Chase' }), cond('account', 'eq', { value: 'Bank of America' }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// matchesCondition — unknown field
// ---------------------------------------------------------------------------

describe('matchesCondition — unknown field', () => {
  it('returns false for unknown fields', () => {
    expect(matchesCondition(txn(), cond('unknown_field', 'eq', { value: 'anything' }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// sweepStore
// ---------------------------------------------------------------------------

function makeStore(transactions) {
  const commit = vi.fn((mutation, payload) => {
    if (mutation === 'updateTransaction') {
      const idx = transactions.findIndex(t => t.transaction_id === payload.transaction_id)
      if (idx !== -1) transactions[idx] = payload
    }
  })
  return { state: { transactions }, commit }
}

describe('sweepStore', () => {
  it('updates mappedCategory on matching transactions', () => {
    const transactions = [
      txn({ transaction_id: '1', merchant_name: 'Starbucks', amount: 6 }),
      txn({ transaction_id: '2', merchant_name: 'Uber', amount: 20 }),
    ]
    const store = makeStore(transactions)
    sweepStore(store, [{ field: 'merchant_name', op: 'eq', value: 'Starbucks' }], 'Coffee')
    expect(store.commit).toHaveBeenCalledTimes(1)
    expect(store.commit).toHaveBeenCalledWith('updateTransaction', expect.objectContaining({
      transaction_id: '1', mappedCategory: 'Coffee',
    }))
  })

  it('skips manually_set transactions', () => {
    const transactions = [
      txn({ transaction_id: '1', merchant_name: 'Starbucks', manually_set: true }),
      txn({ transaction_id: '2', merchant_name: 'Starbucks', manually_set: false }),
    ]
    const store = makeStore(transactions)
    sweepStore(store, [{ field: 'merchant_name', op: 'eq', value: 'Starbucks' }], 'Coffee')
    expect(store.commit).toHaveBeenCalledTimes(1)
    expect(store.commit).toHaveBeenCalledWith('updateTransaction', expect.objectContaining({ transaction_id: '2' }))
  })

  it('respects toSortOnly — only sweeps To Sort transactions when true', () => {
    const transactions = [
      txn({ transaction_id: '1', merchant_name: 'Zelle', mappedCategory: 'To Sort' }),
      txn({ transaction_id: '2', merchant_name: 'Zelle', mappedCategory: 'Other' }),
    ]
    const store = makeStore(transactions)
    sweepStore(store, [{ field: 'merchant_name', op: 'eq', value: 'Zelle' }], 'Transfers', null, true)
    expect(store.commit).toHaveBeenCalledTimes(1)
    expect(store.commit).toHaveBeenCalledWith('updateTransaction', expect.objectContaining({ transaction_id: '1' }))
  })

  it('sweeps all matching when toSortOnly is false', () => {
    const transactions = [
      txn({ transaction_id: '1', merchant_name: 'Zelle', mappedCategory: 'To Sort' }),
      txn({ transaction_id: '2', merchant_name: 'Zelle', mappedCategory: 'Other' }),
    ]
    const store = makeStore(transactions)
    sweepStore(store, [{ field: 'merchant_name', op: 'eq', value: 'Zelle' }], 'Transfers', null, false)
    expect(store.commit).toHaveBeenCalledTimes(2)
  })

  it('applies note when provided', () => {
    const transactions = [txn({ transaction_id: '1', merchant_name: 'Zelle' })]
    const store = makeStore(transactions)
    sweepStore(store, [{ field: 'merchant_name', op: 'eq', value: 'Zelle' }], 'Transfers', 'auto-categorized')
    expect(store.commit).toHaveBeenCalledWith('updateTransaction', expect.objectContaining({ note: 'auto-categorized' }))
  })

  it('preserves existing note when note is null', () => {
    const transactions = [txn({ transaction_id: '1', merchant_name: 'Zelle', note: 'existing note' })]
    const store = makeStore(transactions)
    sweepStore(store, [{ field: 'merchant_name', op: 'eq', value: 'Zelle' }], 'Transfers', null)
    expect(store.commit).toHaveBeenCalledWith('updateTransaction', expect.objectContaining({ note: 'existing note' }))
  })

  it('requires all conditions to match (AND behavior)', () => {
    const transactions = [
      txn({ transaction_id: '1', merchant_name: 'Zelle', amount: 1200 }),
      txn({ transaction_id: '2', merchant_name: 'Zelle', amount: 50 }),
    ]
    const store = makeStore(transactions)
    sweepStore(store, [
      { field: 'merchant_name', op: 'eq', value: 'Zelle' },
      { field: 'amount', op: 'eq', value: 1200 },
    ], 'Transfers')
    expect(store.commit).toHaveBeenCalledTimes(1)
    expect(store.commit).toHaveBeenCalledWith('updateTransaction', expect.objectContaining({ transaction_id: '1' }))
  })

  it('does nothing when no transactions match', () => {
    const transactions = [txn({ transaction_id: '1', merchant_name: 'Uber' })]
    const store = makeStore(transactions)
    sweepStore(store, [{ field: 'merchant_name', op: 'eq', value: 'Zelle' }], 'Transfers')
    expect(store.commit).not.toHaveBeenCalled()
  })
})
