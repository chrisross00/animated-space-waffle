<template>
  <BasilTray :model-value="modelValue" @update:model-value="onModelValueUpdate" max-width="640px">
    <q-card class="basil-dialog-card basil-venmo-dialog" flat>
      <!-- Header -->
      <div class="basil-dialog-header">
        <div class="basil-dialog-title">
          <span class="basil-dialog-title__sub">IMPORT</span>
          <span class="basil-dialog-title__main">Venmo Details</span>
        </div>
        <q-btn flat round dense icon="close" class="basil-dialog-close" @click="close" />
      </div>

      <!-- Body -->
      <q-card-section class="col overflow-auto basil-venmo-dialog__body">

        <!-- Step 1: Upload -->
        <template v-if="step === 'upload'">
          <p class="basil-venmo-dialog__instructions">
            Add names and notes to your Venmo transactions by uploading a Venmo statement.
            You can download yours from the
            <span class="basil-venmo-dialog__link">Venmo app &rarr; Statements</span> section.
          </p>
          <div class="basil-venmo-dialog__drop-zone" @click="$refs.fileInput.click()">
            <q-icon name="upload_file" size="2rem" color="grey-6" />
            <span>Click to select a CSV file</span>
            <span v-if="fileName" class="basil-venmo-dialog__file-name">{{ fileName }}</span>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept=".csv"
            style="display: none"
            @change="onFileSelected"
          />
        </template>

        <!-- Step 2: Review matches -->
        <template v-if="step === 'review'">
          <div class="basil-venmo-dialog__summary">
            <div class="basil-venmo-dialog__stat">
              <span class="basil-venmo-dialog__stat-num">{{ matches.length }}</span>
              <span class="basil-venmo-dialog__stat-label">Matched</span>
            </div>
            <div class="basil-venmo-dialog__stat">
              <span class="basil-venmo-dialog__stat-num">{{ alreadyEnriched.length }}</span>
              <span class="basil-venmo-dialog__stat-label">Already imported</span>
            </div>
            <div class="basil-venmo-dialog__stat">
              <span class="basil-venmo-dialog__stat-num">{{ unmatchedRows.length }}</span>
              <span class="basil-venmo-dialog__stat-label">Unmatched</span>
            </div>
          </div>

          <!-- Matches table -->
          <q-markup-table v-if="matches.length" flat bordered separator="horizontal" class="basil-venmo-dialog__table">
            <thead>
              <tr>
                <th class="text-left">
                  <q-checkbox v-model="selectAll" size="sm" dense />
                </th>
                <th class="text-left">Date</th>
                <th class="text-left">Note</th>
                <th class="text-left">With</th>
                <th class="text-right">Amount</th>
                <th class="text-center">Match</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(m, idx) in matches" :key="m.venmoRow.id">
                <td><q-checkbox v-model="selected[idx]" size="sm" dense /></td>
                <td>{{ formatDate(m.venmoRow.date) }}</td>
                <td>{{ m.venmoRow.note }}</td>
                <td>{{ m.venmoRow.counterparty }}</td>
                <td class="text-right basil-mono">{{ formatAmount(m.venmoRow.amount) }}</td>
                <td class="text-center">
                  <q-badge
                    :color="m.confidence === 'high' ? 'positive' : 'warning'"
                    :label="m.confidence"
                  />
                </td>
              </tr>
            </tbody>
          </q-markup-table>

          <!-- Unmatched (collapsed) -->
          <q-expansion-item
            v-if="unmatchedRows.length"
            dense
            header-class="basil-venmo-dialog__unmatched-header"
            :label="`${unmatchedRows.length} unmatched Venmo transaction${unmatchedRows.length !== 1 ? 's' : ''}`"
            caption="Couldn't find a matching bank transaction"
          >
            <q-markup-table flat bordered separator="horizontal" class="basil-venmo-dialog__table">
              <thead>
                <tr>
                  <th class="text-left">Date</th>
                  <th class="text-left">Note</th>
                  <th class="text-left">With</th>
                  <th class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in unmatchedRows" :key="u.venmoRow.id" class="basil-venmo-dialog__row--muted">
                  <td>{{ formatDate(u.venmoRow.date) }}</td>
                  <td>{{ u.venmoRow.note }}</td>
                  <td>{{ u.venmoRow.counterparty }}</td>
                  <td class="text-right basil-mono">{{ formatAmount(u.venmoRow.amount) }}</td>
                </tr>
              </tbody>
            </q-markup-table>
          </q-expansion-item>
        </template>

        <!-- Step 3: Done -->
        <template v-if="step === 'done'">
          <div class="basil-venmo-dialog__done">
            <q-icon name="check_circle" size="3rem" color="positive" />
            <p>Updated {{ enrichedCount }} transaction{{ enrichedCount !== 1 ? 's' : '' }} with Venmo details.</p>
          </div>
        </template>

      </q-card-section>

      <!-- Footer -->
      <q-card-actions align="right" class="basil-venmo-dialog__actions">
        <q-btn v-if="step === 'upload'" flat label="Cancel" @click="close" />
        <q-btn
          v-if="step === 'upload'"
          unelevated
          label="Upload & Preview"
          color="primary"
          :disable="!csvText"
          :loading="loading"
          @click="preview"
        />
        <q-btn v-if="step === 'review'" flat label="Back" @click="step = 'upload'" />
        <q-btn
          v-if="step === 'review'"
          unelevated
          :label="`Update ${selectedCount} transaction${selectedCount !== 1 ? 's' : ''}`"
          color="primary"
          :disable="selectedCount === 0"
          :loading="loading"
          @click="apply"
        />
        <q-btn v-if="step === 'done'" unelevated label="Done" color="primary" @click="close" />
      </q-card-actions>
    </q-card>
  </BasilTray>
