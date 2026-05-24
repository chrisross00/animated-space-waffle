// utils/tellerCategoryMapping.js
// Teller's coarse transaction `details.category` → Basil category.
// General taxonomy (NOT user-personalized). Keys omitted intentionally fall through
// to To Sort: "general" (Teller's catch-all) and any value not listed here.
// Verify against Teller's docs and add new values as Teller introduces them.
const TELLER_CATEGORY_TO_BASIL = {
  accommodation: 'Travel',
  bar: 'Food & Dining',
  dining: 'Food & Dining',
  groceries: 'Food & Dining',
  clothing: 'Shopping',
  electronics: 'Shopping',
  office: 'Shopping',
  home: 'Shopping',
  shopping: 'Shopping',
  entertainment: 'Entertainment',
  sport: 'Entertainment',
  fuel: 'Transportation',
  transport: 'Transportation',
  transportation: 'Transportation',
  health: 'Health',
  phone: 'Rent & Utilities',
  utilities: 'Rent & Utilities',
  charity: 'Taxes & Giving',
  tax: 'Taxes & Giving',
  income: 'Income',
  loan: 'Payments & Transfers',
  investment: 'Payments & Transfers',
  insurance: 'Services',
  service: 'Services',
  software: 'Services',
  education: 'Services',
  advertising: 'Services',
  // 'general' intentionally omitted → To Sort
};

module.exports = { TELLER_CATEGORY_TO_BASIL };
