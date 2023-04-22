import { firestore } from '@/firebase';

export default {
  state: {
    documentId: null,
    userData: null,
  },
  mutations: {
    setDocumentId(state, documentId) {
      state.documentId = documentId;
    },
    setUserData(state, userData) {
      state.userData = userData;
    },
  },
  actions: {
    async fetchUserData({ state, commit }) {
      try {
        const snapshot = await firestore.collection('sessions').doc(state.documentId).get();
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
