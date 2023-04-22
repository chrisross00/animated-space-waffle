import { firestore } from '@/firebase';

export default {
  state: {
    sessionId: null,
    userData: null,
  },
  mutations: {
    setSessionId(state, sessionId) {
      state.sessionId = sessionId;
    },
    setUserData(state, userData) {
      state.userData = userData;
    },
  },
  actions: {
    async fetchUserData({ state, commit }) {
      try {
        const snapshot = await firestore.collection('sessions').doc(state.sessionId).get();
        if (snapshot.exists()) {
          const userData = snapshot.data();
          commit('setUserData', userData);
        }
      } catch (error) {
        console.log(error);
      }
    },
  },
};
