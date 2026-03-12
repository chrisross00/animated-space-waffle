require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { insertCategories, findCategories } = require('../db/database');

const { DEFAULT_CATEGORIES } = require('./defaultCategories');

async function seedCategories(userId) {
  if (!userId) {
    console.error('Usage: node utils/seedCategories.js <userId>');
    process.exit(1);
  }

  const existing = await findCategories(userId);
  if (existing.length > 0) {
    console.log(`User already has ${existing.length} categories. Skipping.`);
    process.exit(0);
  }

  const toInsert = DEFAULT_CATEGORIES.map(cat => ({
    ...cat,
    annual_spend: '',
    rules: {},
    showOnBudgetPage: true,
    isDefault: true,
    userId,
  }));

  await insertCategories(toInsert);
  console.log(`Seeded ${toInsert.length} categories for user ${userId}.`);
  process.exit(0);
}

seedCategories(process.argv[2]);
