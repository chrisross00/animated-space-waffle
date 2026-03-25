/**
 * Client-side rule condition matching and store sweep utilities.
 *
 * IMPORTANT: matchesCondition must stay in sync with the server-side copy in
 * utils/categoryMapping.js. When adding a new condition type, update both files.
 */

import { toast } from '@/composables/useToast'

const FIELD_LABELS = {
  name: 'name',
  merchant_name: 'merchant',
  personal_finance_category_primary: 'transfer type',
  day_of_month: 'day of month',
};

/**
 * Format an array of rule conditions into a human-readable string.
 * Conditions are joined with " · ".
 */
export function formatConditions(conditions) {
  return conditions.map(c => {
    const fieldLabel = FIELD_LABELS[c.field] || c.field;
    if (c.field === 'amount' && c.op === 'eq') return `amount = $${c.value % 1 === 0 ? c.value : c.value.toFixed(2)}`;
    if (c.op === 'eq') return `${fieldLabel} = ${c.value}`;
    if (c.op === 'contains') return `${fieldLabel} contains "${c.value}"`;
    if (c.op === 'gt') return `${fieldLabel} > $${c.value}`;
    if (c.op === 'lt') return `${fieldLabel} < $${c.value}`;
    if (c.op === 'range' && c.field === 'amount') {
      return c.max >= 9999 ? `amount $${c.min}+` : `amount $${c.min}–$${c.max}`;
    }
    if (c.op === 'range') return `${fieldLabel} ${c.min}–${c.max}`;
    return `${fieldLabel} ${c.op} ${c.value}`;
  }).join(' · ');
}

