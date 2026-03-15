/**
 * Deterministic data generators for test user seeding.
 * Uses a seeded PRNG so the same persona always produces the same data.
 */

const { MERCHANTS, P2P_MERCHANTS, VENMO_ENRICHMENTS } = require('./merchants');

// --- Seeded PRNG (mulberry32) ---
function createRng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a string to a number for seeding
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

// --- Helpers ---
function randomBetween(rng, min, max) {
  return Math.round((min + rng() * (max - min)) * 100) / 100;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN(rng, arr, n) {
  const shuffled = [...arr].sort(() => rng() - 0.5);
  return shuffled.slice(0, n);
}

function dateStr(date) {
  return date.toISOString().split('T')[0];
}

// Generate a date within a given month (YYYY-MM)
function randomDateInMonth(rng, yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const day = Math.floor(rng() * daysInMonth) + 1;
  return `${yearMonth}-${String(day).padStart(2, '0')}`;
}

// Generate months array going back N months from today
function getMonthsBack(n) {
  const months = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

// --- Transaction generator ---
function generateTransactions({ userId, months, merchantPool, accountMap, rng, density = 'normal' }) {
  const transactions = [];
  let txnCounter = 0;

  // Density controls how many transactions per month
  const txnsPerMonth = {
    sparse: { min: 5, max: 12 },
    normal: { min: 25, max: 45 },
    heavy: { min: 40, max: 70 },
  }[density];

  // Build flat list of category->merchants for picking
  const allMerchants = [];
  for (const [category, merchants] of Object.entries(merchantPool)) {
    for (const m of merchants) {
      allMerchants.push({ ...m, category });
    }
  }

  // Separate recurring vs one-off
  const recurringMerchants = allMerchants.filter(m => m.recurring);
  const oneOffMerchants = allMerchants.filter(m => !m.recurring);

  // Assign accounts to transaction types
  const accountNames = Object.keys(accountMap);
  const checkingAcct = accountNames.find(a => accountMap[a].subtype === 'checking') || accountNames[0];
  const creditAcct = accountNames.find(a => accountMap[a].subtype === 'credit card');
  const savingsAcct = accountNames.find(a => accountMap[a].subtype === 'savings');

  for (const month of months) {
    // Always generate recurring transactions
    for (const m of recurringMerchants) {
      const acct = m.isIncome || m.isPayment ? checkingAcct : (creditAcct || checkingAcct);
      const amount = randomBetween(rng, m.min, m.max);
      // Recurring transactions land on a consistent day (1st-28th)
      const [year, mo] = month.split('-').map(Number);
      const day = Math.min(Math.floor(rng() * 28) + 1, new Date(year, mo, 0).getDate());
      const date = `${month}-${String(day).padStart(2, '0')}`;

      transactions.push(makeTransaction({
        userId, merchant: m, amount, date, account: acct,
        accountId: accountMap[acct].account_id,
        txnId: `test-txn-${userId}-${String(txnCounter++).padStart(5, '0')}`,
      }));
    }

    // Fill with one-off transactions
    const targetCount = Math.floor(randomBetween(rng, txnsPerMonth.min, txnsPerMonth.max));
    const remaining = Math.max(0, targetCount - recurringMerchants.length);

    for (let i = 0; i < remaining; i++) {
      const m = pick(rng, oneOffMerchants);
      const acct = m.isIncome ? checkingAcct : (creditAcct || checkingAcct);
      const amount = randomBetween(rng, m.min, m.max);
      const date = randomDateInMonth(rng, month);

      transactions.push(makeTransaction({
        userId, merchant: m, amount, date, account: acct,
        accountId: accountMap[acct].account_id,
        txnId: `test-txn-${userId}-${String(txnCounter++).padStart(5, '0')}`,
      }));
    }
  }

  return transactions;
}

function makeTransaction({ userId, merchant, amount, date, account, accountId, txnId }) {
  const isIncome = merchant.isIncome;
  const isPayment = merchant.isPayment;

  // Plaid convention: positive = debit/expense, negative = credit/income
  // Actually in this app: negative amounts = expenses, positive = income
  // Let me check... from the codebase: amounts come from Plaid as-is
  // Plaid: positive = money leaving account (expense), negative = money entering (income)
  const signedAmount = isIncome ? -amount : amount;

  return {
    transaction_id: txnId,
    account_id: accountId,
    name: merchant.name,
    merchant_name: merchant.merchant_name,
    amount: signedAmount,
    date,
    pending: false,
    pending_transaction_id: null,
    transaction_type: isIncome ? 'credit' : 'debit',
    category: [],
    personal_finance_category: { primary: merchant.pfc || (merchant.category === 'Income' ? 'INCOME' : 'GENERAL'), detailed: merchant.pfcDetailed || '' },
    userId,
    account,
    mappedCategory: merchant.category,
    createdDate: Date.now(),
  };
}

// --- Account generator ---
function generateAccounts(userId, accountDefs) {
  const accountMap = {}; // institution -> { account_id, subtype }
  const items = []; // flat array of plaid_items with nested accounts

  // Group defs by institution
  const byInstitution = {};
  for (const def of accountDefs) {
    if (!byInstitution[def.institution]) byInstitution[def.institution] = [];
    byInstitution[def.institution].push(def);
  }

  for (const [institution, defs] of Object.entries(byInstitution)) {
    const accessToken = `test-access-token-${userId}-${institution.toLowerCase().replace(/\s/g, '-')}`;
    const accounts = defs.map(def => {
      const accountId = `test-acct-${userId}-${def.subtype}`;
      accountMap[institution] = { account_id: accountId, subtype: def.subtype };
      return {
        account_id: accountId,
        name: def.name,
        official_name: def.officialName || def.name,
        mask: def.mask || '0000',
        type: def.type,
        subtype: def.subtype,
        balances: {
          current: def.balance,
          available: def.available || def.balance,
          limit: def.limit || null,
        },
      };
    });

    items.push({ userId, institution, accessToken, accounts });
  }

  return { items, accountMap };
}

// --- Category generator ---
function generateCategories(userId, defaults, customizations = []) {
  const categories = defaults.map(d => ({
    userId,
    category: d.category,
    type: d.type,
    monthly_limit: d.monthly_limit,
    plaid_pfc: d.plaid_pfc,
    rules: { merchant_name: [], name: [] },
    showOnBudgetPage: true,
    isDefault: true,
  }));

  // Apply customizations (budget limits, extra rules)
  for (const c of customizations) {
    const existing = categories.find(cat => cat.category === c.category);
    if (existing) {
      if (c.monthly_limit !== undefined) existing.monthly_limit = c.monthly_limit;
      if (c.rules) {
        if (c.rules.merchant_name) existing.rules.merchant_name.push(...c.rules.merchant_name);
        if (c.rules.name) existing.rules.name.push(...c.rules.name);
      }
      if (c.type) existing.type = c.type;
    } else {
      // New custom category
      categories.push({
        userId,
        category: c.category,
        type: c.type || 'expense',
        monthly_limit: c.monthly_limit || 0,
        plaid_pfc: c.plaid_pfc || [],
        rules: c.rules || { merchant_name: [], name: [] },
        showOnBudgetPage: true,
        isDefault: false,
      });
    }
  }

  return categories;
}

// --- Compound rule generator ---
function generateCompoundRules(userId, ruleDefs) {
  return ruleDefs.map((def, i) => ({
    userId,
    label: def.label,
    conditions: def.conditions,
    action: {
      type: 'categorize',
      categoryName: def.categoryName,
      note: def.note || undefined,
    },
    createdAt: new Date(Date.now() - (ruleDefs.length - i) * 60000), // stagger creation times
    createdFrom: def.createdFrom || 'manual',
  }));
}

// --- P2P transaction enrichment ---
function enrichP2PTransactions(rng, transactions) {
  const p2pTxns = transactions.filter(t =>
    t.name.includes('VENMO') && !t.name.includes('CASHOUT')
  );
  const enrichCount = Math.min(p2pTxns.length, Math.floor(p2pTxns.length * 0.6));
  const toEnrich = pickN(rng, p2pTxns, enrichCount);

  for (const txn of toEnrich) {
    const enrichment = pick(rng, VENMO_ENRICHMENTS);
    txn.venmo_counterparty = enrichment.counterparty;
    txn.venmo_note = enrichment.note;
    txn.venmo_id = `venmo-${txn.transaction_id}`;
  }
}

// --- Scenario transaction resolver ---
// Converts relative date specs + logical account refs into real transaction docs
function resolveScenarioTransactions({ userId, scenarios, accountMap, months, txnCounterStart }) {
  let counter = txnCounterStart;
  const accountNames = Object.keys(accountMap);
  const checkingAcct = accountNames.find(a => accountMap[a].subtype === 'checking') || accountNames[0];
  const creditAcct = accountNames.find(a => accountMap[a].subtype === 'credit card');

  return scenarios.map(s => {
    // Resolve relative date: { monthsBack: N, day: D }
    let date;
    if (s.date && typeof s.date === 'object' && 'monthsBack' in s.date) {
      const now = new Date();
      const d = new Date(now.getFullYear(), now.getMonth() - s.date.monthsBack, s.date.day);
      date = dateStr(d);
    } else {
      date = s.date; // Already a YYYY-MM-DD string
    }

    // Resolve logical account ref
    const acctName = s.account === 'credit' ? (creditAcct || checkingAcct) : checkingAcct;
    const accountId = accountMap[acctName].account_id;

    const txn = {
      transaction_id: `test-txn-${userId}-${String(counter++).padStart(5, '0')}`,
      account_id: accountId,
      name: s.name,
      merchant_name: s.merchant_name || null,
      amount: s.amount,
      date,
      pending: false,
      pending_transaction_id: null,
      transaction_type: s.amount < 0 ? 'credit' : 'debit',
      category: [],
      personal_finance_category: {
        primary: s.pfc || 'GENERAL',
        detailed: s.pfcDetailed || '',
      },
      userId,
      account: acctName,
      mappedCategory: s.mappedCategory || 'To Sort',
      createdDate: Date.now(),
    };

    // Optional enrichment fields
    if (s.venmo_counterparty) txn.venmo_counterparty = s.venmo_counterparty;
    if (s.venmo_note) txn.venmo_note = s.venmo_note;
    if (s.venmo_id) txn.venmo_id = s.venmo_id;

    // Pre-linked for "already linked" test scenario
    if (s.linkedTransaction) txn.linkedTransaction = s.linkedTransaction;

    return txn;
  });
}

module.exports = {
  createRng,
  hashString,
  randomBetween,
  pick,
  pickN,
  getMonthsBack,
  generateTransactions,
  generateAccounts,
  generateCategories,
  generateCompoundRules,
  enrichP2PTransactions,
  resolveScenarioTransactions,
};
