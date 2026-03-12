#!/usr/bin/env node

/**
 * Seed test users with deterministic synthetic data.
 *
 * Usage:
 *   node scripts/seed-test-user.js --persona=active
 *   node scripts/seed-test-user.js --persona=all
 *   node scripts/seed-test-user.js --list
 *
 * Idempotent: deletes all data for the target UID(s) first, then inserts fresh.
 */

require('dotenv').config();

const { seedPersona, getPersonaList } = require('./test-data/seed');

// --- CLI args ---
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, '').split('=');
  acc[key] = val || true;
  return acc;
}, {});

if (args.list) {
  console.log('\nAvailable personas:');
  for (const p of getPersonaList()) {
    console.log(`  --persona=${p.name}  (uid: ${p.uid})`);
  }
  console.log(`  --persona=all     (seed all personas)\n`);
  process.exit(0);
}

if (!args.persona) {
  console.error('Usage: node scripts/seed-test-user.js --persona=<name|all>');
  console.error('       node scripts/seed-test-user.js --list');
  process.exit(1);
}

async function main() {
  const { connectToDb, getPool } = require('../db/database');
  await connectToDb();
  const pool = getPool();

  const personaNames = args.persona === 'all'
    ? getPersonaList().map(p => p.name)
    : [args.persona];

  for (const name of personaNames) {
    try {
      const result = await seedPersona(pool, name);
      console.log(`\nSeeded "${result.persona}" (${result.uid}):`);
      console.log(`  Users: ${result.counts.users}, Accounts: ${result.counts.accounts}, Categories: ${result.counts.categories}, Rules: ${result.counts.rules}, Transactions: ${result.counts.transactions}`);
    } catch (err) {
      console.error(`Failed to seed "${name}":`, err.message);
      process.exit(1);
    }
  }

  console.log('\nDone. Test user UIDs for DEV_AUTH_BYPASS_UID:');
  for (const name of personaNames) {
    const p = getPersonaList().find(p => p.name === name);
    console.log(`  ${name}: ${p.uid}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
