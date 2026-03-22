import { createStore } from 'vuex';
import createPersistedState from 'vuex-persistedstate';
// import { firestore } from '@/firebase';
// import { auth } from '@/firebase'

/** Rebuild flat transactions array from month buckets, excluding split parents. */
function rebuildFlatArray(state) {
  state.transactions = Object.keys(state.transactionsByMonth)
    .sort().reverse()
    .flatMap(k => state.transactionsByMonth[k])
    .filter(t => !t.isSplitParent);
}

const store = createStore({
    state: {
        user: null,
        session: null,
        waitlisted: false,
        theme: localStorage?.getItem?.('basil-theme') || '',
        rules: [],
        tags: [],
        accountBalances: null,
        balanceSnapshots: null,
        itemErrors: {},
        bootstrapping: false,
        transactionsByMonth: {},
        transactions: [],            // compatibility — derived from transactionsByMonth
        lastSyncedAt: null,
    },
    plugins: [createPersistedState({
        storage: window.localStorage,
        key: 'basil-store',
        // Persist session + user so the app can render immediately on PWA reopen
        // without waiting for getOrAddUser() to complete. Financial data (transactions,
        // categories, rules) is always re-fetched from the network.
        reducer: state => ({ session: state.session, user: state.user, lastSyncedAt: state.lastSyncedAt }),
    })],
    mutations: {
        setWaitlisted(state, value) {
            state.waitlisted = value;
        },
        setUser(state, user) {
            // Extract accountBalances and snapshots if present from getOrAddUser response
            if (user?.accountBalances) {
                state.accountBalances = user.accountBalances;
            }
            if (user?.balanceSnapshots) {
                state.balanceSnapshots = user.balanceSnapshots;
            }
            if (user?.itemErrors) {
                state.itemErrors = user.itemErrors;
            }
            if (user?.lastSyncedAt && !state.lastSyncedAt) {
                state.lastSyncedAt = user.lastSyncedAt;
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
          state.tags = [];
          state.accountBalances = null;
          state.balanceSnapshots = null;
          state.itemErrors = {};
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
            const byMonth = {};
            for (const txn of transactions) {
                const month = (txn.effectiveDate || txn.date)?.substring(0, 7);
                if (month) {
                    if (!byMonth[month]) byMonth[month] = [];
                    byMonth[month].push(txn);
                }
            }
            state.transactionsByMonth = byMonth;
            // Rebuild flat array with split parent filter applied
            rebuildFlatArray(state);
        },
        setMonthTransactions(state, { month, transactions }) {
            state.transactionsByMonth = { ...state.transactionsByMonth, [month]: transactions };
            // Rebuild flat compatibility array from all loaded months, newest first
            rebuildFlatArray(state);
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
                if (updatedTransaction.effectiveDate !== undefined) {
                    txn.effectiveDate = updatedTransaction.effectiveDate;
                }
                if (updatedTransaction.manually_set !== undefined) {
                    txn.manually_set = updatedTransaction.manually_set;
                }
            };

            // Detect if effective month is changing — need to re-bucket
            const oldMonth = (txn) => (txn.effectiveDate || txn.date)?.substring(0, 7);
            const newMonth = (updatedTransaction.effectiveDate || updatedTransaction.date)?.substring(0, 7);
            let needsRebucket = false;

            // Search in month buckets
            for (const [month, monthTxns] of Object.entries(state.transactionsByMonth)) {
                const idx = monthTxns.findIndex(t => t.transaction_id === updatedTransaction.transaction_id);
                if (idx !== -1) {
                    const txn = monthTxns[idx];
                    if (oldMonth(txn) !== newMonth) {
                        // Remove from old bucket
                        monthTxns.splice(idx, 1);
                        update(txn);
                        // Add to new bucket
                        if (!state.transactionsByMonth[newMonth]) state.transactionsByMonth[newMonth] = [];
                        state.transactionsByMonth[newMonth].push(txn);
                        needsRebucket = true;
                    } else {
                        update(txn);
                    }
                    break;
                }
            }

            // Rebuild flat array if month changed
            if (needsRebucket) {
                rebuildFlatArray(state);
            } else {
                // Update flat array in-place
                const flatTxn = state.transactions.find(t => t.transaction_id === updatedTransaction.transaction_id);
                if (flatTxn) update(flatTxn);
            }
        },
        linkTransaction(state, { transactionId, partnerId, type, effectiveDate, recategorize }) {
            const now = new Date().toISOString();
            const findAndUpdate = (id, partnerId) => {
                for (const monthTxns of Object.values(state.transactionsByMonth)) {
                    const txn = monthTxns.find(t => t.transaction_id === id);
                    if (txn) {
                        txn.linkedTransaction = { transaction_id: partnerId, type, confirmedAt: now };
                        break;
                    }
                }
                const flat = state.transactions.find(t => t.transaction_id === id);
                if (flat) flat.linkedTransaction = { transaction_id: partnerId, type, confirmedAt: now };
            };
            findAndUpdate(transactionId, partnerId);
            findAndUpdate(partnerId, transactionId);

            // If effectiveDate provided, set it on the partner (secondary) and re-bucket
            if (effectiveDate) {
                const newMonth = effectiveDate.substring(0, 7);
                for (const [month, monthTxns] of Object.entries(state.transactionsByMonth)) {
                    const idx = monthTxns.findIndex(t => t.transaction_id === partnerId);
                    if (idx !== -1) {
                        const txn = monthTxns[idx];
                        txn.effectiveDate = effectiveDate;
                        if (month !== newMonth) {
                            monthTxns.splice(idx, 1);
                            if (!state.transactionsByMonth[newMonth]) state.transactionsByMonth[newMonth] = [];
                            state.transactionsByMonth[newMonth].push(txn);
                            rebuildFlatArray(state);
                        }
                        break;
                    }
                }
                const flat = state.transactions.find(t => t.transaction_id === partnerId);
                if (flat) flat.effectiveDate = effectiveDate;
            }

            // Recategorize the partner (secondary) transaction if requested
            if (recategorize) {
                for (const monthTxns of Object.values(state.transactionsByMonth)) {
                    const txn = monthTxns.find(t => t.transaction_id === partnerId);
                    if (txn) { txn.mappedCategory = recategorize; break; }
                }
                const flat = state.transactions.find(t => t.transaction_id === partnerId);
                if (flat) flat.mappedCategory = recategorize;
            }
        },
        dismissRelationship(state, { transactionId, partnerId }) {
            const now = new Date().toISOString();
            const mark = (id) => {
                for (const monthTxns of Object.values(state.transactionsByMonth)) {
                    const txn = monthTxns.find(t => t.transaction_id === id);
                    if (txn) { txn.dismissedRelationship = now; break; }
                }
                const flat = state.transactions.find(t => t.transaction_id === id);
                if (flat) flat.dismissedRelationship = now;
            };
            mark(transactionId);
            if (partnerId) mark(partnerId);
        },
        unlinkTransaction(state, { transactionId, partnerId, revertCategory }) {
            let needsRebuild = false;
            const clear = (id) => {
                for (const [month, monthTxns] of Object.entries(state.transactionsByMonth)) {
                    const idx = monthTxns.findIndex(t => t.transaction_id === id);
                    if (idx !== -1) {
                        const txn = monthTxns[idx];
                        delete txn.linkedTransaction;
                        // If effectiveDate was set by the link, clear it and re-bucket
                        if (txn.effectiveDate) {
                            const originalMonth = txn.date?.substring(0, 7);
                            delete txn.effectiveDate;
                            if (originalMonth && originalMonth !== month) {
                                monthTxns.splice(idx, 1);
                                if (!state.transactionsByMonth[originalMonth]) state.transactionsByMonth[originalMonth] = [];
                                state.transactionsByMonth[originalMonth].push(txn);
                                needsRebuild = true;
                            }
                        }
                        break;
                    }
                }
                const flat = state.transactions.find(t => t.transaction_id === id);
                if (flat) {
                    delete flat.linkedTransaction;
                    delete flat.effectiveDate;
                }
            };
            clear(transactionId);
            clear(partnerId);
            // Revert category on the partner if it was auto-recategorized
            if (revertCategory) {
                for (const monthTxns of Object.values(state.transactionsByMonth)) {
                    const txn = monthTxns.find(t => t.transaction_id === partnerId);
                    if (txn) { txn.mappedCategory = revertCategory; break; }
                }
                const flat = state.transactions.find(t => t.transaction_id === partnerId);
                if (flat) flat.mappedCategory = revertCategory;
            }
            if (needsRebuild) {
                rebuildFlatArray(state);
            }
        },
        undoDismissRelationship(state, { transactionId, partnerId }) {
            const clear = (id) => {
                for (const monthTxns of Object.values(state.transactionsByMonth)) {
                    const txn = monthTxns.find(t => t.transaction_id === id);
                    if (txn) { delete txn.dismissedRelationship; break; }
                }
                const flat = state.transactions.find(t => t.transaction_id === id);
                if (flat) delete flat.dismissedRelationship;
            };
            clear(transactionId);
            if (partnerId) clear(partnerId);
        },
        updateCategory(state, updatedCategory) {
            const newPfc = updatedCategory.plaid_pfcBEResponse || [];
            const oldName = updatedCategory.originalCategoryName;
            const newName = updatedCategory.categoryNameBEResponse;
            state.categories.forEach(category => {
                if (category._id === updatedCategory._id) {
                    category.category = newName;
                    category.monthly_limit = updatedCategory.monthlyLimitBEResponse
                    category.showOnBudgetPage = updatedCategory.showOnBudgetPageBEResponse
                    category.plaid_pfc = newPfc
                    if (updatedCategory.fixedBEResponse !== undefined) category.fixed = updatedCategory.fixedBEResponse
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
                // Rebuild flat array, newest first
                rebuildFlatArray(state);
            }
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
        setTags(state, tags) {
            state.tags = tags || [];
        },
        addTag(state, tag) {
            state.tags.push(tag);
        },
        removeTag(state, tagId) {
            state.tags = state.tags.filter(t => t.id !== tagId);
            for (const txn of state.transactions) {
                if (txn.tags) {
                    txn.tags = txn.tags.filter(t => t.id !== tagId);
                }
            }
        },
        setTransactionTags(state, { transactionIds, tags }) {
            const idSet = new Set(transactionIds);
            for (const txn of state.transactions) {
                if (idSet.has(txn.transaction_id)) {
                    txn.tags = tags;
                }
            }
        },
        addTransactionTags(state, { transactionIds, tagIds }) {
            const idSet = new Set(transactionIds);
            const newTags = state.tags.filter(t => tagIds.includes(t.id));
            for (const txn of state.transactions) {
                if (idSet.has(txn.transaction_id)) {
                    if (!txn.tags) txn.tags = [];
                    for (const tag of newTags) {
                        if (!txn.tags.some(t => t.id === tag.id)) {
                            txn.tags.push(tag);
                        }
                    }
                }
            }
        },
        removeTransactionTags(state, { transactionIds, tagIds }) {
            const idSet = new Set(transactionIds);
            const removeSet = new Set(tagIds);
            for (const txn of state.transactions) {
                if (idSet.has(txn.transaction_id) && txn.tags) {
                    txn.tags = txn.tags.filter(t => !removeSet.has(t.id));
                }
            }
        },
        setAccountBalances(state, balances) {
            state.accountBalances = balances;
        },
        setBalanceSnapshots(state, snapshots) {
            state.balanceSnapshots = snapshots;
        },
        setItemErrors(state, errors) {
            state.itemErrors = errors || {};
        },
        clearItemError(state, institution) {
            const copy = { ...state.itemErrors };
            delete copy[institution];
            state.itemErrors = copy;
        },
        enrichTransactions(state, enrichments) {
            if (!Array.isArray(enrichments) || !state.transactions) return;
            const map = new Map(enrichments.map(e => [e.transaction_id, e]));
            for (const txn of state.transactions) {
                const e = map.get(txn.transaction_id);
                if (e) {
                    txn.venmo_id = e.venmo_id;
                    txn.venmo_note = e.venmo_note;
                    txn.venmo_counterparty = e.venmo_counterparty;
                }
            }
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
        },
        splitTransaction(state, { parent, children }) {
            // Update parent in month bucket
            const parentMonth = (parent.effectiveDate || parent.date || '').slice(0, 7);
            if (state.transactionsByMonth[parentMonth]) {
                const idx = state.transactionsByMonth[parentMonth].findIndex(t => t.id === parent.id);
                if (idx !== -1) state.transactionsByMonth[parentMonth][idx] = parent;
            }
            // Insert children into their month buckets
            for (const child of children) {
                const childMonth = (child.effectiveDate || child.date || '').slice(0, 7);
                if (!state.transactionsByMonth[childMonth]) {
                    state.transactionsByMonth[childMonth] = [];
                }
                state.transactionsByMonth[childMonth].push(child);
            }
            rebuildFlatArray(state);
        },
        unsplitTransaction(state, { parent }) {
            // Remove children from all month buckets
            for (const month of Object.keys(state.transactionsByMonth)) {
                state.transactionsByMonth[month] = state.transactionsByMonth[month]
                    .filter(t => t.parentTransactionId !== parent.id);
            }
            // Update parent in its month bucket
            const parentMonth = (parent.effectiveDate || parent.date || '').slice(0, 7);
            if (state.transactionsByMonth[parentMonth]) {
                const idx = state.transactionsByMonth[parentMonth].findIndex(t => t.id === parent.id);
                if (idx !== -1) state.transactionsByMonth[parentMonth][idx] = parent;
            }
            rebuildFlatArray(state);
        },
    },
    actions: {
    }
});

export default store;