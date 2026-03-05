<template>
  <div>
    <q-option-group
      :model-value="modelValue"
      :options="options"
      color="primary"
      dense
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <p v-if="modelValue === 'merchant'" class="basil-rule-selector__hint">
      All existing &amp; future <strong>{{ merchantOrName }}</strong>
      transactions → <strong>{{ category || '…' }}</strong>.
    </p>
    <p v-if="modelValue === 'compound'" class="basil-rule-selector__hint">
      All existing &amp; future <strong>{{ merchantOrName }}</strong> · <strong>{{ amtLabel }}</strong>
      transactions → <strong>{{ category || '…' }}</strong>.
    </p>
  </div>
</template>

<style scoped>
.basil-rule-selector__hint {
  font-size: 0.8125rem;
  color: var(--basil-text-muted);
  margin: var(--basil-space-1) 0 0;
  line-height: 1.5;
}
</style>

<script>
export default {
  name: 'RuleModeSelector',

  props: {
    modelValue: { default: null, validator: v => v === null || typeof v === 'string' },
    merchantName: { type: String, default: '' },
    name: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    category: { type: String, default: '' },
  },

  emits: ['update:modelValue'],

  computed: {
    merchantOrName() {
      return this.merchantName || this.name || 'this merchant';
    },
    amtLabel() {
      const abs = Math.abs(this.amount);
      return abs % 1 === 0 ? `$${Math.round(abs)}` : `$${abs.toFixed(2)}`;
    },
    options() {
      return [
        { label: 'No rule', value: null },
        { label: `Remember for all "${this.merchantOrName}"`, value: 'merchant' },
        { label: `Remember for "${this.merchantOrName}" · ${this.amtLabel} only`, value: 'compound' },
      ];
    },
  },
};
</script>
