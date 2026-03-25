#!/usr/bin/env node
/**
 * Similarity cascade analysis — validates proposed findSimilarTransactions tiers
 * against real transaction data.
 *
 * Usage:
 *   1. Dump data:  npm run similarity:dump
 *   2. Analyze:    npm run similarity:analyze
 *
 * Or directly:
 *   node scripts/similarity-analysis.js analyze scripts/txn-dump.json
 *   node scripts/similarity-analysis.js dump    # requires SSH to prod
 */

const fs = require('fs');
const { execSync } = require('child_process');

// --- P2P detection (mirrors utils/categoryMapping.js) ---
const P2P_PATTERNS = [/venmo/i, /zelle/i, /cash app/i, /cashapp/i, /paypal/i, /apple cash/i];
function isP2P(txn) {
  const sources = [txn.merchant_name, txn.name].filter(Boolean);
  return sources.some(s => P2P_PATTERNS.some(p => p.test(s)));
}

// --- Prefix extraction ---
// Two heuristics:
// 1. Strip trailing digits (1+): "Gusto-OSV 00007055 CITIZENS" → "Gusto-OSV"
// 2. If no digits, take first N words that repeat across txns: "DD *DOORDASH MASCAFE" → "DD *DOORDASH"
//    (heuristic 2 is approximated here by taking everything up to the last space-separated token
//     if the last token looks like a variable suffix — all caps, short)
function extractStablePrefix(name) {
  if (!name) return null;

  // Heuristic 1: everything before first digit run (1+ digits)
  const digitMatch = name.match(/\d+/);
  if (digitMatch) {
    const raw = name.slice(0, digitMatch.index).replace(/[\s#\-_.*]+$/, '');
    if (raw.length >= 4) return raw;
  }

  // Heuristic 2: drop the last token if it looks like a variable suffix
  // e.g. "DD *DOORDASH MASCAFE" → last token "MASCAFE" looks like a variable restaurant name
  // Only apply if there are 2+ tokens and the result is still 4+ chars
  const tokens = name.trim().split(/\s+/);
  if (tokens.length >= 2) {
    const withoutLast = tokens.slice(0, -1).join(' ');
    if (withoutLast.length >= 4) return withoutLast;
  }

  return null;
}

// --- Tier definitions ---
function buildTiers(anchor, hasAccount) {
  const anchorName = anchor.name || '';
  const hasMerchant = anchor.merchant_name != null && anchor.merchant_name !== '';
  const p2p = isP2P(anchor);
  const tiers = [];

  if (p2p) {
    // P2P: only amount + account (everything else is too broad)
    if (hasAccount && anchor.amount != null) {
      const absAmount = Math.abs(anchor.amount);
      tiers.push({
        name: 'amount_account',
        matchFn: t => Math.abs(t.amount) === absAmount && t.account === anchor.account,
      });
    }
    return tiers;
  }

  // --- Non-P2P cascade ---

  // Tier 1: merchant
  if (hasMerchant) {
    const valLower = anchor.merchant_name.toLowerCase();
    tiers.push({
      name: 'merchant_name',
      matchFn: t => t.merchant_name != null && t.merchant_name.toLowerCase() === valLower,
    });
  }

  // Tier 2: exact name
  if (anchorName) {
    const nameLower = anchorName.toLowerCase();
    tiers.push({
      name: 'exact_name',
      matchFn: t => (t.name || '').toLowerCase() === nameLower,
    });
  }

  // Tier 3: name + account
  if (anchorName && hasAccount) {
    const nameLower = anchorName.toLowerCase();
    tiers.push({
      name: 'name_account',
      matchFn: t => (t.name || '').toLowerCase() === nameLower && t.account === anchor.account,
    });
  }

  // Tier 4: name prefix
  if (anchorName) {
    const prefix = extractStablePrefix(anchorName);
    if (prefix) {
      const prefixLower = prefix.toLowerCase();
      tiers.push({
        name: 'name_prefix',
        prefix,
        matchFn: t => (t.name || '').toLowerCase().includes(prefixLower),
      });
    }
  }

  // Tier 5: amount + account
  if (hasAccount && anchor.amount != null) {
    const absAmount = Math.abs(anchor.amount);
    tiers.push({
      name: 'amount_account',
      matchFn: t => Math.abs(t.amount) === absAmount && t.account === anchor.account,
    });
  }

  return tiers;
}

function runCascade(anchor, transactions) {
  const hasAccount = anchor.account != null && anchor.account !== '' && anchor.account !== '?';
  const tiers = buildTiers(anchor, hasAccount);
  const allTierResults = [];

  for (const tier of tiers) {
    const matches = transactions.filter(t =>
      t.transaction_id !== anchor.transaction_id && tier.matchFn(t)
    );
    allTierResults.push({ tier: tier.name, count: matches.length, prefix: tier.prefix || null });
    if (matches.length > 0) {
      return { winner: tier.name, count: matches.length, allTiers: allTierResults, prefix: tier.prefix || null };
    }
  }

  return { winner: null, count: 0, allTiers: allTierResults };
}

// --- Dump command ---
function dump() {
  console.log('Pulling transaction data from prod...');
  const query = `SELECT transaction_id, name, merchant_name, account, amount, mapped_category, manually_set, date FROM transactions WHERE user_id = (SELECT id FROM users WHERE email = 'chrisross00@gmail.com') ORDER BY date DESC`;
  const cmd = `ssh root@178.156.248.108 "docker exec basil-postgres-1 psql -U basil -d basil -t -A -F'|||' -c \\"${query}\\""`;

  const raw = execSync(cmd, { encoding: 'utf8', timeout: 15000 });
  const rows = raw.trim().split('\n').filter(Boolean).map(line => {
    const [transaction_id, name, merchant_name, account, amount, mapped_category, manually_set, date] = line.split('|||');
    return {
      transaction_id,
      name: name || null,
      merchant_name: merchant_name || null,
      account: account || null,
      amount: parseFloat(amount) || 0,
      mappedCategory: mapped_category || 'To Sort',
      manually_set: manually_set === 't',
      date,
    };
  });

  const outPath = 'scripts/txn-dump.json';
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Dumped ${rows.length} transactions to ${outPath}`);
}

// --- Analyze command ---
function analyze(filePath) {
  const transactions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`Analyzing ${transactions.length} transactions...\n`);

  // Group by outcome
  const results = { merchant_name: [], exact_name: [], name_account: [], name_prefix: [], amount_account: [], none: [] };
  const p2pResults = { exact_name: [], name_account: [], amount_account: [], none: [] };

  for (const txn of transactions) {
    const cascade = runCascade(txn, transactions);
    const p2p = isP2P(txn);
    const bucket = cascade.winner || 'none';

    const entry = {
      name: txn.name,
      merchant: txn.merchant_name,
      account: txn.account,
      amount: txn.amount,
      category: txn.mappedCategory,
      matchCount: cascade.count,
      prefix: cascade.prefix,
      allTiers: cascade.allTiers,
    };

    if (p2p) {
      (p2pResults[bucket] || p2pResults.none).push(entry);
    } else {
      (results[bucket] || results.none).push(entry);
    }
  }

  // --- Report ---
  console.log('=== NON-P2P TRANSACTIONS ===\n');
  for (const [tier, entries] of Object.entries(results)) {
    console.log(`  ${tier}: ${entries.length} transactions matched at this tier`);
  }

  console.log('\n=== P2P TRANSACTIONS ===\n');
  for (const [tier, entries] of Object.entries(p2pResults)) {
    console.log(`  ${tier}: ${entries.length} transactions matched at this tier`);
  }

  // Show interesting cases
  console.log('\n=== VENMO BREAKDOWN ===\n');
  const venmo = transactions.filter(t => isP2P(t) && /venmo/i.test(t.merchant_name || t.name || ''));
  const venmoByName = new Map();
  for (const v of venmo) {
    const key = v.name || '(no name)';
    if (!venmoByName.has(key)) venmoByName.set(key, []);
    venmoByName.get(key).push(v);
  }
  console.log(`  ${venmo.length} total Venmo transactions, ${venmoByName.size} unique names`);
  console.log(`  Top repeated names:`);
  const sortedVenmo = [...venmoByName.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  for (const [name, txns] of sortedVenmo) {
    const cascade = runCascade(txns[0], transactions);
    console.log(`    "${name}" × ${txns.length} → tier: ${cascade.winner || 'none'} (${cascade.count} matches)`);
  }

  console.log('\n=== GUSTO / PAYROLL BREAKDOWN ===\n');
  const payroll = transactions.filter(t => /gusto|adp|payroll|paycom|paychex/i.test(t.name || ''));
  for (const p of payroll) {
    const cascade = runCascade(p, transactions);
    const prefix = extractStablePrefix(p.name);
    console.log(`  "${p.name}"`);
    console.log(`    prefix: ${prefix || '(none)'} → tier: ${cascade.winner || 'none'} (${cascade.count} matches)`);
  }

  console.log('\n=== NO-MATCH TRANSACTIONS (would hide checkbox) ===\n');
  const noMatch = transactions.filter(t => {
    const cascade = runCascade(t, transactions);
    return cascade.winner === null;
  });
  console.log(`  ${noMatch.length} transactions with zero matches across all tiers`);
  if (noMatch.length > 0) {
    console.log(`  Sample (up to 15):`);
    for (const t of noMatch.slice(0, 15)) {
      console.log(`    "${t.name}" | merchant: ${t.merchant_name || '(none)'} | $${Math.abs(t.amount)} | ${t.account}`);
    }
  }

  console.log('\n=== HIGH MATCH COUNTS (potential over-matching) ===\n');
  const highMatch = [];
  for (const txn of transactions) {
    const cascade = runCascade(txn, transactions);
    if (cascade.count >= 10) {
      highMatch.push({ name: txn.name, merchant: txn.merchant_name, tier: cascade.winner, count: cascade.count, p2p: isP2P(txn) });
    }
  }
  // Dedupe by tier+merchant/name
  const seen = new Set();
  for (const h of highMatch) {
    const key = `${h.tier}|${h.merchant || h.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ${h.p2p ? '[P2P] ' : ''}${h.merchant || h.name} → ${h.tier}: ${h.count} matches`);
  }
}

// --- CLI ---
const [,, command, arg] = process.argv;
if (command === 'dump') {
  dump();
} else if (command === 'analyze') {
  analyze(arg || 'scripts/txn-dump.json');
} else {
  console.log('Usage:');
  console.log('  node scripts/similarity-analysis.js dump');
  console.log('  node scripts/similarity-analysis.js analyze [path-to-dump.json]');
}
