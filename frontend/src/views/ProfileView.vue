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

/* ---- Landing page ---- */

.basil-landing__hero {
  max-width: 600px;
  margin: 0 auto;
  padding: var(--basil-space-7) var(--basil-space-5) var(--basil-space-6);
  text-align: center;
}

.basil-landing__icon {
  width: 64px;
  height: 64px;
  border-radius: var(--basil-radius-lg);
  background: var(--basil-green-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--basil-space-6);
}

.basil-landing__headline {
  font-size: 2.125rem;
  font-weight: 400;
  line-height: 1.15;
  margin-bottom: var(--basil-space-4);
  color: var(--basil-text);
}

.basil-landing__sub {
  font-size: 1.0625rem;
  color: var(--basil-text-secondary);
  line-height: 1.6;
  max-width: 480px;
  margin: 0 auto var(--basil-space-6);
}

.basil-landing__cta {
  margin-bottom: var(--basil-space-2);
}

.basil-landing__props {
  max-width: 560px;
  margin: 0 auto;
  padding: 0 var(--basil-space-5) var(--basil-space-7);
}

.basil-landing__prop {
  display: flex;
  gap: var(--basil-space-4);
  padding: var(--basil-space-4) 0;
  border-top: 1px solid var(--basil-border);
}

.basil-landing__prop:last-child {
  border-bottom: 1px solid var(--basil-border);
}

.basil-landing__prop-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--basil-radius-md);
  background: var(--basil-surface-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.basil-landing__prop-title {
  font-weight: 600;
  font-size: 0.9375rem;
  margin-bottom: var(--basil-space-1);
  color: var(--basil-text);
}

.basil-landing__prop-desc {
  font-size: 0.875rem;
  color: var(--basil-text-secondary);
  line-height: 1.5;
}

.basil-landing__footer {
  text-align: center;
  padding: var(--basil-space-5);
  font-size: 0.8125rem;
}

.basil-landing__footer a {
  color: var(--basil-text-muted);
  text-decoration: none;
}

@media (max-width: 480px) {
  .basil-landing__hero {
    padding: var(--basil-space-6) var(--basil-space-4) var(--basil-space-5);
  }
  .basil-landing__headline {
    font-size: 1.875rem;
  }
  .basil-landing__props {
    padding: 0 var(--basil-space-4) var(--basil-space-6);
  }
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
        <BasilButton variant="flat" dense color="negative" label="Sign out" icon="logout" @click="signOut" class="q-mt-md" />
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
          <BasilButton
            variant="flat" dense
            color="negative"
            label="Delete"
            icon="delete_forever"
            :loading="isDeleting"
            @click="confirmDeleteAccount"
          />
        </div>
      </q-card>

    </div>

    <!-- Waitlist screen -->
    <div v-else-if="$store.state.waitlisted" class="basil-landing">
      <div class="basil-landing__hero">
        <div class="basil-landing__icon">
          <q-icon name="eco" size="32px" color="primary" />
        </div>
        <h1 class="basil-landing__headline basil-display">You're on the list.</h1>
        <p class="basil-landing__sub">
          Basil is currently in early access. We'll let you know when your account is ready.
        </p>
      </div>
    </div>

    <!-- Landing / login screen -->
    <div v-else class="basil-landing">
      <div class="basil-landing__hero">
        <div class="basil-landing__icon">
          <q-icon name="eco" size="32px" color="primary" />
        </div>
        <h1 class="basil-landing__headline basil-display">Know where your money goes.</h1>
        <p class="basil-landing__sub">
          Basil connects to your bank, sorts your transactions, and learns how you think about spending — so you don't have to do the same work twice.
        </p>
        <BasilButton
          icon="login"
          label="Sign in with Google"
          :loading="isLoading"
          class="basil-landing__cta"
          @click="signInWithGoogle"
        />
        <BasilButton
          v-if="isDevAuthBypassEnabled"
          label="Login as test user"
          :loading="isLoading"
          class="q-mt-sm"
          @click="devTestLogin"
        />
      </div>

      <div class="basil-landing__props">
        <div class="basil-landing__prop">
          <div class="basil-landing__prop-icon">
            <q-icon name="auto_fix_high" size="20px" color="primary" />
          </div>
          <div>
            <div class="basil-landing__prop-title">Categorize once, done forever.</div>
            <div class="basil-landing__prop-desc">Move a transaction to a category and Basil remembers. Every similar transaction — past and future — follows suit.</div>
          </div>
        </div>
        <div class="basil-landing__prop">
          <div class="basil-landing__prop-icon">
            <q-icon name="calendar_today" size="20px" color="primary" />
          </div>
          <div>
            <div class="basil-landing__prop-title">See the month as it unfolds.</div>
            <div class="basil-landing__prop-desc">Track spending by category, spot what's left, and catch surprises before they compound.</div>
          </div>
        </div>
        <div class="basil-landing__prop">
          <div class="basil-landing__prop-icon">
            <q-icon name="show_chart" size="20px" color="primary" />
          </div>
          <div>
            <div class="basil-landing__prop-title">Months of context, not just a snapshot.</div>
            <div class="basil-landing__prop-desc">Spending patterns, cash flow, savings rate — watch the shape of your finances over time.</div>
          </div>
        </div>
        <div class="basil-landing__prop">
          <div class="basil-landing__prop-icon">
            <q-icon name="lock" size="20px" color="primary" />
          </div>
          <div>
            <div class="basil-landing__prop-title">Your data stays yours.</div>
            <div class="basil-landing__prop-desc">No third-party cloud. No data selling. Your financial life lives on infrastructure you can trust.</div>
          </div>
        </div>
      </div>

      <div class="basil-landing__footer">
        <router-link to="/privacy">Privacy Policy</router-link>
      </div>
    </div>

    <BasilConfirmTray
      v-model="deleteAccountDialog"
      title="Delete your account?"
      message="This will permanently delete all your transactions, categories, rules, and linked accounts. This cannot be undone."
      ok-label="Delete everything"
      ok-color="negative"
      cancel-label="Cancel"
      persistent
      :loading="isDeleting"
      @confirm="executeDeleteAccount"
    />

  </div>
</template>

<script>
import { getOrAddUser, fetchCategories, fetchMonthRange, deleteAccount, signOut as apiSignOut } from '@/api'
import EmptyState from '../components/EmptyState.vue';
import BasilConfirmTray from '../components/BasilConfirmTray.vue';
import store from '../store'


export default {
  components: {
    EmptyState,
    BasilConfirmTray,
  },
  data() {
    return {
      isLoading: false,
      isDeleting: false,
      deleteAccountDialog: false,
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
        this.$router.push('/budget');
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
      this.deleteAccountDialog = true;
    },
    async executeDeleteAccount() {
      this.isDeleting = true;
      try {
        const result = await deleteAccount();
        if (result) {
          this.deleteAccountDialog = false;
          this.signOut();
        }
      } catch (error) {
        console.error('Delete account error:', error);
      } finally {
        this.isDeleting = false;
      }
    },
    signOut() {
      apiSignOut();
      store.commit('clearState');
      window.location.reload();
    },
  },
}
</script>