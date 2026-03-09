<template>
  <q-page padding>
    <div class="admin-page">

      <!-- User picker -->
      <div class="admin-section">
        <div class="admin-section-header">
          <h6 class="admin-section-title">Target User</h6>
          <q-btn
            flat dense
            icon="refresh"
            @click="loadUsers"
            :loading="loadingUsers"
          />
        </div>
        <q-select
          v-model="selectedUser"
          :options="userOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          outlined
          dense
          clearable
          label="Select a user before running tools"
          class="admin-user-picker"
          :loading="loadingUsers"
        />
      </div>

      <!-- Data Maintenance -->
      <div class="admin-section">
        <div class="admin-section-header">
          <h6 class="admin-section-title">Data Maintenance</h6>
        </div>
        <div class="admin-tool-list">
          <div v-for="tool in maintenanceTools" :key="tool.key" class="admin-tool-row">
            <div class="admin-tool-info">
              <div class="admin-tool-name">{{ tool.label }}</div>
              <div class="admin-tool-desc">{{ tool.description }}</div>
            </div>
            <q-btn
              flat dense
              :label="tool.label"
              :icon="tool.icon"
              color="primary"
              :loading="running[tool.key]"
              :disable="noTarget"
              @click="runTool(tool)"
            />
            <div v-if="results[tool.key]" class="admin-tool-result">
              <pre>{{ results[tool.key] }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Test Data -->
      <div class="admin-section">
        <div class="admin-section-header">
          <h6 class="admin-section-title">Test Data</h6>
        </div>
        <div class="admin-tool-list">
          <div v-for="tool in testDataTools" :key="tool.key" class="admin-tool-row">
            <div class="admin-tool-info">
              <div class="admin-tool-name">{{ tool.label }}</div>
              <div class="admin-tool-desc">{{ tool.description }}</div>
            </div>
            <q-btn
              flat dense
              :label="tool.label"
              :icon="tool.icon"
              color="primary"
              :loading="running[tool.key]"
              :disable="noTarget"
              @click="runTool(tool)"
            />
            <div v-if="results[tool.key]" class="admin-tool-result">
              <pre>{{ results[tool.key] }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="admin-section">
        <div class="admin-section-header">
          <h6 class="admin-section-title">Danger Zone</h6>
        </div>
        <q-card flat bordered class="admin-danger-card">
          <q-card-section class="admin-tool-list">
            <div v-for="tool in dangerTools" :key="tool.key" class="admin-tool-row">
              <div class="admin-tool-info">
                <div class="admin-tool-name">{{ tool.label }}</div>
                <div class="admin-tool-desc">{{ tool.description }}</div>
              </div>
              <q-btn
                flat dense
                :label="tool.label"
                :icon="tool.icon"
                color="negative"
                :loading="running[tool.key]"
                :disable="noTarget"
                @click="runDangerTool(tool)"
              />
              <div v-if="results[tool.key]" class="admin-tool-result">
                <pre>{{ results[tool.key] }}</pre>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

    </div>
  </q-page>
</template>

<script>
import { Notify } from 'quasar';
import {
  fetchUsers,
  addPlaidPfc,
  seedCategories,
  mapUnmapped,
  dedupe,
  cleanPending,
  addVenmoTransactions,
  addTestTransactions,
  resetBalanceSnapshots,
  clearVenmoEnrichment,
  clearManualOverrides,
  nukeTransactions,
  nukeAllData,
} from '../api';

const SELF_OPTION = { label: 'Self (my account)', value: '__self__' };

export default {
  data() {
    return {
      users: [],
      selectedUser: null,
      loadingUsers: false,
      running: {},
      results: {},

      maintenanceTools: [
        { key: 'addPlaidPfc', label: 'Add Plaid PFC', icon: 'category', fn: addPlaidPfc,
          description: 'Backfills Plaid personal_finance_category mappings onto your existing categories.' },
        { key: 'seedCategories', label: 'Seed Categories', icon: 'playlist_add', fn: seedCategories,
          description: 'Creates a default set of categories. No-ops if categories already exist.' },
        { key: 'mapUnmapped', label: 'Map Unmapped', icon: 'auto_fix_high', fn: mapUnmapped,
          description: 'Re-runs categorization rules against any transactions that are missing a category.' },
        { key: 'dedupe', label: 'Dedupe', icon: 'filter_alt', fn: dedupe,
          description: 'Removes duplicate transactions from your account.' },
        { key: 'cleanPending', label: 'Clean Pending', icon: 'cleaning_services', fn: cleanPending,
          description: 'Removes pending transactions that have since posted.' },
      ],

      testDataTools: [
        { key: 'addTestTxns', label: 'Add Test Transactions', icon: 'science', fn: addTestTransactions,
          description: 'Inserts 14 realistic synthetic transactions dated today (groceries, transport, income, etc.).' },
        { key: 'addVenmoTxns', label: 'Add Venmo Transactions', icon: 'payments', fn: addVenmoTransactions,
          description: 'Inserts 5 historical Venmo transactions (categorized, to seed the suggestion engine) + 5 current-month Venmo/Cash App transactions in To Sort.' },
      ],

      dangerTools: [
        { key: 'clearOverrides', label: 'Clear Overrides', icon: 'rule', fn: clearManualOverrides,
          description: 'Removes the manually_set flag from all transactions, allowing rules to re-categorize them.' },
        { key: 'clearVenmo', label: 'Clear Venmo Import', icon: 'delete_sweep', fn: clearVenmoEnrichment,
          description: 'Removes imported Venmo details (names, notes) from all transactions so you can re-upload a CSV.' },
        { key: 'resetSnapshots', label: 'Reset Snapshots', icon: 'restart_alt', fn: resetBalanceSnapshots,
          description: 'Clears all stored net worth snapshots. Refresh balances to regenerate.' },
        { key: 'nukeTxns', label: 'Nuke Transactions', icon: 'delete_forever', fn: nukeTransactions,
          description: 'Permanently deletes ALL transactions for the target user. Irreversible.' },
        { key: 'nukeAll', label: 'Nuke All Data', icon: 'dangerous', fn: nukeAllData,
          description: 'Permanently deletes ALL transactions, categories, rules, and linked accounts. Irreversible.' },
      ],
    };
  },

  computed: {
    noTarget() {
      return this.selectedUser == null;
    },
    targetUserId() {
      return this.selectedUser === '__self__' ? null : this.selectedUser;
    },
    userOptions() {
      const opts = [SELF_OPTION];
      for (const u of this.users) {
        opts.push({
          label: `${u.name || u.email} (${u.email})`,
          value: u.userId,
        });
      }
      return opts;
    },
  },

  mounted() {
    this.loadUsers();
  },

  methods: {
    async loadUsers() {
      this.loadingUsers = true;
      try {
        this.users = await fetchUsers();
      } catch (err) {
        Notify.create({ type: 'negative', message: `Failed to load users: ${err.message}` });
      } finally {
        this.loadingUsers = false;
      }
    },

    async runTool(tool) {
      this.running = { ...this.running, [tool.key]: true };
      this.results = { ...this.results, [tool.key]: null };
      try {
        const result = await tool.fn(this.targetUserId);
        this.results = { ...this.results, [tool.key]: JSON.stringify(result, null, 2) };
        Notify.create({ type: 'positive', message: `${tool.label} completed` });
      } catch (err) {
        this.results = { ...this.results, [tool.key]: `Error: ${err.message}` };
        Notify.create({ type: 'negative', message: `${tool.label} failed: ${err.message}` });
      } finally {
        this.running = { ...this.running, [tool.key]: false };
      }
    },

    runDangerTool(tool) {
      const target = this.selectedUser === '__self__'
        ? 'your own account'
        : this.users.find(u => u.userId === this.selectedUser)?.name || this.selectedUser;
      if (!confirm(`Run "${tool.label}" on ${target}? This may be irreversible.`)) return;
      this.runTool(tool);
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
  margin-bottom: var(--basil-space-6);
}
.admin-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--basil-space-3);
}
.admin-section-title {
  margin: 0;
  font-family: var(--basil-font-ui);
  font-weight: 600;
  font-size: 16px;
  color: var(--basil-text);
}
.admin-danger-card {
  border-color: var(--basil-negative);
  border-radius: var(--basil-radius-md);
  background: var(--basil-surface);
}
.admin-user-picker {
  max-width: 400px;
}
.admin-tool-list {
  display: flex;
  flex-direction: column;
  gap: var(--basil-space-3);
}
.admin-tool-row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  align-items: center;
  gap: var(--basil-space-1) var(--basil-space-3);
  padding: var(--basil-space-3);
  background: var(--basil-surface);
  border: 1px solid var(--basil-border);
  border-radius: var(--basil-radius-md);
}
.admin-danger-card .admin-tool-row {
  border: none;
  background: none;
  padding: var(--basil-space-2) 0;
}
.admin-danger-card .admin-tool-row + .admin-tool-row {
  border-top: 1px solid var(--basil-border);
  padding-top: var(--basil-space-3);
}
.admin-tool-info {
  min-width: 0;
}
.admin-tool-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--basil-text);
}
.admin-tool-desc {
  font-size: 13px;
  color: var(--basil-text-secondary);
  margin-top: 2px;
}
.admin-tool-result {
  grid-column: 1 / -1;
  background: var(--basil-surface-alt);
  border-radius: var(--basil-radius-sm);
  padding: var(--basil-space-2) var(--basil-space-3);
  overflow-x: auto;
}
.admin-tool-result pre {
  margin: 0;
  font-family: var(--basil-font-mono);
  font-size: 12px;
  color: var(--basil-text);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
