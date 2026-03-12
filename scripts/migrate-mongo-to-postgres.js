#!/usr/bin/env node
/**
 * One-time data migration: MongoDB Atlas → Hetzner Postgres
 *
 * Prerequisites:
 *   1. npm install mongodb   (temporarily — remove after migration)
 *   2. SSH tunnel to Hetzner:
 *      ssh -L 15432:127.0.0.1:5432 root@178.156.248.108 -N
 *   3. Set env vars (or they'll be read from root .env):
 *      - DB_URI            MongoDB Atlas connection string
 *      - DB_NAME           MongoDB database name (default: BudgetApp)
 *      - MIGRATE_PG_URL    Postgres URL via tunnel (default: postgresql://basil:<pw>@localhost:15432/basil)
 *
 * Usage:
 *   node scripts/migrate-mongo-to-postgres.js [--dry-run]
 *
 * Dry-run mode reads all Mongo data and logs counts but doesn't write to Postgres.
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

// --- Config ---
const MONGO_URI = process.env.DB_URI;
const MONGO_DB  = process.env.DB_NAME || 'BudgetApp';
const PG_URL    = process.env.MIGRATE_PG_URL
  || `postgresql://basil:${process.env.POSTGRES_PASSWORD}@localhost:15432/basil`;
if (!MONGO_URI) { console.error('FATAL: DB_URI is not set'); process.exit(1); }
if (!process.env.MIGRATE_PG_URL && !process.env.POSTGRES_PASSWORD) { console.error('FATAL: MIGRATE_PG_URL or POSTGRES_PASSWORD must be set'); process.exit(1); }

const BATCH_SIZE = 500; // transactions per INSERT batch

// --- Helpers ---
function log(msg) { console.log(`[migrate] ${msg}`); }
function warn(msg) { console.warn(`[migrate] ⚠ ${msg}`); }
/** Convert a value to a Date — handles raw ms timestamps, Date objects, ISO strings */
function toDate(val) {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val === 'number') return new Date(val);
  return new Date(val);
}

