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
};

module.exports = { PERSONAS };
