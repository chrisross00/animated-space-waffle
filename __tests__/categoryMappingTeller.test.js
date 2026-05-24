// __tests__/categoryMappingTeller.test.js
import { describe, it, expect } from 'vitest';
const { mapTransactions } = require('../utils/categoryMapping');

const noRules = [];           // ruleList
const noCompound = [];        // compoundRules

describe('mapTransactions — Teller category layer', () => {
  it('maps a specific Teller category to Basil and stamps teller_category', async () => {
    const txns = [{ name: 'AMAZON MKTPL*X', merchant_name: 'Amazon', amount: 20, teller_category: 'shopping' }];
    const [r] = await mapTransactions(txns, noRules, noCompound);
    expect(r.mappedCategory).toBe('Shopping');
    expect(r.category_source).toBe('teller_category');
  });

  it('sends "general" to To Sort with null source (no guess)', async () => {
    const txns = [{ name: 'WHATEVER', merchant_name: 'X', amount: 5, teller_category: 'general' }];
    const [r] = await mapTransactions(txns, noRules, noCompound);
    expect(r.mappedCategory).toBe('To Sort');
    expect(r.category_source == null).toBe(true);
  });

  it('sends a missing category to To Sort with null source', async () => {
    const txns = [{ name: 'X', merchant_name: 'X', amount: 5, teller_category: null }];
    const [r] = await mapTransactions(txns, noRules, noCompound);
    expect(r.mappedCategory).toBe('To Sort');
    expect(r.category_source == null).toBe(true);
  });

  it('P2P goes to To Sort even with a Teller category', async () => {
    const txns = [{ name: 'Venmo Payment', merchant_name: 'Venmo', amount: 30, teller_category: 'shopping' }];
    const [r] = await mapTransactions(txns, noRules, noCompound);
    expect(r.mappedCategory).toBe('To Sort');
  });

  it('a user merchant rule wins over the Teller category and stamps rule', async () => {
    const ruleList = [{ category: 'Travel', rules: { merchant_name: ['Amazon'] }, plaid_pfc: [] }];
    const txns = [{ name: 'AMAZON', merchant_name: 'Amazon', amount: 20, teller_category: 'shopping' }];
    const [r] = await mapTransactions(txns, ruleList, noCompound);
    expect(r.mappedCategory).toBe('Travel');
    expect(r.category_source).toBe('rule');
  });

  it('a compound rule stamps rule', async () => {
    const compound = [{ conditions: [{ field: 'merchant_name', op: 'eq', value: 'Amazon' }], action: { type: 'categorize', categoryName: 'Health' } }];
    const txns = [{ name: 'AMAZON', merchant_name: 'Amazon', amount: 20, teller_category: 'shopping' }];
    const [r] = await mapTransactions(txns, noRules, compound);
    expect(r.mappedCategory).toBe('Health');
    expect(r.category_source).toBe('rule');
  });
});
