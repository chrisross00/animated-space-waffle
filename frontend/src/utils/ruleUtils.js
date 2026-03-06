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

/**
 * Stable string key for a single condition — used to detect duplicate rules.
 */
export function condKey(c) {
  return `${c.field}|${c.op}|${c.value ?? ''}|${c.min ?? ''}|${c.max ?? ''}`;
}

/**
 * Find an existing compound rule in the store whose conditions match exactly.
 */
export function findExistingRule(store, conditions) {
  const incoming = conditions.map(condKey).sort().join(',');
  return (store.state.rules || []).find(r =>
    Array.isArray(r.conditions) && r.conditions.map(condKey).sort().join(',') === incoming
  ) || null;
}

/**
 * Update the store to reflect a merchant rule assignment, handling deduplication:
 * removes the rule from a previous category if it existed there, adds to the new one,
 * and notifies the user appropriately.
 *
 * @param {object}   store        - Vuex store instance
 * @param {string}   ruleType     - 'merchant_name' | 'name'
 * @param {string}   ruleValue    - The merchant/name value
 * @param {string}   categoryName - Target category name
 * @param {Function} notify       - $q.notify (or compatible)
 */
export function applyMerchantRuleToStore(store, ruleType, ruleValue, categoryName, notify) {
  const prevCat = store.state.categories.find(c => (c.rules?.[ruleType] || []).includes(ruleValue));
  const newCat = store.state.categories.find(c => c.category === categoryName);
  if (prevCat && prevCat.category === categoryName) {
    notify({ type: 'info', message: 'Rule already exists — categorization applied.' });
  } else {
    if (prevCat) store.commit('updateCategoryRules', { categoryId: prevCat._id, ruleType, ruleValue });
    if (newCat) store.commit('addCategoryRule', { categoryId: newCat._id, ruleType, ruleValue });
    if (prevCat) notify({ type: 'info', message: 'Rule updated — categorization applied.' });
  }
}

/**
 * Save or update a compound rule, sweep matching transactions, and notify the user.
 *
 * @param {object}   store           - Vuex store instance
 * @param {object}   payload         - Rule payload (label, conditions, action, createdFrom)
 * @param {string}   categoryName    - Target category name
 * @param {Function} notify          - $q.notify (or compatible)
 * @param {object}   api             - { saveCompoundRule, updateCompoundRule } from firebase
 */
export async function applyCompoundRuleToStore(store, payload, categoryName, notify, { saveCompoundRule, updateCompoundRule }) {
  const existing = findExistingRule(store, payload.conditions);
  if (existing) {
    if (existing.action?.categoryName !== categoryName) {
      const updated = { ...existing.action, categoryName };
      await updateCompoundRule(String(existing._id), existing.label, existing.conditions, updated);
      store.commit('updateRule', { ruleId: existing._id, label: existing.label, conditions: existing.conditions, action: updated });
      notify({ type: 'info', message: 'Rule updated — categorization applied.' });
    } else {
      notify({ type: 'info', message: 'Rule already exists — categorization applied.' });
    }
  } else {
    const rule = await saveCompoundRule(payload);
    if (rule) store.commit('addRule', rule);
  }
  sweepStore(store, payload.conditions, categoryName, null, false);
}
