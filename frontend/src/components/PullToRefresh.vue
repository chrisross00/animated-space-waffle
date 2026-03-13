<template>
  <div
    class="basil-pull"
    @touchstart.passive="onStart"
    @touchmove.passive="onMove"
    @touchend.passive="onEnd"
  >
    <div
      class="basil-pull__indicator"
      :style="{ height: indicatorHeight + 'px', opacity: indicatorOpacity }"
    >
      <q-icon
        name="arrow_downward"
        class="basil-pull__arrow"
        :class="{ 'basil-pull__arrow--flipped': distance > threshold }"
        :style="{ opacity: state === 'refreshing' ? 0 : 1 }"
        size="1.25rem"
      />
      <span class="basil-pull__text">
        <template v-if="state === 'refreshing'">Refreshing…</template>
        <template v-else-if="distance > threshold">Release to refresh</template>
        <template v-else>Pull to refresh</template>
      </span>
    </div>
    <div
      class="basil-pull__content"
      :class="{ 'basil-pull__content--pulling': state === 'pulling' }"
      :style="{ transform: contentTranslate }"
    >
      <slot />
    </div>
  </div>
</template>

<script>
import store from '../store'
import { getOrAddUser, fetchCategories, fetchRules, fetchTransactionsForMonth } from '../api'

export default {
  name: 'PullToRefresh',

  data() {
    return {
      startY: 0,
      distance: 0,
      state: 'idle', // idle | pulling | refreshing
      threshold: 64,
    }
  },

  computed: {
    indicatorHeight() {
      if (this.state === 'refreshing') return this.threshold;
      return Math.min(this.distance, this.threshold * 1.5);
    },
    indicatorOpacity() {
      if (this.state === 'refreshing') return 1;
      return Math.min(this.distance / this.threshold, 1);
    },
    contentTranslate() {
      if (this.state === 'refreshing') return `translateY(${this.threshold}px)`;
      if (this.distance <= 0) return 'none';
      return `translateY(${Math.min(this.distance, this.threshold * 1.5)}px)`;
    },
  },

  methods: {
    onStart(e) {
      if (this.state === 'refreshing') return;
      if (!this.$q.screen.lt.sm) return;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      if (scrollTop > 0) return;
      this.startY = e.touches[0].clientY;
      this.state = 'pulling';
    },
    onMove(e) {
      if (this.state !== 'pulling') return;
      const delta = e.touches[0].clientY - this.startY;
      this.distance = Math.max(0, delta * 0.4);
    },
    async onEnd() {
      if (this.state !== 'pulling') return;
      if (this.distance > this.threshold) {
        this.state = 'refreshing';
        this.distance = 0;
        try {
          await this.refreshFromDb();
        } finally {
          this.state = 'idle';
        }
      } else {
        this.state = 'idle';
        this.distance = 0;
      }
    },
    async refreshFromDb() {
      const loadedMonths = Object.keys(store.state.transactionsByMonth);
      const [user, categories, rules] = await Promise.all([
        getOrAddUser(),
        fetchCategories(),
        fetchRules(),
      ]);
      if (user) store.commit('setUser', user);
      if (categories) store.commit('setCategories', categories);
      if (rules) store.commit('setRules', rules);
      if (loadedMonths.length > 0) {
        const results = await Promise.all(loadedMonths.map(m => fetchTransactionsForMonth(m)));
        for (let i = 0; i < loadedMonths.length; i++) {
          if (results[i]?.transactions) {
            store.commit('setMonthTransactions', { month: loadedMonths[i], transactions: results[i].transactions });
          }
        }
      }
      this.$emit('refreshed');
    },
  },
}
</script>

<style scoped>
.basil-pull {
  position: relative;
}

.basil-pull__indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--basil-space-2);
  overflow: hidden;
  z-index: 1;
}

.basil-pull__arrow {
  color: var(--basil-text-muted);
  transition: transform var(--basil-t-base) var(--basil-ease);
}

.basil-pull__arrow--flipped {
  transform: rotate(180deg);
}

.basil-pull__text {
  font-family: var(--basil-font-ui);
  font-size: 0.8125rem;
  color: var(--basil-text-secondary);
  letter-spacing: 0.02em;
}

.basil-pull__content {
  transition: transform var(--basil-t-base) var(--basil-ease);
}

.basil-pull__content--pulling {
  transition: none;
}
</style>
