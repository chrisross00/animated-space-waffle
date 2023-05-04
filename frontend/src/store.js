import { createStore } from 'vuex';
import createPersistedState from 'vuex-persistedstate';
// import { firestore } from '@/firebase';
// import { auth } from '@/firebase'

const store = createStore({
    state: {
        user: null,
        session: null
    },
    plugins: [createPersistedState({
        storage: window.sessionStorage,
    })],
    mutations: {
        setUser(state, user) {
            state.user = user;
        },
        clearState(state) {
          state.user = null;
          state.session = null;
          state.lastPlaidFetch = null;
          state.transactions = [];
          state.categories = [];
        },
        setSession(state, session) {
            state.session = session;
        },
        setLastPlaidFetch(state, timestamp) {
            state.lastPlaidFetch = timestamp;
        },
        setTransactions(state, transactions) {
            state.transactions = transactions;
        },
        setCategories(state, categories) {
            state.categories = categories;
        },
        updateTransaction(state, updatedTransaction) {
            console.log('store.js.updateTransaction, ', updatedTransaction)
            console.log('store.js.state.transactions, ', state.transactions)
            for (let transaction of state.transactions) {
                console.log('state.transactions.transaction_id', state.transactions.transaction_id)
                if(transaction.transaction_id === updatedTransaction.transaction_id) {
                    console.log('store.js.updatedTransaction() found a match!', transaction, updatedTransaction)
                    transaction.mappedCategory = updatedTransaction.mappedCategory
                    transaction.date = updatedTransaction.date
                    transaction.note = updatedTransaction.note
                    transaction.excludeFromTotal = updatedTransaction.excludeFromTotal
                }
            }
        console.log('store.js updateTransaction done!', state.transactions)
        },
        updateCategory(state, updatedCategory) {
            console.log('updateCategory store:', updatedCategory)
            state.categories.forEach(category => {
                if (category._id === updatedCategory._id) { // update this if you want multiple client-side updates (add then edit flow)
                    category.category = updatedCategory.categoryNameBEResponse 
                    category.monthly_limit = updatedCategory.monthlyLimitBEResponse 
                    category.showOnBudgetPage = updatedCategory.showOnBudgetPageBEResponse 
                }
            });
            console.log('store.js updateCategory done!', state.categories)
        },
        addCategory(state, newCategory) {
            console.log('addCategory store:', newCategory)
                const category = {
                    _id: newCategory._id,
                    category: newCategory.categoryNameBEResponse,
                    monthly_limit: newCategory.monthlyLimitBEResponse,
                    showOnBudgetPage:  newCategory.showOnBudgetPageBEResponse,
                    type: newCategory.type,
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