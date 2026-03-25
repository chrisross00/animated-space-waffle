<template>
  <BasilTray :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" :persistent="persistent" max-width="400px">
    <BasilCard class="basil-dialog-card" flat>
      <div class="text-subtitle1">{{ title }}</div>
      <div v-if="message" class="text-body2 q-mt-xs" style="color: var(--basil-text-secondary)">
        {{ message }}
      </div>
      <template #actions>
        <BasilButton variant="flat" :label="cancelLabel" @click="$emit('update:modelValue', false)" />
        <BasilButton
          variant="flat"
          :label="okLabel"
          :color="okColor"
          :loading="loading"
          @click="$emit('confirm')"
        />
      </template>
    </BasilCard>
  </BasilTray>
</template>

<script>
import BasilTray from './BasilTray.vue';

export default {
  name: 'BasilConfirmTray',
  components: { BasilTray },
  props: {
    modelValue:   { type: Boolean, default: false },
    title:        { type: String, default: 'Confirm' },
    message:      { type: String, default: '' },
    okLabel:      { type: String, default: 'OK' },
    okColor:      { type: String, default: 'primary' },
    cancelLabel:  { type: String, default: 'Cancel' },
    persistent:   { type: Boolean, default: false },
    loading:      { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'confirm'],
};
</script>
