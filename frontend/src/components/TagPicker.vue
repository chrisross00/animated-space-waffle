<template>
  <div>
    <div class="basil-tag-picker__label">Tags</div>

    <!-- Selected + available tags as toggleable chips -->
    <div class="basil-tag-picker__chips">
      <BasilChip
        v-for="tag in allTags" :key="tag.id"
        :color="isSelected(tag) ? 'primary' : undefined"
        clickable
        dense
        @click="toggle(tag)"
      >
        {{ tag.name }}
        <BasilIcon v-if="isSelected(tag)" name="close" style="font-size: 14px; margin-left: 2px;" />
      </BasilChip>

      <!-- New tag inline input -->
      <BasilChip
        v-if="!showNewInput"
        clickable
        dense
        @click="openNewTagInput"
      >
        <BasilIcon name="add" style="font-size: 14px; margin-right: 2px;" />New tag
      </BasilChip>
    </div>

    <!-- Inline new tag input -->
    <div v-if="showNewInput" class="basil-tag-picker__new" style="display: flex; align-items: center; gap: var(--basil-space-1); margin-top: var(--basil-space-1);">
      <BasilText ref="newTagInput" v-model="newTagName" dense placeholder="Tag name" style="flex: 1" @submit="addNewTag" />
      <BasilButton variant="icon" icon="check" color="primary" dense :disabled="!newTagName?.trim()" @click="addNewTag" />
      <BasilButton variant="icon" icon="close" dense @click="showNewInput = false; newTagName = ''" />
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

