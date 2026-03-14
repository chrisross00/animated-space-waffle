<template>
  <BasilTray :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" :persistent="persistent" max-width="400px">
    <q-card class="basil-dialog-card" flat>
      <q-card-section>
        <div class="text-subtitle1">{{ title }}</div>
        <div v-if="message" class="text-body2 q-mt-xs" style="color: var(--basil-text-secondary)">
          {{ message }}
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat :label="cancelLabel" @click="$emit('update:modelValue', false)" />
        <q-btn
          flat
          :label="okLabel"
          :color="okColor"
          :loading="loading"
          @click="$emit('confirm')"
        />
      </q-card-actions>
    </q-card>
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
