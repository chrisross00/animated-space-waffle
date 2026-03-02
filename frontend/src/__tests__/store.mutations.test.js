import { vi, beforeEach, describe, it, expect } from 'vitest'

// Prevent vuex-persistedstate from touching window.sessionStorage
vi.mock('vuex-persistedstate', () => ({ default: () => () => {} }))

import store from '@/store'

beforeEach(() => {
  store.state.categories = []
  store.state.transactions = []
})

// ---------------------------------------------------------------------------
// addCategoryRule
// ---------------------------------------------------------------------------
describe('addCategoryRule', () => {
  it('adds a rule to a category that has no rules yet', () => {
    store.state.categories = [{ _id: '1', category: 'Groceries', rules: {} }]
    store.commit('addCategoryRule', { categoryId: '1', ruleType: 'merchant_name', ruleValue: 'Whole Foods' })
    expect(store.state.categories[0].rules.merchant_name).toEqual(['Whole Foods'])
  })

  it('appends a rule to a category that already has rules', () => {
    store.state.categories = [{ _id: '1', category: 'Groceries', rules: { merchant_name: ['Trader Joes'] } }]
    store.commit('addCategoryRule', { categoryId: '1', ruleType: 'merchant_name', ruleValue: 'Whole Foods' })
    expect(store.state.categories[0].rules.merchant_name).toEqual(['Trader Joes', 'Whole Foods'])
  })

  it('does not add a duplicate rule', () => {
    store.state.categories = [{ _id: '1', category: 'Groceries', rules: { merchant_name: ['Whole Foods'] } }]
    store.commit('addCategoryRule', { categoryId: '1', ruleType: 'merchant_name', ruleValue: 'Whole Foods' })
    expect(store.state.categories[0].rules.merchant_name).toHaveLength(1)
  })

  it('initializes rules object if missing from category', () => {
    store.state.categories = [{ _id: '1', category: 'Groceries' }]
    store.commit('addCategoryRule', { categoryId: '1', ruleType: 'name', ruleValue: 'Grocery Order' })
    expect(store.state.categories[0].rules.name).toEqual(['Grocery Order'])
  })

  it('does nothing if category not found', () => {
    store.state.categories = [{ _id: '1', category: 'Groceries', rules: {} }]
    store.commit('addCategoryRule', { categoryId: 'nonexistent', ruleType: 'merchant_name', ruleValue: 'Whole Foods' })
    expect(store.state.categories[0].rules).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// updateCategoryRules (delete a rule)
// ---------------------------------------------------------------------------
describe('updateCategoryRules', () => {
  it('removes a specific rule from a category', () => {
    store.state.categories = [{ _id: '1', category: 'Groceries', rules: { merchant_name: ['Whole Foods', 'Trader Joes'] } }]
    store.commit('updateCategoryRules', { categoryId: '1', ruleType: 'merchant_name', ruleValue: 'Whole Foods' })
    expect(store.state.categories[0].rules.merchant_name).toEqual(['Trader Joes'])
  })

  it('is a no-op if the rule is not in the list', () => {
    store.state.categories = [{ _id: '1', category: 'Groceries', rules: { merchant_name: ['Trader Joes'] } }]
    store.commit('updateCategoryRules', { categoryId: '1', ruleType: 'merchant_name', ruleValue: 'Nonexistent' })
    expect(store.state.categories[0].rules.merchant_name).toEqual(['Trader Joes'])
  })

  it('is a no-op if category not found', () => {
    store.state.categories = [{ _id: '1', category: 'Groceries', rules: { merchant_name: ['Whole Foods'] } }]
    store.commit('updateCategoryRules', { categoryId: 'nonexistent', ruleType: 'merchant_name', ruleValue: 'Whole Foods' })
    expect(store.state.categories[0].rules.merchant_name).toEqual(['Whole Foods'])
  })
})

// ---------------------------------------------------------------------------
// updateCategory
// ---------------------------------------------------------------------------
describe('updateCategory', () => {
  it('updates the category name and monthly limit', () => {
    store.state.categories = [{ _id: '1', category: 'Groceries', monthly_limit: 300, plaid_pfc: [] }]
    store.commit('updateCategory', {
      _id: '1',
      originalCategoryName: 'Groceries',
      categoryNameBEResponse: 'Food & Groceries',
      monthlyLimitBEResponse: 400,
      showOnBudgetPageBEResponse: true,
      plaid_pfcBEResponse: [],
    })
    const cat = store.state.categories[0]
    expect(cat.category).toBe('Food & Groceries')
    expect(cat.monthly_limit).toBe(400)
  })

  it('renames mappedCategory on matching transactions when name changes', () => {
    store.state.categories = [{ _id: '1', category: 'Groceries', plaid_pfc: [] }]
    store.state.transactions = [
      { transaction_id: 'a', mappedCategory: 'Groceries' },
      { transaction_id: 'b', mappedCategory: 'Dining' },
    ]
    store.commit('updateCategory', {
      _id: '1',
      originalCategoryName: 'Groceries',
      categoryNameBEResponse: 'Food',
      monthlyLimitBEResponse: 0,
      showOnBudgetPageBEResponse: true,
      plaid_pfcBEResponse: [],
    })
    expect(store.state.transactions[0].mappedCategory).toBe('Food')
    expect(store.state.transactions[1].mappedCategory).toBe('Dining')
  })

  it('does not rename transactions when category name is unchanged', () => {
    store.state.categories = [{ _id: '1', category: 'Groceries', plaid_pfc: [] }]
    store.state.transactions = [{ transaction_id: 'a', mappedCategory: 'Groceries' }]
    store.commit('updateCategory', {
      _id: '1',
      originalCategoryName: 'Groceries',
      categoryNameBEResponse: 'Groceries',
      monthlyLimitBEResponse: 300,
      showOnBudgetPageBEResponse: true,
      plaid_pfcBEResponse: [],
    })
    expect(store.state.transactions[0].mappedCategory).toBe('Groceries')
  })

  it('removes claimed PFC values from other categories', () => {
    store.state.categories = [
      { _id: '1', category: 'Groceries', plaid_pfc: [] },
      { _id: '2', category: 'Food', plaid_pfc: ['FOOD_AND_DRINK'] },
    ]
    store.commit('updateCategory', {
      _id: '1',
      originalCategoryName: 'Groceries',
      categoryNameBEResponse: 'Groceries',
      monthlyLimitBEResponse: 0,
      showOnBudgetPageBEResponse: true,
      plaid_pfcBEResponse: ['FOOD_AND_DRINK'],
    })
    expect(store.state.categories[1].plaid_pfc).toEqual([])
  })
})
