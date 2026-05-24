// __tests__/tellerTools.test.js
import { describe, it, expect } from 'vitest';

const { buildFingerprint, normalizeInstitutionName, tellerToInternal } = require('../utils/tellerTools');

describe('buildFingerprint', () => {
  const a = { id: 't1', amount: '-5.00', date: '2026-05-01', status: 'posted', description: 'COFFEE' };
  const b = { id: 't2', amount: '-9.00', date: '2026-05-02', status: 'pending', description: 'LUNCH' };

  it('is stable regardless of input order', () => {
    expect(buildFingerprint([a, b])).toBe(buildFingerprint([b, a]));
  });

  it('changes when a transaction status changes (pending → posted)', () => {
    const bPosted = { ...b, status: 'posted' };
    expect(buildFingerprint([a, b])).not.toBe(buildFingerprint([a, bPosted]));
  });

  it('returns a hex sha256 string', () => {
    expect(buildFingerprint([a])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('normalizeInstitutionName', () => {
  const map = { Citizens: 'Citizens Bank' };

  it('applies an override when present', () => {
    expect(normalizeInstitutionName('Citizens', map)).toBe('Citizens Bank');
  });

  it('falls back to the raw name when no override', () => {
    expect(normalizeInstitutionName('Chase', map)).toBe('Chase');
  });

  it('handles null/empty input', () => {
    expect(normalizeInstitutionName(null, map)).toBe(null);
  });

  it('default map normalizes Teller "Citizens" to Plaid-era "Citizens Bank"', () => {
    expect(normalizeInstitutionName('Citizens')).toBe('Citizens Bank');
  });

  it('default map passes "Chase" through unchanged', () => {
    expect(normalizeInstitutionName('Chase')).toBe('Chase');
  });
});

describe('tellerToInternal', () => {
  const base = {
    id: 'txn_abc', account_id: 'acc_1', amount: '-42.50', date: '2026-05-10',
    description: 'STARBUCKS STORE 123', status: 'posted',
    details: { counterparty: { name: 'Starbucks' } },
  };

  // Depository: Teller signs by account balance — a purchase is negative. Negate → +spend.
  it('depository: a Teller debit (negative) becomes a positive spend', () => {
    expect(tellerToInternal(base, { userId: 'u1', institution: 'Chase', accountType: 'depository' }).amount).toBe(42.5);
  });

  it('depository: a Teller credit (positive) becomes a negative inflow', () => {
    const deposit = { ...base, amount: '1500.00' };
    expect(tellerToInternal(deposit, { userId: 'u1', institution: 'Chase', accountType: 'depository' }).amount).toBe(-1500);
  });

  // Credit card: Teller signs a purchase POSITIVE (balance owed up). Keep → +spend.
  it('credit: a Teller charge (positive) stays a positive spend', () => {
    const charge = { ...base, amount: '96.10' };
    expect(tellerToInternal(charge, { userId: 'u1', institution: 'Chase', accountType: 'credit' }).amount).toBe(96.1);
  });

  it('credit: a Teller payment/refund (negative) stays a negative inflow', () => {
    const payment = { ...base, amount: '-200.00' };
    expect(tellerToInternal(payment, { userId: 'u1', institution: 'Chase', accountType: 'credit' }).amount).toBe(-200);
  });

  // Default (no/unknown account type) negates like depository — the common case.
  it('defaults to depository negation when accountType is absent', () => {
    expect(tellerToInternal(base, { userId: 'u1', institution: 'Chase' }).amount).toBe(42.5);
  });

  it('maps identity, name, merchant, date, pending, account', () => {
    const r = tellerToInternal(base, { userId: 'u1', institution: 'Chase' });
    expect(r).toMatchObject({
      transaction_id: 'txn_abc',
      userId: 'u1',
      account_id: 'acc_1',
      name: 'STARBUCKS STORE 123',
      merchant_name: 'Starbucks',
      date: '2026-05-10',
      pending: false,
      account: 'Chase',
    });
  });

  it('sets pending true when status is pending', () => {
    expect(tellerToInternal({ ...base, status: 'pending' }, { userId: 'u1', institution: 'Chase' }).pending).toBe(true);
  });

  it('tolerates a missing counterparty (merchant_name null)', () => {
    const noCp = { ...base, details: {} };
    expect(tellerToInternal(noCp, { userId: 'u1', institution: 'Chase' }).merchant_name).toBe(null);
  });
});
