#!/usr/bin/env node

/**
 * Delete all test user data from the database.
 * Only affects users with isTestUser: true on their Basil-Users doc.
 *
 * Usage:
 *   node scripts/nuke-test-users.js
 *   node scripts/nuke-test-users.js --dry-run
 */

require('dotenv').config();

const { nukeTestUsers } = require('./test-data/seed');

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, '').split('=');
  acc[key] = val || true;
  return acc;
}, {});

async function main() {
  const { connectToDb, getPool } = require('../db/database');
  await connectToDb();
  const pool = getPool();

  const dryRun = !!args['dry-run'];
  const result = await nukeTestUsers(pool, { dryRun });

  if (result.users.length === 0) {
    console.log('No test users found in database.');
    process.exit(0);
  }

  console.log(`Found ${result.users.length} test user(s):`);
  for (const u of result.users) {
    console.log(`  ${u.userId} — ${u.name} (${u.email})`);
  }

  const counts = dryRun ? result.wouldDelete : result.deleted;
  console.log(dryRun ? '\n--- DRY RUN (no data deleted) ---' : '\nDeleted:');
  for (const [col, count] of Object.entries(counts)) {
    console.log(`  ${col}: ${count} docs${dryRun ? ' would be deleted' : ''}`);
  }

  if (!dryRun) console.log('\nDone. All test user data removed.');
  process.exit(0);
}

main().catch(err => {
  console.error('Nuke failed:', err);
  process.exit(1);
});