</template>

<script>
import '@/styles/dialogs.css';
import { venmoEnrichmentPreview, venmoEnrichmentApply } from '@/api';
import BasilTray from './BasilTray.vue';

export default {
  name: 'VenmoEnrichmentDialog',
  components: { BasilTray },

  props: {
    modelValue: { type: Boolean, default: false },
  },

  emits: ['update:modelValue'],

  data() {
    return {
      step: 'upload',     // 'upload' | 'review' | 'done'
      csvText: null,
      fileName: null,
      loading: false,
      matches: [],
      unmatchedRows: [],
      alreadyEnriched: [],
      selected: [],
      enrichedCount: 0,
    };
  },

  computed: {
    selectAll: {
      get() {
        return this.selected.length > 0 && this.selected.every(Boolean);
      },
      set(val) {
        this.selected = this.matches.map(() => val);
      },
    },
    selectedCount() {
      return this.selected.filter(Boolean).length;
    },
  },

  watch: {
    modelValue(val) {
      if (!val) this.resetState();
    },
  },

  methods: {
    close() {
      this.$emit('update:modelValue', false);
    },
    onModelValueUpdate(val) {
      this.$emit('update:modelValue', val);
    },
    resetState() {
      this.step = 'upload';
      this.csvText = null;
      this.fileName = null;
      this.matches = [];
      this.unmatchedRows = [];
      this.alreadyEnriched = [];
      this.selected = [];
      this.enrichedCount = 0;
    },

    onFileSelected(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      this.fileName = file.name;
      const reader = new FileReader();
      reader.onload = (e) => { this.csvText = e.target.result; };
      reader.readAsText(file);
    },

    async preview() {
      this.loading = true;
      try {
        const result = await venmoEnrichmentPreview(this.csvText);
        if (!result) return;
        this.matches = result.matches || [];
        this.unmatchedRows = result.unmatched || [];
        this.alreadyEnriched = result.alreadyEnriched || [];
        this.selected = this.matches.map(() => true);
        this.step = 'review';
      } finally {
        this.loading = false;
      }
    },

    async apply() {
      this.loading = true;
      try {
        const enrichments = this.matches
          .filter((_, i) => this.selected[i])
          .map(m => ({
            transaction_id: m.plaidTransaction.transaction_id,
            venmo_id: m.venmoRow.id,
            venmo_note: m.venmoRow.note,
            venmo_counterparty: m.venmoRow.counterparty,
          }));
        const result = await venmoEnrichmentApply(enrichments);
        if (!result) return;
        this.enrichedCount = result.enriched;
        // Update store so UI reflects enrichment without re-fetch
        this.$store.commit('enrichTransactions', enrichments);
        this.step = 'done';
      } finally {
        this.loading = false;
      }
    },

    formatDate(dateStr) {
      if (!dateStr) return '';
      const [y, m, d] = dateStr.split('-');
      return `${parseInt(m)}/${parseInt(d)}`;
    },

    formatAmount(amount) {
      const abs = Math.abs(amount).toFixed(2);
      return amount >= 0 ? `+$${abs}` : `-$${abs}`;
    },
  },
};
</script>

<style scoped>
.basil-venmo-dialog {
  width: 100%;
  max-height: 85vh;
}

.basil-venmo-dialog__body {
  padding: var(--basil-space-5);
}

.basil-venmo-dialog__instructions {
  color: var(--basil-text-secondary);
  font-size: 0.875rem;
  margin-bottom: var(--basil-space-4);
  line-height: 1.5;
}

.basil-venmo-dialog__link {
  font-weight: 600;
  color: var(--basil-text);
}

.basil-venmo-dialog__drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--basil-space-2);
  padding: var(--basil-space-6);
  border: 2px dashed var(--basil-border);
  border-radius: var(--basil-radius-md);
  cursor: pointer;
  color: var(--basil-text-secondary);
  font-size: 0.875rem;
  transition: border-color var(--basil-t-fast) var(--basil-ease);
}

.basil-venmo-dialog__drop-zone:hover {
  border-color: var(--basil-green);
}

.basil-venmo-dialog__file-name {
  font-weight: 600;
  color: var(--basil-text);
  margin-top: var(--basil-space-1);
}

.basil-venmo-dialog__summary {
  display: flex;
  gap: var(--basil-space-5);
  margin-bottom: var(--basil-space-4);
}

.basil-venmo-dialog__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.basil-venmo-dialog__stat-num {
  font-family: var(--basil-font-display);
  font-size: 1.5rem;
  color: var(--basil-text);
}

.basil-venmo-dialog__stat-label {
  font-size: 0.75rem;
  color: var(--basil-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.basil-venmo-dialog__table {
  font-size: 0.8125rem;
  margin-bottom: var(--basil-space-4);
}

.basil-venmo-dialog__row--muted {
  opacity: 0.5;
}

.basil-venmo-dialog__unmatched-header {
  color: var(--basil-text-secondary);
  font-size: 0.8125rem;
}

.basil-venmo-dialog__done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--basil-space-3);
  padding: var(--basil-space-6) 0;
  text-align: center;
  color: var(--basil-text);
}

.basil-venmo-dialog__actions {
  border-top: 1px solid var(--basil-border);
  padding: var(--basil-space-3) var(--basil-space-5);
}
</style>
