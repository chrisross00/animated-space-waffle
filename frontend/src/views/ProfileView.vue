<style>
.basil-profile-layout {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1rem;
}

.profile-card {
  width: 100%;
  max-width: 400px;
}

.basil-profile-card {
  padding: var(--basil-space-5) !important;
}

/* ---- Identity row ---- */
.basil-profile-identity {
  display: flex;
  align-items: center;
  gap: var(--basil-space-4);
  margin-bottom: var(--basil-space-2);
}

.basil-profile-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid var(--basil-border);
  object-fit: cover;
  flex-shrink: 0;
}

.basil-profile-avatar--placeholder {
  background-color: var(--basil-surface-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--basil-text-muted);
}

.basil-profile-name {
  font-size: 1.25rem;
  color: var(--basil-text);
  line-height: 1.2;
}

.basil-profile-email {
  font-size: 0.875rem;
  color: var(--basil-text-muted);
  margin-top: 2px;
}

/* ---- Account list ---- */
.basil-account-item {
  padding-left: 0;
  padding-right: 0;
}

/* ---- Settings row ---- */
.basil-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--basil-space-4);
}

.basil-settings-row__label {
  font-size: 0.9375rem;
  color: var(--basil-text);
  font-weight: 500;
}

.basil-settings-row__hint {
  font-size: 0.8125rem;
  color: var(--basil-text-muted);
  margin-top: 2px;
}
</style>

<template>
  <div class="q-pa-md-page-padder p-3">
    <SpinnerComponent :isLoading="isLoading"/>
    <div v-if="session !== null && user" class="basil-profile-layout">

      <!-- Profile card -->
      <q-card class="my-card profile-card basil-profile-card">
        <div class="basil-card-head">
          <span class="basil-card-label">Profile</span>
        </div>
        <div class="basil-profile-identity">
          <img v-if="user.picture" :src="user.picture" alt="User photo" class="basil-profile-avatar" />
          <div v-else class="basil-profile-avatar basil-profile-avatar--placeholder">
            <q-icon name="person" size="2rem" />
          </div>
          <div class="basil-profile-info">
            <div class="basil-profile-name basil-display">{{ user.name }}</div>
            <div class="basil-profile-email">{{ user.email }}</div>
          </div>
        </div>
        <q-btn flat dense color="negative" label="Sign out" icon="logout" @click="signOut" class="q-mt-md" />
      </q-card>

      <!-- Display settings card -->
      <q-card class="my-card profile-card basil-profile-card">
        <div class="basil-card-head">
          <span class="basil-card-label">Display</span>
        </div>
        <div class="basil-settings-row">
          <div>
            <div class="basil-settings-row__label">Dark mode</div>
            <div class="basil-settings-row__hint">Terminal theme with emerald accents</div>
          </div>
          <q-toggle :model-value="isDark" color="primary" @update:model-value="toggleTheme" />
        </div>
      </q-card>

      <!-- Linked Accounts card -->
      <q-card class="my-card profile-card basil-profile-card">
        <div class="basil-card-head">
          <span class="basil-card-label">Linked Accounts</span>
        </div>

        <EmptyState
          v-if="!user.accounts || user.accounts.length === 0"
          icon="account_balance"
          heading="No accounts linked"
          body="Connect a bank account to start importing your transactions."
        />

        <q-list v-else separator>
          <q-item v-for="account in user.accounts" :key="account" class="basil-account-item">
            <q-item-section avatar>
              <q-icon name="account_balance" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ account }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <template v-if="!preDelete[account]">
                <q-btn flat round dense icon="delete" color="negative" size="sm"
                  @click.stop="preDeleteAccount(account)" />
              </template>
              <template v-else>
                <div class="row q-gutter-xs">
                  <q-btn flat round dense icon="check" color="positive" size="sm"
                    @click.stop="deleteAccount(account)" />
                  <q-btn flat round dense icon="close" color="negative" size="sm"
                    @click.stop="cancelPreDeleteAccount(account)" />
                </div>
              </template>
            </q-item-section>
          </q-item>
        </q-list>

        <div class="q-mt-md">
          <q-btn unelevated color="primary" icon="add" label="Add account"
            @click="handleAddNewAccountClick" />
          <PlaidLinkHandler v-if="showPlaidLink" @onPlaidSuccess="handlePlaidSuccess" />
        </div>
      </q-card>

    </div>

    <div v-if="session == null || !user">
      <EmptyState
        icon="lock_open"
        heading="Welcome to Basil"
        body="Track your spending, set budgets, and understand your finances. Sign in to get started."
      >
        <q-btn
          unelevated
          color="primary"
          label="Sign in with Google"
          :loading="isLoading"
          class="q-mt-sm"
          @click="signInWithGoogle"
        />
      </EmptyState>
    </div>
      
  </div>
</template>

<script>
import { auth, GoogleAuthProvider, firestore, getOrAddUser, removeAccount, fetchTransactions } from '@/firebase'
import { getAuth, setPersistence, browserSessionPersistence } from '@firebase/auth'
import SpinnerComponent from '../components/SpinnerComponent.vue'
import PlaidLinkHandler from '../components/PlaidLinkHandler.vue';
import EmptyState from '../components/EmptyState.vue';
import store from '../store'


export default {
  components: {
    SpinnerComponent,
    PlaidLinkHandler,
    EmptyState,
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
  computed: {
    isDark() {
      return this.$store.state.theme === 'dark';
    },
  },
  methods: {
    toggleTheme() {
      this.$store.commit('setTheme', this.isDark ? '' : 'dark');
    },
    preDeleteAccount(account){
      // set preDelete to true
    this.preDelete[account] = true;
    },
    cancelPreDeleteAccount(account) {
      // account.preDelete = false;
      this.preDelete[account] = false;
    },
    async deleteAccount(account) {
      try {
        await removeAccount(account);
        this.user = { ...this.user, accounts: this.user.accounts.filter(a => a !== account) };
        store.commit('setUser', this.user);
      } catch (error) {
        console.error('deleteAccount error:', error);
      }
      this.cancelPreDeleteAccount(account);
    },
    handleAddNewAccountClick() {
      this.showPlaidLink = true;
    },
    async handlePlaidSuccess() {
      this.isLoading = true;
      try {
        const response = await getOrAddUser();
        this.user = response;
        store.commit('setUser', this.user);
      } catch (error) {
        console.error('handlePlaidSuccess: getOrAddUser error:', error);
      }
      try {
        const result = await fetchTransactions();
        if (result?.transactions) {
          store.commit('setTransactions', result.transactions);
        }
      } catch (error) {
        console.error('handlePlaidSuccess: fetchTransactions error:', error);
      }
      this.isLoading = false;
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
        if (!this.user?.accounts?.length) {
          this.$router.push('/onboarding');
          return;
        }
        store.commit("setLastPlaidFetch", null) // set last plaid fetch to 0 since new login
      } catch (error) {
        console.log(error)
        this.isLoading = false;
      }
    },
    // sign out should log out the user using firebase.auth().signOut() and clear the store state
    async signOut() {
      if(this.session.docId){
        try {
          // update the collection('sessions') with the endAt timestamp
          await firestore.collection('sessions').doc(this.session.docId).update({
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

          // Restore session display if it was cleared (e.g. after a data nuke)
          // Firebase confirms the user is authenticated, so session should be truthy
          if (!this.session) {
            const stored = store.state.session;
            this.session = stored || { isSessionActive: true };
            if (!stored) store.commit('setSession', this.session);
          }
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