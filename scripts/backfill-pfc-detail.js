/**
 * One-time backfill: populate plaid_pfc_detail from Plaid's transactionsGet API.
 *
 * Usage: node scripts/backfill-pfc-detail.js
 *
 * Reads all plaid_items, fetches transactions via transactionsGet (paginated),
 * and UPDATEs plaid_pfc_detail for each matching transaction_id.
 */
require('dotenv').config();
const { production } = require('../utils/plaidClient');
const { connectToDb, getPool } = require('../db/database');

async function backfill() {
  await connectToDb();
  const pool = getPool();

  // Get all plaid items
  const { rows: items } = await pool.query('SELECT id, access_token, institution FROM plaid_items');
  console.log(`Found ${items.length} plaid items`);

  let totalUpdated = 0;

  for (const item of items) {
    console.log(`\nProcessing ${item.institution}...`);
    let offset = 0;
    let totalTxns = null;

    while (totalTxns === null || offset < totalTxns) {
      try {
        const response = await production.transactionsGet({
          access_token: item.access_token,
          start_date: '2020-01-01',
          end_date: new Date().toISOString().split('T')[0],
          options: { count: 500, offset },
        });

        const data = response.data;
        totalTxns = data.total_transactions;
        const txns = data.transactions;
        console.log(`  Fetched ${txns.length} (offset ${offset}, total ${totalTxns})`);

        let batchUpdated = 0;
        for (const txn of txns) {
          const detail = txn.personal_finance_category?.detailed;
          if (!detail) continue;

          const result = await pool.query(
            `UPDATE transactions SET plaid_pfc_detail = $1
             WHERE transaction_id = $2 AND plaid_pfc_detail IS NULL`,
            [detail, txn.transaction_id]
          );
          if (result.rowCount > 0) batchUpdated++;
        }

        totalUpdated += batchUpdated;
        console.log(`  Updated ${batchUpdated} transactions`);
        offset += txns.length;
      } catch (err) {
        console.error(`  Error at offset ${offset}: ${err.message}`);
        break;
      }
    }
  }

  console.log(`\nDone. Total updated: ${totalUpdated}`);
  process.exit(0);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
