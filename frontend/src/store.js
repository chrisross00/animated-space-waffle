import { createStore } from 'vuex';
import createPersistedState from 'vuex-persistedstate';
import { firestore } from '@/firebase';

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
        },
        setSession(state, session) {
            state.session = session;
        }
    },
    actions: {
        async fetchUserData({state}){
        try {
            const userData = await firestore.collection('sessions').doc(state.session.sessionId).get();
            // console.log('fetchUserData ', userData.data());
            // store.commit('setUser', userData.data()) // is this necessary? Do I actually want it in the store? Or can i just keep it in session and if I lose it, use the sessionId to get it again?
            return userData.data();
        } catch (error) {
            console.log(error);
        }
        }
    }
});

export default store;