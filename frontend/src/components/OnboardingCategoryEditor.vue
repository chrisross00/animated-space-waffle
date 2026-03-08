<template>
  <div class="basil-cat-editor">
    <div
      v-for="(cat, idx) in categories"
      :key="cat.id"
      class="basil-cat-editor__row"
    >
      <div class="basil-cat-editor__main">
        <q-input
          v-model="cat.category"
          dense
          outlined
          :disable="cat.locked"
          :rules="[v => !!v?.trim() || 'Required']"
          class="basil-cat-editor__name"
        />
        <div class="basil-cat-editor__hint">{{ cat.hint }}</div>
      </div>

      <q-icon
        v-if="!cat.locked"
        name="delete_outline"
        size="16px"
        class="basil-cat-editor__delete"
        @click="startDelete(idx)"
      />
    </div>

    <!-- Add category -->
    <q-btn
      flat
      dense
      icon="add"
      label="Add category"
      color="primary"
      class="basil-cat-editor__add q-mt-sm"
      @click="addCategory"
    />

    <!-- Validation error -->
    <div v-if="validationError" class="basil-cat-editor__error">
      {{ validationError }}
    </div>

    <!-- Done button -->
    <q-btn
      unelevated
      color="primary"
      label="Save categories"
      class="full-width q-mt-md"
      @click="emitDone"
    />
  </div>
</template>

<script>
import { DEFAULT_CATEGORIES, CATEGORY_HINTS } from '@/utils/defaultCategories';

export default {
  name: 'OnboardingCategoryEditor',
  emits: ['done'],

  data() {
    let nextId = 1;
    return {
      nextId: DEFAULT_CATEGORIES.length + 1,
      categories: DEFAULT_CATEGORIES.map(c => ({
        ...c,
        id: nextId++,
        plaid_pfc: [...c.plaid_pfc],
        hint: CATEGORY_HINTS[c.category] || '',
        locked: c.category === 'To Sort',
      })),
      validationError: null,
    };
  },

  methods: {
    startDelete(idx) {
      const cat = this.categories[idx];

      // No PFCs to reassign — just confirm and remove
      if (!cat.plaid_pfc.length) {
        this.$q.dialog({
          title: `Remove "${cat.category}"?`,
          cancel: true,
          ok: { label: 'Remove', color: 'negative', flat: true },
          cancel: { label: 'Keep', flat: true },
        }).onOk(() => {
          this.categories.splice(idx, 1);
        });
        return;
      }

      // Has PFCs — ask where to reassign
      const others = this.categories
        .filter((_, i) => i !== idx)
        .map(c => c.category);

      this.$q.dialog({
        title: `Remove "${cat.category}"?`,
        message: `Transactions like ${cat.hint || 'these'} will auto-sort to:`,
        options: {
          model: 'To Sort',
          items: others.map(name => ({ label: name, value: name })),
        },
        cancel: true,
        ok: { label: 'Remove', color: 'negative', flat: true },
        cancel: { label: 'Keep', flat: true },
      }).onOk(targetName => {
        const target = this.categories.find(c => c.category === targetName);
        if (target) target.plaid_pfc.push(...cat.plaid_pfc);
        this.categories.splice(idx, 1);
      });
    },

    addCategory() {
      this.categories.push({
        id: this.nextId++,
        category: '',
        type: 'expense',
        monthly_limit: 0,
        plaid_pfc: [],
        locked: false,
      });
    },

    emitDone() {
      this.validationError = null;
      const names = this.categories.map(c => c.category.trim()).filter(Boolean);
      if (names.length < 2) {
        this.validationError = 'You need at least 2 categories.';
        return;
      }
      if (new Set(names).size !== names.length) {
        this.validationError = 'Category names must be unique.';
        return;
      }
      if (this.categories.some(c => !c.category.trim())) {
        this.validationError = 'All categories need a name.';
        return;
      }
      this.$emit('done', this.categories.map(({ locked, id, hint, ...c }) => c));
    },
  },
};
</script>

<style scoped>
.basil-cat-editor__row {
  display: flex;
  align-items: center;
  gap: var(--basil-space-3);
  padding: var(--basil-space-2) 0;
  border-bottom: 1px solid var(--basil-border);
}

.basil-cat-editor__row:last-of-type {
  border-bottom: none;
}

.basil-cat-editor__main {
  flex: 1;
  min-width: 0;
}

.basil-cat-editor__name {
  max-width: 200px;
}

.basil-cat-editor__hint {
  font-size: 0.75rem;
  color: var(--basil-text-muted);
  margin-top: 2px;
  line-height: 1.3;
}

.basil-cat-editor__delete {
  flex-shrink: 0;
  cursor: pointer;
  color: var(--basil-text-muted);
  transition: color var(--basil-t-fast);
}

.basil-cat-editor__delete:hover {
  color: var(--basil-red);
}

.basil-cat-editor__error {
  color: var(--basil-red);
  font-size: 0.8125rem;
  margin-top: var(--basil-space-2);
}
</style>
