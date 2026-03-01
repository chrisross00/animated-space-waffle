require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { insertData, findUserData } = require('../db/database');

const DEFAULT_CATEGORIES = [
  { category: 'Income',         type: 'income',   monthly_limit: 0, plaid_pfc: ['INCOME', 'TRANSFER_IN'] },
  { category: 'Housing',        type: 'expense',  monthly_limit: 0, plaid_pfc: ['HOME_IMPROVEMENT'] },
  { category: 'Food & Dining',  type: 'expense',  monthly_limit: 0, plaid_pfc: ['FOOD_AND_DRINK'] },
  { category: 'Transportation', type: 'expense',  monthly_limit: 0, plaid_pfc: ['TRANSPORTATION'] },
  { category: 'Entertainment',  type: 'expense',  monthly_limit: 0, plaid_pfc: ['ENTERTAINMENT', 'TRAVEL'] },
  { category: 'Shopping',       type: 'expense',  monthly_limit: 0, plaid_pfc: ['GENERAL_MERCHANDISE'] },
  { category: 'Health',         type: 'expense',  monthly_limit: 0, plaid_pfc: ['MEDICAL', 'PERSONAL_CARE'] },
  { category: 'Utilities',      type: 'expense',  monthly_limit: 0, plaid_pfc: ['RENT_AND_UTILITIES'] },
  { category: 'To Sort',        type: 'expense',  monthly_limit: 0, plaid_pfc: [] },
  { category: 'Payment',        type: 'payment',  monthly_limit: 0, plaid_pfc: ['TRANSFER_OUT', 'LOAN_PAYMENTS', 'BANK_FEES'] },
];

async function seedCategories(userId) {
  if (!userId) {
    console.error('Usage: node utils/seedCategories.js <userId>');
    process.exit(1);
  }

  const existing = await findUserData('Basil-Categories', userId);
  if (existing.length > 0) {
    console.log(`User already has ${existing.length} categories. Skipping.`);
    process.exit(0);
  }

  const toInsert = DEFAULT_CATEGORIES.map(cat => ({
    ...cat,
    annual_spend: '',
    rules: {},
    showOnBudgetPage: true,
    userId,
  }));

  await insertData('Basil-Categories', toInsert);
  console.log(`Seeded ${toInsert.length} categories for user ${userId}.`);
  process.exit(0);
}

seedCategories(process.argv[2]);
