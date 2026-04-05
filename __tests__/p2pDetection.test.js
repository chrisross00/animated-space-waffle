import { describe, it, expect } from 'vitest';
import { P2P_PATTERNS, isP2PTransaction } from '../shared/p2pDetection';

const txn = (overrides) => ({ account: null, merchant_name: null, name: null, ...overrides });

describe('isP2PTransaction', () => {
  it('detects Venmo by merchant_name', () => {
    expect(isP2PTransaction(txn({ merchant_name: 'Venmo' }))).toBe(true);
  });
  it('detects Venmo by name', () => {
    expect(isP2PTransaction(txn({ name: 'VENMO PAYMENT' }))).toBe(true);
  });
  it('detects Venmo by account', () => {
    expect(isP2PTransaction(txn({ account: 'Venmo' }))).toBe(true);
  });
  it('detects Zelle', () => {
    expect(isP2PTransaction(txn({ name: 'Zelle payment from John' }))).toBe(true);
  });
  it('detects Cash App', () => {
    expect(isP2PTransaction(txn({ merchant_name: 'Cash App' }))).toBe(true);
  });
  it('detects PayPal', () => {
    expect(isP2PTransaction(txn({ merchant_name: 'PayPal' }))).toBe(true);
  });
  it('detects Apple Cash', () => {
    expect(isP2PTransaction(txn({ name: 'Apple Cash Payment' }))).toBe(true);
  });
  it('returns false for non-P2P', () => {
    expect(isP2PTransaction(txn({ merchant_name: 'Starbucks', name: 'Starbucks Coffee' }))).toBe(false);
  });
  it('returns false for all-null fields', () => {
    expect(isP2PTransaction(txn({}))).toBe(false);
  });
  it('exports P2P_PATTERNS array', () => {
    expect(Array.isArray(P2P_PATTERNS)).toBe(true);
    expect(P2P_PATTERNS.length).toBe(6);
  });
});
