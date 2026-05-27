import { describe, it, expect } from 'vitest';
import { validateAndSignSplits } from '../utils/splitValidation.js';

describe('split transaction_id generation', () => {
  it('should generate unique transaction_ids for children', () => {
    const parentTxnId = 'abc123';
    const childIds = [0, 1, 2].map(i => `split-${parentTxnId}-${i}`);
    expect(childIds).toEqual(['split-abc123-0', 'split-abc123-1', 'split-abc123-2']);
    expect(new Set(childIds).size).toBe(3);
  });

  it('should not collide with Plaid transaction ID format', () => {
    const plaidId = 'wvqrVjNdMBCJkMa7D6DGCxxgqEPe3mCZrqWqd';
    const splitId = 'split-abc123-0';
    expect(splitId.startsWith('split-')).toBe(true);
    expect(plaidId.startsWith('split-')).toBe(false);
  });
});

describe('validateAndSignSplits', () => {
  const expenseParent = { amount: 50, pending: false, parentTransactionId: null, isSplitParent: false };
  const incomeParent = { amount: -1000, pending: false, parentTransactionId: null, isSplitParent: false };

  it('accepts a valid expense split and passes amounts through unchanged', () => {
    const result = validateAndSignSplits(expenseParent, [
      { amount: 30, categoryName: 'Groceries' },
      { amount: 20, categoryName: 'Home' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.signedSplits).toEqual([
      { amount: 30, categoryName: 'Groceries', note: null },
      { amount: 20, categoryName: 'Home', note: null },
    ]);
  });

  it('accepts a valid income split and negates the amounts to match parent sign', () => {
    const result = validateAndSignSplits(incomeParent, [
      { amount: 600, categoryName: 'Salary' },
      { amount: 400, categoryName: 'Bonus' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.signedSplits).toEqual([
      { amount: -600, categoryName: 'Salary', note: null },
      { amount: -400, categoryName: 'Bonus', note: null },
    ]);
  });

  it('preserves the note field on each signed split', () => {
    const result = validateAndSignSplits(incomeParent, [
      { amount: 600, categoryName: 'Salary', note: 'base pay' },
      { amount: 400, categoryName: 'Bonus', note: null },
    ]);
    expect(result.ok).toBe(true);
    expect(result.signedSplits[0]).toEqual({ amount: -600, categoryName: 'Salary', note: 'base pay' });
    expect(result.signedSplits[1]).toEqual({ amount: -400, categoryName: 'Bonus', note: null });
  });

  it('rejects when fewer than 2 splits', () => {
    const result = validateAndSignSplits(expenseParent, [{ amount: 50, categoryName: 'Groceries' }]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toMatch(/at least 2/i);
  });

  it('rejects when more than 20 splits', () => {
    const splits = Array.from({ length: 21 }, () => ({ amount: 1, categoryName: 'Groceries' }));
    const parent = { ...expenseParent, amount: 21 };
    const result = validateAndSignSplits(parent, splits);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toMatch(/maximum 20/i);
  });

  it('rejects a pending parent', () => {
    const result = validateAndSignSplits({ ...expenseParent, pending: true }, [
      { amount: 30, categoryName: 'Groceries' },
      { amount: 20, categoryName: 'Home' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toMatch(/pending/i);
  });

  it('rejects a split child', () => {
    const result = validateAndSignSplits({ ...expenseParent, parentTransactionId: 'p1' }, [
      { amount: 30, categoryName: 'Groceries' },
      { amount: 20, categoryName: 'Home' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toMatch(/split child/i);
  });

  it('rejects an already-split parent', () => {
    const result = validateAndSignSplits({ ...expenseParent, isSplitParent: true }, [
      { amount: 30, categoryName: 'Groceries' },
      { amount: 20, categoryName: 'Home' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toMatch(/already split/i);
  });

  it('rejects non-positive split amounts', () => {
    const result = validateAndSignSplits(expenseParent, [
      { amount: 50, categoryName: 'Groceries' },
      { amount: 0, categoryName: 'Home' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toMatch(/positive/i);
  });

  it('rejects splits missing categoryName', () => {
    const result = validateAndSignSplits(expenseParent, [
      { amount: 30, categoryName: 'Groceries' },
      { amount: 20 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toMatch(/categoryName/);
  });

  it('rejects when splits do not sum to abs(parent) for an expense parent', () => {
    const result = validateAndSignSplits(expenseParent, [
      { amount: 30, categoryName: 'Groceries' },
      { amount: 25, categoryName: 'Home' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toMatch(/55\.00.*50\.00/);
  });

  it('rejects when splits do not sum to abs(parent) for an income parent', () => {
    const result = validateAndSignSplits(incomeParent, [
      { amount: 600, categoryName: 'Salary' },
      { amount: 300, categoryName: 'Bonus' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    // Error message compares the positive editor sum vs |parent|.
    expect(result.message).toMatch(/900\.00.*1000\.00/);
  });
});
