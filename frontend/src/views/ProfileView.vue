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

    <!-- Skeleton cards while data is bootstrapping or auth state is resolving -->
    <div v-if="$store.state.bootstrapping || (session && !user)" class="basil-profile-layout">
      <q-card class="my-card profile-card basil-profile-card">
        <div class="basil-card-head"><span class="basil-card-label">Profile</span></div>
        <div class="basil-profile-identity">
          <q-skeleton type="QAvatar" size="56px" />
          <div style="flex: 1">
            <q-skeleton type="text" width="55%" />
            <q-skeleton type="text" width="40%" />
          </div>
        </div>
      </q-card>
    </div>

    <!-- Real content once loaded -->
    <div v-else-if="session !== null && user" class="basil-profile-layout">

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

    </div>

    <!-- Login screen — only when definitively not signed in -->
    <div v-else>
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
        <q-btn
          v-if="isDevAuthBypassEnabled"
          unelevated
          color="secondary"
          label="Login as test user"
          :loading="isLoading"
          class="q-mt-sm q-ml-sm"
          @click="devTestLogin"
        />
      </EmptyState>
    </div>

  </div>
</template>

<script>
import { auth, GoogleAuthProvider, firestore, getOrAddUser, fetchCategories, fetchMonthRange } from '@/firebase'
import { getAuth, setPersistence, browserSessionPersistence } from '@firebase/auth'
import EmptyState from '../components/EmptyState.vue';
import store from '../store'


export default {
  components: {
    EmptyState,
  },
  data() {
    return {
      isLoading: false,
    }
  },
  computed: {
    user() {
      return this.$store.state.user;
    },
    session() {
      return this.$store.state.session;
    },
    isDark() {
      return this.$store.state.theme === 'dark';
    },
    isDevAuthBypassEnabled() {
      return import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';
    },
  },
  methods: {
    toggleTheme() {
      this.$store.commit('setTheme', this.isDark ? '' : 'dark');
    },
    async devTestLogin() {
      this.isLoading = true;
      try {
        const user = await getOrAddUser();
        store.commit('setUser', user);
        store.commit('setSession', { isSessionActive: true });

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
        await Promise.all([
          fetchCategories().then(c => { if (c?.length) store.commit('setCategories', c); }),
          fetchMonthRange(store, startMonth, currentMonth),
        ]);

        this.isLoading = false;
      } catch (error) {
        console.error('devTestLogin error:', error);
        this.isLoading = false;
      }
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
          const appUser = await getOrAddUser()
          store.commit('setUser', appUser)
        } catch (error) {
          console.log(error)
        }
        // load categories so we can detect returning users who skipped Plaid
        try {
          const categories = await fetchCategories()
          if (categories?.length) store.commit('setCategories', categories)
        } catch (error) {
          console.log(error)
        }
        this.isLoading = false;
        if (!this.user?.onboarded_at) {
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
      if(this.session?.docId){
        try {
          await firestore.collection('sessions').doc(this.session.docId).update({
            endAt: Date.now().toString()
          })
        } catch (error) {
          console.log(error)
          }
      }
      sessionStorage.removeItem('impersonate-token');
      await auth.signOut();
      store.commit('clearState');
      window.location.reload();
      // this.$router.push({ name: 'Profile' });
    }

  },
}
</script>