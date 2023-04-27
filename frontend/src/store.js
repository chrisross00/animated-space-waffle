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
        }
    },
    actions: {
    }
});

export default store;