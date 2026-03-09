/**
 * Venmo CSV enrichment utility.
 *
 * Parses Venmo statement CSV exports and matches rows against existing
 * Plaid transactions so the app can store counterparty names and notes
 * that Plaid doesn't provide for P2P transfers.
 */

/**
 * Parse a Venmo statement CSV string into structured row objects.
 *
 * Venmo CSVs have:
 *   - 2 header lines (account info + "Account Activity")
 *   - 1 column header line
 *   - 1 blank/balance line
 *   - Data rows
 *   - Footer rows (summary + legal disclaimer)
 *
 * @param {string} csvText  Raw CSV file contents
 * @returns {Array<Object>}  Parsed rows with: id, date, amount, note, counterparty, type
 */
function parseVenmoCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];

  // Strip BOM if present
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = text.split('\n');

  // Find the column header row (contains "ID" and "Datetime")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i].includes(',ID,') && lines[i].includes('Datetime')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const rows = [];

  // Parse data rows after the header. Skip the blank/balance row right after header.
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);

    // Stop at footer: rows without a valid ID in column 1
    const id = fields[1]?.trim();
    if (!id || !/^\d+$/.test(id)) break;

    const datetime = fields[2]?.trim();
    const type = fields[3]?.trim();       // "Charge" or "Payment"
    const status = fields[4]?.trim();
    const note = fields[5]?.trim() || '';
    const from = fields[6]?.trim() || '';
    const to = fields[7]?.trim() || '';
    const amountRaw = fields[8]?.trim();

    // Only include completed transactions
    if (status !== 'Complete') continue;

    const amount = parseVenmoAmount(amountRaw);
    if (amount === null) continue;

    // Determine counterparty: the other person in the transaction.
    // The CSV "From" and "To" are from the perspective of the charge/payment:
    //   - Negative (you paid):    From = the person who charged you (counterparty)
    //   - Positive (you received): To = the person you charged (counterparty)
    const counterparty = amount < 0 ? from : to;

    // Extract date portion from datetime (format: 2026-03-04T04:40:53)
    const date = datetime ? datetime.split('T')[0] : null;
    if (!date) continue;

    rows.push({ id, date, amount, note, counterparty, type });
  }

  return rows;
}

/**
 * Parse a Venmo amount string like "+ $72.66" or "- $182.40" to a number.
 * Returns positive for received, negative for sent. Returns null on failure.
 */
function parseVenmoAmount(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse a single CSV line respecting quoted fields (handles commas inside quotes).
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Match parsed Venmo CSV rows against Plaid transactions.
 *
 * Matching criteria:
 *   1. Transaction's `account` field contains "venmo" (case-insensitive)
 *      OR `merchant_name` contains "venmo" (case-insensitive)
 *   2. Amount matches (absolute value, within 1 cent for float precision)
 *   3. Date within ±1 day
 *
 * @param {Array} venmoRows     Output of parseVenmoCsv()
 * @param {Array} plaidTxns     Array of Plaid transaction documents
 * @returns {{ matches: Array, unmatched: Array, alreadyEnriched: Array }}
 */
function matchVenmoRows(venmoRows, plaidTxns) {
  if (!Array.isArray(venmoRows) || !Array.isArray(plaidTxns)) {
    return { matches: [], unmatched: [], alreadyEnriched: [] };
  }

  // Filter to Venmo-related Plaid transactions.
  // Venmo txns can appear as: account="Venmo" (if linked directly),
  // or name="Venmo" with account="Citizens Bank" (bank-side view),
  // or merchant_name containing "Venmo".
  const venmoTxns = plaidTxns.filter(t =>
    (t.account && t.account.toLowerCase().includes('venmo')) ||
    (t.merchant_name && t.merchant_name.toLowerCase().includes('venmo')) ||
    (t.name && t.name.toLowerCase().includes('venmo'))
  );

  const matches = [];
  const unmatched = [];
  const alreadyEnriched = [];

  // Track which Plaid txns have been claimed to avoid double-matching
  const claimed = new Set();

  for (const row of venmoRows) {
    // Skip rows that were already enriched in a previous upload
    const alreadyDone = venmoTxns.find(t => t.venmo_id === row.id);
    if (alreadyDone) {
      alreadyEnriched.push({ venmoRow: row, plaidTransaction: alreadyDone });
      continue;
    }

    const candidates = venmoTxns.filter(t => {
      if (claimed.has(t.transaction_id)) return false;
      if (t.venmo_id) return false; // already enriched with a different row

      // Amount match: compare absolute values within 1 cent
      // Plaid: positive = money out (debit), negative = money in (credit)
      // Venmo CSV: negative = money out, positive = money in
      // So signs are flipped: venmo * -1 ≈ plaid
      // But Plaid's sign for Venmo can be inconsistent, so match on abs
      if (Math.round(Math.abs(t.amount) * 100) !== Math.round(Math.abs(row.amount) * 100)) {
        return false;
      }

      // Date match: within ±1 day
      if (!t.date) return false;
      const plaidDate = t.date.substring(0, 10);
      const dayDiff = Math.abs(dateDiffDays(row.date, plaidDate));
      return dayDiff <= 1;
    });

    if (candidates.length === 0) {
      unmatched.push({ venmoRow: row });
      continue;
    }

    // Pick the best candidate: prefer exact date match, then closest date
    candidates.sort((a, b) => {
      const diffA = Math.abs(dateDiffDays(row.date, a.date.substring(0, 10)));
      const diffB = Math.abs(dateDiffDays(row.date, b.date.substring(0, 10)));
      return diffA - diffB;
    });

    const best = candidates[0];
    const confidence = candidates.length === 1 ? 'high' : 'medium';
    claimed.add(best.transaction_id);

    matches.push({
      venmoRow: row,
      plaidTransaction: {
        transaction_id: best.transaction_id,
        name: best.name,
        amount: best.amount,
        date: best.date,
        merchant_name: best.merchant_name,
        mappedCategory: best.mappedCategory,
      },
      confidence,
    });
  }

  return { matches, unmatched, alreadyEnriched };
}

/** Difference in days between two YYYY-MM-DD date strings. */
function dateDiffDays(dateA, dateB) {
  const a = new Date(dateA + 'T00:00:00Z');
  const b = new Date(dateB + 'T00:00:00Z');
  return Math.round((a - b) / 86400000);
}

module.exports = { parseVenmoCsv, matchVenmoRows, parseVenmoAmount, parseCSVLine, dateDiffDays };
