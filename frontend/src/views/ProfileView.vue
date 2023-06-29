<style>
.icon-hover-neg:hover {
  color: red;
}
.icon-hover-pos:hover {
  color: green;
}
.profile-card {
  width: 100%;
  min-width: 400px;
  max-width: 400px;
  margin: 1rem;
}
.connectedAccounts {
  display: flex;
  flex-direction: column;
  width: calc(66.33% - 2px);
}

.profile-card-item {
  flex: 1;
  margin: 10px;
}

</style>

<template>
  <div class="q-pa-md-page-padder p-3">
    <SpinnerComponent :isLoading="isLoading"/>
    <div v-if="session !== null">
      <q-card class="my-card profile-card ">
        <q-card-section horizontal>
          <q-card-section class="q-pt-xs">
            <div class="text-overline">Profile</div>
              <p><img :src="user.picture" alt="User photo"></p>
              <p>Name: {{ user.name }}</p>
              <p>Email: {{ user.email }}</p>
            <q-btn v-show="user" @click="signOut">Sign Out</q-btn>
          </q-card-section>
        </q-card-section>
      </q-card>
      
        <q-card class="my-card profile-card ">
            <q-card-section class="q-pt-xs">       
              <div class="text-overline">Linked Accounts</div>
              <div class="connectedAccounts" v-if="user.accounts !== null">
                <q-item class="profile-card-item" v-for="account in user.accounts" :key="account.id" 
                        clickable v-ripple>
                  <q-item-section>
                    {{ account }}
                  </q-item-section>

                  <q-item-section side>
                    <template v-if="!preDelete[account]">
                      <q-icon 
                        key="account.id"
                        style="font-size: 16px;"
                        name="delete"
                        class="icon-hover-neg"
                        @click="preDeleteAccount(account)"
                      />
                    </template>
                    <template v-else>
                      <div style="display: flex;">
                        <q-icon name="check" class="icon-hover-pos" style="font-size: 16px;" @click="deleteAccount(account)" />
                        <q-icon name="close" class="icon-hover-neg" style="font-size: 16px;" @click="cancelPreDeleteAccount(account)" />
                      </div>
                    </template>
                  </q-item-section>

                </q-item>
              </div>
              <div class="addAccount">
                <div>
                  <q-btn @click="handleAddNewAccountClick">Add new account</q-btn>
                  <PlaidLinkHandler v-if="showPlaidLink" @onPlaidSuccess="handlePlaidSuccess" />
                </div>
              </div>
            </q-card-section>
        </q-card>
    </div>

    <div v-if="session == null">
      <q-card class="my-card profile-card ">
      <q-card-section horizontal>
        <q-card-section class="q-pt-xs">       
          <q-btn v-show="!user" @click="signInWithGoogle">Sign in with Google</q-btn>
          </q-card-section>
        </q-card-section>
      </q-card>
    </div>
      
  </div>
</template>

<script>
import { auth, GoogleAuthProvider, firestore, getOrAddUser,  } from '@/firebase'
import { getAuth, setPersistence, browserSessionPersistence } from '@firebase/auth'
import SpinnerComponent from '../components/SpinnerComponent.vue'
import PlaidLinkHandler from '../components/PlaidLinkHandler.vue';
import store from '../store'


export default {
  components: {
    SpinnerComponent,
    PlaidLinkHandler
},
  data() {
    return {
      user: store.state.user ? store.state.user : null,
      session: store.state.session ? store.state.session : null,
      isLoading: false,
      showPlaidLink: false,
      preDelete: {}
    }
  },
  methods: {
    preDeleteAccount(account){
      // set preDelete to true
    this.preDelete[account] = true;
    },
    cancelPreDeleteAccount(account) {
      // account.preDelete = false;
      this.preDelete[account] = false;
    },
    deleteAccount(account){
      console.log('deleting account...', account);
      this.cancelPreDeleteAccount(account)
    },
    handleAddNewAccountClick() {
      this.showPlaidLink = true;
    },
    handlePlaidSuccess(publicToken, metadata) {
      console.log('Public token:', publicToken);
      console.log('Metadata:', metadata);
      this.showPlaidLink = false;
    },
    async signInWithGoogle() {
      this.isLoading = true;
      try {
        // try to set Persistence
        try {
          await setPersistence(auth, browserSessionPersistence);
        } catch (error) {
          console.log('Error setting persistence', error)
        }

        const result = await auth.signInWithPopup(GoogleAuthProvider)
        const { user } = result
        
        // store the userData to firebase.firestore()
        try {
          const userData = {
            uid: user.uid,
            refreshToken: user.refreshToken,
            email: user.email,
            createdAt: user.metadata.createdAt,
          }
          const docId = await firestore.collection('sessions').add(userData)
          console.log('Session data successfully saved to firestore!', docId.id)

          // after the session is saved to firestore, store the user in the store
          const sessionData = {
            docId: docId.id,
            isSessionActive: true,
          }
          store.commit('setSession', sessionData)    
        } catch (error) {
          console.log('Error saving session data to firestore!', error)
        }
          
        // check if user exists in mongodb. If it does add it to the store
        try {
          const response = await getOrAddUser()
          this.user = response
          store.commit('setUser', this.user)
        } catch (error) {
          console.log(error)
        }
        this.session = await store.state.session
        this.isLoading = false;
        store.commit("setLastPlaidFetch", null) // set last plaid fetch to 0 since new login
      } catch (error) {
        console.log(error)
      }
    },
    // sign out should log out the user using firebase.auth().signOut() and clear the store state
    async signOut() {
      if(this.session.docId){
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
      .then(store.commit('clearState'))
      .then(this.userData = null)
      window.location.reload();
      // this.$router.push({ name: 'Profile' });
    }

  },
  async mounted() {
    const auth1 = getAuth()
    try {
      this.user = store.state.user
      auth.onAuthStateChanged(async (user) => {
        if (user) {
          console.log("User signed in:", user);
          console.log('mounting, auth1.currentUser', auth1.currentUser)
          
          // Your logic to handle the signed-in user
          const response = await getOrAddUser();
          this.user = response;
          console.log("this.user", this.user);
          console.log("store.state", store.state);
          
          // Update the Vuex store
          store.commit("setUser", this.user);
      } else {
        console.log("User signed out");
        return;
      }
    });
    } catch (err) {
      // console.log('external catch', err);
    }
  }
}
</script>