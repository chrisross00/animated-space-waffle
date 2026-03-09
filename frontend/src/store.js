import { createStore } from 'vuex';
import createPersistedState from 'vuex-persistedstate';
// import { firestore } from '@/firebase';
// import { auth } from '@/firebase'

const store = createStore({
    state: {
        user: null,
        session: null,
        theme: localStorage?.getItem?.('basil-theme') || '',
        rules: [],
        accountBalances: null,
        balanceSnapshots: null,
        bootstrapping: false,
        transactionsByMonth: {},
        transactions: [],            // compatibility — derived from transactionsByMonth
        lastSyncedAt: null,
    },
    plugins: [createPersistedState({
        storage: window.sessionStorage,
        // Only persist session (needed for isLoggedIn check on page refresh).
        // User data (email, account names) and financial data are reloaded
        // from the network via auth.onAuthStateChanged + getOrAddUser().
        reducer: state => ({ session: state.session, user: state.user, lastSyncedAt: state.lastSyncedAt }),
    })],
    mutations: {
        setUser(state, user) {
            // Extract accountBalances and snapshots if present from getOrAddUser response
            if (user?.accountBalances) {
                state.accountBalances = user.accountBalances;
            }
            if (user?.balanceSnapshots) {
                state.balanceSnapshots = user.balanceSnapshots;
            }
            state.user = user;
        },
        clearState(state) {
          state.user = null;
          state.session = null;
          state.lastPlaidFetch = null;
          state.transactionsByMonth = {};
          state.transactions = [];
          state.categories = [];
          state.rules = [];
          state.accountBalances = null;
          state.balanceSnapshots = null;
          state.lastSyncedAt = null;
        },
        setSession(state, session) {
            state.session = session;
        },
        setLastPlaidFetch(state, timestamp) {
            state.lastPlaidFetch = timestamp;
        },
        setTransactions(state, transactions) {
            // Legacy setter — also populate month-keyed cache
            state.transactions = transactions;
            const byMonth = {};
            for (const txn of transactions) {
                const month = txn.date?.substring(0, 7);
                if (month) {
                    if (!byMonth[month]) byMonth[month] = [];
                    byMonth[month].push(txn);
                }
            }
            state.transactionsByMonth = byMonth;
        },
        setMonthTransactions(state, { month, transactions }) {
            state.transactionsByMonth = { ...state.transactionsByMonth, [month]: transactions };
            // Rebuild flat compatibility array from all loaded months
            state.transactions = Object.values(state.transactionsByMonth).flat();
        },
        setLastSyncedAt(state, timestamp) {
            state.lastSyncedAt = timestamp;
        },
        setCategories(state, categories) {
            state.categories = categories;
        },
        updateTransaction(state, updatedTransaction) {
            // Update in both transactionsByMonth and the flat compatibility array
            const update = (txn) => {
                txn.mappedCategory = updatedTransaction.mappedCategory;
                txn.date = updatedTransaction.date;
                txn.note = updatedTransaction.note;
                txn.excludeFromTotal = updatedTransaction.excludeFromTotal;
                if (updatedTransaction.manually_set !== undefined) {
                    txn.manually_set = updatedTransaction.manually_set;
                }
            };
            // Search in month buckets
            for (const monthTxns of Object.values(state.transactionsByMonth)) {
                const txn = monthTxns.find(t => t.transaction_id === updatedTransaction.transaction_id);
                if (txn) { update(txn); break; }
            }
            // Also update flat array (shares object references with month buckets,
            // but update explicitly in case they diverge)
            const flatTxn = state.transactions.find(t => t.transaction_id === updatedTransaction.transaction_id);
            if (flatTxn) update(flatTxn);
        },
        updateCategory(state, updatedCategory) {
            console.log('updateCategory store:', updatedCategory)
            const newPfc = updatedCategory.plaid_pfcBEResponse || [];
            const oldName = updatedCategory.originalCategoryName;
            const newName = updatedCategory.categoryNameBEResponse;
            state.categories.forEach(category => {
                if (category._id === updatedCategory._id) {
                    category.category = newName;
                    category.monthly_limit = updatedCategory.monthlyLimitBEResponse
                    category.showOnBudgetPage = updatedCategory.showOnBudgetPageBEResponse
                    category.plaid_pfc = newPfc
                } else if (newPfc.length > 0) {
                    // Mirror backend dedup: remove any PFC values now claimed by this category
                    category.plaid_pfc = (category.plaid_pfc || []).filter(p => !newPfc.includes(p));
                }
            });
            // If name changed, update transactions in store to match
            if (oldName && newName !== oldName) {
                for (const monthTxns of Object.values(state.transactionsByMonth)) {
                    for (const txn of monthTxns) {
                        if (txn.mappedCategory === oldName) txn.mappedCategory = newName;
                    }
                }
                // Rebuild flat array
                state.transactions = Object.values(state.transactionsByMonth).flat();
            }
            console.log('store.js updateCategory done!', state.categories)
        },
        updateCategoryRules(state, { categoryId, ruleType, ruleValue }) {
            const cat = state.categories.find(c => c._id === categoryId);
            if (cat && cat.rules && cat.rules[ruleType]) {
                cat.rules[ruleType] = cat.rules[ruleType].filter(v => v !== ruleValue);
            }
        },
        addCategoryRule(state, { categoryId, ruleType, ruleValue }) {
            const cat = state.categories.find(c => c._id === categoryId);
            if (cat) {
                if (!cat.rules) cat.rules = {};
                if (!cat.rules[ruleType]) cat.rules[ruleType] = [];
                if (!cat.rules[ruleType].includes(ruleValue)) {
                    cat.rules[ruleType].push(ruleValue);
                }
            }
        },
        setRules(state, rules) {
            state.rules = rules;
        },
        addRule(state, rule) {
            state.rules.unshift(rule);
        },
        removeRule(state, ruleId) {
            state.rules = state.rules.filter(r => String(r._id) !== String(ruleId));
        },
        updateRule(state, { ruleId, label, conditions, action }) {
            const rule = state.rules.find(r => String(r._id) === String(ruleId));
            if (rule) { rule.label = label; rule.conditions = conditions; if (action) rule.action = action; }
        },
        setAccountBalances(state, balances) {
            state.accountBalances = balances;
        },
        setBalanceSnapshots(state, snapshots) {
            state.balanceSnapshots = snapshots;
        },
        setBootstrapping(state, val) {
            state.bootstrapping = val;
        },
        setTheme(state, theme) {
            state.theme = theme;
            localStorage.setItem('basil-theme', theme);
            if (theme === 'dark') {
                document.documentElement.dataset.theme = 'dark';
            } else {
                delete document.documentElement.dataset.theme;
            }
            document.documentElement.classList.add('basil-theme-transitioning');
            setTimeout(() => document.documentElement.classList.remove('basil-theme-transitioning'), 350);
        },
        updateCategoryLimit(state, { categoryId, monthly_limit }) {
            const cat = state.categories.find(c => c._id === categoryId);
            if (cat) cat.monthly_limit = monthly_limit;
        },
        removeCategory(state, categoryId) {
            state.categories = state.categories.filter(c => c._id !== categoryId);
        },
        addCategory(state, newCategory) {
            console.log('addCategory store:', newCategory)
                const newPfc = newCategory.plaid_pfcBEResponse || [];
                // Mirror backend dedup: remove claimed PFC values from existing categories
                if (newPfc.length > 0) {
                    state.categories.forEach(category => {
                        category.plaid_pfc = (category.plaid_pfc || []).filter(p => !newPfc.includes(p));
                    });
                }
                const category = {
                    _id: newCategory._id,
                    category: newCategory.categoryNameBEResponse,
                    monthly_limit: newCategory.monthlyLimitBEResponse,
                    showOnBudgetPage: newCategory.showOnBudgetPageBEResponse,
                    type: newCategory.type,
                    plaid_pfc: newPfc,
                }

                state.categories.push(category)
                console.log('store.js addCategory done!', state.categories)
            // this.categoryMonthlyLimits.push(categoryToAdd) // need to modify addedCategory first
        },
    },
    actions: {
    }
});

export default store;