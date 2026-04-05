import { CATEGORY_TYPES } from '../../../shared/categoryTypes';

/**
 * Compute free cash flow (income − expenses − savings) for a set of transactions.
 *
 * Sums raw amounts per category first (so refunds net against purchases),
 * then takes abs of each category total before grouping by type.
 *
 * @param {Array} transactions — already filtered to the desired month
 * @param {Array} categories — from store.state.categories
 * @returns {{ income: number, expenses: number, savings: number, net: number }}
 */
export function freeCashFlow(transactions, categories) {
  const catTypeMap = new Map(categories.map(c => [c.category, c.type]));

  // Sum raw amounts per category
  const catSums = {};
  for (const txn of transactions) {
    if (txn.excludeFromTotal) continue;
    const cat = txn.mappedCategory;
    catSums[cat] = (catSums[cat] || 0) + txn.amount;
  }

  // Abs per category, then group by type
  let income = 0, expenses = 0, savings = 0;
  for (const [cat, sum] of Object.entries(catSums)) {
    const type = catTypeMap.get(cat);
    if (type === CATEGORY_TYPES.INCOME) income += Math.abs(sum);
    else if (type === CATEGORY_TYPES.EXPENSE) expenses += Math.abs(sum);
    else if (type === CATEGORY_TYPES.SAVINGS) savings += Math.abs(sum);
  }

  return {
    income,
    expenses,
    savings,
    net: Math.round((income - expenses - savings) * 100) / 100,
  };
}
