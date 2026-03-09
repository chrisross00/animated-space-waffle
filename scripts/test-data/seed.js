/**
 * Core seed/nuke logic — shared between CLI scripts and admin API routes.
 * Does NOT manage DB connections; callers must ensure DB is connected.
 */

const { PERSONAS } = require('./personas');
const { DEFAULT_CATEGORIES } = require('../../utils/defaultCategories');
const { P2P_MERCHANTS } = require('./merchants');
const {
  createRng, hashString, getMonthsBack,
  generateTransactions, generateAccounts, generateCategories,
  generateCompoundRules, enrichP2PTransactions,
} = require('./generators');

const COLLECTIONS = ['Basil-Users', 'Plaid-Transactions', 'Plaid-Accounts', 'Basil-Categories', 'Basil-Rules'];

/**
 * Seed a single persona. Wipes existing data for that UID first.
 * @param {Db} db - MongoDB Db instance
 * @param {string} personaName - key from PERSONAS
 * @returns {{ persona: string, uid: string, counts: object }}
 */
async function seedPersona(db, personaName) {
  const persona = PERSONAS[personaName];
  if (!persona) throw new Error(`Unknown persona: "${personaName}"`);

  const uid = persona.uid;
  const counts = { users: 0, accounts: 0, categories: 0, rules: 0, transactions: 0 };

  // 1. Nuke existing data for this UID
  for (const col of COLLECTIONS) {
    await db.collection(col).deleteMany({ userId: uid });
  }

  // 2. Insert user
  await db.collection('Basil-Users').insertOne({
    userId: uid,
    ...persona.user,
    isTestUser: true,
    insertDate: Date.now(),
  });
  counts.users = 1;

  // 3. Accounts
  let accountMap = {};
  if (persona.accounts && persona.accounts.length > 0) {
    const result = generateAccounts(uid, persona.accounts);
    accountMap = result.accountMap;
    result.accountsDoc.insertDate = Date.now();
    await db.collection('Plaid-Accounts').insertOne(result.accountsDoc);
    counts.accounts = persona.accounts.length;
  }

  // 4. Categories
  if (persona.categories !== null) {
    const categories = generateCategories(uid, DEFAULT_CATEGORIES, persona.categoryCustomizations || []);
    const catDocs = categories.map(c => ({ ...c, insertDate: Date.now() }));
    await db.collection('Basil-Categories').insertMany(catDocs);
    counts.categories = catDocs.length;
  }

  // 5. Compound rules
  if (persona.compoundRules && persona.compoundRules.length > 0) {
    const rules = generateCompoundRules(uid, persona.compoundRules);
    const ruleDocs = rules.map(r => ({ ...r, insertDate: Date.now() }));
    await db.collection('Basil-Rules').insertMany(ruleDocs);
    counts.rules = ruleDocs.length;
  }

  // 6. Transactions
  if (persona.transactionConfig && Object.keys(accountMap).length > 0) {
    const config = persona.transactionConfig;
    const rng = createRng(hashString(uid));
    const months = getMonthsBack(config.months);

    let merchantPool = config.merchantPool;
    if (config.p2pHeavy) {
      merchantPool = { ...merchantPool };
      merchantPool['To Sort'] = [...(merchantPool['To Sort'] || []), ...P2P_MERCHANTS];
    }

    const transactions = generateTransactions({
      userId: uid,
      months,
      merchantPool,
      accountMap,
      rng,
      density: config.density || 'normal',
    });

    if (config.p2pHeavy) {
      enrichP2PTransactions(rng, transactions);
    }

    if (config.manuallySetCount) {
      const candidates = transactions.filter(t => t.mappedCategory && t.mappedCategory !== 'To Sort');
      const count = Math.min(config.manuallySetCount, candidates.length);
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(rng() * candidates.length);
        candidates[idx].manually_set = true;
        candidates.splice(idx, 1);
      }
    }

    const txnDocs = transactions.map(t => ({ ...t, insertDate: Date.now() }));
    await db.collection('Plaid-Transactions').insertMany(txnDocs);
    counts.transactions = txnDocs.length;
  }

  return { persona: personaName, uid, counts };
}

/**
 * List all test users in the database.
 * @param {Db} db
 * @returns {Array<{ userId, name, email }>}
 */
async function listTestUsers(db) {
  return db.collection('Basil-Users')
    .find({ isTestUser: true })
    .project({ userId: 1, name: 1, email: 1, _id: 0 })
    .toArray();
}

/**
 * Nuke all test user data.
 * @param {Db} db
 * @param {{ dryRun?: boolean }} options
 * @returns {{ users: Array, deleted: object } | { users: Array, wouldDelete: object }}
 */
async function nukeTestUsers(db, { dryRun = false } = {}) {
  const testUsers = await listTestUsers(db);
  if (testUsers.length === 0) return { users: [], deleted: {} };

  const uids = testUsers.map(u => u.userId);
  const result = {};

  for (const col of COLLECTIONS) {
    const count = await db.collection(col).countDocuments({ userId: { $in: uids } });
    if (dryRun) {
      result[col] = count;
    } else {
      const del = await db.collection(col).deleteMany({ userId: { $in: uids } });
      result[col] = del.deletedCount;
    }
  }

  return {
    users: testUsers,
    [dryRun ? 'wouldDelete' : 'deleted']: result,
  };
}

/**
 * Get available persona names.
 * @returns {Array<{ name: string, uid: string }>}
 */
function getPersonaList() {
  return Object.entries(PERSONAS).map(([name, p]) => ({ name, uid: p.uid }));
}

module.exports = { seedPersona, listTestUsers, nukeTestUsers, getPersonaList };
