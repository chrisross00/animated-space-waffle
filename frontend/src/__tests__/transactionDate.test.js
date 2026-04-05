import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { txnDate, txnDayjs, txnMonth, isInMonth } from '@/utils/transactionDate';

describe('txnDate', () => {
  it('returns effectiveDate when set', () => {
    expect(txnDate({ effectiveDate: '2026-03-15', date: '2026-03-10' })).toBe('2026-03-15');
  });
  it('falls back to date', () => {
    expect(txnDate({ date: '2026-03-10' })).toBe('2026-03-10');
  });
  it('falls back to date when effectiveDate is null', () => {
    expect(txnDate({ effectiveDate: null, date: '2026-03-10' })).toBe('2026-03-10');
  });
});

describe('txnMonth', () => {
  it('returns YYYY-MM from effectiveDate', () => {
    expect(txnMonth({ effectiveDate: '2026-03-15', date: '2026-02-28' })).toBe('2026-03');
  });
  it('returns YYYY-MM from date fallback', () => {
    expect(txnMonth({ date: '2026-01-05' })).toBe('2026-01');
  });
});

describe('txnDayjs', () => {
  it('returns dayjs instance for effectiveDate', () => {
    const d = txnDayjs({ effectiveDate: '2026-03-15', date: '2026-03-10' });
    expect(d.format('YYYY-MM-DD')).toBe('2026-03-15');
  });
});

describe('isInMonth', () => {
  const march = dayjs('2026-03-01');
  it('matches transaction in the target month', () => {
    expect(isInMonth({ date: '2026-03-15' }, march)).toBe(true);
  });
  it('rejects transaction in a different month', () => {
    expect(isInMonth({ date: '2026-04-01' }, march)).toBe(false);
  });
  it('uses effectiveDate over date', () => {
    expect(isInMonth({ effectiveDate: '2026-03-15', date: '2026-04-01' }, march)).toBe(true);
  });
});
