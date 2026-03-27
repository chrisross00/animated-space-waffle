import { describe, it, expect, vi, beforeEach } from 'vitest'
import { matchesCondition, sweepStore, condKey, findExistingRule, applyMerchantRuleToStore, applyCompoundRuleToStore, findSimilarTransactions, getAttribution, formatConditions, extractStablePrefix, isP2P } from '@/utils/ruleUtils'

// Mock toast so applyCompoundRuleToStore can call toast.show() without errors
vi.mock('@/composables/useToast', () => ({
  toast: { show: vi.fn() },
}))

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
  let toastShow

  beforeEach(async () => {
    const { toast } = await import('@/composables/useToast')
    toastShow = toast.show
    toastShow.mockClear()
  })

  it('adds rule to new category when none existed before', () => {
    const store = makeCategoryStore([
      { _id: 'a', category: 'Coffee', rules: {} },
    ])
    applyMerchantRuleToStore(store, 'merchant_name', 'Starbucks', 'Coffee')
    expect(store.commit).toHaveBeenCalledWith('addCategoryRule', { categoryId: 'a', ruleType: 'merchant_name', ruleValue: 'Starbucks' })
  })

  it('notifies "already exists" when rule is already in target category', () => {
    const store = makeCategoryStore([
      { _id: 'a', category: 'Coffee', rules: { merchant_name: ['Starbucks'] } },
    ])
    applyMerchantRuleToStore(store, 'merchant_name', 'Starbucks', 'Coffee')
    expect(store.commit).not.toHaveBeenCalled()
    expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('already exists') }))
  })

  it('removes from old category and adds to new, notifies "updated"', () => {
    const store = makeCategoryStore([
      { _id: 'a', category: 'Coffee', rules: { merchant_name: ['Starbucks'] } },
      { _id: 'b', category: 'Dining', rules: {} },
    ])
    applyMerchantRuleToStore(store, 'merchant_name', 'Starbucks', 'Dining')
    expect(store.commit).toHaveBeenCalledWith('updateCategoryRules', { categoryId: 'a', ruleType: 'merchant_name', ruleValue: 'Starbucks' })
    expect(store.commit).toHaveBeenCalledWith('addCategoryRule', { categoryId: 'b', ruleType: 'merchant_name', ruleValue: 'Starbucks' })
    expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('updated') }))
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
  let saveCompoundRule, updateCompoundRule, api, toastShow

  beforeEach(async () => {
    saveCompoundRule = vi.fn().mockResolvedValue({ _id: 'new', conditions: CONDITIONS, action: { categoryName: 'Coffee' } })
    updateCompoundRule = vi.fn().mockResolvedValue({})
    api = { saveCompoundRule, updateCompoundRule }
    const { toast } = await import('@/composables/useToast')
    toastShow = toast.show
    toastShow.mockClear()
  })

  const payload = {
    label: 'Starbucks $6',
    conditions: CONDITIONS,
    action: { type: 'categorize', categoryName: 'Coffee' },
  }

  it('saves new rule and commits addRule when no existing rule', async () => {
    const store = makeFullStore([], [])
    await applyCompoundRuleToStore(store, payload, 'Coffee', api)
    expect(saveCompoundRule).toHaveBeenCalledWith(payload)
    expect(store.commit).toHaveBeenCalledWith('addRule', expect.objectContaining({ _id: 'new' }))
  })

  it('does not commit addRule when saveCompoundRule returns null', async () => {
    saveCompoundRule.mockResolvedValue(null)
    const store = makeFullStore([], [])
    await applyCompoundRuleToStore(store, payload, 'Coffee', api)
    expect(store.commit).not.toHaveBeenCalledWith('addRule', expect.anything())
  })

  it('updates existing rule and notifies when category differs', async () => {
    const existing = { _id: 'r1', label: 'Starbucks $6', conditions: CONDITIONS, action: { type: 'categorize', categoryName: 'OldCat' } }
    const store = makeFullStore([existing], [])
    await applyCompoundRuleToStore(store, payload, 'Coffee', api)
    expect(updateCompoundRule).toHaveBeenCalledWith('r1', existing.label, existing.conditions, expect.objectContaining({ categoryName: 'Coffee' }))
    expect(store.commit).toHaveBeenCalledWith('updateRule', expect.objectContaining({ ruleId: 'r1' }))
    expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('updated') }))
  })

  it('notifies "already exists" when existing rule has same category', async () => {
    const existing = { _id: 'r1', label: 'Starbucks $6', conditions: CONDITIONS, action: { type: 'categorize', categoryName: 'Coffee' } }
    const store = makeFullStore([existing], [])
    await applyCompoundRuleToStore(store, payload, 'Coffee', api)
    expect(updateCompoundRule).not.toHaveBeenCalled()
    expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('already exists') }))
  })

  it('always calls sweepStore after save or update', async () => {
    const store = makeFullStore([], [txn({ transaction_id: '1', merchant_name: 'Starbucks', amount: 6 })])
    await applyCompoundRuleToStore(store, payload, 'Coffee', api)
    expect(store.commit).toHaveBeenCalledWith('updateTransaction', expect.objectContaining({ mappedCategory: 'Coffee' }))
  })
})

