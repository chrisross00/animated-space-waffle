/**
 * Client-side rule condition matching and store sweep utilities.
 *
 * IMPORTANT: matchesCondition must stay in sync with the server-side copy in
 * utils/categoryMapping.js. When adding a new condition type, update both files.
 */

export function matchesCondition(txn, c) {
  const { field, op, value, min, max } = c;
  switch (field) {
    case 'merchant_name':
      return op === 'eq' && txn.merchant_name != null &&
        txn.merchant_name.toLowerCase() === (value || '').toLowerCase();
    case 'name':
      return op === 'eq' && (txn.name || '').toLowerCase() === (value || '').toLowerCase();
    case 'amount': {
      const abs = Math.abs(txn.amount);
      if (op === 'eq')    return abs === value;
      if (op === 'range') return abs >= min && abs <= max;
      return false;
    }
    case 'account':
      return op === 'eq' && txn.account != null && txn.account === value;
    default:
      return false;
  }
}

/**
 * Sweep the Vuex store, updating mappedCategory (and optionally note) on all
 * transactions that match every condition and haven't been manually set.
 *
 * @param {object}   store        - Vuex store instance
 * @param {object[]} conditions   - Array of rule condition objects
 * @param {string}   categoryName - Target category name
 * @param {string|null} note      - Note to apply (null = preserve existing)
 * @param {boolean}  toSortOnly   - If true, only sweep "To Sort" transactions
 */
export function sweepStore(store, conditions, categoryName, note = null, toSortOnly = false) {
  store.state.transactions
    .filter(t => {
      if (toSortOnly && t.mappedCategory !== 'To Sort') return false;
      if (t.manually_set) return false;
      return conditions.every(c => matchesCondition(t, c));
    })
    .forEach(t => {
      const update = { ...t, mappedCategory: categoryName };
      if (note) update.note = note;
      store.commit('updateTransaction', update);
    });
}
