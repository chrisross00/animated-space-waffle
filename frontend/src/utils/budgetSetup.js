/**
 * Budget setup utilities — shared logic for guided setup and nudge evaluation.
 * Extracted for testability (no Vue component dependency).
 */

/**
 * Format a number with commas for display.
 * @param {number|null} val
 * @returns {string}
 */
export function formatWithCommas(val) {
  if (val == null || val === '') return '';
  return Number(val).toLocaleString();
}

/**
 * Parse a string into a positive integer, stripping all non-numeric characters.
 * @param {string|number} val
 * @returns {number|null} Positive number or null
 */
export function parseAmount(val) {
  const cleaned = String(val).replace(/[^0-9]/g, '');
  const num = Number(cleaned) || 0;
  return num > 0 ? num : null;
}

/**
 * Calculate the "last month" key for transactionsByMonth lookups.
 * Handles year rollover (January → December of previous year).
 * @param {Date} now
 * @returns {string} YYYY-MM format
 */
export function getLastMonthKey(now) {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Calculate the current month key.
 * @param {Date} now
 * @returns {string} YYYY-MM format
 */
export function getCurrentMonthKey(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Evaluate which nudge card to show on the budget page.
 * Returns the first matching nudge or null.
 *
 * @param {Object} params
 * @param {boolean} params.isOnboarded
 * @param {number} params.toSortCount - number of unsorted transactions
 * @param {number} params.pendingRelationshipCount - number of pending relationships
 * @param {Array} params.categories - array of category objects with { type, monthly_limit, category }
 * @param {Object} params.preferences - user preferences object
 * @param {Function} params.getCategorySpend - (categoryName) => number (absolute spend)
 * @returns {Object|null} { type, text, cta, to?, category? }
 */
export function evaluateNudge({ isOnboarded, toSortCount, pendingRelationshipCount, categories, preferences, getCategorySpend }) {
  if (!isOnboarded) return null;
  if (toSortCount > 0) return null;
  if (pendingRelationshipCount > 0) return null;

  const prefs = preferences || {};
  const expenseWithLimit = categories.filter(c => c.type === 'expense' && Number(c.monthly_limit) > 0);

  // Nudge A: no expense categories have limits
  if (expenseWithLimit.length === 0 && !prefs.dismissed_budget_nudge) {
    return { type: 'budget', text: 'Set spending limits to track your budget.', cta: 'Set up budgets', to: '/plan' };
  }

  // Nudge B: some categories have limits, but at least one with spending doesn't
  if (expenseWithLimit.length > 0) {
    const dismissedCats = prefs.dismissed_category_nudges || [];
    const candidates = categories
      .filter(c => c.type === 'expense' && (!c.monthly_limit || Number(c.monthly_limit) === 0) && !dismissedCats.includes(c.category))
      .map(c => ({ name: c.category, spend: getCategorySpend(c.category) }))
      .filter(c => c.spend > 0)
      .sort((a, b) => b.spend - a.spend);
    if (candidates.length > 0) {
      const top = candidates[0];
      return {
        type: 'category',
        category: top.name,
        text: `You spent $${Math.round(top.spend).toLocaleString()} on ${top.name} this month. Set a limit?`,
        cta: 'Set limit',
      };
    }
  }

  // Nudge C: all active categories budgeted
  if (expenseWithLimit.length > 0 && !prefs.dismissed_trends_nudge) {
    return { type: 'trends', text: 'See where your money goes each month.', cta: 'View trends', to: '/trends' };
  }

  return null;
}
