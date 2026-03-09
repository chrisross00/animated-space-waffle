<template>
  <q-page padding>
    <div class="admin-page">

      <!-- Personas: seed test users -->
      <div class="admin-section">
        <div class="admin-section-header">
          <h6 class="admin-section-title">Seed Test Users</h6>
          <q-btn
            flat dense
            label="Seed All"
            icon="play_arrow"
            color="primary"
            :loading="seedingAll"
            @click="seedAll"
          />
        </div>

        <div class="admin-persona-grid">
          <q-card v-for="p in personas" :key="p.name" flat bordered class="admin-persona-card">
            <q-card-section>
              <div class="admin-persona-name">{{ p.name }}</div>
              <div class="admin-persona-uid">{{ p.uid }}</div>
            </q-card-section>
            <q-card-actions>
              <q-btn
                flat dense
                label="Seed"
                icon="add_circle"
                color="primary"
                :loading="seeding[p.name]"
                @click="seedOne(p.name)"
              />
              <q-btn
                flat dense
                label="Login As"
                icon="open_in_new"
                color="secondary"
                :disable="!seededUsers.find(u => u.userId === p.uid)"
                @click="loginAs(p.uid)"
              />
            </q-card-actions>
            <q-card-section v-if="seedResults[p.name]" class="admin-seed-result">
              <div v-for="(val, key) in seedResults[p.name].counts" :key="key" class="admin-seed-stat">
                <span class="admin-seed-stat-label">{{ key }}</span>
                <span class="admin-seed-stat-value">{{ val }}</span>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Seeded test users in DB -->
      <div class="admin-section">
        <div class="admin-section-header">
          <h6 class="admin-section-title">Seeded Test Users</h6>
          <q-btn
            flat dense
            icon="refresh"
            @click="loadTestUsers"
            :loading="loadingUsers"
          />
        </div>

        <div v-if="seededUsers.length === 0 && !loadingUsers" class="admin-empty">
          No test users in database. Seed a persona above.
        </div>

        <q-list v-else bordered separator class="admin-user-list">
          <q-item v-for="u in seededUsers" :key="u.userId">
            <q-item-section>
              <q-item-label>{{ u.name }}</q-item-label>
              <q-item-label caption>{{ u.userId }} &middot; {{ u.email }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn
                flat dense
                label="Login As"
                icon="open_in_new"
                size="sm"
                @click="loginAs(u.userId)"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </div>

      <!-- Nuke -->
      <div class="admin-section">
        <div class="admin-section-header">
          <h6 class="admin-section-title">Danger Zone</h6>
        </div>
        <q-card flat bordered class="admin-danger-card">
          <q-card-section>
            <p class="admin-danger-text">
              Delete all test user data (users with <code>isTestUser: true</code>).
              This cannot be undone.
            </p>
          </q-card-section>
          <q-card-actions>
            <q-btn
              flat dense
              label="Dry Run"
              icon="preview"
              @click="nukeUsers(true)"
              :loading="nuking"
            />
            <q-btn
              flat dense
              label="Nuke All Test Users"
              icon="delete_forever"
              color="negative"
              @click="confirmNuke"
              :loading="nuking"
            />
          </q-card-actions>
          <q-card-section v-if="nukeResult" class="admin-seed-result">
            <div class="admin-nuke-label">{{ nukeResult.dryRun ? 'Would delete:' : 'Deleted:' }}</div>
            <div v-for="(val, key) in (nukeResult.wouldDelete || nukeResult.deleted)" :key="key" class="admin-seed-stat">
              <span class="admin-seed-stat-label">{{ key }}</span>
              <span class="admin-seed-stat-value">{{ val }}</span>
            </div>
          </q-card-section>
        </q-card>
      </div>

    </div>
  </q-page>
</template>

<script>
import { Notify } from 'quasar';
import { getPersonas, getTestUsers, seedTestUser, nukeTestUsers } from '../api';

export default {
  data() {
    return {
      personas: [],
      seededUsers: [],
      loadingUsers: false,
      seeding: {},
      seedingAll: false,
      seedResults: {},
      nuking: false,
      nukeResult: null,
    };
  },
  async mounted() {
    try {
      this.personas = await getPersonas();
    } catch (err) {
      Notify.create({ type: 'negative', message: `Failed to load personas: ${err.message}` });
    }
    this.loadTestUsers();
  },
  methods: {
    async loadTestUsers() {
      this.loadingUsers = true;
      try {
        this.seededUsers = await getTestUsers();
      } catch (err) {
        Notify.create({ type: 'negative', message: `Failed to load test users: ${err.message}` });
      } finally {
        this.loadingUsers = false;
      }
    },

    async seedOne(name) {
      this.seeding = { ...this.seeding, [name]: true };
      try {
        const result = await seedTestUser(name);
        this.seedResults = { ...this.seedResults, [name]: result };
        Notify.create({ type: 'positive', message: `Seeded "${name}"` });
        this.loadTestUsers();
      } catch (err) {
        Notify.create({ type: 'negative', message: `Failed to seed "${name}": ${err.message}` });
      } finally {
        this.seeding = { ...this.seeding, [name]: false };
      }
    },

    async seedAll() {
      this.seedingAll = true;
      try {
        const result = await seedTestUser('all');
        for (const r of result.results) {
          this.seedResults = { ...this.seedResults, [r.persona]: r };
        }
        Notify.create({ type: 'positive', message: `Seeded all ${result.results.length} personas` });
        this.loadTestUsers();
      } catch (err) {
        Notify.create({ type: 'negative', message: `Failed to seed all: ${err.message}` });
      } finally {
        this.seedingAll = false;
      }
    },

    async nukeUsers(dryRun = false) {
      this.nuking = true;
      this.nukeResult = null;
      try {
        const result = await nukeTestUsers({ dryRun });
        this.nukeResult = { ...result, dryRun };
        if (!dryRun) {
          Notify.create({ type: 'positive', message: 'All test user data deleted' });
          this.loadTestUsers();
          this.seedResults = {};
        }
      } catch (err) {
        Notify.create({ type: 'negative', message: `Nuke failed: ${err.message}` });
      } finally {
        this.nuking = false;
      }
    },

    confirmNuke() {
      if (confirm('Delete ALL test user data? This cannot be undone.')) {
        this.nukeUsers(false);
      }
    },

    loginAs(uid) {
      // Phase 4: proper token handoff. For now, show instructions.
      Notify.create({
        type: 'info',
        timeout: 10000,
        message: `Set DEV_AUTH_BYPASS_UID=${uid} in .env and restart the backend, then login via the main app.`,
      });
    },
  },
};
</script>

<style>
.admin-page {
  max-width: 800px;
  margin: 0 auto;
}
.admin-section {
  margin-bottom: 32px;
}
.admin-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.admin-section-title {
  margin: 0;
  font-weight: 600;
  font-size: 16px;
}
.admin-persona-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.admin-persona-card {
  border-radius: 8px;
}
.admin-persona-name {
  font-weight: 600;
  font-size: 15px;
  text-transform: capitalize;
}
.admin-persona-uid {
  font-size: 12px;
  color: #888;
  font-family: monospace;
}
.admin-seed-result {
  padding-top: 0;
}
.admin-seed-stat {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 2px 0;
}
.admin-seed-stat-label {
  color: #666;
  text-transform: capitalize;
}
.admin-seed-stat-value {
  font-weight: 600;
  font-family: monospace;
}
.admin-user-list {
  border-radius: 8px;
}
.admin-empty {
  color: #888;
  font-size: 14px;
  padding: 16px 0;
}
.admin-danger-card {
  border-color: #ef9a9a;
  border-radius: 8px;
}
.admin-danger-text {
  margin: 0;
  font-size: 14px;
  color: #666;
}
.admin-nuke-label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}
</style>
