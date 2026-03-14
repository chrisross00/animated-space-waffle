import { describe, it, expect, vi, beforeEach } from 'vitest'
import { matchesCondition, sweepStore, condKey, findExistingRule, applyMerchantRuleToStore, applyCompoundRuleToStore, findSimilarTransactions, getAttribution, formatConditions } from '@/utils/ruleUtils'

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
// matchesCondition — merchant_name (contains)
// ---------------------------------------------------------------------------

describe('matchesCondition — merchant_name (contains)', () => {
  it('matches substring case-insensitively', () => {
    expect(matchesCondition(txn({ merchant_name: 'Starbucks Coffee' }), cond('merchant_name', 'contains', { value: 'starbucks' }))).toBe(true)
    expect(matchesCondition(txn({ merchant_name: 'Starbucks Coffee' }), cond('merchant_name', 'contains', { value: 'COFFEE' }))).toBe(true)
  })

  it('rejects when substring is absent', () => {
    expect(matchesCondition(txn({ merchant_name: 'Starbucks' }), cond('merchant_name', 'contains', { value: 'Uber' }))).toBe(false)
  })

  it('rejects null merchant_name', () => {
    expect(matchesCondition(txn({ merchant_name: null }), cond('merchant_name', 'contains', { value: 'Star' }))).toBe(false)
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
// matchesCondition — name (contains)
// ---------------------------------------------------------------------------

describe('matchesCondition — name (contains)', () => {
  it('matches substring case-insensitively', () => {
    expect(matchesCondition(txn({ name: 'Zelle Payment From John' }), cond('name', 'contains', { value: 'zelle' }))).toBe(true)
    expect(matchesCondition(txn({ name: 'Zelle Payment From John' }), cond('name', 'contains', { value: 'PAYMENT' }))).toBe(true)
  })

  it('rejects when substring is absent', () => {
    expect(matchesCondition(txn({ name: 'Zelle Payment' }), cond('name', 'contains', { value: 'Venmo' }))).toBe(false)
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
// matchesCondition — amount (gt)
// ---------------------------------------------------------------------------

describe('matchesCondition — amount (gt)', () => {
  it('matches when abs amount is greater than value', () => {
    expect(matchesCondition(txn({ amount: 50 }), cond('amount', 'gt', { value: 25 }))).toBe(true)
  })

  it('rejects when abs amount equals value', () => {
    expect(matchesCondition(txn({ amount: 25 }), cond('amount', 'gt', { value: 25 }))).toBe(false)
  })

  it('rejects when abs amount is less than value', () => {
    expect(matchesCondition(txn({ amount: 10 }), cond('amount', 'gt', { value: 25 }))).toBe(false)
  })

  it('works with negative amounts (uses absolute value)', () => {
    expect(matchesCondition(txn({ amount: -50 }), cond('amount', 'gt', { value: 25 }))).toBe(true)
    expect(matchesCondition(txn({ amount: -10 }), cond('amount', 'gt', { value: 25 }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// matchesCondition — amount (lt)
// ---------------------------------------------------------------------------

describe('matchesCondition — amount (lt)', () => {
  it('matches when abs amount is less than value', () => {
    expect(matchesCondition(txn({ amount: 10 }), cond('amount', 'lt', { value: 25 }))).toBe(true)
  })

  it('rejects when abs amount equals value', () => {
    expect(matchesCondition(txn({ amount: 25 }), cond('amount', 'lt', { value: 25 }))).toBe(false)
  })

  it('rejects when abs amount is greater than value', () => {
    expect(matchesCondition(txn({ amount: 50 }), cond('amount', 'lt', { value: 25 }))).toBe(false)
  })

  it('works with negative amounts (uses absolute value)', () => {
    expect(matchesCondition(txn({ amount: -10 }), cond('amount', 'lt', { value: 25 }))).toBe(true)
    expect(matchesCondition(txn({ amount: -50 }), cond('amount', 'lt', { value: 25 }))).toBe(false)
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

// ---------------------------------------------------------------------------
// condKey
// ---------------------------------------------------------------------------

describe('condKey', () => {
  it('produces a stable string for eq conditions', () => {
    expect(condKey({ field: 'merchant_name', op: 'eq', value: 'Uber' })).toBe('merchant_name|eq|Uber||')
  })

  it('produces a stable string for range conditions', () => {
    expect(condKey({ field: 'amount', op: 'range', min: 10, max: 100 })).toBe('amount|range||10|100')
  })

  it('treats missing value/min/max as empty string', () => {
    expect(condKey({ field: 'name', op: 'eq' })).toBe('name|eq|||')
  })
})

// ---------------------------------------------------------------------------
// findExistingRule
// ---------------------------------------------------------------------------

function makeRuleStore(rules) {
  return { state: { rules }, commit: vi.fn() }
}

const CONDITIONS = [
  { field: 'merchant_name', op: 'eq', value: 'Starbucks' },
  { field: 'amount', op: 'eq', value: 6 },
]

describe('findExistingRule', () => {
  it('finds a rule whose conditions match exactly', () => {
    const rule = { _id: '1', conditions: CONDITIONS, action: { categoryName: 'Coffee' } }
    const store = makeRuleStore([rule])
    expect(findExistingRule(store, CONDITIONS)).toBe(rule)
  })

  it('matches regardless of condition order', () => {
    const rule = { _id: '1', conditions: [...CONDITIONS].reverse(), action: {} }
    const store = makeRuleStore([rule])
    expect(findExistingRule(store, CONDITIONS)).toBe(rule)
  })

  it('returns null when no rule matches', () => {
    const rule = { _id: '1', conditions: [{ field: 'merchant_name', op: 'eq', value: 'Uber' }], action: {} }
    const store = makeRuleStore([rule])
    expect(findExistingRule(store, CONDITIONS)).toBeNull()
  })

  it('returns null for empty rules list', () => {
    expect(findExistingRule(makeRuleStore([]), CONDITIONS)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// applyMerchantRuleToStore
// ---------------------------------------------------------------------------

function makeCategoryStore(categories) {
  const commit = vi.fn()
  return { state: { categories }, commit }
}

describe('applyMerchantRuleToStore', () => {
  let notify

  beforeEach(() => { notify = vi.fn() })

  it('adds rule to new category when none existed before', () => {
    const store = makeCategoryStore([
      { _id: 'a', category: 'Coffee', rules: {} },
    ])
    applyMerchantRuleToStore(store, 'merchant_name', 'Starbucks', 'Coffee', notify)
    expect(store.commit).toHaveBeenCalledWith('addCategoryRule', { categoryId: 'a', ruleType: 'merchant_name', ruleValue: 'Starbucks' })
    expect(notify).not.toHaveBeenCalled()
  })

  it('notifies "already exists" when rule is already in target category', () => {
    const store = makeCategoryStore([
      { _id: 'a', category: 'Coffee', rules: { merchant_name: ['Starbucks'] } },
    ])
    applyMerchantRuleToStore(store, 'merchant_name', 'Starbucks', 'Coffee', notify)
    expect(store.commit).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('already exists') }))
  })

  it('removes from old category and adds to new, notifies "updated"', () => {
    const store = makeCategoryStore([
      { _id: 'a', category: 'Coffee', rules: { merchant_name: ['Starbucks'] } },
      { _id: 'b', category: 'Dining', rules: {} },
    ])
    applyMerchantRuleToStore(store, 'merchant_name', 'Starbucks', 'Dining', notify)
    expect(store.commit).toHaveBeenCalledWith('updateCategoryRules', { categoryId: 'a', ruleType: 'merchant_name', ruleValue: 'Starbucks' })
    expect(store.commit).toHaveBeenCalledWith('addCategoryRule', { categoryId: 'b', ruleType: 'merchant_name', ruleValue: 'Starbucks' })
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('updated') }))
  })
})

// ---------------------------------------------------------------------------
// applyCompoundRuleToStore
// ---------------------------------------------------------------------------

function makeFullStore(rules = [], transactions = []) {
  const commit = vi.fn()
  return { state: { rules, transactions }, commit }
}

describe('applyCompoundRuleToStore', () => {
  let notify, saveCompoundRule, updateCompoundRule, api

  beforeEach(() => {
    notify = vi.fn()
    saveCompoundRule = vi.fn().mockResolvedValue({ _id: 'new', conditions: CONDITIONS, action: { categoryName: 'Coffee' } })
    updateCompoundRule = vi.fn().mockResolvedValue({})
    api = { saveCompoundRule, updateCompoundRule }
  })

  const payload = {
    label: 'Starbucks $6',
    conditions: CONDITIONS,
    action: { type: 'categorize', categoryName: 'Coffee' },
  }

  it('saves new rule and commits addRule when no existing rule', async () => {
    const store = makeFullStore([], [])
    await applyCompoundRuleToStore(store, payload, 'Coffee', notify, api)
    expect(saveCompoundRule).toHaveBeenCalledWith(payload)
    expect(store.commit).toHaveBeenCalledWith('addRule', expect.objectContaining({ _id: 'new' }))
    expect(notify).not.toHaveBeenCalled()
  })

  it('does not commit addRule when saveCompoundRule returns null', async () => {
    saveCompoundRule.mockResolvedValue(null)
    const store = makeFullStore([], [])
    await applyCompoundRuleToStore(store, payload, 'Coffee', notify, api)
    expect(store.commit).not.toHaveBeenCalledWith('addRule', expect.anything())
  })

  it('updates existing rule and notifies when category differs', async () => {
    const existing = { _id: 'r1', label: 'Starbucks $6', conditions: CONDITIONS, action: { type: 'categorize', categoryName: 'OldCat' } }
    const store = makeFullStore([existing], [])
    await applyCompoundRuleToStore(store, payload, 'Coffee', notify, api)
    expect(updateCompoundRule).toHaveBeenCalledWith('r1', existing.label, existing.conditions, expect.objectContaining({ categoryName: 'Coffee' }))
    expect(store.commit).toHaveBeenCalledWith('updateRule', expect.objectContaining({ ruleId: 'r1' }))
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('updated') }))
  })

  it('notifies "already exists" when existing rule has same category', async () => {
    const existing = { _id: 'r1', label: 'Starbucks $6', conditions: CONDITIONS, action: { type: 'categorize', categoryName: 'Coffee' } }
    const store = makeFullStore([existing], [])
    await applyCompoundRuleToStore(store, payload, 'Coffee', notify, api)
    expect(updateCompoundRule).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('already exists') }))
  })

  it('always calls sweepStore after save or update', async () => {
    const store = makeFullStore([], [txn({ transaction_id: '1', merchant_name: 'Starbucks', amount: 6 })])
    await applyCompoundRuleToStore(store, payload, 'Coffee', notify, api)
    expect(store.commit).toHaveBeenCalledWith('updateTransaction', expect.objectContaining({ mappedCategory: 'Coffee' }))
  })
})

// ---------------------------------------------------------------------------
// findSimilarTransactions
// ---------------------------------------------------------------------------

describe('findSimilarTransactions', () => {
  it('matches by merchant_name (strategy 1)', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Starbucks' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Starbucks', mappedCategory: 'To Sort' }),
      txn({ transaction_id: 'c', merchant_name: 'Uber', mappedCategory: 'To Sort' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('merchant_name')
    expect(result.ruleType).toBe('merchant')
    expect(result.ruleField).toBe('merchant_name')
    expect(result.ruleValue).toBe('Starbucks')
    expect(result.allCount).toBe(1)
    expect(result.label).toBe('Starbucks')
  })

  it('is case-insensitive for merchant_name', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'STARBUCKS' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'starbucks', mappedCategory: 'Coffee' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.allCount).toBe(1)
    expect(result.strategy).toBe('merchant_name')
  })

  it('uses name + account when merchant_name is null (strategy 2)', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: 'Venmo Payment', account: 'Chase' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', name: 'Venmo Payment', account: 'Chase', mappedCategory: 'To Sort' }),
      txn({ transaction_id: 'c', name: 'Venmo Payment', account: 'BofA', mappedCategory: 'To Sort' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('name_account')
    expect(result.ruleType).toBe('compound')
    expect(result.allCount).toBe(1)
    expect(result.conditions).toEqual([
      { field: 'name', op: 'eq', value: 'Venmo Payment' },
      { field: 'account', op: 'eq', value: 'Chase' },
    ])
  })

  it('falls back to name-only when account is null (strategy 3)', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: 'Venmo', account: null })
    const all = [
      anchor,
      txn({ transaction_id: 'b', name: 'Venmo', mappedCategory: 'To Sort' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('name')
    expect(result.ruleType).toBe('merchant')
    expect(result.ruleField).toBe('name')
    expect(result.ruleValue).toBe('Venmo')
    expect(result.allCount).toBe(1)
  })

  it('treats account "?" as no account — falls through to strategy 3', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: 'Zelle', account: '?' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', name: 'Zelle', account: '?', mappedCategory: 'To Sort' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('name')
    expect(result.ruleType).toBe('merchant')
  })

  it('excludes the anchor transaction by transaction_id', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Starbucks' })
    const all = [anchor]
    const result = findSimilarTransactions(anchor, all)
    expect(result.allCount).toBe(0)
    expect(result.matches).toHaveLength(0)
  })

  it('includes manually_set transactions in matches', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Starbucks' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Starbucks', manually_set: true }),
      txn({ transaction_id: 'c', merchant_name: 'Starbucks', manually_set: false }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.allCount).toBe(2)
    expect(result.matches).toHaveLength(2)
  })

  it('includes matches from all categories', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Starbucks' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Starbucks', mappedCategory: 'To Sort' }),
      txn({ transaction_id: 'c', merchant_name: 'Starbucks', mappedCategory: 'Coffee' }),
      txn({ transaction_id: 'd', merchant_name: 'Starbucks', mappedCategory: 'Food' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.allCount).toBe(3)
    expect(result.matches.map(m => m.mappedCategory)).toEqual(['To Sort', 'Coffee', 'Food'])
  })

  it('returns zeroes and null strategy when no matches', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'UniqueShop' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Uber', mappedCategory: 'Transport' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.allCount).toBe(0)
    expect(result.strategy).toBe('merchant_name')
  })

  it('returns empty result for anchor with no name and no merchant', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: '' })
    const result = findSimilarTransactions(anchor, [anchor])
    expect(result.strategy).toBeNull()
    expect(result.allCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getAttribution
// ---------------------------------------------------------------------------

describe('getAttribution', () => {
  const categories = [
    { _id: 'c1', category: 'Coffee', rules: { merchant_name: ['Starbucks'], name: ['Morning Brew'] }, plaid_pfc: [] },
    { _id: 'c2', category: 'Transfers', rules: {}, plaid_pfc: ['TRANSFER_IN'] },
  ]

  const compoundRule = {
    _id: 'r1',
    label: 'Uber rides',
    conditions: [{ field: 'merchant_name', op: 'eq', value: 'Uber' }],
    action: { categoryName: 'Transport' },
  }

  it('returns manual attribution for manually_set transactions', () => {
    const result = getAttribution(txn({ manually_set: true }), categories, [])
    expect(result.type).toBe('manual')
    expect(result.label).toBe('You categorized this')
    expect(result.icon).toBe('edit')
    expect(result.linkable).toBeUndefined()
  })

  it('returns compound_rule attribution when a compound rule matches', () => {
    const result = getAttribution(txn({ merchant_name: 'Uber' }), categories, [compoundRule])
    expect(result.type).toBe('compound_rule')
    expect(result.ruleId).toBe('r1')
    expect(result.linkable).toBe(true)
    expect(result.label).toContain('Uber rides')
  })

  it('returns merchant_rule attribution when merchant_name rule matches', () => {
    const result = getAttribution(txn({ merchant_name: 'Starbucks' }), categories, [])
    expect(result.type).toBe('merchant_rule')
    expect(result.linkable).toBe(true)
    expect(result.label).toContain('Starbucks')
  })

  it('returns name_rule attribution when name rule matches', () => {
    const result = getAttribution(txn({ merchant_name: null, name: 'Morning Brew' }), categories, [])
    expect(result.type).toBe('name_rule')
    expect(result.linkable).toBe(true)
    expect(result.label).toContain('Morning Brew')
  })

  it('returns plaid_pfc attribution when PFC mapping matches', () => {
    const result = getAttribution(
      txn({ merchant_name: null, name: 'Bank Transfer', personal_finance_category: { primary: 'TRANSFER_IN' } }),
      categories, []
    )
    expect(result.type).toBe('plaid_pfc')
    expect(result.label).toBe('Auto-sorted by your bank')
    expect(result.linkable).toBeUndefined()
  })

  it('returns unsorted for To Sort transactions with no matching rule', () => {
    const result = getAttribution(txn({ merchant_name: null, name: 'Random', mappedCategory: 'To Sort' }), categories, [])
    expect(result.type).toBe('unsorted')
    expect(result.label).toBe('Needs sorting')
  })

  it('returns unknown for categorized transactions with no matching rule', () => {
    const result = getAttribution(txn({ merchant_name: null, name: 'Random', mappedCategory: 'Groceries' }), categories, [])
    expect(result.type).toBe('unknown')
    expect(result.label).toBe('Auto-sorted')
  })

  it('compound rule wins over merchant rule when both match', () => {
    const starbucksCompound = {
      _id: 'r2',
      label: 'Starbucks compound',
      conditions: [{ field: 'merchant_name', op: 'eq', value: 'Starbucks' }],
      action: { categoryName: 'Coffee' },
    }
    const result = getAttribution(txn({ merchant_name: 'Starbucks' }), categories, [starbucksCompound])
    expect(result.type).toBe('compound_rule')
    expect(result.ruleId).toBe('r2')
  })

  it('manually_set wins over everything', () => {
    const result = getAttribution(
      txn({ manually_set: true, merchant_name: 'Starbucks' }),
      categories, [compoundRule]
    )
    expect(result.type).toBe('manual')
  })
})

// ---------------------------------------------------------------------------
// formatConditions
// ---------------------------------------------------------------------------

describe('formatConditions', () => {
  it('formats eq on merchant_name', () => {
    expect(formatConditions([{ field: 'merchant_name', op: 'eq', value: 'Starbucks' }]))
      .toBe('merchant = Starbucks')
  })

  it('formats eq on name', () => {
    expect(formatConditions([{ field: 'name', op: 'eq', value: 'Coffee Shop' }]))
      .toBe('name = Coffee Shop')
  })

  it('formats eq on amount with integer', () => {
    expect(formatConditions([{ field: 'amount', op: 'eq', value: 50 }]))
      .toBe('amount = $50')
  })

  it('formats eq on amount with decimal', () => {
    expect(formatConditions([{ field: 'amount', op: 'eq', value: 12.5 }]))
      .toBe('amount = $12.50')
  })

  it('formats contains', () => {
    expect(formatConditions([{ field: 'name', op: 'contains', value: 'coffee' }]))
      .toBe('name contains "coffee"')
  })

  it('formats gt as >', () => {
    expect(formatConditions([{ field: 'amount', op: 'gt', value: 100 }]))
      .toBe('amount > $100')
  })

  it('formats lt as <', () => {
    expect(formatConditions([{ field: 'amount', op: 'lt', value: 25 }]))
      .toBe('amount < $25')
  })

  it('formats amount range with upper bound', () => {
    expect(formatConditions([{ field: 'amount', op: 'range', min: 10, max: 50 }]))
      .toBe('amount $10–$50')
  })

  it('formats amount range with high max as open-ended', () => {
    expect(formatConditions([{ field: 'amount', op: 'range', min: 100, max: 9999 }]))
      .toBe('amount $100+')
  })

  it('formats known field labels', () => {
    expect(formatConditions([{ field: 'personal_finance_category_primary', op: 'eq', value: 'INCOME' }]))
      .toBe('transfer type = INCOME')
  })

  it('falls back to raw field name for unknown fields', () => {
    expect(formatConditions([{ field: 'account', op: 'eq', value: 'Chase' }]))
      .toBe('account = Chase')
  })

  it('joins multiple conditions with ·', () => {
    const result = formatConditions([
      { field: 'merchant_name', op: 'eq', value: 'Target' },
      { field: 'amount', op: 'gt', value: 50 },
    ])
    expect(result).toBe('merchant = Target · amount > $50')
  })

  it('falls back to raw op for unknown operators', () => {
    expect(formatConditions([{ field: 'name', op: 'regex', value: '.*test' }]))
      .toBe('name regex .*test')
  })
})