export function matchesCondition(txn, c) {
  const { field, op, value, min, max } = c;
  switch (field) {
    case 'merchant_name':
      if (txn.merchant_name == null) return false;
      if (op === 'eq') return txn.merchant_name.toLowerCase() === (value || '').toLowerCase();
      if (op === 'contains') return txn.merchant_name.toLowerCase().includes((value || '').toLowerCase());
      return false;
    case 'name':
      if (op === 'eq') return (txn.name || '').toLowerCase() === (value || '').toLowerCase();
      if (op === 'contains') return (txn.name || '').toLowerCase().includes((value || '').toLowerCase());
      return false;
    case 'amount': {
      const abs = Math.abs(txn.amount);
      if (op === 'eq')    return abs === value;
      if (op === 'gt')    return abs > value;
      if (op === 'lt')    return abs < value;
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
 * Extract the stable prefix of a transaction name for similarity grouping.
 *
 * Two heuristics:
 * 1. Everything before the first run of 1+ digits, trimmed of trailing punctuation.
 *    Catches: "Gusto-OSV 00007055 ..." → "Gusto-OSV", "CHECK # 1234" → "CHECK"
 * 2. If no digits, drop the last space-separated token (assumed variable suffix).
 *    Catches: "DD *DOORDASH MASCAFE" → "DD *DOORDASH"
 *
 * Returns null if the result is shorter than 4 characters.
 */
export function extractStablePrefix(name) {
  if (!name) return null;

  // Heuristic 1: everything before first digit run
  const digitMatch = name.match(/\d+/);
  if (digitMatch) {
    const raw = name.slice(0, digitMatch.index).replace(/[\s#\-_.*]+$/, '');
    if (raw.length >= 4) return raw;
  }

  // Heuristic 2: drop the last token if 2+ tokens exist
  const tokens = name.trim().split(/\s+/);
  if (tokens.length >= 2) {
    const withoutLast = tokens.slice(0, -1).join(' ');
    if (withoutLast.length >= 4) return withoutLast;
  }

  return null;
}

const P2P_PATTERNS = [/venmo/i, /zelle/i, /cash app/i, /cashapp/i, /paypal/i, /apple cash/i];

/**
 * Detect P2P payment transactions (Venmo, Zelle, Cash App, PayPal, Apple Cash).
 * P2P transactions get special handling in similarity matching — only amount+account
 * matching is useful because merchant/name matching is too broad.
 */
export function isP2P(txn) {
  const sources = [txn.merchant_name, txn.name].filter(Boolean);
  return sources.some(s => P2P_PATTERNS.some(p => p.test(s)));
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
 * Find transactions similar to an anchor transaction using a tiered cascade.
 * Tries strategies in specificity order; the first tier with >0 matches wins.
 *
 * Non-P2P cascade:
 *   1. merchant_name  — same Plaid-normalized merchant
 *   2. exact_name     — identical transaction name
 *   3. name_account   — identical name + same institution
 *   4. name_prefix    — stable prefix (before digits / variable suffix) via contains
 *   5. amount_account — same dollar amount + same institution
 *
 * P2P cascade (Venmo, Zelle, Cash App, PayPal, Apple Cash):
 *   Only exact amount — everything else is too broad.
 *   Scoped to account when available, amount-only otherwise.
 *
 * @param {object}   anchor       - The transaction to find matches for
 * @param {object[]} transactions - All transactions to search
 * @returns {object} { matches, allCount, strategy, ruleType, conditions, ruleField, ruleValue, label }
 */
export function findSimilarTransactions(anchor, transactions) {
  const empty = { matches: [], allCount: 0, strategy: null, ruleType: null, conditions: [], ruleField: null, ruleValue: null, label: '' };
  if (!anchor || !transactions?.length) return empty;

  const anchorName = anchor.name || '';
  const hasMerchant = anchor.merchant_name != null && anchor.merchant_name !== '';
  const hasAccount = anchor.account != null && anchor.account !== '' && anchor.account !== '?';
  const p2p = isP2P(anchor);

  const tiers = [];

  if (p2p) {
    // P2P: only exact amount matching (merchant/name matching is too broad)
    if (anchor.amount != null) {
      const absAmount = Math.abs(anchor.amount);
      const conditions = [{ field: 'amount', op: 'eq', value: absAmount }];
      let matchFn = t => Math.abs(t.amount) === absAmount;
      const amountStr = `$${absAmount % 1 === 0 ? absAmount : absAmount.toFixed(2)}`;
      const label = `${anchorName || anchor.merchant_name || ''} ${amountStr}`.trim();

      // Scope to account when available for a tighter rule
      if (hasAccount) {
        conditions.push({ field: 'account', op: 'eq', value: anchor.account });
        matchFn = t => Math.abs(t.amount) === absAmount && t.account === anchor.account;
      }

      tiers.push({
        strategy: hasAccount ? 'amount_account' : 'amount',
        ruleType: 'compound',
        ruleField: null,
        ruleValue: null,
        label,
        conditions,
        matchFn,
      });
    }
  } else {
    // --- Non-P2P cascade ---

    // Tier 1: merchant
    if (hasMerchant) {
      const val = anchor.merchant_name;
      const valLower = val.toLowerCase();
      tiers.push({
        strategy: 'merchant_name',
        ruleType: 'merchant',
        ruleField: 'merchant_name',
        ruleValue: val,
        label: val,
        conditions: [{ field: 'merchant_name', op: 'eq', value: val }],
        matchFn: t => t.merchant_name != null && t.merchant_name.toLowerCase() === valLower,
      });
    }

    // Tier 2: exact name
    if (anchorName) {
      const nameLower = anchorName.toLowerCase();
      tiers.push({
        strategy: 'exact_name',
        ruleType: 'compound',
        ruleField: 'name',
        ruleValue: anchorName,
        label: anchorName,
        conditions: [{ field: 'name', op: 'eq', value: anchorName }],
        matchFn: t => (t.name || '').toLowerCase() === nameLower,
      });
    }

    // Tier 3: name + account
    if (anchorName && hasAccount) {
      const nameLower = anchorName.toLowerCase();
      tiers.push({
        strategy: 'name_account',
        ruleType: 'compound',
        ruleField: null,
        ruleValue: null,
        label: anchorName,
        conditions: [
          { field: 'name', op: 'eq', value: anchorName },
          { field: 'account', op: 'eq', value: anchor.account },
        ],
        matchFn: t => (t.name || '').toLowerCase() === nameLower && t.account === anchor.account,
      });
    }

    // Tier 4: name prefix
    if (anchorName) {
      const prefix = extractStablePrefix(anchorName);
      if (prefix) {
        const prefixLower = prefix.toLowerCase();
        tiers.push({
          strategy: 'name_prefix',
          ruleType: 'compound',
          ruleField: null,
          ruleValue: null,
          label: prefix,
          conditions: [{ field: 'name', op: 'contains', value: prefix }],
          matchFn: t => (t.name || '').toLowerCase().includes(prefixLower),
        });
      }
    }

    // Tier 5: amount + account
    if (hasAccount && anchor.amount != null) {
      const absAmount = Math.abs(anchor.amount);
      tiers.push({
        strategy: 'amount_account',
        ruleType: 'compound',
        ruleField: null,
        ruleValue: null,
        label: `$${absAmount % 1 === 0 ? absAmount : absAmount.toFixed(2)} from ${anchor.account}`,
        conditions: [
          { field: 'amount', op: 'eq', value: absAmount },
          { field: 'account', op: 'eq', value: anchor.account },
        ],
        matchFn: t => Math.abs(t.amount) === absAmount && t.account === anchor.account,
      });
    }
  }

  // Try each tier — first one with matches wins
  for (const tier of tiers) {
    const matches = transactions.filter(t =>
      t.transaction_id !== anchor.transaction_id && tier.matchFn(t)
    );
    if (matches.length > 0) {
      return {
        matches,
        allCount: matches.length,
        strategy: tier.strategy,
        ruleType: tier.ruleType,
        conditions: tier.conditions,
        ruleField: tier.ruleField,
        ruleValue: tier.ruleValue,
        label: tier.label,
      };
    }
  }

  // No matches — return first tier's metadata for "Remember for future" label
  if (tiers.length > 0) {
    const first = tiers[0];
    return {
      matches: [],
      allCount: 0,
      strategy: first.strategy,
      ruleType: first.ruleType,
      conditions: first.conditions,
      ruleField: first.ruleField,
      ruleValue: first.ruleValue,
      label: first.label,
    };
  }

  return empty;
}

/**
 * Determine why a transaction is in its current category.
 * Checks sources in the same priority order as categoryMapping.js → mapTransactions().
 *
 * @param {object}   txn        - The transaction to attribute
 * @param {object[]} categories - Array of category objects from the store
 * @param {object[]} rules      - Array of compound rule objects from the store
 * @returns {object} { type, label, icon, ruleId?, linkable? }
 */
export function getAttribution(txn, categories, rules) {
  // 1. Manual override
  if (txn.manually_set)
    return { type: 'manual', label: 'You categorized this', icon: 'edit' };

  // 2. Compound rule (highest priority in engine)
  if (rules?.length) {
    const match = rules.find(r =>
      Array.isArray(r.conditions) && r.conditions.every(c => matchesCondition(txn, c))
    );
    if (match)
      return {
        type: 'compound_rule',
        label: `Auto-sorted — rule: ${match.label || 'Compound rule'}`,
        icon: 'tune',
        ruleId: match._id,
        linkable: true,
      };
  }

  // 3. Merchant rule
  if (txn.merchant_name) {
    const cat = categories.find(c =>
      (c.rules?.merchant_name || []).some(m =>
        m.toLowerCase() === txn.merchant_name.toLowerCase()
      )
    );
    if (cat)
      return {
        type: 'merchant_rule',
        label: `Auto-sorted — all ${txn.merchant_name} transactions`,
        icon: 'store',
        linkable: true,
      };
  }

  // 4. Name rule
  if (txn.name) {
    const cat = categories.find(c =>
      (c.rules?.name || []).some(n => n.toLowerCase() === txn.name.toLowerCase())
    );
    if (cat)
      return {
        type: 'name_rule',
        label: `Auto-sorted — all "${txn.name}" transactions`,
        icon: 'label',
        linkable: true,
      };
  }

  // 5. Plaid PFC mapping
  const pfc = txn.personal_finance_category?.primary;
  if (pfc) {
    const cat = categories.find(c => (c.plaid_pfc || []).includes(pfc));
    if (cat) return { type: 'plaid_pfc', label: 'Auto-sorted by your bank', icon: 'account_balance' };
  }

  // 6. Unsorted
  if (txn.mappedCategory === 'To Sort')
    return { type: 'unsorted', label: 'Needs sorting', icon: 'help_outline' };

  // 7. Categorized but can't determine source
  return { type: 'unknown', label: 'Auto-sorted', icon: 'auto_awesome' };
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
 */
export function applyMerchantRuleToStore(store, ruleType, ruleValue, categoryName) {
  const prevCat = store.state.categories.find(c => (c.rules?.[ruleType] || []).includes(ruleValue));
  const newCat = store.state.categories.find(c => c.category === categoryName);
  if (prevCat && prevCat.category === categoryName) {
    toast.show({ type: 'info', message: 'Rule already exists — categorization applied.' });
  } else {
    if (prevCat) store.commit('updateCategoryRules', { categoryId: prevCat._id, ruleType, ruleValue });
    if (newCat) store.commit('addCategoryRule', { categoryId: newCat._id, ruleType, ruleValue });
    if (prevCat) toast.show({ type: 'info', message: 'Rule updated — categorization applied.' });
  }
}

/**
 * Save or update a compound rule, sweep matching transactions, and notify the user.
 *
 * @param {object}   store           - Vuex store instance
 * @param {object}   payload         - Rule payload (label, conditions, action, createdFrom)
 * @param {string}   categoryName    - Target category name
 * @param {object}   api             - { saveCompoundRule, updateCompoundRule }
 */
export async function applyCompoundRuleToStore(store, payload, categoryName, { saveCompoundRule, updateCompoundRule }) {
  const existing = findExistingRule(store, payload.conditions);
  if (existing) {
    if (existing.action?.categoryName !== categoryName) {
      const updated = { ...existing.action, categoryName };
      await updateCompoundRule(String(existing._id), existing.label, existing.conditions, updated);
      store.commit('updateRule', { ruleId: existing._id, label: existing.label, conditions: existing.conditions, action: updated });
      toast.show({ type: 'info', message: 'Rule updated — categorization applied.' });
    } else {
      toast.show({ type: 'info', message: 'Rule already exists — categorization applied.' });
    }
  } else {
    const rule = await saveCompoundRule(payload);
    if (rule) store.commit('addRule', rule);
  }
  sweepStore(store, payload.conditions, categoryName, null, false);
}