// ---------------------------------------------------------------------------
// findSimilarTransactions
// ---------------------------------------------------------------------------

describe('findSimilarTransactions', () => {
  // --- Tier 1: merchant_name ---

  it('tier 1: matches by merchant_name', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Starbucks', name: 'Starbucks Store #100' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Starbucks', name: 'Starbucks Store #200', mappedCategory: 'To Sort' }),
      txn({ transaction_id: 'c', merchant_name: 'Uber', name: 'Uber Trip', mappedCategory: 'To Sort' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('merchant_name')
    expect(result.ruleType).toBe('merchant')
    expect(result.ruleField).toBe('merchant_name')
    expect(result.ruleValue).toBe('Starbucks')
    expect(result.allCount).toBe(1)
    expect(result.label).toBe('Starbucks')
  })

  it('tier 1: is case-insensitive for merchant_name', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'STARBUCKS', name: 'STARBUCKS #100' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'starbucks', name: 'starbucks #200', mappedCategory: 'Coffee' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.allCount).toBe(1)
    expect(result.strategy).toBe('merchant_name')
  })

  it('tier 1: skips merchant for P2P transactions', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Venmo', name: 'Venmo', amount: -50, account: 'Chase' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Venmo', name: 'Venmo', amount: -25, account: 'Chase' }),
      txn({ transaction_id: 'c', merchant_name: 'Venmo', name: 'Venmo', amount: -75, account: 'Chase' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).not.toBe('merchant_name')
  })

  // --- Tier 2: exact_name ---

  it('tier 2: matches by exact name when merchant differs', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: 'CHASE CREDIT CRD EPAY', account: 'Chase' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', name: 'CHASE CREDIT CRD EPAY', account: 'Chase' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('exact_name')
    expect(result.ruleField).toBe('name')
    expect(result.allCount).toBe(1)
  })

  // --- Tier 3: name_account ---

  it('tier 3: matches by name + account when no merchant and exact name matches across accounts', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: 'Wire Transfer', account: 'Chase' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', name: 'Wire Transfer', account: 'Chase', mappedCategory: 'To Sort' }),
      txn({ transaction_id: 'c', name: 'Wire Transfer', account: 'BofA', mappedCategory: 'To Sort' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    // exact_name fires first and finds both b and c
    expect(result.strategy).toBe('exact_name')
    expect(result.allCount).toBe(2)
  })

  // --- Tier 4: name_prefix ---

  it('tier 4: matches by name prefix for payroll-style transactions', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: 'Gusto-OSV 00007055 CITIZENS PAID EARLY', account: 'Citizens Bank' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', name: 'Gusto-OSV 00007008 CITIZENS PAID EARLY', account: 'Citizens Bank' }),
      txn({ transaction_id: 'c', name: 'Gusto-OSV 00006956 CITIZENS PAID EARLY', account: 'Citizens Bank' }),
      txn({ transaction_id: 'd', name: 'Something Else', account: 'Citizens Bank' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('name_prefix')
    expect(result.allCount).toBe(2)
    expect(result.conditions).toEqual([{ field: 'name', op: 'contains', value: 'Gusto-OSV' }])
    expect(result.label).toBe('Gusto-OSV')
  })

  it('tier 4: matches by drop-last-token prefix (no digits)', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: 'DD *DOORDASH MASCAFE' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', name: 'DD *DOORDASH DAVESHOTC' }),
      txn({ transaction_id: 'c', name: 'DD *DOORDASH SHAWARMAK' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('name_prefix')
    expect(result.allCount).toBe(2)
    expect(result.label).toBe('DD *DOORDASH')
  })

  it('tier 4: skips name prefix for P2P transactions', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Venmo', name: 'Venmo Payment 12345', amount: -99, account: 'Chase' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Venmo', name: 'Venmo Payment 67890', amount: -88, account: 'Chase' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).not.toBe('name_prefix')
  })

  // --- Tier 5: amount_account ---

  it('tier 5: matches by amount + account as final fallback', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: 'Unique Payment ABC', amount: -100, account: 'Chase' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', name: 'Different Payment XYZ', amount: -100, account: 'Chase' }),
      txn({ transaction_id: 'c', name: 'Another Payment DEF', amount: -50, account: 'Chase' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('amount_account')
    expect(result.allCount).toBe(1)
  })

  it('tier 5: P2P only uses amount + account', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Venmo', name: 'Venmo', amount: -50, account: 'Chase' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Venmo', name: 'Venmo', amount: -50, account: 'Chase' }),
      txn({ transaction_id: 'c', merchant_name: 'Venmo', name: 'Venmo', amount: -25, account: 'Chase' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('amount_account')
    expect(result.allCount).toBe(1) // only b matches $50 + Chase
  })

  it('tier 5: requires account for amount matching (non-P2P)', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: 'Unique Thing', amount: -9.99, account: null })
    const all = [
      anchor,
      txn({ transaction_id: 'b', name: 'Other Thing', amount: -9.99, account: null }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.allCount).toBe(0)
  })

  it('P2P matches by amount alone when account is missing', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'Venmo', name: 'Venmo', amount: -16, account: null })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Venmo', name: 'Venmo', amount: -16, account: null }),
      txn({ transaction_id: 'c', merchant_name: 'Venmo', name: 'Venmo', amount: -25, account: null }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('amount')
    expect(result.allCount).toBe(1)
    expect(result.conditions).toEqual([{ field: 'amount', op: 'eq', value: 16 }])
  })

  // --- General behavior ---

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

  it('returns zero matches but valid strategy for "Remember for future"', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: 'UniqueShop', name: 'UniqueShop Purchase' })
    const all = [
      anchor,
      txn({ transaction_id: 'b', merchant_name: 'Uber', name: 'Uber Trip', mappedCategory: 'Transport' }),
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

  it('P2P with account "?" matches by amount alone', () => {
    const anchor = txn({ transaction_id: 'a', merchant_name: null, name: 'Zelle', account: '?', amount: -50 })
    const all = [
      anchor,
      txn({ transaction_id: 'b', name: 'Zelle', account: '?', amount: -50, mappedCategory: 'To Sort' }),
      txn({ transaction_id: 'c', name: 'Zelle', account: '?', amount: -30, mappedCategory: 'To Sort' }),
    ]
    const result = findSimilarTransactions(anchor, all)
    expect(result.strategy).toBe('amount')
    expect(result.allCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// extractStablePrefix
// ---------------------------------------------------------------------------

describe('extractStablePrefix', () => {
  it('extracts prefix before digit run', () => {
    expect(extractStablePrefix('Gusto-OSV 00007055 CITIZENS PAID EARLY')).toBe('Gusto-OSV')
  })

  it('strips trailing punctuation from prefix', () => {
    expect(extractStablePrefix('CHECK # 1234')).toBe('CHECK')
  })

  it('handles single-digit runs', () => {
    expect(extractStablePrefix('Gusto-OSV PAYROLL1 CITIZENS')).toBe('Gusto-OSV PAYROLL')
  })

  it('drops last token when no digits exist', () => {
    expect(extractStablePrefix('DD *DOORDASH MASCAFE')).toBe('DD *DOORDASH')
  })

  it('returns null when prefix would be too short', () => {
    expect(extractStablePrefix('AB 12345')).toBeNull()
  })

  it('returns null for single-token names without digits', () => {
    expect(extractStablePrefix('Netflix')).toBeNull()
  })

  it('returns null for empty/null input', () => {
    expect(extractStablePrefix('')).toBeNull()
    expect(extractStablePrefix(null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isP2P
// ---------------------------------------------------------------------------

describe('isP2P', () => {
  it('detects Venmo by merchant_name', () => {
    expect(isP2P(txn({ merchant_name: 'Venmo' }))).toBe(true)
  })

  it('detects Venmo by name (case-insensitive)', () => {
    expect(isP2P(txn({ name: 'VENMO PAYMENT' }))).toBe(true)
  })

  it('detects Zelle', () => {
    expect(isP2P(txn({ name: 'Zelle payment from John' }))).toBe(true)
  })

  it('detects Cash App', () => {
    expect(isP2P(txn({ merchant_name: 'Cash App' }))).toBe(true)
  })

  it('detects PayPal', () => {
    expect(isP2P(txn({ merchant_name: 'PayPal' }))).toBe(true)
  })

  it('detects Apple Cash', () => {
    expect(isP2P(txn({ name: 'Apple Cash Payment' }))).toBe(true)
  })

  it('returns false for regular merchants', () => {
    expect(isP2P(txn({ merchant_name: 'Starbucks', name: 'Starbucks Coffee' }))).toBe(false)
  })

  it('returns false for null fields', () => {
    expect(isP2P(txn({ merchant_name: null, name: null }))).toBe(false)
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
