import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Pure helper that mirrors BudgetView's client-side search filter inside the
// tableTransactions computed property. Tests serve as a spec — if the computed
// changes, these should change too.
// ---------------------------------------------------------------------------

function filterBySearch(rows, search) {
  if (!search || !search.trim()) return rows;
  const q = search.trim().toLowerCase();
  return rows.filter(t =>
    (t.name && t.name.toLowerCase().includes(q)) ||
    (t.merchant_name && t.merchant_name.toLowerCase().includes(q)) ||
    (t.mappedCategory && t.mappedCategory.toLowerCase().includes(q))
  );
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const txns = [
  { transaction_id: '1', name: 'UBER TRIP', merchant_name: 'Uber', mappedCategory: 'Transportation', amount: 25 },
  { transaction_id: '2', name: 'WHOLEFDS MKT 10432', merchant_name: 'Whole Foods', mappedCategory: 'Groceries', amount: 87.50 },
  { transaction_id: '3', name: 'SPOTIFY P12345', merchant_name: 'Spotify', mappedCategory: 'Entertainment', amount: 9.99 },
  { transaction_id: '4', name: 'ACH DEPOSIT EMPLOYER', merchant_name: null, mappedCategory: 'Salary', amount: -3000 },
  { transaction_id: '5', name: 'VENMO PAYMENT', merchant_name: null, mappedCategory: null, amount: 50 },
];

// ---------------------------------------------------------------------------
// filterBySearch
// ---------------------------------------------------------------------------

describe('filterBySearch (client-side table search)', () => {
  it('returns all rows when search is empty', () => {
    expect(filterBySearch(txns, '')).toEqual(txns);
    expect(filterBySearch(txns, '   ')).toEqual(txns);
    expect(filterBySearch(txns, null)).toEqual(txns);
    expect(filterBySearch(txns, undefined)).toEqual(txns);
  });

  it('matches on merchant_name', () => {
    const result = filterBySearch(txns, 'uber');
    expect(result).toHaveLength(1);
    expect(result[0].transaction_id).toBe('1');
  });

  it('matches on name (raw Plaid name)', () => {
    const result = filterBySearch(txns, 'WHOLEFDS');
    expect(result).toHaveLength(1);
    expect(result[0].transaction_id).toBe('2');
  });

  it('matches on mappedCategory', () => {
    const result = filterBySearch(txns, 'entertainment');
    expect(result).toHaveLength(1);
    expect(result[0].transaction_id).toBe('3');
  });

  it('is case-insensitive', () => {
    expect(filterBySearch(txns, 'SPOTIFY')).toHaveLength(1);
    expect(filterBySearch(txns, 'spotify')).toHaveLength(1);
    expect(filterBySearch(txns, 'Spotify')).toHaveLength(1);
  });

  it('returns multiple matches', () => {
    // "er" matches Uber (merchant_name) and EMPLOYER (name)
    const result = filterBySearch(txns, 'er');
    const ids = result.map(t => t.transaction_id);
    expect(ids).toContain('1');  // Uber
    expect(ids).toContain('4');  // EMPLOYER
  });

  it('handles transactions with null merchant_name', () => {
    const result = filterBySearch(txns, 'ACH DEPOSIT');
    expect(result).toHaveLength(1);
    expect(result[0].transaction_id).toBe('4');
  });

  it('handles transactions with null mappedCategory', () => {
    const result = filterBySearch(txns, 'VENMO');
    expect(result).toHaveLength(1);
    expect(result[0].transaction_id).toBe('5');
  });

  it('returns empty array when nothing matches', () => {
    expect(filterBySearch(txns, 'zzzznonexistent')).toHaveLength(0);
  });

  it('trims whitespace from search query', () => {
    expect(filterBySearch(txns, '  uber  ')).toHaveLength(1);
  });

  it('matches partial strings (substring, not exact)', () => {
    // "hole" is a substring of "Whole Foods"
    const result = filterBySearch(txns, 'hole');
    expect(result).toHaveLength(1);
    expect(result[0].merchant_name).toBe('Whole Foods');
  });
});