// --- Main ---
async function migrate() {
  log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  log(`Mongo: ${MONGO_URI?.replace(/\/\/[^@]+@/, '//***@')}`);
  log(`Postgres: ${PG_URL.replace(/\/\/[^@]+@/, '//***@')}`);

  // Connect to both databases
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  const mdb = mongo.db(MONGO_DB);
  log('Connected to MongoDB');

  const pool = new Pool({ connectionString: PG_URL });
  await pool.query('SELECT 1');
  log('Connected to Postgres');

  const stats = { users: 0, categories: 0, simpleRules: 0, plaidItems: 0, plaidAccounts: 0, balanceSnapshots: 0, transactions: 0, compoundRules: 0 };

  try {
    // =============================================
    // 1. USERS
    // =============================================
    log('--- Migrating users ---');
    const users = await mdb.collection('Basil-Users').find().toArray();
    log(`Found ${users.length} users in Mongo`);

    for (const u of users) {
      if (DRY_RUN) { stats.users++; continue; }
      await pool.query(
        `INSERT INTO users (id, email, name, picture, is_admin, onboarded_at, last_synced_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           email = COALESCE(EXCLUDED.email, users.email),
           name = COALESCE(EXCLUDED.name, users.name),
           picture = COALESCE(EXCLUDED.picture, users.picture),
           is_admin = EXCLUDED.is_admin`,
        [
          u.userId,
          u.email || null,
          u.name || null,
          u.picture || null,
          u.isAdmin || false,
          u.onboarded_at || null,
          u.lastSyncedAt || u.last_synced_at || null,
          u.created_at || new Date(),
        ]
      );
      stats.users++;
    }
    log(`Users: ${stats.users} migrated`);

    // =============================================
    // 2. CATEGORIES + SIMPLE RULES
    // =============================================
    log('--- Migrating categories + simple rules ---');
    const categories = await mdb.collection('Basil-Categories').find().toArray();
    log(`Found ${categories.length} categories in Mongo`);

    // Map to look up category Postgres IDs by (userId, name) for later use
    const categoryIdMap = {};

    for (const cat of categories) {
      if (DRY_RUN) { stats.categories++; continue; }

      const { rows } = await pool.query(
        `INSERT INTO categories (user_id, name, type, monthly_limit, show_on_budget, plaid_pfc)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, name) DO UPDATE SET
           type = EXCLUDED.type,
           monthly_limit = EXCLUDED.monthly_limit,
           show_on_budget = EXCLUDED.show_on_budget,
           plaid_pfc = EXCLUDED.plaid_pfc
         RETURNING id`,
        [
          cat.userId,
          cat.category,
          cat.type || 'expense',
          cat.monthly_limit || 0,
          cat.show_on_budget !== false,
          cat.plaid_pfc || null,
        ]
      );
      const categoryId = rows[0].id;
      categoryIdMap[`${cat.userId}:${cat.category}`] = categoryId;
      stats.categories++;

      // Simple rules — embedded in category document
      for (const merchant of cat.rules?.merchant_name || []) {
        await pool.query(
          `INSERT INTO simple_rules (category_id, user_id, rule_type, rule_value)
           VALUES ($1, $2, 'merchant_name', $3)
           ON CONFLICT (user_id, rule_type, rule_value) DO NOTHING`,
          [categoryId, cat.userId, merchant]
        );
        stats.simpleRules++;
      }
      for (const name of cat.rules?.name || []) {
        await pool.query(
          `INSERT INTO simple_rules (category_id, user_id, rule_type, rule_value)
           VALUES ($1, $2, 'name', $3)
           ON CONFLICT (user_id, rule_type, rule_value) DO NOTHING`,
          [categoryId, cat.userId, name]
        );
        stats.simpleRules++;
      }
    }
    log(`Categories: ${stats.categories} migrated, ${stats.simpleRules} simple rules`);

    // =============================================
    // 3. PLAID ITEMS + ACCOUNTS (flatten nested structure)
    // =============================================
    log('--- Migrating Plaid items + accounts ---');
    const accountDocs = await mdb.collection('Plaid-Accounts').find().toArray();
    log(`Found ${accountDocs.length} Plaid account documents in Mongo`);

    for (const doc of accountDocs) {
      const accounts = doc.Accounts || {};
      for (const [institution, data] of Object.entries(accounts)) {
        if (DRY_RUN) {
          stats.plaidItems++;
          stats.plaidAccounts += (data.balances || data.accounts || []).length;
          stats.balanceSnapshots += (data.balanceSnapshots || []).length;
          continue;
        }

        const { rows } = await pool.query(
          `INSERT INTO plaid_items (user_id, institution, access_token, next_cursor, prev_cursor,
             error_code, error_message, error_detected_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            doc.userId,
            institution,
            data.token || data.accessToken || '',
            data.next_cursor || data.nextCursor || null,
            data.prev_cursor || data.prevCursor || null,
            data.error?.error_code || null,
            data.error?.error_message || null,
            data.error?.detected_at || null,
          ]
        );

        // If ON CONFLICT hit, look up existing item ID
        let itemId;
        if (rows.length > 0) {
          itemId = rows[0].id;
        } else {
          const lookup = await pool.query(
            `SELECT id FROM plaid_items WHERE user_id = $1 AND institution = $2`,
            [doc.userId, institution]
          );
          if (lookup.rows.length === 0) {
            warn(`Could not find/insert plaid_item for ${doc.userId}/${institution}, skipping accounts`);
            continue;
          }
          itemId = lookup.rows[0].id;
        }
        stats.plaidItems++;

        // Insert individual accounts under this item
        // Mongo stores account data under `balances` (not `accounts`)
        for (const acct of data.balances || data.accounts || []) {
          // Mongo shape has current/available at top level (not nested under balances)
          await pool.query(
            `INSERT INTO plaid_accounts (account_id, item_id, user_id, name, official_name,
               mask, type, subtype, balance, available, "limit", balance_fetched_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (account_id) DO UPDATE SET
               balance = EXCLUDED.balance,
               available = EXCLUDED.available,
               "limit" = EXCLUDED."limit",
               balance_fetched_at = EXCLUDED.balance_fetched_at`,
            [
              acct.account_id,
              itemId,
              doc.userId,
              acct.name || null,
              acct.official_name || null,
              acct.mask || null,
              acct.type || null,
              acct.subtype || null,
              acct.current ?? acct.balances?.current ?? null,
              acct.available ?? acct.balances?.available ?? null,
              acct.limit ?? acct.balances?.limit ?? null,
              acct.fetchedAt ? new Date(acct.fetchedAt) : null,
            ]
          );
          stats.plaidAccounts++;
        }

        // Insert balance snapshots for this item
        for (const snap of data.balanceSnapshots || []) {
          await pool.query(
            `INSERT INTO balance_snapshots (item_id, date, net, fetched_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [
              itemId,
              snap.date,
              snap.net,
              snap.fetchedAt ? new Date(snap.fetchedAt) : new Date(),
            ]
          );
          stats.balanceSnapshots++;
        }
      }
    }
    log(`Plaid items: ${stats.plaidItems}, accounts: ${stats.plaidAccounts}, snapshots: ${stats.balanceSnapshots}`);

    // =============================================
    // 4. TRANSACTIONS (batched)
    // =============================================
    log('--- Migrating transactions ---');
    const txnCount = await mdb.collection('Plaid-Transactions').countDocuments();
    log(`Found ${txnCount} transactions in Mongo`);

    const txnCursor = mdb.collection('Plaid-Transactions').find();
    let batch = [];
    let batchNum = 0;

    while (await txnCursor.hasNext()) {
      const t = await txnCursor.next();
      batch.push(t);

      if (batch.length >= BATCH_SIZE) {
        if (!DRY_RUN) await insertTransactionBatch(pool, batch);
        stats.transactions += batch.length;
        batchNum++;
        if (batchNum % 10 === 0) log(`  ...${stats.transactions}/${txnCount} transactions`);
        batch = [];
      }
    }
    // Final partial batch
    if (batch.length > 0) {
      if (!DRY_RUN) await insertTransactionBatch(pool, batch);
      stats.transactions += batch.length;
    }
    log(`Transactions: ${stats.transactions} migrated`);

    // =============================================
    // 5. COMPOUND RULES
    // =============================================
    log('--- Migrating compound rules ---');
    const rules = await mdb.collection('Basil-Rules').find().toArray();
    log(`Found ${rules.length} compound rules in Mongo`);

    for (const r of rules) {
      if (DRY_RUN) { stats.compoundRules++; continue; }
      await pool.query(
        `INSERT INTO compound_rules (user_id, label, conditions, action, created_from, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          r.userId,
          r.label || null,
          JSON.stringify(r.conditions),
          JSON.stringify(r.action),
          r.createdFrom || null,
          toDate(r.createdAt || r.created_at),
        ]
      );
      stats.compoundRules++;
    }
    log(`Compound rules: ${stats.compoundRules} migrated`);

    // =============================================
    // SUMMARY
    // =============================================
    log('');
    log('=== Migration complete ===');
    log(`  Users:          ${stats.users}`);
    log(`  Categories:     ${stats.categories}`);
    log(`  Simple rules:   ${stats.simpleRules}`);
    log(`  Plaid items:    ${stats.plaidItems}`);
    log(`  Plaid accounts: ${stats.plaidAccounts}`);
    log(`  Bal. snapshots: ${stats.balanceSnapshots}`);
    log(`  Transactions:   ${stats.transactions}`);
    log(`  Compound rules: ${stats.compoundRules}`);
    if (DRY_RUN) log('  (DRY RUN — nothing was written to Postgres)');

  } finally {
    await mongo.close();
    await pool.end();
  }
}

/**
 * Insert a batch of transactions into Postgres.
 * Uses individual INSERTs with ON CONFLICT to skip duplicates.
 */
async function insertTransactionBatch(pool, batch) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of batch) {
      // Transform personal_finance_category → plaid_pfc array
      let plaidPfc = null;
      if (t.plaid_pfc) {
        plaidPfc = Array.isArray(t.plaid_pfc) ? t.plaid_pfc : [t.plaid_pfc];
      } else if (t.personal_finance_category?.primary) {
        plaidPfc = [t.personal_finance_category.primary];
      }

      // Handle dismissed_relationship: Mongo stores boolean, Postgres expects TIMESTAMPTZ
      let dismissedRelationship = null;
      if (t.dismissed_relationship === true || t.dismissedRelationship === true) {
        dismissedRelationship = new Date(); // Convert boolean true → timestamp
      } else if (t.dismissed_relationship instanceof Date || typeof t.dismissed_relationship === 'string') {
        dismissedRelationship = t.dismissed_relationship;
      }

      await client.query(
        `INSERT INTO transactions (
           transaction_id, user_id, account_id, name, merchant_name,
           amount, date, effective_date, mapped_category, pending,
           pending_transaction_id, note, exclude_from_total, manually_set,
           account, plaid_pfc, venmo_id, venmo_counterparty, venmo_note,
           linked_transaction, dismissed_relationship, inserted_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (transaction_id) DO NOTHING`,
        [
          t.transaction_id,
          t.userId,
          t.account_id || null,
          t.name || null,
          t.merchant_name || null,
          t.amount ?? null,
          t.date || null,
          t.effective_date || t.effectiveDate || null,
          t.mappedCategory || t.mapped_category || null,
          t.pending || false,
          t.pending_transaction_id || null,
          t.note || null,
          t.excludeFromTotal || t.exclude_from_total || false,
          t.manually_set || false,
          t.account || null,
          plaidPfc,
          t.venmo_id || null,
          t.venmo_counterparty || null,
          t.venmo_note || null,
          t.linked_transaction || t.linkedTransaction ? JSON.stringify(t.linked_transaction || t.linkedTransaction) : null,
          dismissedRelationship,
          t.created_at || t.inserted_at || new Date(),
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

migrate().catch(err => {
  console.error('[migrate] FATAL:', err);
  process.exit(1);
});
