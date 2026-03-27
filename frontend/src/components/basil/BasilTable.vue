<template>
  <!-- Standard (non-virtual) table -->
  <div :class="rootClasses">
    <!-- Top slot (title + top-right) -->
    <div v-if="title || $slots['top-right']" class="basil-table__top">
      <div v-if="title" class="basil-table__title">{{ title }}</div>
      <div v-if="$slots['top-right']" class="basil-table__top-right">
        <slot name="top-right" />
      </div>
    </div>

    <div v-if="virtualScroll" ref="scrollEl" class="basil-table__virtual-container" :style="virtualContainerStyle">
      <table class="basil-table__el">
        <thead v-if="sortedColumns.length" class="basil-table__head">
          <slot name="header">
            <tr>
              <th
                v-for="col in sortedColumns"
                :key="col.name"
                :class="headerCellClasses(col)"
                @click="col.sortable !== false && onHeaderClick(col)"
              >
                <span>{{ col.label }}</span>
                <span v-if="localSort.field === col.name" class="basil-table__sort-icon material-icons" aria-hidden="true">
                  {{ localSort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward' }}
                </span>
              </th>
            </tr>
          </slot>
        </thead>
      </table>
      <div ref="virtualListEl" class="basil-table__virtual-scroll" @scroll="onVirtualContainerScroll">
        <div :style="{ height: `${virtualizer?.getTotalSize() || 0}px`, position: 'relative' }">
          <table class="basil-table__el" :style="{ position: 'absolute', top: 0, left: 0, width: '100%' }">
            <tbody>
              <tr
                v-for="vRow in virtualRows"
                :key="rowKeyFn(filteredRows[vRow.index])"
                :class="rowClasses(filteredRows[vRow.index])"
                :style="{ position: 'absolute', top: `${vRow.start}px`, left: 0, width: '100%', display: 'table-row' }"
                @click="$emit('row-click', filteredRows[vRow.index])"
              >
                <td
                  v-for="col in sortedColumns"
                  :key="col.name"
                  :class="cellClasses(col)"
                >
                  <slot :name="`body-cell-${col.name}`" :row="filteredRows[vRow.index]" :col="col" :value="cellValue(filteredRows[vRow.index], col)">
                    {{ cellValue(filteredRows[vRow.index], col) }}
                  </slot>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <template v-else>
      <table class="basil-table__el">
        <thead v-if="sortedColumns.length" class="basil-table__head">
          <slot name="header">
            <tr>
              <th
                v-for="col in sortedColumns"
                :key="col.name"
                :class="headerCellClasses(col)"
                @click="col.sortable !== false && onHeaderClick(col)"
              >
                <span>{{ col.label }}</span>
                <span v-if="localSort.field === col.name" class="basil-table__sort-icon material-icons" aria-hidden="true">
                  {{ localSort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward' }}
                </span>
              </th>
            </tr>
          </slot>
        </thead>
        <tbody>
          <template v-if="paginatedRows.length === 0">
            <tr v-if="$slots['no-data']">
              <td :colspan="sortedColumns.length || 1">
                <slot name="no-data" />
              </td>
            </tr>
            <tr v-else-if="$slots.empty">
              <td :colspan="sortedColumns.length || 1">
                <slot name="empty" />
              </td>
            </tr>
          </template>
          <tr
            v-else
            v-for="row in paginatedRows"
            :key="rowKeyFn(row)"
            :class="rowClasses(row)"
            @click="$emit('row-click', row)"
          >
            <td
              v-for="col in sortedColumns"
              :key="col.name"
              :class="cellClasses(col)"
            >
              <slot :name="`body-cell-${col.name}`" :row="row" :col="col" :value="cellValue(row, col)">
                {{ cellValue(row, col) }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="!noPagination && totalPages > 1" class="basil-table__pagination">
        <span class="basil-table__page-info">
          {{ paginationStart }}–{{ paginationEnd }} of {{ filteredRows.length }}
        </span>
        <button
          class="basil-table__page-btn"
          :disabled="localPage === 1"
          @click="localPage--"
        >
          <span class="material-icons" aria-hidden="true">chevron_left</span>
        </button>
        <button
          class="basil-table__page-btn"
          :disabled="localPage >= totalPages"
          @click="localPage++"
        >
          <span class="material-icons" aria-hidden="true">chevron_right</span>
        </button>
      </div>
    </template>

    <div v-if="$slots.bottom" class="basil-table__bottom">
      <slot name="bottom" />
    </div>

    <!-- Loading overlay -->
    <div v-if="loading" class="basil-table__loading">
      <BasilSpinner size="24px" />
    </div>
  </div>
</template>

<script>
import { computed, ref, watch, onScopeDispose } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'

export default {
  name: 'BasilTable',

  props: {
    columns:       { type: Array, default: () => [] },
    rows:          { type: Array, default: () => [] },
    rowKey:        { type: String, default: 'id' },
    virtualScroll: { type: Boolean, default: false },
    rowHeight:     { type: Number, default: 48 },
    flat:          { type: Boolean, default: false },
    bordered:      { type: Boolean, default: false },
    separator:     { type: String, default: 'horizontal', validator: v => ['horizontal', 'none'].includes(v) },
    filter:        { type: String, default: '' },
    loading:       { type: Boolean, default: false },
    title:         { type: String, default: '' },
    pagination:    { type: Object, default: null },
    noPagination:  { type: Boolean, default: false },
  },

  emits: ['row-click', 'virtual-scroll'],

  setup(props, { emit }) {
    const scrollEl = ref(null)
    const virtualListEl = ref(null)

    // Virtual scroll setup (only active when virtualScroll is true)
    let virtualizer = null

    if (props.virtualScroll) {
      // We need a reactive row count for the virtualizer
      const rowCount = computed(() => {
        // filteredRows computed — we replicate the filter logic here
        if (!props.filter) return props.rows.length
        const needle = props.filter.toLowerCase()
        return props.rows.filter(row =>
          props.columns.some(col => {
            const val = typeof col.field === 'function' ? col.field(row) : row[col.field || col.name]
            return val != null && String(val).toLowerCase().includes(needle)
          })
        ).length
      })

      virtualizer = useVirtualizer(computed(() => ({
        count: rowCount.value,
        getScrollElement: () => virtualListEl.value,
        estimateSize: () => props.rowHeight,
        overscan: 10,
      })))

      // Emit virtual-scroll events for infinite scroll
      const onScroll = () => {
        if (!virtualizer.value) return
        const items = virtualizer.value.getVirtualItems()
        if (items.length === 0) return
        const lastItem = items[items.length - 1]
        emit('virtual-scroll', {
          to: lastItem.index,
          from: items[0].index,
          direction: 'increase',
        })
      }

      // We'll handle scroll via template @scroll instead
    }

    return {
      scrollEl,
      virtualListEl,
      virtualizer,
    }
  },

  data() {
    return {
      localSort: { field: null, dir: 'asc' },
      localPage: 1,
    }
  },

  computed: {
    rootClasses() {
      return [
        'basil-table',
        this.flat && 'basil-table--flat',
        this.bordered && 'basil-table--bordered',
        `basil-table--separator-${this.separator}`,
        this.loading && 'basil-table--loading',
      ]
    },

    sortedColumns() {
      return this.columns
    },

    rowsPerPage() {
      return this.pagination?.rowsPerPage || 25
    },

    filteredRows() {
      let result = this.rows
      if (this.filter) {
        const needle = this.filter.toLowerCase()
        result = result.filter(row =>
          this.columns.some(col => {
            const val = typeof col.field === 'function' ? col.field(row) : row[col.field || col.name]
            return val != null && String(val).toLowerCase().includes(needle)
          })
        )
      }
      if (this.localSort.field) {
        const col = this.columns.find(c => c.name === this.localSort.field)
        if (col) {
          const field = col.field || col.name
          const dir = this.localSort.dir === 'asc' ? 1 : -1
          result = [...result].sort((a, b) => {
            const aVal = typeof field === 'function' ? field(a) : a[field]
            const bVal = typeof field === 'function' ? field(b) : b[field]
            if (aVal == null && bVal == null) return 0
            if (aVal == null) return 1
            if (bVal == null) return -1
            if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
            return String(aVal).localeCompare(String(bVal)) * dir
          })
        }
      }
      return result
    },

    totalPages() {
      if (this.noPagination) return 1
      return Math.max(1, Math.ceil(this.filteredRows.length / this.rowsPerPage))
    },

    paginatedRows() {
      if (this.noPagination || this.virtualScroll) return this.filteredRows
      const start = (this.localPage - 1) * this.rowsPerPage
      return this.filteredRows.slice(start, start + this.rowsPerPage)
    },

    paginationStart() {
      return (this.localPage - 1) * this.rowsPerPage + 1
    },

    paginationEnd() {
      return Math.min(this.localPage * this.rowsPerPage, this.filteredRows.length)
    },

    virtualRows() {
      if (!this.virtualScroll || !this.virtualizer) return []
      return this.virtualizer.getVirtualItems()
    },

    virtualContainerStyle() {
      return { display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    },
  },

  watch: {
    filter() {
      this.localPage = 1
    },
    rows() {
      // Reset page if current page is beyond available data
      if (this.localPage > this.totalPages) {
        this.localPage = Math.max(1, this.totalPages)
      }
    },
  },

  methods: {
    rowKeyFn(row) {
      if (!row) return undefined
      return row[this.rowKey]
    },

    cellValue(row, col) {
      if (typeof col.field === 'function') return col.field(row)
      return row[col.field || col.name]
    },

    headerCellClasses(col) {
      return [
        'basil-table__th',
        col.align && `text-${col.align}`,
        col.sortable !== false && 'basil-table__th--sortable',
        col.headerClass,
      ]
    },

    cellClasses(col) {
      return [
        'basil-table__td',
        col.align && `text-${col.align}`,
      ]
    },

    rowClasses(row) {
      return ['basil-table__tr']
    },

    onHeaderClick(col) {
      if (this.localSort.field === col.name) {
        this.localSort.dir = this.localSort.dir === 'asc' ? 'desc' : 'asc'
      } else {
        this.localSort.field = col.name
        this.localSort.dir = 'asc'
      }
    },

    onVirtualContainerScroll() {
      if (!this.virtualizer) return
      const items = this.virtualizer.getVirtualItems()
      if (items.length === 0) return
      const lastItem = items[items.length - 1]
      this.$emit('virtual-scroll', {
        to: lastItem.index,
        from: items[0].index,
        direction: 'increase',
      })
    },
  },
}
</script>

<style>
.basil-table {
  position: relative;
  background: var(--basil-surface);
  border-radius: var(--basil-radius-lg);
}

.basil-table--bordered {
  border: 1px solid var(--basil-border);
}

.basil-table:not(.basil-table--flat) {
  box-shadow: var(--basil-shadow-sm);
}

.basil-table--flat {
  box-shadow: none;
}

.basil-table__el {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
}

/* Top bar */
.basil-table__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--basil-space-3) var(--basil-space-4);
  gap: var(--basil-space-3);
}

.basil-table__title {
  font-family: var(--basil-font-display);
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--basil-text);
}

.basil-table__top-right {
  display: flex;
  align-items: center;
  gap: var(--basil-space-2);
}

/* Header cells */
.basil-table__head {
  border-bottom: 2px solid var(--basil-border-strong, var(--basil-border));
}

.basil-table__th {
  padding: var(--basil-space-2) var(--basil-space-3);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--basil-text-muted);
  white-space: nowrap;
  user-select: none;
  text-align: left;
}

.basil-table__th--sortable {
  cursor: pointer;
}

.basil-table__th--sortable:hover {
  color: var(--basil-text);
}

.basil-table__sort-icon {
  font-size: 14px;
  vertical-align: middle;
  margin-left: var(--basil-space-1);
}

/* Body cells */
.basil-table__td {
  padding: var(--basil-space-2) var(--basil-space-3);
  font-size: 0.875rem;
  color: var(--basil-text);
  vertical-align: middle;
}

.basil-table--separator-horizontal .basil-table__tr + .basil-table__tr .basil-table__td {
  border-top: 1px solid var(--basil-border);
}

.basil-table__tr {
  transition: background var(--basil-t-fast) var(--basil-ease);
}

.basil-table__tr:hover {
  background: var(--basil-surface-alt);
}

/* Alignment helpers */
.basil-table .text-left { text-align: left; }
.basil-table .text-right { text-align: right; }
.basil-table .text-center { text-align: center; }

/* Pagination */
.basil-table__pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--basil-space-2);
  padding: var(--basil-space-2) var(--basil-space-3);
  border-top: 1px solid var(--basil-border);
}

