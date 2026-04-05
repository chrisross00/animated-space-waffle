/**
 * Single source of truth for default categories (backend).
 * Consumed by api.js (seed route) and utils/seedCategories.js.
 */
const { CATEGORY_TYPES } = require('../shared/categoryTypes');

const DEFAULT_CATEGORIES = [
  { category: 'Income',          type: CATEGORY_TYPES.INCOME,   monthly_limit: 0, plaid_pfc: ['INCOME'] },
  { category: 'Rent & Utilities',type: CATEGORY_TYPES.EXPENSE,  monthly_limit: 0, plaid_pfc: ['HOME_IMPROVEMENT', 'RENT_AND_UTILITIES'], fixed: true },
  { category: 'Food & Dining',   type: CATEGORY_TYPES.EXPENSE,  monthly_limit: 0, plaid_pfc: ['FOOD_AND_DRINK'] },
  { category: 'Transportation',  type: CATEGORY_TYPES.EXPENSE,  monthly_limit: 0, plaid_pfc: ['TRANSPORTATION'] },
  { category: 'Entertainment',   type: CATEGORY_TYPES.EXPENSE,  monthly_limit: 0, plaid_pfc: ['ENTERTAINMENT'] },
  { category: 'Travel',          type: CATEGORY_TYPES.EXPENSE,  monthly_limit: 0, plaid_pfc: ['TRAVEL'] },
  { category: 'Shopping',        type: CATEGORY_TYPES.EXPENSE,  monthly_limit: 0, plaid_pfc: ['GENERAL_MERCHANDISE'] },
  { category: 'Health',          type: CATEGORY_TYPES.EXPENSE,  monthly_limit: 0, plaid_pfc: ['MEDICAL', 'PERSONAL_CARE'] },
  { category: 'Services',        type: CATEGORY_TYPES.EXPENSE,  monthly_limit: 0, plaid_pfc: ['GENERAL_SERVICES'] },
  { category: 'Taxes & Giving',  type: CATEGORY_TYPES.EXPENSE,  monthly_limit: 0, plaid_pfc: ['GOVERNMENT_AND_NON_PROFIT'] },
  { category: 'To Sort',         type: CATEGORY_TYPES.EXPENSE,  monthly_limit: 0, plaid_pfc: [] },
  { category: 'Payments & Transfers', type: CATEGORY_TYPES.PAYMENT,  monthly_limit: 0, plaid_pfc: ['TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS', 'LOAN_DISBURSEMENTS', 'BANK_FEES'] },
];

module.exports = { DEFAULT_CATEGORIES };
