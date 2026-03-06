import { describe, it, expect } from 'vitest'
import { mapTransactions, getMappingRuleList, evaluateCompoundRules } from '../utils/categoryMapping.js'

// ---------------------------------------------------------------------------
// getMappingRuleList
// ---------------------------------------------------------------------------
describe('getMappingRuleList', () => {
  it('builds a rule list from category documents', async () => {
    const cats = [
      { category: 'Groceries', rules: { merchant_name: ['Whole Foods'] }, plaid_pfc: ['FOOD_AND_DRINK'] },
      { category: 'Transport', rules: { merchant_name: ['Uber'] } },
    ]
    const result = await getMappingRuleList(cats)
    expect(result).toHaveLength(2)
    expect(result[0].category).toBe('Groceries')
    expect(result[0].rules.merchant_name).toEqual(['Whole Foods'])
    expect(result[0].plaid_pfc).toEqual(['FOOD_AND_DRINK'])
  })

  it('defaults plaid_pfc to [] when not present on a category', async () => {
    const cats = [{ category: 'Transport', rules: { merchant_name: ['Uber'] } }]
    const result = await getMappingRuleList(cats)
    expect(result[0].plaid_pfc).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// mapTransactions — helpers
// ---------------------------------------------------------------------------

/** Build a minimal rules array for common test scenarios */
function makeRules(overrides = {}) {
  return [{
    category: 'Groceries',
    rules: { merchant_name: ['Whole Foods'], name: ['Grocery Pickup'] },
    plaid_pfc: ['FOOD_AND_DRINK'],
    ...overrides,
  }]
}

function txn(fields) {
  // Ensure mappedCategory is absent unless explicitly set
  return { name: 'Test', merchant_name: null, ...fields }
}

// ---------------------------------------------------------------------------
// mapTransactions
// ---------------------------------------------------------------------------
describe('mapTransactions', () => {
  it('maps by merchant_name', async () => {
    const txns = [txn({ merchant_name: 'Whole Foods' })]
    const result = await mapTransactions(txns, makeRules())
    expect(result[0].mappedCategory).toBe('Groceries')
  })

  it('merchant_name matching is case-insensitive', async () => {
    const txns = [txn({ merchant_name: 'whole foods' })]
    const result = await mapTransactions(txns, makeRules())
    expect(result[0].mappedCategory).toBe('Groceries')
  })

  it('maps by transaction name rule', async () => {
    const rules = [{ category: 'Groceries', rules: { name: ['Grocery Pickup'] }, plaid_pfc: [] }]
    const txns = [txn({ name: 'Grocery Pickup', merchant_name: null })]
    const result = await mapTransactions(txns, rules)
    expect(result[0].mappedCategory).toBe('Groceries')
  })

  it('name rule matching is case-insensitive', async () => {
    const rules = [{ category: 'Groceries', rules: { name: ['Grocery Pickup'] }, plaid_pfc: [] }]
    const txns = [txn({ name: 'grocery pickup', merchant_name: null })]
    const result = await mapTransactions(txns, rules)
    expect(result[0].mappedCategory).toBe('Groceries')
  })

  it('maps by personal_finance_category (PFC)', async () => {
    const rules = [{ category: 'Food', rules: {}, plaid_pfc: ['FOOD_AND_DRINK'] }]
    const txns = [txn({ name: 'Mystery Restaurant', personal_finance_category: { primary: 'FOOD_AND_DRINK' } })]
    const result = await mapTransactions(txns, rules)
    expect(result[0].mappedCategory).toBe('Food')
  })

  it('falls back to "To Sort" when no rules match', async () => {
    const txns = [txn({ name: 'Unknown Vendor', merchant_name: null })]
    const result = await mapTransactions(txns, [])
    expect(result[0].mappedCategory).toBe('To Sort')
  })

  it('does not overwrite an already-mapped transaction', async () => {
    const txns = [txn({ name: 'Grocery Pickup', merchant_name: 'Whole Foods', mappedCategory: 'Existing' })]
    const result = await mapTransactions(txns, makeRules())
    expect(result[0].mappedCategory).toBe('Existing')
  })

  it('name rules take priority over merchant_name rules', async () => {
    // name rule is checked first in mapTransactions; merchant_name is checked later
    const rules = [
      { category: 'Groceries', rules: { merchant_name: ['Whole Foods'] }, plaid_pfc: [] },
      { category: 'Special', rules: { name: ['Special Purchase'] }, plaid_pfc: [] },
    ]
    const txns = [txn({ name: 'Special Purchase', merchant_name: 'Whole Foods' })]
    const result = await mapTransactions(txns, rules)
    expect(result[0].mappedCategory).toBe('Special')
  })

  it('maps multiple transactions independently', async () => {
    const rules = [
      { category: 'Groceries', rules: { merchant_name: ['Whole Foods'] }, plaid_pfc: [] },
      { category: 'Transport', rules: { merchant_name: ['Uber'] }, plaid_pfc: [] },
    ]
    const txns = [
      txn({ merchant_name: 'Whole Foods' }),
      txn({ merchant_name: 'Uber' }),
      txn({ merchant_name: null }),
    ]
    const result = await mapTransactions(txns, rules)
    expect(result[0].mappedCategory).toBe('Groceries')
    expect(result[1].mappedCategory).toBe('Transport')
    expect(result[2].mappedCategory).toBe('To Sort')
  })
})

// ---------------------------------------------------------------------------
// evaluateCompoundRules
// ---------------------------------------------------------------------------

function rule(conditions, categoryName, overrides = {}) {
  return {
    conditions,
    action: { type: 'categorize', categoryName },
    ...overrides,
  }
}

describe('evaluateCompoundRules — merchant_name + amount', () => {
  it('matches when all conditions pass', () => {
    const rules = [rule([
      { field: 'merchant_name', op: 'eq', value: 'Zelle' },
      { field: 'amount', op: 'eq', value: 1200 },
    ], 'Transfers')]
    const action = evaluateCompoundRules(rules, txn({ merchant_name: 'Zelle', amount: -1200 }))
    expect(action.categoryName).toBe('Transfers')
  })

  it('does not match when only one condition passes', () => {
    const rules = [rule([
      { field: 'merchant_name', op: 'eq', value: 'Zelle' },
      { field: 'amount', op: 'eq', value: 1200 },
    ], 'Transfers')]
    const action = evaluateCompoundRules(rules, txn({ merchant_name: 'Zelle', amount: -50 }))
    expect(action).toBeNull()
  })
})

describe('evaluateCompoundRules — amount range', () => {
  it('matches amount within range', () => {
    const rules = [rule([{ field: 'amount', op: 'range', min: 100, max: 500 }], 'Large Purchase')]
    expect(evaluateCompoundRules(rules, txn({ amount: 250 }))).not.toBeNull()
  })

  it('does not match amount outside range', () => {
    const rules = [rule([{ field: 'amount', op: 'range', min: 100, max: 500 }], 'Large Purchase')]
    expect(evaluateCompoundRules(rules, txn({ amount: 50 }))).toBeNull()
  })
})

describe('evaluateCompoundRules — account', () => {
  it('matches by institution', () => {
    const rules = [rule([{ field: 'account', op: 'eq', value: 'Chase' }], 'Chase Expenses')]
    expect(evaluateCompoundRules(rules, txn({ account: 'Chase' }))).not.toBeNull()
  })

  it('does not match null account', () => {
    const rules = [rule([{ field: 'account', op: 'eq', value: 'Chase' }], 'Chase Expenses')]
    expect(evaluateCompoundRules(rules, txn({ account: null }))).toBeNull()
  })
})

describe('evaluateCompoundRules — note in action', () => {
  it('returns note from action when rule matches', () => {
    const rules = [rule(
      [{ field: 'merchant_name', op: 'eq', value: 'Zelle' }],
      'Transfers',
      { action: { type: 'categorize', categoryName: 'Transfers', note: 'auto-tagged' } }
    )]
    const action = evaluateCompoundRules(rules, txn({ merchant_name: 'Zelle' }))
    expect(action.note).toBe('auto-tagged')
  })
})

describe('evaluateCompoundRules — priority', () => {
  it('returns the first matching rule', () => {
    const rules = [
      rule([{ field: 'merchant_name', op: 'eq', value: 'Zelle' }], 'First'),
      rule([{ field: 'merchant_name', op: 'eq', value: 'Zelle' }], 'Second'),
    ]
    const action = evaluateCompoundRules(rules, txn({ merchant_name: 'Zelle' }))
    expect(action.categoryName).toBe('First')
  })

  it('returns null when no rules match', () => {
    const rules = [rule([{ field: 'merchant_name', op: 'eq', value: 'Zelle' }], 'Transfers')]
    expect(evaluateCompoundRules(rules, txn({ merchant_name: 'Uber' }))).toBeNull()
  })
})

describe('mapTransactions — compound rules take priority', () => {
  it('compound rule overrides merchant_name rule', async () => {
    const compoundRules = [rule([
      { field: 'merchant_name', op: 'eq', value: 'Zelle' },
      { field: 'amount', op: 'eq', value: 1200 },
    ], 'Large Transfers')]
    const simpleRules = [{ category: 'Transfers', rules: { merchant_name: ['Zelle'] }, plaid_pfc: [] }]
    const txns = [txn({ merchant_name: 'Zelle', amount: -1200 })]
    const result = await mapTransactions(txns, simpleRules, compoundRules)
    expect(result[0].mappedCategory).toBe('Large Transfers')
  })

  it('falls through to simple rule when compound does not match', async () => {
    const compoundRules = [rule([
      { field: 'merchant_name', op: 'eq', value: 'Zelle' },
      { field: 'amount', op: 'eq', value: 1200 },
    ], 'Large Transfers')]
    const simpleRules = [{ category: 'Transfers', rules: { merchant_name: ['Zelle'] }, plaid_pfc: [] }]
    const txns = [txn({ merchant_name: 'Zelle', amount: -50 })]
    const result = await mapTransactions(txns, simpleRules, compoundRules)
    expect(result[0].mappedCategory).toBe('Transfers')
  })
})
