<template>
    <div class="q-pa-md-page-padder p-3">
    <q-card class="my-card">
      <q-card-section horizontal>
        <q-card-section class="q-pt-xs">
          <div class="text-overline">Profile</div>
          <button @click="signInWithGoogle">{{ user ? 'Sign out' : 'Sign in with Google' }}</button>
        </q-card-section>
      </q-card-section>
    </q-card>
    {{ message }}
    <div v-if="user">
      <p>ID: {{ user.uid }}</p>
      <p>Name: {{ user.displayName }}</p>
      <p>Email: {{ user.email }}</p>
      <p>Photo: <img :src="user.photoURL" alt="User photo"></p>
    </div>

  </div>
</template>

<script>
import { auth, GoogleAuthProvider } from '@/firebase'
// import routes from '@/routes'
// replace this with something else
// import axios from 'axios';

export default {
  data() {
    return {
      user: null,
    }
  },
  methods: {
    async signInWithGoogle() {
      if (this.user) {
        // If the user is already signed in, sign them out
        await auth.signOut()
        this.user = null
      } else {
        // If the user is not signed in, sign them in with Google
        try {
          const result = await auth.signInWithPopup(GoogleAuthProvider)
          this.user = result.user
          this.$router.push({
            name: 'BudgetView',
            params: {
              userId: this.user.uid,
            },
          })
        } catch (error) {
          console.log(error.message)
        }
      }
    }
  },
  async mounted() {
    try {
    // Check if the user is already signed in
    this.user = auth.currentUser
    } catch (err) {
      // console.log('external catch', err);
    }
  }
}
// google ID: 4N3HcPg0wEhJcBzACsSPw7b2idu2
</script>