import { describe, it, expect } from 'vitest';
import { formatDollar, formatSignedDollar } from '@/utils/formatDollar';

describe('formatDollar', () => {
  it('formats integer amounts with commas', () => {
    expect(formatDollar(1234)).toBe('1,234');
    expect(formatDollar(0)).toBe('0');
    expect(formatDollar(999999)).toBe('999,999');
  });

  it('uses absolute value', () => {
    expect(formatDollar(-500)).toBe('500');
  });

  it('respects decimal places', () => {
    expect(formatDollar(1234.5, 2)).toBe('1,234.50');
    expect(formatDollar(1234, 2)).toBe('1,234.00');
  });

  it('handles NaN gracefully', () => {
    expect(formatDollar(NaN)).toBe('0');
  });
});

describe('formatSignedDollar', () => {
  it('formats positive with + prefix and positive class', () => {
    const result = formatSignedDollar(500);
    expect(result.text).toBe('+$500');
    expect(result.colorClass).toBe('basil-positive');
  });

  it('formats negative with − prefix and negative class', () => {
    const result = formatSignedDollar(-500);
    expect(result.text).toBe('−$500');
    expect(result.colorClass).toBe('basil-negative');
  });

  it('formats zero as positive', () => {
    const result = formatSignedDollar(0);
    expect(result.text).toBe('+$0');
    expect(result.colorClass).toBe('basil-positive');
  });

  it('respects decimal places', () => {
    const result = formatSignedDollar(-1234.5, 2);
    expect(result.text).toBe('−$1,234.50');
  });
});
