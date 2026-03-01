<template>
  <div class="page-padder p-3">
    <h1>API Toolbox</h1>
    <p>Admin tools for managing your Plaid data. Each button runs the operation and shows the result below.</p>

    <div class="tool-list">
      <div v-for="tool in tools" :key="tool.key" class="tool-row">
        <q-btn
          :label="tool.label"
          color="primary"
          :loading="loading[tool.key]"
          @click="run(tool)"
          class="q-mr-md"
        />
        <span class="tool-desc">{{ tool.description }}</span>
        <div v-if="results[tool.key]" class="tool-result">{{ results[tool.key] }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import { addPlaidPfc, dedupe, seedCategories, cleanPending, mapUnmapped } from '../firebase';

const TOOLS = [
  {
    key: 'addplaidpfc',
    label: 'Add Plaid PFC Mappings',
    description: 'Backfills Plaid personal_finance_category mappings onto your existing categories.',
    fn: addPlaidPfc,
  },
  {
    key: 'seedcategories',
    label: 'Seed Categories',
    description: 'Creates a default set of categories. No-ops if categories already exist.',
    fn: seedCategories,
  },
  {
    key: 'mapunmapped',
    label: 'Map Unmapped Transactions',
    description: 'Re-runs categorization rules against any transactions that are missing a category.',
    fn: mapUnmapped,
  },
  {
    key: 'dedupe',
    label: 'De-duplicate Transactions',
    description: 'Removes duplicate transactions from your account.',
    fn: dedupe,
  },
  {
    key: 'cleanpending',
    label: 'Clean Pending Transactions',
    description: 'Removes pending transactions that have since posted.',
    fn: cleanPending,
  },
];

export default {
  name: 'ApiDir',
  data() {
    return {
      tools: TOOLS,
      loading: {},
      results: {},
    };
  },
  methods: {
    async run(tool) {
      this.loading[tool.key] = true;
      this.results[tool.key] = null;
      try {
        const result = await tool.fn();
        this.results[tool.key] = result ?? 'Done.';
      } catch (err) {
        this.results[tool.key] = `Error: ${err.message}`;
      } finally {
        this.loading[tool.key] = false;
      }
    },
  },
};
</script>

<style scoped>
.tool-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
}
.tool-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.tool-desc {
  color: #666;
  font-size: 0.9em;
}
.tool-result {
  margin-top: 4px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: monospace;
}
</style>
