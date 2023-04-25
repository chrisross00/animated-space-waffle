<template>
    <div class="q-pa-md-page-padder p-3">
    <q-card class="my-card">
      <q-card-section horizontal>
        <q-card-section class="q-pt-xs">
          <div class="text-overline">Profile</div>
          <button v-show="!user" @click="signInWithGoogle">Sign in with Google</button>
          <button v-show="user" @click="signOut">Sign Out</button>
        </q-card-section>
      </q-card-section>
    </q-card>
    <div v-if="user">
      <p>ID: {{ user.uid }}</p>
      <p>Name: {{ user.displayName }}</p>
      <p>Email: {{ user.email }}</p>
      <p>Photo: <img :src="user.photoURL" alt="User photo"></p>
      <p>Session Id: {{ session ? session.documentId : '' }}</p>
    </div>

  </div>
</template>

<script>
import { auth, GoogleAuthProvider, firestore } from '@/firebase'
import store from '../store'

export default {
  data() {
    return {
      user: null,
      session: store.state.session ? store.state.session : null
    }
  },
  methods: {
    async signInWithGoogle() {
      try {        
        const result = await auth.signInWithPopup(GoogleAuthProvider)
        const { user } = result
        
        // store the userData to firebase.firestore()
        const userData = {
          uid: user.uid,
          refreshToken: user.refreshToken,
          email: user.email,
          createdAt: user.metadata.createdAt,
        }
        
        const docId = await firestore.collection('sessions').add(userData)
        console.log('Session data successfully saved!', docId.id)
        
        this.user = result.user
        
        const sessionData = {
          documentId: docId.id
        }
        store.commit('setSession', sessionData)
        this.session = await store.state.session
        console.log('auth object', auth)
      } catch (error) {
        console.log(error)
      }
    },
    // sign out should log out the user using firebase.auth().signOut() and clear the store state
    async signOut() {
      if(this.session.documentId){
        try {
          // update the collection('sessions') with the endAt timestamp
          await firestore.collection('sessions').doc(this.session.documentId).update({
            endAt: Date.now().toString()
          })
        } catch (error) {
          console.log(error)
          }
      }
      auth.signOut()
      .then(this.userData = null)
      .then(store.commit('clearState'))
      window.location.reload();
      // this.$router.push({ name: 'Profile' });
    }

  },
  async mounted() {
    try {
    // Check if the user is already signed in
    this.user = auth.currentUser
    console.log('mounted, current user is', this.user)
    } catch (err) {
      // console.log('external catch', err);
    }
  }
}
</script>