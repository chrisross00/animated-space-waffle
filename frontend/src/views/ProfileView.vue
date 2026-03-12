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

      <!-- Danger zone card -->
      <q-card class="my-card profile-card basil-profile-card">
        <div class="basil-card-head">
          <span class="basil-card-label">Danger zone</span>
        </div>
        <div class="basil-settings-row">
          <div>
            <div class="basil-settings-row__label">Delete account</div>
            <div class="basil-settings-row__hint">Permanently remove all your data</div>
          </div>
          <q-btn
            flat dense
            color="negative"
            label="Delete"
            icon="delete_forever"
            :loading="isDeleting"
            @click="confirmDeleteAccount"
          />
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
import { getOrAddUser, fetchCategories, fetchMonthRange, deleteAccount, signOut as apiSignOut } from '@/api'
import EmptyState from '../components/EmptyState.vue';
import store from '../store'


export default {
  components: {
    EmptyState,
  },
  data() {
    return {
      isLoading: false,
      isDeleting: false,
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
        this.$router.push('/');
      } catch (error) {
        console.error('devTestLogin error:', error);
        this.isLoading = false;
      }
    },
    signInWithGoogle() {
      this.isLoading = true;
      // Redirect to backend OAuth endpoint — Google handles the rest
      window.location.href = '/auth/google';
    },
    confirmDeleteAccount() {
      this.$q.dialog({
        title: 'Delete your account?',
        message: 'This will permanently delete all your transactions, categories, rules, and linked accounts. This cannot be undone.',
        cancel: { flat: true, label: 'Cancel' },
        ok: { color: 'negative', unelevated: true, label: 'Delete everything' },
        persistent: true,
      }).onOk(async () => {
        this.isDeleting = true;
        try {
          const result = await deleteAccount();
          if (result) {
            this.signOut();
          }
        } catch (error) {
          console.error('Delete account error:', error);
        } finally {
          this.isDeleting = false;
        }
      });
    },
    signOut() {
      apiSignOut();
      store.commit('clearState');
      window.location.reload();
    },
  },
}
</script>