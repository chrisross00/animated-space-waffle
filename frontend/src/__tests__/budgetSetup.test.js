import { describe, it, expect } from 'vitest';
import { formatWithCommas, parseAmount, getLastMonthKey, getCurrentMonthKey, evaluateNudge } from '../utils/budgetSetup.js';

describe('formatWithCommas', () => {
  it('formats numbers with commas', () => {
    expect(formatWithCommas(1000)).toBe('1,000');
    expect(formatWithCommas(1234567)).toBe('1,234,567');
  });

  it('returns empty string for null/empty', () => {
    expect(formatWithCommas(null)).toBe('');
    expect(formatWithCommas('')).toBe('');
  });

  it('handles small numbers without commas', () => {
    expect(formatWithCommas(999)).toBe('999');
    expect(formatWithCommas(0)).toBe('0');
  });
});

describe('parseAmount', () => {
  it('parses numeric strings', () => {
    expect(parseAmount('1000')).toBe(1000);
    expect(parseAmount('5')).toBe(5);
  });

  it('strips commas', () => {
    expect(parseAmount('1,000')).toBe(1000);
    expect(parseAmount('1,234,567')).toBe(1234567);
  });

  it('strips non-numeric characters', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('$500')).toBe(500);
    expect(parseAmount('12.34')).toBe(1234);
  });

  it('returns null for zero and negative', () => {
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('000')).toBeNull();
  });
});

describe('getLastMonthKey', () => {
  it('returns previous month in YYYY-MM format', () => {
    expect(getLastMonthKey(new Date(2026, 2, 15))).toBe('2026-02'); // March → February
    expect(getLastMonthKey(new Date(2026, 5, 1))).toBe('2026-05');  // June → May
  });

  it('handles January → December year rollover', () => {
    expect(getLastMonthKey(new Date(2026, 0, 10))).toBe('2025-12'); // Jan 2026 → Dec 2025
  });

  it('pads single-digit months', () => {
    expect(getLastMonthKey(new Date(2026, 1, 1))).toBe('2026-01'); // Feb → Jan
  });
});

describe('getCurrentMonthKey', () => {
  it('returns current month in YYYY-MM format', () => {
    expect(getCurrentMonthKey(new Date(2026, 0, 15))).toBe('2026-01'); // January
    expect(getCurrentMonthKey(new Date(2026, 11, 1))).toBe('2026-12'); // December
  });
});

