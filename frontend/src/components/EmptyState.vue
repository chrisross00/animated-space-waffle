<template>
  <div class="basil-empty">
    <div class="basil-empty__icon">
      <q-icon :name="icon" />
    </div>
    <div class="basil-empty__heading basil-display">{{ heading }}</div>
    <p v-if="body" class="basil-empty__body">{{ body }}</p>
    <slot />
  </div>
</template>

<script>
export default {
  name: 'EmptyState',
  props: {
    icon:    { type: String, required: true },
    heading: { type: String, required: true },
    body:    { type: String, default: '' },
  },
}
</script>

<style scoped>
.basil-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--basil-space-8) var(--basil-space-5);
  gap: var(--basil-space-3);
}

.basil-empty__icon {
  color: var(--basil-border-strong);
  margin-bottom: var(--basil-space-2);
  font-size: 3rem;
  line-height: 1;
}

.basil-empty__icon .q-icon {
  font-size: inherit;
}

.basil-empty__heading {
  font-size: 1.5rem;
  color: var(--basil-text);
  line-height: 1.2;
}

.basil-empty__body {
  font-size: 0.9375rem;
  color: var(--basil-text-muted);
  max-width: 300px;
  line-height: 1.6;
  margin: 0;
}
</style>
