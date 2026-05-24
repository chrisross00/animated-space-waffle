// __tests__/tellerCategoryMapping.test.js
import { describe, it, expect } from 'vitest';
const { TELLER_CATEGORY_TO_BASIL } = require('../utils/tellerCategoryMapping');

// The 12 real Basil default categories (utils/defaultCategories.js).
const BASIL_CATEGORIES = new Set([
  'Income', 'Rent & Utilities', 'Food & Dining', 'Transportation', 'Entertainment',
  'Travel', 'Shopping', 'Health', 'Services', 'Taxes & Giving', 'Payments & Transfers', 'To Sort',
]);

describe('TELLER_CATEGORY_TO_BASIL', () => {
  it('maps a few known Teller categories to the right Basil categories', () => {
    expect(TELLER_CATEGORY_TO_BASIL.dining).toBe('Food & Dining');
    expect(TELLER_CATEGORY_TO_BASIL.shopping).toBe('Shopping');
    expect(TELLER_CATEGORY_TO_BASIL.entertainment).toBe('Entertainment');
    expect(TELLER_CATEGORY_TO_BASIL.fuel).toBe('Transportation');
    expect(TELLER_CATEGORY_TO_BASIL.income).toBe('Income');
  });

  it('every mapped value is a real Basil category', () => {
    for (const [tellerCat, basilCat] of Object.entries(TELLER_CATEGORY_TO_BASIL)) {
      expect(BASIL_CATEGORIES.has(basilCat), `${tellerCat} -> ${basilCat}`).toBe(true);
    }
  });

  it('does NOT map "general" (catch-all falls through to To Sort)', () => {
    expect(TELLER_CATEGORY_TO_BASIL.general).toBeUndefined();
  });
});
