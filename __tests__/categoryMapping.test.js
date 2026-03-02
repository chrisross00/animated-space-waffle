import { describe, it, expect } from 'vitest'
import { mapTransactions, getMappingRuleList } from '../utils/categoryMapping.js'

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