describe('evaluateNudge', () => {
  const baseParams = {
    isOnboarded: true,
    toSortCount: 0,
    pendingRelationshipCount: 0,
    categories: [],
    preferences: {},
    getCategorySpend: () => 0,
  };

  it('returns null when not onboarded', () => {
    expect(evaluateNudge({ ...baseParams, isOnboarded: false })).toBeNull();
  });

  it('returns null when there are unsorted transactions', () => {
    expect(evaluateNudge({ ...baseParams, toSortCount: 5 })).toBeNull();
  });

  it('returns null when there are pending relationships', () => {
    expect(evaluateNudge({ ...baseParams, pendingRelationshipCount: 2 })).toBeNull();
  });

  describe('Nudge A: generic budget setup', () => {
    it('shows when zero expense categories have limits', () => {
      const result = evaluateNudge({
        ...baseParams,
        categories: [
          { type: 'expense', monthly_limit: 0, category: 'Food' },
          { type: 'expense', monthly_limit: null, category: 'Travel' },
          { type: 'income', monthly_limit: 5000, category: 'Income' },
        ],
      });
      expect(result.type).toBe('budget');
      expect(result.to).toBe('/plan');
    });

    it('does not show when dismissed', () => {
      const result = evaluateNudge({
        ...baseParams,
        categories: [{ type: 'expense', monthly_limit: 0, category: 'Food' }],
        preferences: { dismissed_budget_nudge: true },
      });
      expect(result).toBeNull();
    });

    it('does not show when at least one expense has a limit', () => {
      const result = evaluateNudge({
        ...baseParams,
        categories: [
          { type: 'expense', monthly_limit: 500, category: 'Food' },
          { type: 'expense', monthly_limit: 0, category: 'Travel' },
        ],
        getCategorySpend: () => 0,
      });
      // Should not be nudge A — might be B or C
      expect(result?.type).not.toBe('budget');
    });
  });

  describe('Nudge B: category-specific', () => {
    it('shows highest-spend category without a limit', () => {
      const spending = { Food: 500, Travel: 200, Shopping: 800 };
      const result = evaluateNudge({
        ...baseParams,
        categories: [
          { type: 'expense', monthly_limit: 600, category: 'Food' },
          { type: 'expense', monthly_limit: 0, category: 'Travel' },
          { type: 'expense', monthly_limit: 0, category: 'Shopping' },
        ],
        getCategorySpend: (name) => spending[name] || 0,
      });
      expect(result.type).toBe('category');
      expect(result.category).toBe('Shopping'); // highest spend without limit
    });

    it('skips dismissed categories', () => {
      const spending = { Travel: 200, Shopping: 800 };
      const result = evaluateNudge({
        ...baseParams,
        categories: [
          { type: 'expense', monthly_limit: 600, category: 'Food' },
          { type: 'expense', monthly_limit: 0, category: 'Travel' },
          { type: 'expense', monthly_limit: 0, category: 'Shopping' },
        ],
        preferences: { dismissed_category_nudges: ['Shopping'] },
        getCategorySpend: (name) => spending[name] || 0,
      });
      expect(result.type).toBe('category');
      expect(result.category).toBe('Travel'); // Shopping dismissed, next highest
    });

    it('skips categories with zero spending', () => {
      const result = evaluateNudge({
        ...baseParams,
        categories: [
          { type: 'expense', monthly_limit: 600, category: 'Food' },
          { type: 'expense', monthly_limit: 0, category: 'Travel' },
        ],
        getCategorySpend: () => 0, // no spending on Travel
      });
      // No category nudge — falls through to trends
      expect(result?.type).not.toBe('category');
    });
  });

  describe('Nudge C: explore trends', () => {
    it('shows when all active categories are budgeted', () => {
      const result = evaluateNudge({
        ...baseParams,
        categories: [
          { type: 'expense', monthly_limit: 600, category: 'Food' },
          { type: 'expense', monthly_limit: 200, category: 'Travel' },
        ],
      });
      expect(result.type).toBe('trends');
      expect(result.to).toBe('/trends');
    });

    it('does not show when dismissed', () => {
      const result = evaluateNudge({
        ...baseParams,
        categories: [
          { type: 'expense', monthly_limit: 600, category: 'Food' },
        ],
        preferences: { dismissed_trends_nudge: true },
      });
      expect(result).toBeNull();
    });
  });

  describe('priority order', () => {
    it('Nudge A takes priority over B and C', () => {
      const result = evaluateNudge({
        ...baseParams,
        categories: [
          { type: 'expense', monthly_limit: 0, category: 'Food' },
        ],
      });
      expect(result.type).toBe('budget');
    });

    it('Nudge B takes priority over C when applicable', () => {
      const result = evaluateNudge({
        ...baseParams,
        categories: [
          { type: 'expense', monthly_limit: 600, category: 'Food' },
          { type: 'expense', monthly_limit: 0, category: 'Travel' },
        ],
        getCategorySpend: (name) => name === 'Travel' ? 300 : 0,
      });
      expect(result.type).toBe('category');
    });

    it('returns null when everything is dismissed', () => {
      const result = evaluateNudge({
        ...baseParams,
        categories: [
          { type: 'expense', monthly_limit: 0, category: 'Food' },
        ],
        preferences: { dismissed_budget_nudge: true },
      });
      expect(result).toBeNull();
    });
  });
});
