/**
 * Single source of truth for default categories (backend).
 * Consumed by api.js (seed route) and utils/seedCategories.js.
 */
const DEFAULT_CATEGORIES = [
  { category: 'Income',          type: 'income',   monthly_limit: 0, plaid_pfc: ['INCOME', 'TRANSFER_IN'] },
  { category: 'Rent & Utilities',type: 'expense',  monthly_limit: 0, plaid_pfc: ['HOME_IMPROVEMENT', 'RENT_AND_UTILITIES'], fixed: true },
  { category: 'Food & Dining',   type: 'expense',  monthly_limit: 0, plaid_pfc: ['FOOD_AND_DRINK'] },
  { category: 'Transportation',  type: 'expense',  monthly_limit: 0, plaid_pfc: ['TRANSPORTATION'] },
  { category: 'Entertainment',   type: 'expense',  monthly_limit: 0, plaid_pfc: ['ENTERTAINMENT'] },
  { category: 'Travel',          type: 'expense',  monthly_limit: 0, plaid_pfc: ['TRAVEL'] },
  { category: 'Shopping',        type: 'expense',  monthly_limit: 0, plaid_pfc: ['GENERAL_MERCHANDISE'] },
  { category: 'Health',          type: 'expense',  monthly_limit: 0, plaid_pfc: ['MEDICAL', 'PERSONAL_CARE'] },
  { category: 'Services',        type: 'expense',  monthly_limit: 0, plaid_pfc: ['GENERAL_SERVICES'] },
  { category: 'Taxes & Giving',  type: 'expense',  monthly_limit: 0, plaid_pfc: ['GOVERNMENT_AND_NON_PROFIT'] },
  { category: 'To Sort',         type: 'expense',  monthly_limit: 0, plaid_pfc: [] },
  { category: 'Payment',         type: 'payment',  monthly_limit: 0, plaid_pfc: ['TRANSFER_OUT', 'LOAN_PAYMENTS', 'BANK_FEES'] },
];

module.exports = { DEFAULT_CATEGORIES };
