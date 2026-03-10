/**
 * Test user persona definitions.
 * Each persona defines the user profile, accounts, category customizations,
 * compound rules, and transaction generation parameters.
 */

const { MERCHANTS, P2P_MERCHANTS } = require('./merchants');

const PERSONAS = {

  fresh: {
    uid: 'test-user-fresh',
    user: {
      email: 'fresh@basil.test',
      name: 'Test Fresh',
      picture: null,
      firebase: false,
      isTestUser: true,
      // No onboarded_at — triggers onboarding flow
    },
    accounts: [],      // No linked accounts
    categories: null,  // No categories (not onboarded)
    compoundRules: [],
    transactions: null, // No transactions
  },

  connected: {
    uid: 'test-user-connected',
    user: {
      email: 'connected@basil.test',
      name: 'Test Connected',
      picture: null,
      firebase: false,
      isTestUser: true,
      onboarded_at: new Date(),
    },
    accounts: [
      { institution: 'Chase', name: 'Chase Checking', officialName: 'TOTAL CHECKING', mask: '4521', type: 'depository', subtype: 'checking', balance: 4250.00, available: 4250.00 },
    ],
    categoryCustomizations: [],  // Default categories only, no budget limits
    compoundRules: [],           // No rules yet
    transactionConfig: {
      months: 1,
      density: 'normal',
      merchantPool: MERCHANTS,
    },
  },

  active: {
    uid: 'test-user-active',
    user: {
      email: 'active@basil.test',
      name: 'Test Active',
      picture: null,
      firebase: false,
      isTestUser: true,
      onboarded_at: new Date(),
    },
    accounts: [
      { institution: 'Chase', name: 'Chase Checking', officialName: 'TOTAL CHECKING', mask: '4521', type: 'depository', subtype: 'checking', balance: 8500.00, available: 8350.00 },
      { institution: 'Chase', name: 'Chase Credit', officialName: 'SAPPHIRE PREFERRED', mask: '9876', type: 'credit', subtype: 'credit card', balance: 1250.00, available: 8750.00, limit: 10000 },
      { institution: 'Marcus', name: 'Marcus Savings', officialName: 'ONLINE SAVINGS', mask: '3344', type: 'depository', subtype: 'savings', balance: 15000.00, available: 15000.00 },
    ],
    categoryCustomizations: [
      { category: 'Food & Dining', monthly_limit: 600 },
      { category: 'Transportation', monthly_limit: 200 },
      { category: 'Entertainment', monthly_limit: 100 },
      { category: 'Shopping', monthly_limit: 300 },
      { category: 'Rent & Utilities', monthly_limit: 2200, rules: { merchant_name: ['Apartments.com', 'Con Edison', 'Spectrum'] } },
      { category: 'Health', monthly_limit: 100, rules: { merchant_name: ['Planet Fitness'] } },
      { category: 'Savings', type: 'savings', monthly_limit: 500 },
    ],
    compoundRules: [
      {
        label: 'DoorDash orders → Food',
        conditions: [{ field: 'merchant_name', op: 'eq', value: 'DoorDash' }],
        categoryName: 'Food & Dining',
        createdFrom: 'triage',
      },
      {
        label: 'Uber rides under $50',
        conditions: [
          { field: 'merchant_name', op: 'eq', value: 'Uber' },
          { field: 'amount', op: 'lt', value: 50 },
        ],
        categoryName: 'Transportation',
        createdFrom: 'dialog',
      },
      {
        label: 'Amazon purchases → Shopping',
        conditions: [{ field: 'merchant_name', op: 'eq', value: 'Amazon' }],
        categoryName: 'Shopping',
        createdFrom: 'triage',
      },
      {
        label: 'Small coffee shops',
        conditions: [
          { field: 'name', op: 'contains', value: 'CAFE' },
          { field: 'amount', op: 'lt', value: 20 },
        ],
        categoryName: 'Food & Dining',
        createdFrom: 'manual',
      },
      {
        label: 'Chase credit card payment',
        conditions: [{ field: 'name', op: 'contains', value: 'CHASE CREDIT CRD' }],
        categoryName: 'Payment',
        createdFrom: 'triage',
      },
    ],
    transactionConfig: {
      months: 6,
      density: 'normal',
      merchantPool: MERCHANTS,
      manuallySetCount: 8,  // Number of transactions to flag as manually_set
    },
  },

  p2p: {
    uid: 'test-user-p2p',
    user: {
      email: 'p2p@basil.test',
      name: 'Test P2P',
      picture: null,
      firebase: false,
      isTestUser: true,
      onboarded_at: new Date(),
    },
    accounts: [
      { institution: 'Bank of America', name: 'BoA Checking', officialName: 'ADVANTAGE CHECKING', mask: '7788', type: 'depository', subtype: 'checking', balance: 3200.00, available: 3200.00 },
      { institution: 'Bank of America', name: 'BoA Credit', officialName: 'CASH REWARDS VISA', mask: '5566', type: 'credit', subtype: 'credit card', balance: 800.00, available: 4200.00, limit: 5000 },
    ],
    categoryCustomizations: [
      { category: 'Food & Dining', monthly_limit: 500 },
    ],
    compoundRules: [
      {
        label: 'Venmo payments → To Sort',
        conditions: [{ field: 'name', op: 'contains', value: 'VENMO' }],
        categoryName: 'To Sort',
        createdFrom: 'manual',
      },
    ],
    transactionConfig: {
      months: 4,
      density: 'normal',
      merchantPool: { ...MERCHANTS },
      p2pHeavy: true,  // Mix in lots of P2P transactions
    },
  },

  rules: {
    uid: 'test-user-rules',
    user: {
      email: 'rules@basil.test',
      name: 'Test Rules',
      picture: null,
      firebase: false,
      isTestUser: true,
      onboarded_at: new Date(),
    },
    accounts: [
      { institution: 'Wells Fargo', name: 'WF Checking', officialName: 'EVERYDAY CHECKING', mask: '1122', type: 'depository', subtype: 'checking', balance: 5600.00, available: 5600.00 },
      { institution: 'Citi', name: 'Citi Double Cash', officialName: 'DOUBLE CASH CARD', mask: '3344', type: 'credit', subtype: 'credit card', balance: 950.00, available: 4050.00, limit: 5000 },
    ],
    categoryCustomizations: [
      { category: 'Food & Dining', monthly_limit: 700, rules: { merchant_name: ['Starbucks', 'Chipotle', 'Sweetgreen'] } },
      { category: 'Transportation', monthly_limit: 250, rules: { merchant_name: ['Uber', 'Lyft'] } },
      { category: 'Shopping', monthly_limit: 400, rules: { merchant_name: ['Amazon', 'Target'] } },
      { category: 'Entertainment', monthly_limit: 150, rules: { merchant_name: ['Netflix', 'Spotify', 'Steam'] } },
      { category: 'Subscriptions', type: 'expense', monthly_limit: 100 },
      { category: 'Coffee', type: 'expense', monthly_limit: 80 },
      { category: 'Groceries', type: 'expense', monthly_limit: 500 },
    ],
    compoundRules: [
      // Overlapping: Starbucks could match "Coffee" or "Food & Dining"
      {
        label: 'Starbucks → Coffee',
        conditions: [{ field: 'merchant_name', op: 'eq', value: 'Starbucks' }],
        categoryName: 'Coffee',
        createdFrom: 'manual',
      },
      {
        label: 'Grocery stores → Groceries',
        conditions: [{ field: 'merchant_name', op: 'contains', value: 'Whole Foods' }],
        categoryName: 'Groceries',
        createdFrom: 'triage',
      },
      {
        label: 'Trader Joe\'s → Groceries',
        conditions: [{ field: 'merchant_name', op: 'contains', value: 'Trader Joe' }],
        categoryName: 'Groceries',
        createdFrom: 'triage',
      },
      // Amount-based splits
      {
        label: 'Small Amazon orders → Shopping',
        conditions: [
          { field: 'merchant_name', op: 'eq', value: 'Amazon' },
          { field: 'amount', op: 'lt', value: 50 },
        ],
        categoryName: 'Shopping',
        createdFrom: 'manual',
      },
      {
        label: 'Large Amazon orders → Shopping (big)',
        conditions: [
          { field: 'merchant_name', op: 'eq', value: 'Amazon' },
          { field: 'amount', op: 'gt', value: 50 },
        ],
        categoryName: 'Shopping',
        createdFrom: 'manual',
      },
      // Subscription detection
      {
        label: 'Netflix → Subscriptions',
        conditions: [{ field: 'merchant_name', op: 'eq', value: 'Netflix' }],
        categoryName: 'Subscriptions',
        createdFrom: 'dialog',
      },
      {
        label: 'Spotify → Subscriptions',
        conditions: [{ field: 'merchant_name', op: 'eq', value: 'Spotify' }],
        categoryName: 'Subscriptions',
        createdFrom: 'dialog',
      },
      {
        label: 'Google services → Subscriptions',
        conditions: [{ field: 'name', op: 'contains', value: 'GOOGLE *SERVICES' }],
        categoryName: 'Subscriptions',
        createdFrom: 'manual',
      },
      {
        label: 'Planet Fitness → Subscriptions',
        conditions: [{ field: 'merchant_name', op: 'eq', value: 'Planet Fitness' }],
        categoryName: 'Subscriptions',
        createdFrom: 'dialog',
      },
      // Account-based rules
      {
        label: 'Wells Fargo income',
        conditions: [
          { field: 'account', op: 'eq', value: 'Wells Fargo' },
          { field: 'name', op: 'contains', value: 'PAYROLL' },
        ],
        categoryName: 'Income',
        createdFrom: 'manual',
      },
      // Name-based rules
      {
        label: 'Square merchants → Food',
        conditions: [{ field: 'name', op: 'contains', value: 'SQ *' }],
        categoryName: 'Food & Dining',
        createdFrom: 'manual',
      },
      {
        label: 'TST restaurants → Food',
        conditions: [{ field: 'name', op: 'contains', value: 'TST*' }],
        categoryName: 'Food & Dining',
        createdFrom: 'manual',
      },
      // Uber rides vs Uber Eats (overlapping merchant, different name)
      {
        label: 'Uber Eats → Food',
        conditions: [
          { field: 'merchant_name', op: 'eq', value: 'Uber' },
          { field: 'name', op: 'contains', value: 'EATS' },
        ],
        categoryName: 'Food & Dining',
        createdFrom: 'manual',
      },
      {
        label: 'Uber rides → Transportation',
        conditions: [
          { field: 'merchant_name', op: 'eq', value: 'Uber' },
          { field: 'name', op: 'contains', value: 'TRIP' },
        ],
        categoryName: 'Transportation',
        createdFrom: 'manual',
      },
      // MTA as recurring
      {
        label: 'MTA → Transportation',
        conditions: [{ field: 'name', op: 'contains', value: 'MTA' }],
        categoryName: 'Transportation',
        createdFrom: 'triage',
      },
      // CVS could be health or shopping
      {
        label: 'CVS → Health',
        conditions: [{ field: 'merchant_name', op: 'eq', value: 'CVS' }],
        categoryName: 'Health',
        createdFrom: 'triage',
      },
      {
        label: 'Citibike → Transportation',
        conditions: [{ field: 'name', op: 'contains', value: 'CITI BIKE' }],
        categoryName: 'Transportation',
        createdFrom: 'dialog',
      },
    ],
    transactionConfig: {
      months: 4,
      density: 'normal',
      merchantPool: MERCHANTS,
    },
  },
  splits: {
    uid: 'test-user-splits',
    user: {
      email: 'splits@basil.test',
      name: 'Test Splits',
      picture: null,
      firebase: false,
      isTestUser: true,
      onboarded_at: new Date(),
    },
    accounts: [
      { institution: 'Chase', name: 'Chase Checking', officialName: 'TOTAL CHECKING', mask: '4521', type: 'depository', subtype: 'checking', balance: 6000.00, available: 6000.00 },
      { institution: 'Venmo', name: 'Venmo', officialName: 'VENMO BALANCE', mask: '0000', type: 'depository', subtype: 'checking', balance: 500.00, available: 500.00 },
    ],
    categoryCustomizations: [
      { category: 'Food & Dining', monthly_limit: 600 },
      { category: 'Entertainment', monthly_limit: 200 },
      { category: 'Rent & Utilities', monthly_limit: 2200 },
      { category: 'Shopping', monthly_limit: 300 },
    ],
    compoundRules: [
      {
        label: 'Venmo payments → To Sort',
        conditions: [{ field: 'name', op: 'contains', value: 'VENMO' }],
        categoryName: 'To Sort',
        createdFrom: 'manual',
      },
    ],
    transactionConfig: {
      months: 4,
      density: 'normal',
      merchantPool: MERCHANTS,
    },
    // Injected transaction pairs for split/return detection testing.
    // Dates use relative format: { monthsBack: N, day: D } resolved at seed time.
    // account: 'checking' | 'credit' → resolved to first matching account subtype.
    scenarioTransactions: [
      // --- HIGH CONFIDENCE: same-day 50/50 dining split ---
      { name: 'SUSHI PALACE NYC', merchant_name: 'Sushi Palace', amount: 94, date: { monthsBack: 0, day: 5 },
        account: 'checking', mappedCategory: 'Food & Dining', pfc: 'FOOD_AND_DRINK', pfcDetailed: 'FOOD_AND_DRINK_RESTAURANTS' },
      { name: 'VENMO PAYMENT', merchant_name: null, amount: -47, date: { monthsBack: 0, day: 5 },
        account: 'checking', venmo_counterparty: 'Jake Miller', venmo_note: 'sushi', venmo_id: 'venmo-split-sushi' },

      // --- HIGH CONFIDENCE: 3-way concert ticket split (high PFC, no enrichment) ---
      { name: 'TICKETMASTER*CONCERT', merchant_name: 'Ticketmaster', amount: 150, date: { monthsBack: 0, day: 2 },
        account: 'checking', mappedCategory: 'Entertainment', pfc: 'ENTERTAINMENT', pfcDetailed: 'ENTERTAINMENT_MUSIC' },
      { name: 'VENMO PAYMENT', merchant_name: null, amount: -50, date: { monthsBack: 0, day: 3 },
        account: 'checking' },

      // --- MEDIUM CONFIDENCE: exact 50/50 ratio, but low-tier PFC and no enrichment ---
      { name: 'IKEA BROOKLYN', merchant_name: 'IKEA', amount: 80, date: { monthsBack: 1, day: 28 },
        account: 'checking', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },
      { name: 'ZELLE PAYMENT FROM', merchant_name: null, amount: -40, date: { monthsBack: 0, day: 2 },
        account: 'checking' },

      // --- MEDIUM CONFIDENCE: 4-way Airbnb split (high PFC makes this high actually) ---
      { name: 'AIRBNB *HM9876XYZ', merchant_name: 'Airbnb', amount: 400, date: { monthsBack: 1, day: 15 },
        account: 'checking', mappedCategory: 'Travel', pfc: 'TRAVEL', pfcDetailed: 'TRAVEL_LODGING' },
      { name: 'VENMO PAYMENT', merchant_name: null, amount: -100, date: { monthsBack: 1, day: 18 },
        account: 'checking' },

      // --- NO MATCH: wrong ratio (15/100 = 0.15, not close to 1/2, 1/3, or 1/4) ---
      { name: 'AMAZON.COM*XY1234', merchant_name: 'Amazon', amount: 100, date: { monthsBack: 0, day: 1 },
        account: 'checking', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },
      { name: 'VENMO PAYMENT', merchant_name: null, amount: -15, date: { monthsBack: 0, day: 2 },
        account: 'checking' },

      // --- NO MATCH: too far apart (14 days) ---
      { name: 'SWEETGREEN NYC', merchant_name: 'Sweetgreen', amount: 60, date: { monthsBack: 1, day: 1 },
        account: 'checking', mappedCategory: 'Food & Dining', pfc: 'FOOD_AND_DRINK' },
      { name: 'VENMO PAYMENT', merchant_name: null, amount: -30, date: { monthsBack: 1, day: 15 },
        account: 'checking' },

      // --- RETURN: exact refund, same merchant ---
      { name: 'NIKE.COM ORDER#98765', merchant_name: 'Nike', amount: 89.99, date: { monthsBack: 0, day: 3 },
        account: 'checking', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },
      { name: 'NIKE.COM REFUND', merchant_name: 'Nike', amount: -89.99, date: { monthsBack: 0, day: 7 },
        account: 'checking', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },

      // --- RETURN: partial refund (within $0.50) ---
      { name: 'BEST BUY #0456', merchant_name: 'Best Buy', amount: 149.99, date: { monthsBack: 1, day: 20 },
        account: 'checking', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },
      { name: 'BEST BUY #0456 RETURN', merchant_name: 'Best Buy', amount: -149.50, date: { monthsBack: 1, day: 25 },
        account: 'checking', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },

      // --- EDGE: P2P with no matching purchase ---
      { name: 'VENMO PAYMENT', merchant_name: null, amount: -25, date: { monthsBack: 0, day: 8 },
        account: 'checking' },

      // --- EDGE: already-linked transactions (should not re-suggest) ---
      { name: 'BURGER JOINT NYC', merchant_name: 'Burger Joint', amount: 100, date: { monthsBack: 0, day: 1 },
        account: 'checking', mappedCategory: 'Food & Dining', pfc: 'FOOD_AND_DRINK',
        linkedTransaction: { transaction_id: '__placeholder_linked_partner__', type: 'split', confirmedAt: new Date().toISOString() } },
      { name: 'VENMO PAYMENT', merchant_name: null, amount: -50, date: { monthsBack: 0, day: 1 },
        account: 'checking', venmo_counterparty: 'Dan O\'Brien', venmo_note: 'burgers',
        linkedTransaction: { transaction_id: '__placeholder_linked_partner__', type: 'split', confirmedAt: new Date().toISOString() } },
    ],
  },

  returns: {
    uid: 'test-user-returns',
    user: {
      email: 'returns@basil.test',
      name: 'Test Returns',
      picture: null,
      firebase: false,
      isTestUser: true,
      onboarded_at: new Date(),
    },
    accounts: [
      { institution: 'Bank of America', name: 'BoA Checking', officialName: 'ADVANTAGE CHECKING', mask: '7788', type: 'depository', subtype: 'checking', balance: 4000.00, available: 4000.00 },
      { institution: 'Bank of America', name: 'BoA Credit', officialName: 'CASH REWARDS VISA', mask: '5566', type: 'credit', subtype: 'credit card', balance: 1200.00, available: 3800.00, limit: 5000 },
    ],
    categoryCustomizations: [
      { category: 'Shopping', monthly_limit: 400 },
      { category: 'Food & Dining', monthly_limit: 500 },
    ],
    compoundRules: [],
    transactionConfig: {
      months: 3,
      density: 'normal',
      merchantPool: MERCHANTS,
    },
    scenarioTransactions: [
      // --- RETURN: exact refund, same merchant ---
      { name: 'TARGET #5678', merchant_name: 'Target', amount: 45.67, date: { monthsBack: 0, day: 2 },
        account: 'credit', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },
      { name: 'TARGET #5678 RETURN', merchant_name: 'Target', amount: -45.67, date: { monthsBack: 0, day: 5 },
        account: 'credit', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },

      // --- NO MATCH: partial refund too large ($15 diff, exceeds $0.50) ---
      { name: 'NORDSTROM #1234', merchant_name: 'Nordstrom', amount: 200, date: { monthsBack: 1, day: 10 },
        account: 'credit', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },
      { name: 'NORDSTROM #1234 REFUND', merchant_name: 'Nordstrom', amount: -185, date: { monthsBack: 1, day: 18 },
        account: 'credit', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },

      // --- NO MATCH: same merchant, wrong amount (not a refund pattern) ---
      { name: 'WHOLE FOODS MKT #10234', merchant_name: 'Whole Foods', amount: 92, date: { monthsBack: 0, day: 1 },
        account: 'credit', mappedCategory: 'Food & Dining', pfc: 'FOOD_AND_DRINK' },
      { name: 'WHOLE FOODS MKT #10234', merchant_name: 'Whole Foods', amount: -12.50, date: { monthsBack: 0, day: 3 },
        account: 'credit', mappedCategory: 'Food & Dining', pfc: 'FOOD_AND_DRINK' },

      // --- NO MATCH: same amount, different merchant ---
      { name: 'UNIQLO NYC', merchant_name: 'Uniqlo', amount: 50, date: { monthsBack: 0, day: 1 },
        account: 'credit', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },
      { name: 'H&M ONLINE', merchant_name: 'H&M', amount: -50, date: { monthsBack: 0, day: 3 },
        account: 'credit', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },

      // --- NO MATCH: refund too late (46 days apart) ---
      { name: 'REI #789', merchant_name: 'REI', amount: 120, date: { monthsBack: 2, day: 5 },
        account: 'credit', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },
      { name: 'REI #789 RETURN', merchant_name: 'REI', amount: -120, date: { monthsBack: 1, day: 20 },
        account: 'credit', mappedCategory: 'Shopping', pfc: 'GENERAL_MERCHANDISE' },
    ],
  },

  error: {
    uid: 'test-user-error',
    user: {
      email: 'error@basil.test',
      name: 'Test Error',
      picture: null,
      firebase: false,
      isTestUser: true,
      onboarded_at: new Date(),
    },
    // Real Plaid sandbox items — allows full reconnect flow testing
    useSandbox: true,
    accounts: [
      { institution: 'First Platypus Bank', type: 'depository', subtype: 'checking' },
      { institution: 'Tartan Bank', type: 'depository', subtype: 'checking' },
    ],
    // Map persona institution names to Plaid sandbox institution IDs
    sandboxInstitutions: {
      'First Platypus Bank': 'ins_109508',
      'Tartan Bank': 'ins_109511',
    },
    // Simulate a stale Plaid token on Tartan Bank
    itemErrors: {
      'Tartan Bank': { error_code: 'ITEM_LOGIN_REQUIRED', error_message: 'the login details of this item have changed', detectedAt: new Date() },
    },
    categoryCustomizations: [
      { category: 'Food & Dining', monthly_limit: 500 },
      { category: 'Shopping', monthly_limit: 300 },
    ],
    compoundRules: [],
    transactionConfig: {
      months: 3,
      density: 'normal',
      merchantPool: MERCHANTS,
    },
  },
};

module.exports = { PERSONAS };
