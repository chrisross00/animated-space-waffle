<template>
  <div>
    <div class="basil-tag-picker__label">Tags</div>

    <!-- Selected + available tags as toggleable chips -->
    <div class="basil-tag-picker__chips">
      <q-chip
        v-for="tag in allTags" :key="tag.id"
        :class="isSelected(tag) ? 'basil-tag-picker__chip--selected' : 'basil-tag-picker__chip--unselected'"
        clickable
        size="sm"
        @click="toggle(tag)"
      >
        {{ tag.name }}
        <q-icon v-if="isSelected(tag)" name="close" size="14px" class="q-ml-xs" />
      </q-chip>

      <!-- New tag inline input -->
      <q-chip
        v-if="!showNewInput"
        outline clickable size="sm"
        icon="add"
        @click="openNewTagInput"
      >
        New tag
      </q-chip>
    </div>

    <!-- Inline new tag input -->
    <div v-if="showNewInput" class="basil-tag-picker__new row items-center q-gutter-xs q-mt-xs">
      <BasilText ref="newTagInput" v-model="newTagName" dense placeholder="Tag name" style="flex: 1" @submit="addNewTag" />
      <q-btn flat dense icon="check" color="primary" :disable="!newTagName?.trim()" @click="addNewTag" />
      <q-btn flat dense icon="close" @click="showNewInput = false; newTagName = ''" />
    </div>
  </div>
</template>

<script>
import { createTag } from '@/api';
import store from '../store';
import BasilText from '@/components/BasilText';

export default {
  name: 'TagPicker',
  components: { BasilText },
  props: {
    modelValue: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],

  data() {
    return {
      showNewInput: false,
      newTagName: '',
    };
  },

  computed: {
    allTags() {
      return store.state.tags || [];
    },
  },

  methods: {
    openNewTagInput() {
      this.showNewInput = true;
      this.$nextTick(() => {
        setTimeout(() => {
          this.$refs.newTagInput?.focus();
        }, 300);
      });
    },

    isSelected(tag) {
      return this.modelValue.some(t => (t.id || t.value) === tag.id);
    },

    toggle(tag) {
      const tagObj = { label: tag.name, value: tag.id, id: tag.id, name: tag.name };
      if (this.isSelected(tag)) {
        this.$emit('update:modelValue', this.modelValue.filter(t => (t.id || t.value) !== tag.id));
      } else {
        this.$emit('update:modelValue', [...this.modelValue, tagObj]);
      }
    },

    async addNewTag() {
      const trimmed = this.newTagName?.trim();
      if (!trimmed) return;
      // Check if already exists
      const existing = this.allTags.find(t => t.name.toLowerCase() === trimmed.toLowerCase());
      let tagObj;
      if (existing) {
        tagObj = { label: existing.name, value: existing.id, id: existing.id, name: existing.name };
      } else {
        const tag = await createTag(trimmed);
        if (!tag) return;
        store.commit('addTag', tag);
        tagObj = { label: tag.name, value: tag.id, id: tag.id, name: tag.name };
      }
      if (!this.isSelected({ id: tagObj.id })) {
        this.$emit('update:modelValue', [...this.modelValue, tagObj]);
      }
      this.newTagName = '';
      this.showNewInput = false;
    },
  },
};
</script>

<style scoped>
.basil-tag-picker__label {
  font-size: 0.75rem;
  color: var(--basil-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--basil-space-1);
}

.basil-tag-picker__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--basil-space-1);
}
</style>

<!-- Chip color overrides live in quasar-overrides.css (dark mode aware) -->
