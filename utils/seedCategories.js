require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { insertData, findUserData } = require('../db/database');

const DEFAULT_CATEGORIES = [
  { category: 'Income',         type: 'income',   monthly_limit: 0 },
  { category: 'Housing',        type: 'expense',  monthly_limit: 0 },
  { category: 'Food & Dining',  type: 'expense',  monthly_limit: 0 },
  { category: 'Transportation', type: 'expense',  monthly_limit: 0 },
  { category: 'Entertainment',  type: 'expense',  monthly_limit: 0 },
  { category: 'Shopping',       type: 'expense',  monthly_limit: 0 },
  { category: 'Health',         type: 'expense',  monthly_limit: 0 },
  { category: 'Utilities',      type: 'expense',  monthly_limit: 0 },
  { category: 'To Sort',        type: 'expense',  monthly_limit: 0 },
  { category: 'Payment',        type: 'payment',  monthly_limit: 0 },
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