.basil-table__page-info {
  font-size: 0.8125rem;
  color: var(--basil-text-secondary);
}

.basil-table__page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--basil-radius-sm);
  background: transparent;
  color: var(--basil-text-secondary);
  cursor: pointer;
  transition: background var(--basil-t-fast) var(--basil-ease);
}

.basil-table__page-btn:hover:not(:disabled) {
  background: var(--basil-surface-alt);
}

.basil-table__page-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.basil-table__page-btn .material-icons {
  font-size: 20px;
}

/* Loading overlay */
.basil-table__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--basil-overlay-light, rgba(255,255,255,0.6));
  border-radius: inherit;
  z-index: 1;
}

[data-theme="dark"] .basil-table__loading {
  background: rgba(0,0,0,0.4);
}

/* Virtual scroll */
.basil-table__virtual-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* Bottom slot */
.basil-table__bottom {
  padding: var(--basil-space-2) var(--basil-space-3);
  border-top: 1px solid var(--basil-border);
}

/* Markup table (simple static table replacement for q-markup-table) */
.basil-markup-table {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  font-size: 0.8125rem;
}

.basil-markup-table th {
  padding: var(--basil-space-2) var(--basil-space-3);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--basil-text-muted);
  text-align: left;
  border-bottom: 2px solid var(--basil-border-strong, var(--basil-border));
}

.basil-markup-table td {
  padding: var(--basil-space-2) var(--basil-space-3);
  color: var(--basil-text);
  border-top: 1px solid var(--basil-border);
  vertical-align: middle;
}

.basil-markup-table tr:first-child td {
  border-top: none;
}

.basil-markup-table .text-left { text-align: left; }
.basil-markup-table .text-right { text-align: right; }
.basil-markup-table .text-center { text-align: center; }
</style>
