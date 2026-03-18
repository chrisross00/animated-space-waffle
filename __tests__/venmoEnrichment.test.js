import { describe, test, expect } from 'vitest'
import { parseVenmoCsv, matchVenmoRows, parseVenmoAmount, dateDiffDays } from '../utils/venmoEnrichment.js'

// Minimal CSV matching the real Venmo export format
const SAMPLE_CSV = `Account Statement - (@TestUser) ,,,,,,,,,,,,,,,,,,,,,
Account Activity,,,,,,,,,,,,,,,,,,,,,
,ID,Datetime,Type,Status,Note,From,To,Amount (total),Amount (tip),Amount (tax),Amount (fee),Tax Rate,Tax Exempt,Funding Source,Destination,Beginning Balance,Ending Balance,Statement Period Venmo Fees,Terminal Location,Year to Date Venmo Fees,Disclaimer
,,,,,,,,,,,,,,,,$0.00,,,,,
,1111111111111111111,2026-03-04T04:40:53,Charge,Complete,Dog sitter,McKayla Smith,Chris Ross,- $182.40,,0,,0,,Citizens Bank *3589,,,,,Venmo,,
,2222222222222222222,2026-03-06T05:38:23,Charge,Complete,gjlina,Chris Ross,McKayla Smith,+ $72.66,,0,,0,,,Venmo balance,,,,Venmo,,
,3333333333333333333,2026-03-06T05:38:42,Payment,Complete,Tacos and fries,McKayla Smith,Chris Ross,+ $19.00,,0,,0,,,Venmo balance,,,,Venmo,,
,4444444444444444444,2026-03-07T01:25:21,Charge,Pending,Prince less,McKayla Smith,Chris Ross,- $51.22,,0,,0,,Citizens Bank *3589,,,,,Venmo,,
,5555555555555555555,2026-03-16T06:05:30,Standard Transfer,Issued,,,,- $90.42,,,,,,,Citizens Bank *3589,,,,Venmo,,
,,,,,,,,,,,,,,,,,$0.00,$0.00,,$0.00,"Disclaimer text"
`;

describe('parseVenmoCsv', () => {
  test('parses valid rows and skips headers, footer, and pending', () => {
    const rows = parseVenmoCsv(SAMPLE_CSV);
    expect(rows).toHaveLength(4); // 3 Complete + 1 Issued, 1 Pending skipped
  });

  test('extracts correct fields', () => {
    const rows = parseVenmoCsv(SAMPLE_CSV);
    const first = rows[0];
    expect(first.id).toBe('1111111111111111111');
    expect(first.date).toBe('2026-03-04');
    expect(first.amount).toBeCloseTo(-182.40);
    expect(first.note).toBe('Dog sitter');
    expect(first.type).toBe('Charge');
  });

  test('determines counterparty correctly for sent money', () => {
    const rows = parseVenmoCsv(SAMPLE_CSV);
    // First row: negative amount (you paid) → counterparty is "From" (McKayla charged you)
    expect(rows[0].counterparty).toBe('McKayla Smith');
  });

  test('determines counterparty correctly for received money', () => {
    const rows = parseVenmoCsv(SAMPLE_CSV);
    // Second row: positive amount (you received) → counterparty is "To" (you charged McKayla)
    expect(rows[1].counterparty).toBe('McKayla Smith');
  });

  test('returns empty array for invalid input', () => {
    expect(parseVenmoCsv('')).toEqual([]);
    expect(parseVenmoCsv(null)).toEqual([]);
    expect(parseVenmoCsv('not a csv')).toEqual([]);
  });

  test('handles BOM', () => {
    const withBom = '\uFEFF' + SAMPLE_CSV;
    const rows = parseVenmoCsv(withBom);
    expect(rows).toHaveLength(4);
  });
});

describe('parseVenmoAmount', () => {
  test('parses positive amounts', () => {
    expect(parseVenmoAmount('+ $72.66')).toBeCloseTo(72.66);
  });

  test('parses negative amounts', () => {
    expect(parseVenmoAmount('- $182.40')).toBeCloseTo(-182.40);
  });

  test('returns null for invalid', () => {
    expect(parseVenmoAmount('')).toBeNull();
    expect(parseVenmoAmount(null)).toBeNull();
  });
});

describe('dateDiffDays', () => {
  test('same day returns 0', () => {
    expect(dateDiffDays('2026-03-04', '2026-03-04')).toBe(0);
  });

  test('adjacent days return 1/-1', () => {
    expect(dateDiffDays('2026-03-05', '2026-03-04')).toBe(1);
    expect(dateDiffDays('2026-03-04', '2026-03-05')).toBe(-1);
  });
});

