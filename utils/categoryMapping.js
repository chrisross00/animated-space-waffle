function matchesCondition(txn, condition) {
  const { field, op, value, min, max } = condition;
  switch (field) {
    case 'name':
      return op === 'eq' && (txn.name || '').toLowerCase() === (value || '').toLowerCase();
    case 'merchant_name':
      return op === 'eq' && txn.merchant_name != null &&
        txn.merchant_name.toLowerCase() === (value || '').toLowerCase();
    case 'amount': {
      const abs = Math.abs(txn.amount);
      if (op === 'eq') return abs === value;
      if (op === 'range') return abs >= min && abs <= max;
      return false;
    }
    case 'personal_finance_category_primary':
      return op === 'eq' && txn.personal_finance_category?.primary === value;
    case 'day_of_month': {
      if (op !== 'range') return false;
      const day = new Date(txn.date + 'T12:00:00').getDate();
      return day >= min && day <= max;
    }
    default:
      return false;
  }
}

function evaluateCompoundRules(compoundRules, transaction) {
  const sorted = [...compoundRules].sort((a, b) => b.conditions.length - a.conditions.length);
  for (const rule of sorted) {
    if (rule.conditions.every(c => matchesCondition(transaction, c))) {
      return rule.action;
    }
  }
  return null;
}

async function getMappingRuleList(dbCategories = null) {
  const ruleList = [];
  dbCategories.forEach(e => {
    ruleList.push({
      category: e.category,
      rules: e.rules,
      plaid_pfc: e.plaid_pfc || [],
    });
  });
  return ruleList;
}

async function mapTransactions(transactions, rulesArray, compoundRules = []) {
  const ruleList = rulesArray;

  // RULE: compound rules (highest priority — user-defined, multi-condition)
  if (compoundRules.length > 0) {
    transactions.forEach(transaction => {
      if (!transaction.mappedCategory) {
        const action = evaluateCompoundRules(compoundRules, transaction);
        if (action) {
          if (action.type === 'categorize') {
            transaction.mappedCategory = action.categoryName;
          } else if (action.type === 'route') {
            transaction.mappedCategory = action.destination === 'to-sort' ? 'To Sort' : null;
          }
        }
      }
    });
  }

  // BUILD SPECIFIC RULE LISTS (normalized to lowercase for case-insensitive matching)
  let nameList = [];
  let cat2List = [];
  ruleList.forEach(rule => {
    if (rule.rules.name) nameList.push(...rule.rules.name.map(n => n.toLowerCase()));
    if (rule.rules.category1) cat2List.push(...rule.rules.category1);
  });

  // RULE: exact transaction name match (highest priority — user-defined, case-insensitive)
  for (let i = 0; i < nameList.length; i++) {
    transactions.forEach(transaction => {
      const txnName = transaction.name?.toLowerCase();
      if (!transaction.mappedCategory && txnName === nameList[i]) {
        ruleList.forEach(rule => {
          if (rule.rules.name && rule.rules.name.map(n => n.toLowerCase()).includes(nameList[i])) {
            transaction.mappedCategory = rule.category;
          }
        });
      }
    });
  }

  // RULE: Plaid category[1]
  for (let i = 0; i < cat2List.length; i++) {
    transactions.forEach(transaction => {
      if (!transaction.mappedCategory && transaction.category?.[1] === cat2List[i]) {
        ruleList.forEach(rule => {
          if (rule.rules.category1 && rule.rules.category1.includes(cat2List[i])) {
            transaction.mappedCategory = rule.category;
          }
        });
      }
    });
  }

  // RULE: transaction_type, merchant_name, accountName, category[0]
  transactions.forEach(transaction => {
    if (!transaction.mappedCategory) {
      ruleList.forEach(rule => {
        if (!transaction.mappedCategory && rule.rules.transaction_type && rule.rules.transaction_type.includes(transaction.transaction_type)) {
          transaction.mappedCategory = rule.category;
        }
        if (!transaction.mappedCategory && rule.rules.merchant_name && transaction.merchant_name &&
            rule.rules.merchant_name.map(m => m.toLowerCase()).includes(transaction.merchant_name.toLowerCase())) {
          transaction.mappedCategory = rule.category;
        }
        if (!transaction.mappedCategory && rule.rules.accountName && rule.rules.accountName.includes(transaction.accountName)) {
          transaction.mappedCategory = rule.category;
        }
        if (!transaction.mappedCategory && rule.rules.category0 && transaction.category?.[0] && rule.rules.category0.includes(transaction.category[0])) {
          transaction.mappedCategory = rule.category;
        }
      });
    }
  });

  // RULE: Plaid personal_finance_category (good default, lower priority than custom rules)
  transactions.forEach(transaction => {
    if (!transaction.mappedCategory && transaction.personal_finance_category?.primary) {
      const pfc = transaction.personal_finance_category.primary;
      ruleList.forEach(rule => {
        if (!transaction.mappedCategory && rule.plaid_pfc && rule.plaid_pfc.includes(pfc)) {
          transaction.mappedCategory = rule.category;
        }
      });
    }
  });

  // FALLBACK: To Sort
  transactions.forEach(transaction => {
    if (!transaction.mappedCategory) {
      transaction.mappedCategory = 'To Sort';
    }
  });

  return transactions;
}

module.exports = { mapTransactions, getMappingRuleList, evaluateCompoundRules };
