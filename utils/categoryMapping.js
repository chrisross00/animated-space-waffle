async function getMappingRuleList (dbCategories=null) {
    // build rule lists based on rules listed on each Category; spread the associated category to the 
        let ruleList = []
        const categories = dbCategories;
        categories.forEach((e) => {
            const parentCategory = {category: e.Category}
            const rule = { 
                ...parentCategory,
                rules: e.rules,
            }
            // console.log('rule object no logic', rule);
            ruleList.push(rule)
        });
    return ruleList;
  }
  


async function mapTransactions (transactionArray, rulesArray) {
/**
 *  // NAME FILTER -- duplicate block for new filter
 
    This uses two filters as an alternative to loops. This method is useful because looping through the rules array creates limitations around category order, and makes it hard to integrate rule exceptions

    Function structure

    PART I: BUILD SPECIFIC RULES
    PART II: SPECIFIC RULES - for loop based on txn attribute for higher prioritization and more specific mapping
    PART III: GENERAL RULES - pure filter function for general categorization based

* TO DO: explore adding all items into one list or object with the type as a key associated with each array. and consolidating the for loop blocks
* TODO: could add a call to get rules if it's null...

*/
    let transactions = []
    // const transactionsArray = transactionArray; 
    const ruleList = rulesArray;
    transactionArray.filter(block => {
        if(block.added) transactions.push(...block.added) 
    })
    // console.log('Top of mapTransactions, transactions = ',)

    // Function beginning messages
    // console.log(JSON.stringify(ruleList),'\n\nRules List')
    // console.log('\n// Beginning of mapping work... //\n')

    // BUILD SPECIFIC RULES: 
    let nameList = []
    let cat2List = []
    // Prop-based rule lists use the value associated with a specific parameter from the ruleList array
    ruleList.filter(rule => {
        if(rule.rules.name) nameList.push(...rule.rules.name) // this whole block is mostly needed because some name map to arrays and some map to values
        if(rule.rules.category1) cat2List.push(...rule.rules.category1)
    })

    // CAT RULE: Names
    for (i=0; i<nameList.length;i++){
        transactions.filter(transaction => {
            if (!transaction.mappedCategory) {
                if (transaction.name && transaction.name == nameList[i]) {
                    ruleList.filter(rule => {
                        if(rule.rules.name && rule.rules.name.includes(nameList[i])){
                            transaction.mappedCategory = rule.category
                        }
                    })
                } 
            }
        })
    }

    // CAT RULE: Plaid Category 2
    for (i=0; i<cat2List.length;i++){
        transactions.filter(transaction => {
            if (!transaction.mappedCategory) {
                if (transaction.category?.[1] && transaction.category[1] == cat2List[i]) {
                    ruleList.filter(rule => {
                        if(rule.rules.category1 && rule.rules.category1.includes(cat2List[i])){
                            transaction.mappedCategory = rule.category
                        }
                    })
                } 
            }
        })
    }

    // GENERAL CAT RULES: No for targeted-list for loops
    transactions.filter(transaction => {
        if (!transaction.mappedCategory) {
            ruleList.filter(rule => {
                if(rule.rules.transaction_type && rule.rules.transaction_type.includes(transaction.transaction_type)){
                    transaction.mappedCategory = rule.category
                }
                if(rule.rules.merchant_name && rule.rules.merchant_name.includes(transaction.merchant_name)){
                    transaction.mappedCategory = rule.category
                }
                if(rule.rules.accountName && rule.rules.accountName.includes(transaction.accountName)){
                    transaction.mappedCategory = rule.category
                }
                if(rule.rules.category0 && transaction.category?.[0] && rule.rules.category0.includes(transaction.category[0])){
                    transaction.mappedCategory = rule.category
                }
            }) 
        }
    })

    return transactions
}

  
module.exports = {
    mapTransactions,
    getMappingRuleList,
}