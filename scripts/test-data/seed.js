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

const { sandbox } = require('../../utils/plaidClient');

// Plaid sandbox institution IDs (these are Plaid's built-in test institutions)
const SANDBOX_INSTITUTIONS = {
  'First Platypus Bank': 'ins_109508',
  'Platypus OAuth Bank': 'ins_127287',
  'First Gingham Credit Union': 'ins_109509',
  'Tattersall Federal Credit Union': 'ins_109510',
  'Tartan Bank': 'ins_109511',
  'Houndstooth Bank': 'ins_109512',
};

const COLLECTIONS = ['Basil-Users', 'Plaid-Transactions', 'Plaid-Accounts', 'Basil-Categories', 'Basil-Rules'];

/**
 * Create real Plaid sandbox items for a persona.
 * Groups accounts by institution, creates one sandbox item per institution,
 * then optionally resets login for institutions with itemErrors.
 */
async function createSandboxAccounts(uid, persona) {
  const accountsDoc = { userId: uid, Accounts: {} };

  // Group account definitions by institution
  const byInstitution = {};
  for (const def of persona.accounts) {
    if (!byInstitution[def.institution]) byInstitution[def.institution] = [];
    byInstitution[def.institution].push(def);
  }

  for (const [institution, defs] of Object.entries(byInstitution)) {
    const sandboxInstId = persona.sandboxInstitutions?.[institution] || SANDBOX_INSTITUTIONS['First Platypus Bank'];

    // Create a sandbox public token
    const publicTokenResp = await sandbox.sandboxPublicTokenCreate({
      institution_id: sandboxInstId,
      initial_products: ['transactions'],
    });
    const publicToken = publicTokenResp.data.public_token;

    // Exchange for a real access token
    const exchangeResp = await sandbox.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchangeResp.data.access_token;

    // Fetch the actual accounts from Plaid to get real account IDs
    const accountsResp = await sandbox.accountsGet({ access_token: accessToken });
    const plaidAccounts = accountsResp.data.accounts;

    // Build balances array from real Plaid accounts
    const balances = plaidAccounts.map(acct => ({
      account_id: acct.account_id,
      name: acct.name,
      official_name: acct.official_name || acct.name,
      mask: acct.mask || '0000',
      type: acct.type,
      subtype: acct.subtype,
      current: acct.balances.current,
      available: acct.balances.available,
      limit: acct.balances.limit || null,
      fetchedAt: Date.now(),
    }));

    accountsDoc.Accounts[institution] = {
      token: accessToken,
      next_cursor: '',
      earliestDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      plaidEnv: 'sandbox',
      balances,
    };

    // Reset login if this institution should have an item error
    if (persona.itemErrors?.[institution]) {
      await sandbox.sandboxItemResetLogin({ access_token: accessToken });
      accountsDoc.Accounts[institution].itemError = persona.itemErrors[institution];
    }
  }

  return accountsDoc;
}

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
    if (persona.useSandbox) {
      // Create real Plaid sandbox items via the sandbox API
      const accountsDoc = await createSandboxAccounts(uid, persona);
      accountMap = {};
      for (const [inst, data] of Object.entries(accountsDoc.Accounts)) {
        const firstBalance = data.balances?.[0];
        if (firstBalance) {
          accountMap[inst] = { account_id: firstBalance.account_id, subtype: firstBalance.subtype };
        }
      }
      accountsDoc.insertDate = Date.now();
      await db.collection('Plaid-Accounts').insertOne(accountsDoc);
    } else {
      const result = generateAccounts(uid, persona.accounts);
      accountMap = result.accountMap;
      // Inject item errors if the persona defines them
      if (persona.itemErrors) {
        for (const [inst, errorData] of Object.entries(persona.itemErrors)) {
          if (result.accountsDoc.Accounts[inst]) {
            result.accountsDoc.Accounts[inst].itemError = errorData;
          }
        }
      }
      result.accountsDoc.insertDate = Date.now();
      await db.collection('Plaid-Accounts').insertOne(result.accountsDoc);
    }
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
