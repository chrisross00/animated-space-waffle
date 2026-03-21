import { describe, it, expect } from 'vitest';

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
