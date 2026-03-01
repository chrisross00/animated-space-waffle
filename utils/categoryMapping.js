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

async function mapTransactions(transactions, rulesArray) {
  const ruleList = rulesArray;

  // BUILD SPECIFIC RULE LISTS
  let nameList = [];
  let cat2List = [];
  ruleList.forEach(rule => {
    if (rule.rules.name) nameList.push(...rule.rules.name);
    if (rule.rules.category1) cat2List.push(...rule.rules.category1);
  });

  // RULE: exact transaction name match (highest priority — user-defined)
  for (let i = 0; i < nameList.length; i++) {
    transactions.forEach(transaction => {
      if (!transaction.mappedCategory && transaction.name === nameList[i]) {
        ruleList.forEach(rule => {
          if (rule.rules.name && rule.rules.name.includes(nameList[i])) {
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
        if (!transaction.mappedCategory && rule.rules.merchant_name && rule.rules.merchant_name.includes(transaction.merchant_name)) {
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

module.exports = { mapTransactions, getMappingRuleList };
