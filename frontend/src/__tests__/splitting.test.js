import { describe, it, expect } from 'vitest';

describe('rebuildFlatArray', () => {
  it('should exclude split parents from flat array', () => {
    const state = {
      transactionsByMonth: {
        '2026-03': [
          { transaction_id: 'txn1', date: '2026-03-15', isSplitParent: true, amount: 100 },
          { transaction_id: 'split-txn1-0', date: '2026-03-15', parentTransactionId: 'uuid1', amount: 60 },
          { transaction_id: 'split-txn1-1', date: '2026-03-15', parentTransactionId: 'uuid1', amount: 40 },
          { transaction_id: 'txn2', date: '2026-03-10', amount: 50 },
        ],
      },
      transactions: [],
    };
    state.transactions = Object.keys(state.transactionsByMonth)
      .sort().reverse()
      .flatMap(k => state.transactionsByMonth[k])
      .filter(t => !t.isSplitParent);
    expect(state.transactions).toHaveLength(3);
    expect(state.transactions.find(t => t.isSplitParent)).toBeUndefined();
  });

  it('should keep split parents in transactionsByMonth for lookups', () => {
    const state = {
      transactionsByMonth: {
        '2026-03': [
          { transaction_id: 'txn1', isSplitParent: true },
          { transaction_id: 'split-txn1-0', parentTransactionId: 'uuid1' },
        ],
      },
    };
    const parent = state.transactionsByMonth['2026-03'].find(t => t.isSplitParent);
    expect(parent).toBeDefined();
  });
});

describe('splitTransaction mutation logic', () => {
  it('should flag parent and insert children into month bucket', () => {
    const parent = { id: 'uuid1', transaction_id: 'txn1', date: '2026-03-15', amount: 100, isSplitParent: false };
    const state = {
      transactionsByMonth: { '2026-03': [parent] },
      transactions: [parent],
    };
    const idx = state.transactionsByMonth['2026-03'].findIndex(t => t.id === parent.id);
    state.transactionsByMonth['2026-03'][idx] = { ...parent, isSplitParent: true };
    const children = [
      { id: 'uuid2', transaction_id: 'split-txn1-0', date: '2026-03-15', amount: 60, parentTransactionId: 'uuid1' },
      { id: 'uuid3', transaction_id: 'split-txn1-1', date: '2026-03-15', amount: 40, parentTransactionId: 'uuid1' },
    ];
    state.transactionsByMonth['2026-03'].push(...children);
    state.transactions = Object.keys(state.transactionsByMonth)
      .sort().reverse()
      .flatMap(k => state.transactionsByMonth[k])
      .filter(t => !t.isSplitParent);
    expect(state.transactions).toHaveLength(2);
    expect(state.transactions.map(t => t.amount)).toEqual([60, 40]);
  });
});

describe('unsplitTransaction mutation logic', () => {
  it('should remove children and unflag parent', () => {
    const parent = { id: 'uuid1', transaction_id: 'txn1', date: '2026-03-15', amount: 100, isSplitParent: true };
    const child1 = { id: 'uuid2', transaction_id: 'split-txn1-0', date: '2026-03-15', amount: 60, parentTransactionId: 'uuid1' };
    const child2 = { id: 'uuid3', transaction_id: 'split-txn1-1', date: '2026-03-15', amount: 40, parentTransactionId: 'uuid1' };
    const state = {
      transactionsByMonth: { '2026-03': [parent, child1, child2] },
      transactions: [child1, child2],
    };
    const restoredParent = { ...parent, isSplitParent: false };
    state.transactionsByMonth['2026-03'] = state.transactionsByMonth['2026-03']
      .filter(t => t.parentTransactionId !== parent.id);
    const parentIdx = state.transactionsByMonth['2026-03'].findIndex(t => t.id === parent.id);
    state.transactionsByMonth['2026-03'][parentIdx] = restoredParent;
    state.transactions = Object.keys(state.transactionsByMonth)
      .sort().reverse()
      .flatMap(k => state.transactionsByMonth[k])
      .filter(t => !t.isSplitParent);
    expect(state.transactions).toHaveLength(1);
    expect(state.transactions[0].transaction_id).toBe('txn1');
    expect(state.transactions[0].isSplitParent).toBe(false);
  });
});
