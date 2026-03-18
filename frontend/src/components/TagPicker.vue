<template>
  <q-select
    ref="select"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :options="filteredOptions"
    multiple
    use-chips
    use-input
    input-debounce="0"
    label="Tags"
    outlined
    dense
    @new-value="onNewValue"
    @filter="onFilter"
    @blur="onBlur"
  >
    <template v-slot:no-option>
      <q-item>
        <q-item-section style="color: var(--basil-text-secondary); font-size: 0.8125rem;">
          Type to create a new tag
        </q-item-section>
      </q-item>
    </template>
  </q-select>
</template>

<script>
import { createTag } from '@/api';
import store from '../store';

export default {
  name: 'TagPicker',
  props: {
    modelValue: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],

  data() {
    return {
      filteredOptions: [],
    };
  },

  methods: {
    onFilter(val, update) {
      update(() => {
        const allTags = store.state.tags || [];
        const options = allTags.map(t => ({ label: t.name, value: t.id, id: t.id, name: t.name }));
        if (!val) {
          this.filteredOptions = options;
        } else {
          const needle = val.toLowerCase();
          this.filteredOptions = options.filter(o => o.label.toLowerCase().includes(needle));
        }
      });
    },

    async onBlur() {
      // Auto-commit any typed text on blur (mobile has no Enter key)
      const input = this.$refs.select?.inputValue;
      if (!input?.trim()) return;
      const trimmed = input.trim();
      const existing = (store.state.tags || []).find(
        t => t.name.toLowerCase() === trimmed.toLowerCase()
      );
      let tagObj;
      if (existing) {
        tagObj = { label: existing.name, value: existing.id, id: existing.id, name: existing.name };
      } else {
        const tag = await createTag(trimmed);
        if (!tag) return;
        store.commit('addTag', tag);
        tagObj = { label: tag.name, value: tag.id, id: tag.id, name: tag.name };
      }
      // Add if not already selected
      if (!this.modelValue.some(t => (t.id || t.value) === tagObj.id)) {
        this.$emit('update:modelValue', [...this.modelValue, tagObj]);
      }
    },

    async onNewValue(val, done) {
      const trimmed = val.trim();
      if (!trimmed) return done(null);
      // Check if tag already exists
      const existing = (store.state.tags || []).find(
        t => t.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        done({ label: existing.name, value: existing.id, id: existing.id, name: existing.name });
        return;
      }
      // Create new tag
      const tag = await createTag(trimmed);
      if (tag) {
        store.commit('addTag', tag);
        done({ label: tag.name, value: tag.id, id: tag.id, name: tag.name });
      } else {
        done(null);
      }
    },
  },
};
</script>
