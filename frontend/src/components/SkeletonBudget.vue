<template>
  <div class="basil-sk-wrap q-pa-md">

    <!-- Stat cards row -->
    <div class="basil-sk-cards">
      <div class="basil-sk-card">
        <div class="basil-sk basil-sk--label"></div>
        <div class="basil-sk-row" style="margin-top: 14px; gap: 24px;">
          <div>
            <div class="basil-sk basil-sk--num-lg"></div>
            <div class="basil-sk basil-sk--text" style="width: 48px; margin-top: 6px;"></div>
          </div>
          <div class="basil-sk-divider"></div>
          <div>
            <div class="basil-sk basil-sk--num-lg"></div>
            <div class="basil-sk basil-sk--text" style="width: 52px; margin-top: 6px;"></div>
          </div>
        </div>
        <div class="basil-sk basil-sk--rule" style="margin-top: 18px;"></div>
        <div class="basil-sk basil-sk--num-xl" style="margin-top: 14px;"></div>
        <div class="basil-sk basil-sk--text" style="width: 56px; margin-top: 8px;"></div>
      </div>

      <div class="basil-sk-card">
        <div class="basil-sk basil-sk--label"></div>
        <div class="basil-sk basil-sk--num-lg" style="margin-top: 14px;"></div>
        <div class="basil-sk basil-sk--text" style="width: 88px; margin-top: 6px;"></div>
        <div class="basil-sk basil-sk--text" style="width: 120px; margin-top: 18px;"></div>
        <div class="basil-sk basil-sk--text" style="width: 96px; margin-top: 8px;"></div>
      </div>
    </div>

    <!-- Category rows -->
    <div class="basil-sk-list">
      <div v-for="(w, i) in rowWidths" :key="i" class="basil-sk-row-item">
        <div class="basil-sk basil-sk--text" :style="{ width: w + '%' }"></div>
        <div class="basil-sk basil-sk--bar" style="flex: 1; margin: 0 20px;"></div>
        <div class="basil-sk basil-sk--text" style="width: 64px;"></div>
      </div>
    </div>

  </div>
</template>

<script>
export default {
  name: 'SkeletonBudget',
  data() {
    // Vary row label widths so skeleton looks organic, not robotic
    return { rowWidths: [28, 34, 22, 38, 26, 32, 24] };
  },
};
</script>

<style scoped>
@keyframes basil-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

.basil-sk {
  display: block;
  background: linear-gradient(
    90deg,
    var(--basil-surface-alt) 25%,
    var(--basil-surface-raised) 50%,
    var(--basil-surface-alt) 75%
  );
  background-size: 200% 100%;
  animation: basil-shimmer 1.6s ease-in-out infinite;
  border-radius: var(--basil-radius-sm);
}

/* Size variants */
.basil-sk--label  { height: 10px; width: 56px; }
.basil-sk--num-xl { height: 38px; width: 52%; }
.basil-sk--num-lg { height: 28px; width: 44%; }
.basil-sk--text   { height: 13px; }
.basil-sk--bar    { height: 6px; border-radius: var(--basil-radius-pill); }
.basil-sk--rule   { height: 1px; background: var(--basil-border); animation: none; }

/* Layout */
.basil-sk-wrap {
  max-width: 800px;
  margin: 0 auto;
}

.basil-sk-cards {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.basil-sk-card {
  flex: 1;
  min-width: 220px;
  background: var(--basil-surface);
  border: 1px solid var(--basil-border);
  border-radius: var(--basil-radius-md);
  box-shadow: var(--basil-shadow-sm);
  padding: 24px;
}

.basil-sk-row {
  display: flex;
  align-items: flex-start;
}

.basil-sk-divider {
  width: 1px;
  height: 48px;
  background: var(--basil-border);
  flex-shrink: 0;
}

.basil-sk-list {
  background: var(--basil-surface);
  border: 1px solid var(--basil-border);
  border-radius: var(--basil-radius-md);
  box-shadow: var(--basil-shadow-sm);
  overflow: hidden;
}

.basil-sk-row-item {
  display: flex;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--basil-border);
}

.basil-sk-row-item:last-child {
  border-bottom: none;
}
</style>