describe('matchVenmoRows', () => {
  const venmoRows = [
    { id: 'v1', date: '2026-03-04', amount: -182.40, note: 'Dog sitter', counterparty: 'Chris Ross', type: 'Charge' },
    { id: 'v2', date: '2026-03-06', amount: 72.66, note: 'gjlina', counterparty: 'Chris Ross', type: 'Charge' },
    { id: 'v3', date: '2026-03-10', amount: -50.00, note: 'No match', counterparty: 'Someone', type: 'Payment' },
  ];

  const plaidTxns = [
    // Real-world pattern: Venmo txns come through the bank with name="Venmo", merchant_name=null
    { transaction_id: 'p1', name: 'Venmo', merchant_name: null, amount: 182.40, date: '2026-03-04', account: 'Citizens Bank' },
    { transaction_id: 'p2', name: 'Venmo', merchant_name: null, amount: -72.66, date: '2026-03-06', account: 'Citizens Bank' },
    { transaction_id: 'p3', name: 'Starbucks', merchant_name: 'Starbucks', amount: 5.00, date: '2026-03-04', account: 'Chase' },
  ];

  test('matches by amount and date', () => {
    const result = matchVenmoRows(venmoRows, plaidTxns);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].venmoRow.id).toBe('v1');
    expect(result.matches[0].plaidTransaction.transaction_id).toBe('p1');
    expect(result.matches[1].venmoRow.id).toBe('v2');
    expect(result.matches[1].plaidTransaction.transaction_id).toBe('p2');
  });

  test('reports unmatched rows', () => {
    const result = matchVenmoRows(venmoRows, plaidTxns);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].venmoRow.id).toBe('v3');
  });

  test('ignores non-Venmo Plaid transactions', () => {
    // Starbucks from Chase should never match
    const result = matchVenmoRows(
      [{ id: 'x', date: '2026-03-04', amount: -5.00, note: 'test', counterparty: 'Test', type: 'Payment' }],
      plaidTxns,
    );
    expect(result.matches).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
  });

  test('skips already-enriched transactions', () => {
    const enrichedPlaid = [
      { ...plaidTxns[0], venmo_id: 'v1' },
      plaidTxns[1],
    ];
    const result = matchVenmoRows(venmoRows, enrichedPlaid);
    expect(result.alreadyEnriched).toHaveLength(1);
    expect(result.alreadyEnriched[0].venmoRow.id).toBe('v1');
    expect(result.matches).toHaveLength(1); // v2 still matches
  });

  test('matches regardless of date drift', () => {
    const farPlaid = [
      { transaction_id: 'p1', name: 'Venmo', merchant_name: 'Venmo', amount: 182.40, date: '2026-03-10', account: 'Venmo' },
    ];
    const result = matchVenmoRows([venmoRows[0]], farPlaid);
    expect(result.matches).toHaveLength(1);
  });

  test('uses date proximity as tiebreaker for duplicate amounts', () => {
    const dupePlaid = [
      { transaction_id: 'far', name: 'Venmo', merchant_name: 'Venmo', amount: 182.40, date: '2026-03-10', account: 'Venmo' },
      { transaction_id: 'close', name: 'Venmo', merchant_name: 'Venmo', amount: 182.40, date: '2026-03-05', account: 'Venmo' },
    ];
    const result = matchVenmoRows([venmoRows[0]], dupePlaid);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].plaidTransaction.transaction_id).toBe('close');
    expect(result.matches[0].confidence).toBe('medium');
  });

  test('handles empty inputs', () => {
    expect(matchVenmoRows([], [])).toEqual({ matches: [], unmatched: [], alreadyEnriched: [] });
    expect(matchVenmoRows(null, null)).toEqual({ matches: [], unmatched: [], alreadyEnriched: [] });
  });

  test('assigns high confidence for single match, medium for multiple', () => {
    const dupeAmount = [
      { transaction_id: 'pd1', name: 'Venmo', merchant_name: 'Venmo', amount: 182.40, date: '2026-03-04', account: 'Venmo' },
      { transaction_id: 'pd2', name: 'Venmo', merchant_name: 'Venmo', amount: 182.40, date: '2026-03-04', account: 'Venmo' },
    ];
    const result = matchVenmoRows([venmoRows[0]], dupeAmount);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].confidence).toBe('medium');
  });
});
