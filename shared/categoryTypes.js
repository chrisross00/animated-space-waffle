// shared/categoryTypes.js
// Dual CJS/ESM export so both backend (require) and frontend (import) can consume this.
const CATEGORY_TYPES = {
  INCOME: 'income',
  EXPENSE: 'expense',
  PAYMENT: 'payment',
  SAVINGS: 'savings',
};

// CJS (Node/backend)
if (typeof module !== 'undefined') {
  module.exports = { CATEGORY_TYPES };
}

// ESM (Vite/frontend)
export { CATEGORY_TYPES };
