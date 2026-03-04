<style src="../styles/BudgetView.css"></style>
<style src="../styles/OnboardingView.css"></style>

<template>
  <q-pull-to-refresh @refresh="onPullRefresh" :disable="!$q.screen.lt.sm">
  <div class="table-wrapper">

  <EmptyState
    v-if="!isLoggedIn"
    icon="account_circle"
    heading="Sign in to see your budget"
    body="Connect your bank accounts to start tracking spending and income."
  >
    <q-btn unelevated color="primary" label="Go to Profile" to="/profile" class="q-mt-sm" />
  </EmptyState>

  <div v-show="isLoggedIn">
    <SkeletonBudget v-if="isLoading" />
      <div v-show="!isLoading" class="q-pa-md" style="max-width: 800px; margin: 0 auto;">

        <!-- Set up Basil card — shown when logged in but no categories yet -->
        <div v-if="isLoggedIn && !categoryMonthlyLimits.length && !isRefreshing" class="q-mb-md">
          <q-card class="my-card basil-setup-card">
            <div class="basil-card-head">
              <span class="basil-card-label">Get started</span>
            </div>
            <div class="basil-setup-card__body">
              <q-icon name="auto_awesome" color="primary" size="2rem" />
              <div>
                <div class="basil-setup-card__heading">Set up Basil</div>
                <div class="basil-setup-card__hint">Connect your bank and configure your budget in a few quick steps.</div>
              </div>
            </div>
            <q-btn unelevated color="primary" label="Set up Basil" to="/onboarding" class="q-mt-md" />
          </q-card>
        </div>

        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 220px;">
        <q-card class="my-card basil-actuals-card">
          <div class="basil-card-head">
            <span class="basil-card-label">Actuals</span>
            <span class="basil-card-period">{{ selectedDate.display }}</span>
          </div>

          <!-- Spent vs Earned -->
          <div class="basil-primary-stats">
            <div class="basil-primary-stat">
              <div class="basil-primary-stat__amount basil-display">
                ${{ Math.round(displayedStats.expenseSpend).toLocaleString() }}
              </div>
              <div class="basil-primary-stat__label">spent</div>
            </div>
            <div class="basil-primary-stats__divider"></div>
            <div class="basil-primary-stat basil-primary-stat--earned">
              <div class="basil-primary-stat__amount basil-display">
                ${{ Math.round(displayedStats.incomeAmount).toLocaleString() }}
              </div>
              <div class="basil-primary-stat__label">earned</div>
            </div>
          </div>

          <div class="basil-card-rule"></div>

          <!-- Net position — hero stat -->
          <div :class="['basil-net', netPositive ? 'basil-net--positive' : 'basil-net--negative']">
            <div class="basil-net__amount basil-display">
              {{ netPositive ? '+' : '−' }}${{ Math.round(Math.abs(displayedStats.netPosition)).toLocaleString() }}
            </div>
            <div class="basil-net__label">{{ netPositive ? 'free cash flow' : 'over budget' }}</div>
          </div>

          <!-- Secondary stats -->
          <div v-if="monthlyStats.savingsAmount > 0" class="basil-secondary-stat">
            <q-icon name="savings" size="xs" color="info" />
            ${{ Math.round(monthlyStats.savingsAmount).toLocaleString() }} saved
          </div>
          <div v-if="monthlyStats.toSortSpending > 0" class="basil-secondary-stat basil-secondary-stat--warn">
            <q-icon name="warning_amber" size="xs" />
            ${{ Math.round(monthlyStats.toSortSpending).toLocaleString() }} unsorted
          </div>
        </q-card>
        </div>
        <div style="flex: 1; min-width: 220px;">
        <q-card class="my-card basil-projections-card">
          <div class="basil-card-head">
            <span class="basil-card-label">Projections</span>
          </div>

          <div v-if="monthlyStats.budgetRemaining > 0" class="basil-primary-stat">
            <div class="basil-primary-stat__amount basil-display">
              ${{ Math.round(monthlyStats.budgetRemaining).toLocaleString() }}
            </div>
            <div class="basil-primary-stat__label">left in budgets</div>
          </div>

          <div
            v-if="isCurrentMonth && forecastedEndOfMonth.remainingRecurringCount > 0"
            :class="['basil-forecast', monthlyStats.budgetRemaining > 0 ? 'basil-forecast--mt' : '']"
          >
            <div class="basil-forecast__amount basil-display">
              ~${{ Math.round(forecastedEndOfMonth.expectedRemaining).toLocaleString() }}
            </div>
            <div class="basil-forecast__label">
              <span v-if="forecastedEndOfMonth.remainingRecurringCount === 1">
                {{ forecastedEndOfMonth.remainingMerchantNames[0] }} hasn't posted yet
              </span>
              <span v-else>
                {{ forecastedEndOfMonth.remainingRecurringCount }} recurring merchants still expected
              </span>
            </div>
          </div>
        </q-card>
        </div>
        </div>
      </div>

      <!-- Button Container -->
      <div class="q-pa-md button-container" style="max-width: 800px; margin: 0 auto;">
        <q-toggle v-model="showAll" v-if="!showAll" @click="showAll = true" label="Show all transactions" />
        <q-toggle v-model="showAll" v-if="showAll" @click="showAll = false" label="Show all transactions"  />
        <q-select v-if="!showAll" outlined v-model="selectedDate.display" :options="months" label="Budgets" @touchmove.stop.prevent />
      </div>

      <!-- If show all is false -->    
      <div v-show="!showAll" class="q-pa-md" style="max-width: 800px; margin: 0 auto;">
        <q-list>
          <div class="categories">
            <div
              v-for="(groupedTransactions, category, categoryIndex) in groupedTransactions"
              :key="category"
              class="budget-container"
              :class="{ 'basil-category-reveal': barsReady }"
              :style="barsReady ? { animationDelay: `${categoryIndex * 35}ms` } : {}"
            >

              <!-- Make a category List Item -->
              <q-item
                v-show="this.groupedTransactions[category].showOnBudgetPage"
                clickable v-ripple
                @click="toggleCategory(category)"
                category="category"
                elevated
                :class="[
                  { 'active': clickedCategories.includes(category) },
                  'basil-category-row',
                  `basil-category-row--${groupedTransactions.type || 'expense'}`
                ]"
              >
                <q-item-section>

                  <div class="budget-container header">
                    <q-item-label>
                      {{this.groupedTransactions[category].categoryName}}
                      <q-icon
                        v-if="recurringByCategory[this.groupedTransactions[category].categoryName]"
                        name="autorenew"
                        size="xs"
                        color="grey-6"
                        style="vertical-align: middle; margin-left: 4px;"
                      >
                        <q-tooltip>Contains recurring transactions</q-tooltip>
                      </q-icon>
                    </q-item-label>
                    <q-item-label class="budget-container total">
                      {{ categoryAmountLabel(category) }}
                    </q-item-label>
                  </div>
                  <div v-show="this.groupedTransactions[category].monthly_limit" class="budget-container progress">
                    <q-linear-progress
                      :value="barsReady ? getProgressRatio(category) : 0"
                      :class="['q-mt-sm', 'basil-progress', `basil-progress--${getCategoryProgressColor(category)}`]"
                      :color="getCategoryProgressColor(category)"
                      size="md"
                    />
                  </div>

                  <q-item-label caption class="budget-container" v-show="this.groupedTransactions[category].monthly_limit">
                    {{ isNaN(categorySum(category)) ? "N/A" : formatDollar(categorySum(category).toFixed(this.decimalPlaces)) }}
                    {{ isNaN(this.groupedTransactions[category].monthly_limit) ||
                        this.groupedTransactions[category].monthly_limit == 0 ? "" : " out of " + formatDollar(this.groupedTransactions[category].monthly_limit) }}
                  </q-item-label>
                </q-item-section>

                <!-- Edit Pencil Icon -->
                <q-item-section side>
                  <q-icon 
                  style="font-size: 16px;"
                  name="edit"
                  class="icon-hover"
                  clickable
                  @click.stop="buildEditCategoryDialog(category)">
                  
                  <!-- Start Making Dialog Box -->
                        <!-- Dialog: Edit Category  -->
                    <q-dialog v-model="categoryClickers[category]" class="dialog" :maximized="maximizedToggle" transition-show="slide-up" transition-hide="slide-down">
                      <DialogComponent :dialogType="'editCategory'" :item="this.dialogBody.currentCategoryDetails" @update-category="onSubmit"/>
                    </q-dialog>
                  </q-icon>
                </q-item-section>
              </q-item>
              
            <!-- Make the nested rows grouped under each category List Item -->
            <q-list>
              <Transition name="basil-txn-expand" :duration="{ enter: 800, leave: 150 }">
              <div v-if="groupedTransactionsVisible[category]" class="category-transactions">
                <!-- <Table :headerLabels="tableHeaders" :tableData="filteredTransactions(groupedTransactions)" /> -->
                <div
                  v-for="(item, index) in filteredTransactions(groupedTransactions)"
                  :key="index"
                  class="category-txn-item"
                  :style="{ '--txn-i': index }"
                >

                  <q-item clickable v-ripple :class="[item.pending ? 'pending' : 'posted']" @click.stop="buildEditTransactionDialog(item)">
                      <q-item-section>
                        <q-item-label lines="1">{{item.name == 'Venmo' ? item.name + (item.note ?  ': '+ item.note : '') : item.name }}</q-item-label>
                        <q-item-label caption lines="2">{{ item.date }}</q-item-label>
                      </q-item-section>
                      <div class="transaction-decoration">
                        <q-item-section side top>
                          {{ isNaN(item.amount) ? "N/A" : formatDollar(item.amount.toFixed(2), '-') }}                    
                        </q-item-section>
                        <q-item-section side bottom v-if="item.excludeFromTotal">
                          <q-badge label="excluded" />
                        </q-item-section>
                      </div>
                      <q-dialog v-model="transactionClickers[item.transaction_id]" class="dialog" :maximized="maximizedToggle" transition-show="slide-up" transition-hide="slide-down">
                        <DialogComponent :dialogType="'transaction'" :item="item" 
                        :dropDown="this.categoryMonthlyLimits" 
                        @update-transaction="onSubmit"/>
                      </q-dialog>
                    </q-item>
                </div>
              </div>
              </Transition>
              </q-list>
            </div>
          </div>
        </q-list>
      </div>

      <!-- If show all is true -->
      <div v-show="showAll" class="q-pa-md all-transactions-table">

        <!-- Toolbar: filters when nothing selected, bulk actions when rows are selected -->
        <div class="row items-center q-gutter-sm q-mb-sm">
          <template v-if="selectedRows.length === 0">
            <q-input
              v-model="tableSearch"
              dense
              outlined
              placeholder="Search name or merchant"
              clearable
              style="flex: 1; min-width: 150px"
            >
              <template v-slot:prepend>
                <q-icon name="search" />
              </template>
            </q-input>
            <q-select
              v-model="tableMonth"
              :options="[{ label: 'All months', value: null }, ...months.map(m => ({ label: m, value: m }))]"
              option-label="label"
              option-value="value"
              emit-value
              map-options
              dense
              outlined
              style="min-width: 140px"
              @touchmove.stop.prevent
            />
            <q-input
              v-model="amountMin"
              dense
              outlined
              type="number"
              placeholder="Min $"
              style="width: 90px"
              class="gt-xs"
            />
            <q-input
              v-model="amountMax"
              dense
              outlined
              type="number"
              placeholder="Max $"
              style="width: 90px"
              class="gt-xs"
            />
            <q-btn
              flat
              label="Clear"
              :disable="!tableSearch && tableMonth === null && amountMin === null && amountMax === null"
              @click="tableSearch = ''; tableMonth = null; amountMin = null; amountMax = null"
            />
          </template>

          <template v-else>
            <div class="gt-xs row items-center q-gutter-sm full-width">
              <span class="basil-bulk-label">{{ selectedRows.length }} selected</span>
              <q-select
                v-model="bulkCategory"
                :options="categoryMonthlyLimits.map(c => c.category).sort()"
                label="Move to category"
                dense
                outlined
                style="min-width: 180px"
                @touchmove.stop.prevent
              />
              <q-btn color="primary" label="Apply" :disable="!bulkCategory" @click="applyBulkCategory" />
              <q-btn flat label="Clear selection" @click="selectedRows = []" />
              <span v-if="bulkCategory" class="basil-bulk-disclosure">
                Moves {{ selectedRows.length }} transaction{{ selectedRows.length === 1 ? '' : 's' }} to {{ bulkCategory }}. No rule is created.
              </span>
            </div>
          </template>
        </div>

        <q-table
          :title="`All Transactions (${tableTransactions.length})`"
          :rows="tableTransactions"
          :columns="columns"
          row-key="transaction_id"
          :filter="tableSearch"
          :rows-per-page-options="[0]"
          selection="multiple"
          v-model:selected="selectedRows"
          virtual-scroll
          :virtual-scroll-item-size="52"
          style="max-height: calc(100vh - 220px)"
          class="basil-txn-table"
        >
          <template v-slot:body="props">
            <q-tr
              :props="props"
              :class="['basil-txn-row', { 'basil-txn-row--excluded': props.row.excludeFromTotal }]"
              @click="openTableDialog($event, props.row)"
            >
              <q-td auto-width>
                <q-checkbox dense v-model="props.selected" @click.stop />
              </q-td>

              <!-- Name: initials avatar + label -->
              <q-td key="name" :props="props">
                <div class="basil-txn-cell">
                  <div class="basil-txn-avatar" :style="{ background: merchantColor(props.row) }">
                    {{ merchantInitials(props.row) }}
                  </div>
                  <div class="basil-txn-label">
                    <div class="basil-txn-label__primary">{{ props.row.merchant_name || props.row.name }}</div>
                    <div
                      v-if="props.row.merchant_name && props.row.merchant_name !== props.row.name"
                      class="basil-txn-label__secondary"
                    >{{ props.row.name }}</div>
                  </div>
                </div>
              </q-td>

              <!-- Amount: monospace, colored -->
              <q-td key="amount" :props="props" class="text-right">
                <span
                  class="basil-txn-amount"
                  :class="props.row.amount >= 0 ? 'basil-txn-amount--credit' : 'basil-txn-amount--debit'"
                >
                  {{ props.row.amount < 0 ? `-$${Math.abs(props.row.amount).toFixed(2)}` : `$${Number(props.row.amount).toFixed(2)}` }}
                </span>
              </q-td>

              <!-- Category (desktop only) -->
              <q-td key="mappedCategory" :props="props" class="gt-xs">
                {{ props.row.mappedCategory }}
              </q-td>

              <!-- Date (desktop only) -->
              <q-td key="date" :props="props" class="gt-xs">
                {{ formatDate(props.row.date) }}
              </q-td>

              <!-- Status (desktop only) -->
              <q-td key="pending" :props="props" class="gt-xs text-center">
                <span v-if="props.row.pending" class="basil-txn-pending">Pending</span>
              </q-td>
            </q-tr>
          </template>
        </q-table>

        <q-dialog v-model="tableDialogOpen" :maximized="maximizedToggle" transition-show="slide-up" transition-hide="slide-down">
          <DialogComponent
            v-if="tableDialogTransaction"
            :dialogType="'transaction'"
            :item="tableDialogTransaction"
            :dropDown="categoryMonthlyLimits"
            @update-transaction="onSubmit"
          />
        </q-dialog>
      </div>

    </div>

    <!-- Mobile bulk action bar — sits above bottom nav -->
    <div
      v-if="showAll && selectedRows.length > 0"
      class="lt-sm basil-mobile-bulk q-pa-sm"
      style="position: fixed; left: 0; right: 0; bottom: var(--basil-bottom-nav-height); z-index: 2000"
    >
      <div class="row items-center q-gutter-sm q-mb-xs">
        <span class="basil-bulk-label col-auto">{{ selectedRows.length }} selected</span>
        <q-btn flat dense round icon="close" @click="selectedRows = []" class="col-auto" />
      </div>
      <div class="row items-center q-gutter-sm">
        <q-select
          v-model="bulkCategory"
          :options="categoryMonthlyLimits.map(c => c.category).sort()"
          label="Move to category"
          dense
          outlined
          style="flex: 1"
          @touchmove.stop.prevent
        />
        <q-btn color="primary" label="Apply" :disable="!bulkCategory" @click="applyBulkCategory" />
      </div>
      <div v-if="bulkCategory" class="basil-bulk-disclosure q-mt-xs">
        Moves {{ selectedRows.length }} transaction{{ selectedRows.length === 1 ? '' : 's' }} to {{ bulkCategory }}. No rule is created.
      </div>
    </div>
    

    <q-page-sticky class="floating-button gt-xs" position="bottom-right" :offset="[25,25]">
      <q-fab
      v-model="fabRight"
      vertical-actions-align="right"
      color="primary"
      glossy
      icon="keyboard_arrow_up"
      direction="up"
      >
      <q-fab-action label-position="right" color="primary" @click="addCategoryDialog" icon="add" label="Add Category" />
      <q-fab-action label-position="right" color="secondary" @click="forceSync" icon="sync" label="Sync" />
      <!-- <q-fab-action label-position="right" color="orange" @click="onClick" icon="airplay" label="Airplay" />
      <q-fab-action label-position="right" color="accent" @click="onClick" icon="room" label="Map" />  -->
    </q-fab>
    <q-dialog v-model="newCategory" class="dialog" :maximized="maximizedToggle" transition-show="slide-up" transition-hide="slide-down">
      <DialogComponent :dialogType="'addCategory'" @add-category="onSubmit"/>
    </q-dialog>
    </q-page-sticky>
  </div>
  </q-pull-to-refresh>
</template>


<script>
  import {ref} from 'vue'
  import dayjs from 'dayjs'
  import minMax from 'dayjs/plugin/minMax';
  import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
  import customParseFormat from 'dayjs/plugin/customParseFormat'
  import DialogComponent from '../components/DialogComponent.vue'
  import SkeletonBudget from '../components/SkeletonBudget.vue'
  import EmptyState from '../components/EmptyState.vue'
  import store from '../store'
  import { fetchTransactions, handleDialogSubmit, fetchCategories, bulkCategorize, deleteRule, fetchMerchants, saveRule } from '@/firebase';

// import e from 'express';

  dayjs().format()
  dayjs.extend(minMax);
  dayjs.extend(isSameOrBefore);
  dayjs.extend(customParseFormat);

  const columns = [
  { name: 'name',          label: 'Name',     align: 'left',   field: row => row.merchant_name || row.name, sortable: true },
  { name: 'amount',        label: 'Amount',   align: 'right',  field: 'amount',               format: val => val < 0 ? `-$${Math.abs(val).toFixed(2)}` : `$${Number(val).toFixed(2)}`, sortable: true },
  { name: 'mappedCategory',label: 'Category', align: 'left',   field: 'mappedCategory',       sortable: true,  classes: 'gt-xs', headerClasses: 'gt-xs' },
  { name: 'date',          label: 'Date',     align: 'left',   field: row => row.date,        format: val => dayjs(val).format('MMM D, YYYY'), sortable: true, classes: 'gt-xs', headerClasses: 'gt-xs' },
  { name: 'pending',       label: 'Status',   align: 'center', field: 'pending',              format: val => val ? 'Pending' : '', classes: 'gt-xs', headerClasses: 'gt-xs' },
  ]
  export default {
    components: {
      DialogComponent,
      SkeletonBudget,
      EmptyState
    },
    data() {
      const currentDate = dayjs();
      const selectedDate = {
        display: dayjs(currentDate).format('MMMM YYYY'),
        actual: dayjs(currentDate)
      }
      return {   
        isLoggedIn: false,
        isLoading: true,
        isRefreshing: false,
        selectedDate, 
        currentDate,
        clicker: ref(false),
        clicker2: ref(false),
        transactionClickers: {},
        newCategory: false,
        fabRight: false,
        categoryClickers: {},
        maximizedToggle: ref(true),
        transactionDetails: {},
        decimalPlaces: 0,
        fetchInterval: 0,
        columns,
        lastFetch: 0,
        tableHeaders: ["date", "name", "mappedCategory", "amount", "pending"],
        currentMonth: "",
        months: [], // array of month/year strings
        transactions: [],
        groupedTransactions: {},
        groupedTransactionsVisible: {},
        showAll: false,
        clickedCategories: [], // stores the clicked categories
        categoryMonthlyLimits: [],
        dialogBody:{},
        updatedShowOnBudgetPage: ref(true),
        addedCategory: {},
        updatedCategory:{},
        updatedTransaction:{},
        pagination: {
          rowsPerPage: 30 // current rows per page being displayed
        },
        monthlyStats:{},
        displayedStats: { expenseSpend: 0, incomeAmount: 0, savingsAmount: 0, netPosition: 0 },
        barsReady: false,
        selectedRows: [],
        bulkCategory: null,
        tableDialogOpen: false,
        tableDialogTransaction: null,
        tableSearch: '',
        tableMonth: null,
        amountMin: null,
        amountMax: null,
      };
    },
    computed: {
      netPositive() {
        return (this.monthlyStats.netPosition || 0) >= 0;
      },
      tableTransactions() {
        let rows = this.transactions;
        if (this.tableMonth) {
          const m = dayjs(this.tableMonth, 'MMMM YYYY');
          rows = rows.filter(t =>
            dayjs(t.date).year() === m.year() &&
            dayjs(t.date).month() === m.month()
          );
        }
        if (this.amountMin !== null && this.amountMin !== '') {
          rows = rows.filter(t => Math.abs(t.amount) >= Number(this.amountMin));
        }
        if (this.amountMax !== null && this.amountMax !== '') {
          rows = rows.filter(t => Math.abs(t.amount) <= Number(this.amountMax));
        }
        return rows;
      },
      filteredTransactions: function() {
        let selectedDate = this.selectedDate.actual;
        return function (groupedTransactions) {
          // console.log('this.selectedDate',selectedDate.year())
          const filtered = groupedTransactions.length === 0
            ? []
            : groupedTransactions.filter(
                (transaction) =>
                  dayjs(transaction.date).year() === selectedDate.year() &&
                  dayjs(transaction.date).month() === selectedDate.month()
              );
          // console.log('filteredTransactions', filtered)
          return filtered; 
        };
      },
      categorySum() { // returns sums of txns for each group in budget table
        return (category) => {
          // console.log('groupedTransactions (reminder) ', this.groupedTransactions[category].monthly_limit)
          const filtered = this.filteredTransactions(
            this.groupedTransactions[category]
          );
          let sum = 0;
          for (const transaction of filtered) {
            // if transaction.excludeFromTotal is true, exclude from total
            if (transaction.excludeFromTotal === true) {
              continue;
            }
            // if transaction.amount is a number, add to total
            if (typeof transaction.amount === 'number') {
              sum += parseFloat(transaction.amount);
            }
            // if transaction.amount is a string, convert to number
            else if (typeof transaction.amount ==='string') {
              sum += parseFloat(transaction.amount.replace(/,/g, ''));
            }
          }
          return Number.isNaN(sum) ? NaN : sum;
        };
      },
      recurringMerchants() {
        const allTxns = (store.state.transactions || []).filter(t => !t.pending);
        const now = dayjs();
        const lastThree = [
          now.subtract(1, 'month').format('YYYY-MM'),
          now.subtract(2, 'month').format('YYYY-MM'),
          now.subtract(3, 'month').format('YYYY-MM'),
        ];
        const merchantMonths = {};
        for (const txn of allTxns) {
          const key = txn.merchant_name || txn.name;
          if (!key) continue;
          const m = dayjs(txn.date).format('YYYY-MM');
          if (!merchantMonths[key]) merchantMonths[key] = new Set();
          merchantMonths[key].add(m);
        }
        const result = new Set();
        for (const [key, months] of Object.entries(merchantMonths)) {
          if (lastThree.filter(m => months.has(m)).length >= 2) result.add(key);
        }
        return result;
      },
      recurringByCategory() {
        const map = {};
        const recurring = this.recurringMerchants;
        for (const txn of store.state.transactions || []) {
          const key = txn.merchant_name || txn.name;
          if (txn.mappedCategory && recurring.has(key)) map[txn.mappedCategory] = true;
        }
        return map;
      },
      isCurrentMonth() {
        return this.selectedDate.actual.format('YYYY-MM') === dayjs().format('YYYY-MM');
      },
      forecastedEndOfMonth() {
        const recurring = this.recurringMerchants;
        const categories = store.state.categories || [];
        const allTxns = (store.state.transactions || []).filter(t => !t.pending && !t.excludeFromTotal);
        const now = dayjs();
        const currentMonth = now.format('YYYY-MM');
        const lastThree = [
          now.subtract(1, 'month').format('YYYY-MM'),
          now.subtract(2, 'month').format('YYYY-MM'),
          now.subtract(3, 'month').format('YYYY-MM'),
        ];
        // Average monthly spend per recurring merchant from last 3 months
        const merchantAvg = {};
        for (const key of recurring) {
          let total = 0, count = 0;
          for (const m of lastThree) {
            const monthTotal = allTxns
              .filter(t => (t.merchant_name || t.name) === key && dayjs(t.date).format('YYYY-MM') === m)
              .reduce((s, t) => s + Math.abs(t.amount), 0);
            if (monthTotal > 0) { total += monthTotal; count++; }
          }
          merchantAvg[key] = count > 0 ? total / count : 0;
        }
        // Which recurring merchants have already appeared this month?
        const appearedThisMonth = new Set(
          allTxns
            .filter(t => dayjs(t.date).format('YYYY-MM') === currentMonth && recurring.has(t.merchant_name || t.name))
            .map(t => t.merchant_name || t.name)
        );
        // Sum expected remaining from recurring merchants not yet seen
        let expectedRemaining = 0;
        const remainingMerchantNames = [];
        for (const key of recurring) {
          if (!appearedThisMonth.has(key)) {
            expectedRemaining += merchantAvg[key];
            remainingMerchantNames.push(key);
          }
        }
        return {
          expectedRemaining: Math.round(expectedRemaining),
          remainingRecurringCount: remainingMerchantNames.length,
          remainingMerchantNames,
        };
      },
monthStats() {
        return (groupedTransactions) => {
          let monthlySum = 0; // sum of all categories
          let toSortSpending = 0; // sum of to sort category
          let projectedSum = 0; // budget-based end-of-month projection
          let budgetRemaining = 0;
          let totalExp = 0;
          let absoluteSpend = 0;
          let expenseSpend = 0; // expense-type categories only, positive
          let incomeAmount = 0; // income-type categories only, positive
          let savingsAmount = 0; // savings-type categories only, positive
          for (const category in groupedTransactions) {
            if(category !== 'Payment' ){
              absoluteSpend += this.categorySum(category)
            }
            const catSum = this.categorySum(category);
            if (!isNaN(catSum)) {
              if (this.groupedTransactions[category].type === 'expense') {
                expenseSpend += Math.abs(catSum);
                totalExp += catSum;
              }
              if (this.groupedTransactions[category].type === 'income') {
                incomeAmount += Math.abs(catSum);
              }
              if (this.groupedTransactions[category].type === 'savings') {
                savingsAmount += Math.abs(catSum);
              }
            }
            if (this.isBudgetRemaining(category) == true) {
              projectedSum += (Number(this.groupedTransactions[category].monthly_limit))
              if (this.groupedTransactions[category].monthly_limit >= this.categorySum(category)){
                if (groupedTransactions[category].type == 'expense') budgetRemaining += this.budgetRemaining(category)
              }
            }
            if (this.isBudgetRemaining(category) == false && category !== 'Payment'){
              projectedSum += this.categorySum(category)
            }
            if (this.categorySum(category) && groupedTransactions[category].showOnBudgetPage == true) {
              if(groupedTransactions[category].type == 'expense' || groupedTransactions[category].type == 'income'){
                monthlySum += this.categorySum(category)
              }
              if(category == 'To Sort' ){
                toSortSpending += this.categorySum(category)
              }
            }
          }
          monthlySum=monthlySum.toFixed(2),
          toSortSpending=toSortSpending.toFixed(2)
          return {
            monthlySum,
            toSortSpending,
            projectedSum,
            budgetRemaining,
            totalExp,
            absoluteSpend,
            expenseSpend,
            incomeAmount,
            savingsAmount,
            netPosition: incomeAmount - expenseSpend - savingsAmount,
          }
        }
      },
    },
    methods: {
      animateStats(from, to) {
        if (!to || !Object.keys(to).length) return;
        const fields = ['expenseSpend', 'incomeAmount', 'savingsAmount', 'netPosition'];
        const startVals = {};
        for (const f of fields) startVals[f] = this.displayedStats[f] || 0;
        const endVals = {};
        for (const f of fields) endVals[f] = to[f] || 0;

        const duration = 600;
        const startTime = performance.now();

        if (this._animFrame) {
          cancelAnimationFrame(this._animFrame);
          this._animFrame = null;
        }

        const tick = (now) => {
          const t = 1 - Math.pow(1 - Math.min((now - startTime) / duration, 1), 3); // ease-out cubic
          for (const f of fields) {
            this.displayedStats[f] = startVals[f] + (endVals[f] - startVals[f]) * t;
          }
          if (t < 1) {
            this._animFrame = requestAnimationFrame(tick);
          } else {
            this._animFrame = null;
          }
        };
        this._animFrame = requestAnimationFrame(tick);
      },
      categoryAmountLabel(category) {
        const type = this.groupedTransactions[category].type;
        const sum = this.categorySum(category);
        const limit = this.groupedTransactions[category].monthly_limit;
        if (type === 'income') {
          if (isNaN(sum)) return 'N/A';
          const received = Math.abs(sum);
          if (!limit || limit === 0) return this.formatDollar(received.toFixed(0)) + ' received';
          const stillExpected = limit - received;
          return stillExpected > 0
            ? this.formatDollar(stillExpected.toFixed(0)) + ' expected'
            : this.formatDollar(received.toFixed(0)) + ' received';
        }
        if (type === 'savings') {
          if (isNaN(sum)) return 'N/A';
          return this.formatDollar(Math.abs(sum).toFixed(0)) + ' saved';
        }
        // expense / payment / other
        if (isNaN(this.budgetRemaining(category))) {
          return isNaN(sum) ? 'N/A' : this.formatDollar(sum.toFixed(0)) + ' spent';
        }
        return this.isBudgetRemaining(category)
          ? this.formatDollar(this.budgetRemaining(category).toFixed(0)) + ' left'
          : this.formatDollar(Math.abs(this.budgetRemaining(category).toFixed(0))) + ' over';
      },
      formatDollar(value, Prefix = null) {
        let val = (value/1).toFixed(2).replace('.', '.');
        let prefix = Prefix == null ? '' : Prefix;
        if (value < 0) {
          prefix = ''; // change to `prefix = '-'` for negative income values
        }
        if (isNaN(val)) val = 0;
        return prefix + '$' + Math.abs(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      },
      addCategoryDialog(){
        if(!this.newCategory){
          this.newCategory = true
          this.fabRight = true
        } else{
          this.newCategory = !this.newCategory;
          this.fabRight = !this.fabRight;
        }
        return this.newCategory
      },
      buildEditCategoryDialog(category){ // Should this code live on DialogComponent
        this.clicker = !this.clicker;

        if(!this.categoryClickers[category]){
            this.categoryClickers[category] = true
          } else{
            this.categoryClickers[category] = !this.categoryClickers[category]
          }
          // // Set up the client-side tracking for what to display at the category level
          // Important: whatever props you want to build the popup; example: `this.dialogBody.foobar = 'bootylicious' `
          const merchantRuleMap = {};
          this.categoryMonthlyLimits.forEach(cat => {
            (cat.rules?.merchant_name || []).forEach(merchant => {
              merchantRuleMap[merchant] = cat.category;
            });
          });

          let isOriginalCategoryNameSet = false;
          this.dialogBody.currentCategoryDetails = {
            _id: this.dialogBody._id = this.groupedTransactions[category]._id,
            type: this.dialogBody.type = this.groupedTransactions[category].type,
            monthly_limit: this.dialogBody.monthly_limit = this.groupedTransactions[category].monthly_limit,
            categoryName: this.dialogBody.categoryName = this.groupedTransactions[category].categoryName,
            showOnBudgetPage: this.dialogBody.showOnBudgetPage = this.groupedTransactions[category].showOnBudgetPage,
            plaid_pfc: this.groupedTransactions[category].plaid_pfc || [],
            rules: this.groupedTransactions[category].rules || {},
            merchants: [],
            merchantRuleMap,
            originalCategoryName: isOriginalCategoryNameSet ? this.dialogBody.currentCategoryDetails.originalCategoryName : this.groupedTransactions[category].originalName
          }
          isOriginalCategoryNameSet = true;
          if (!this.dialogBody.currentCategoryDetails.originalCategoryName){
            this.dialogBody.currentCategoryDetails.originalCategoryName = this.groupedTransactions[category].categoryName
          }
          // Fetch merchants lazily so the dropdown is ready when the user needs it
          fetchMerchants().then(list => {
            if (list) this.dialogBody.currentCategoryDetails.merchants = list;
          });
          return this.categoryClickers[category.categoryName];
      },
      buildEditTransactionDialog(e){ // Should this live on DialogComponent?
          let isOriginalCategoryNameSet = false;
          this.dialogBody.currentTransactionDetails = {
            originalCategoryName: isOriginalCategoryNameSet ? this.dialogBody.currentTransactionDetails.originalCategoryName : this.groupedTransactions[e.mappedCategory].originalName
          }
          isOriginalCategoryNameSet = true;
          if (!this.dialogBody.currentTransactionDetails.originalCategoryName){
            this.dialogBody.currentTransactionDetails.originalCategoryName = this.groupedTransactions[e.mappedCategory].categoryName
          } 
          if(!this.transactionClickers[e.transaction_id]){
            this.transactionClickers[e.transaction_id] = true
          } else{
            this.transactionClickers[e.transaction_id] = !this.transactionClickers[e.transaction_id]
          }
          this.transactionDetails = e
          return this.transactionClickers[e.transaction_id];
      },
      buildDateList(transactions) {
        try {
          const dates = transactions.map(transaction => dayjs(transaction.date));
          const minDate = dayjs.min(dates).$d
          const maxDate = dayjs.max(dates).$d
          const dateList = [];
          let currentDate = dayjs(minDate).startOf('month');
          
          while (currentDate.isSameOrBefore(maxDate)) {
            dateList.push(currentDate.format('MMMM YYYY'));
            currentDate = currentDate.add(1, 'month').startOf('month');
          }
          return dateList;
        } catch (err) {
            console.log("error trying to buildDateList...", err)
        }
      },
      budgetRemaining(category){ // does math between monthlyLimit and Category sum to get budget
        let diff = 0
        const monthlyLimit = this.groupedTransactions[category].monthly_limit
        const categorySpend = this.categorySum(category).valueOf()
        diff = monthlyLimit - categorySpend

        // set up income for UI (negative)
        // if (category == "Income") diff = Math.abs(diff)
        if (monthlyLimit == 0) diff = NaN//if the monthly_limit was already zero, then just mark it NaN so it gets labeled 'spent' in UI
        this.groupedTransactions[category].budgetRemaining = diff
        return Number.isNaN(diff) ? NaN : diff
      },
      isBudgetRemaining(category){ // returns a boolean for if there is a budget remaining, yes or no
        let isRemaining = false;
        const monthlyLimit = this.groupedTransactions[category].monthly_limit
        const categorySpend = this.categorySum(category).valueOf()
        if (Math.abs(monthlyLimit) > Math.abs(categorySpend)) {
          isRemaining = true
        } else {
          isRemaining = false
        }
        return isRemaining
      },
      getCategoryProgressColor(category) {
        let budgetRemaining = this.isBudgetRemaining(category)
        let progressRatio = this.groupedTransactions[category].progressRatio
        
        return budgetRemaining == true 
                ? (progressRatio >= 1 
                    ? "positive" 
                    : (progressRatio < 1 && progressRatio > 0.9 
                        ? "warning" 
                        : "secondary"))
                : this.groupedTransactions[category].type == 'income' ? "positive" : "negative"
      },
      getProgressRatio (category) {
        let progressRatio;
        const monthlyLimit = Number(this.groupedTransactions[category].monthly_limit)
        const categorySpend = this.categorySum(category).valueOf()
        if(!isNaN(monthlyLimit) && monthlyLimit != 0){
          progressRatio = Math.abs(categorySpend) / monthlyLimit
        } else {
          progressRatio = 0
        }
        this.groupedTransactions[category].progressRatio = progressRatio
        return progressRatio// something category
      },
      groupTransactions (){
        // this function sets up the this.groupedTransactions object based on this.transactions and this.categoryMonthlyLimits
        this.groupedTransactions = {};
        // set up the groupedTransactions properties
        this.categoryMonthlyLimits.forEach(category => {
          if (!this.groupedTransactions[category.category]) {
            this.groupedTransactions[category.category] = []; 
          }
          this.groupedTransactions[category.category]._id= category._id
          this.groupedTransactions[category.category].categoryName = category.category
          this.groupedTransactions[category.category].monthly_limit = category.monthly_limit
          this.groupedTransactions[category.category].showOnBudgetPage = category.showOnBudgetPage
          this.groupedTransactions[category.category].originalName = category.category
          this.groupedTransactions[category.category].type = category.type
          this.groupedTransactions[category.category].plaid_pfc = category.plaid_pfc || []
          this.groupedTransactions[category.category].rules = category.rules || {}
        });
        
        // for the transactions retrieved above, map them to the relevant groupedTransaction[category]
        this.transactions.forEach((transaction) => {
          const category = transaction.mappedCategory;
          if (!transaction.request_id) {
            if (!this.groupedTransactions) {
              this.groupedTransactions = {};
            }
            if (!this.groupedTransactions[category]) {
              this.groupedTransactions[category] = [];
            }
            this.groupedTransactions[category].push(transaction);
          }
        });

      },
      async forceSync(){
        this.resetLastFetch();
        window.location.reload();
      },
      async onPullRefresh(done) {
        this.isRefreshing = true;
        this.categoryMonthlyLimits = [];
        await this.buildPage('sync');
        store.commit('setLastPlaidFetch', Date.now());
        this.isRefreshing = false;
        done();
      },
      async resetLastFetch (){
        const now = Date.now();
        store.commit("setLastPlaidFetch", now - this.fetchInterval)
      },
      async buildPage (mode){
        let txns, categoryResponse;
        try {
          if(mode == 'sync'){
            // Get all user transactions and category monthlyLimit info
            txns = await fetchTransactions()
            this.transactions = txns.transactions;
            categoryResponse = await fetchCategories();
            this.categoryMonthlyLimits.push(...categoryResponse) //
          } else if(mode == 'refresh'){
              this.transactions = store.state.transactions
              this.categoryMonthlyLimits.push(...store.state.categories)
          } else if (mode == 'addCategory'){
              this.transactions = store.state.transactions
              this.categoryMonthlyLimits.push(this.addedCategory)
          }
        } catch (error) {
          console.log('error setting up transactions and categories: ' + error)
        }
        this.groupTransactions();
        this.months = this.buildDateList(this.transactions).reverse()
        this.monthlyStats = this.monthStats(this.groupedTransactions) // call setMonthlyStats()
        this.isLoading = false
        // Flip barsReady after the next paint so bars transition from 0 → value
        this.$nextTick(() => setTimeout(() => { this.barsReady = true; }, 80));

        try {
          if (mode == 'sync' || mode == 'addCategory'){
            store.commit("setTransactions", this.transactions);
            store.commit("setCategories", categoryResponse);
          }
        } catch (error) {
            console.log('error committing transactions and categories to store:', error)
        }
      },
      onSubmit(e) { 
        let d = {}
        if (e.dialogType == 'transaction') {
          d = {
            'updateType': e.dialogType,
            'mappedCategory': e.mappedCategory,
            'date': e.date,
            'note':e.note,
            'name': e.name,
            'merchantName': e.merchantName,
            'createRule': e.createRule ? true : false,
            'transaction_id': e.transaction_id,
            'originalCategoryName': this.dialogBody.currentTransactionDetails.originalCategoryName ? this.dialogBody.currentTransactionDetails.originalCategoryName : '',//e.originalCategoryName,
            'excludeFromTotal' : e.excludeFromTotal ? e.excludeFromTotal : false
          }
        }
        // merge these
        if (e.dialogType == 'addCategory' || e.dialogType == 'editCategory'){
        d = {
          'updateType': e.dialogType,
          'categoryName': e.categoryName,
          'monthly_limit': e.monthly_limit,
          'type': e.type.toLowerCase(),
          'showOnBudgetPage': true,
          'plaid_pfc': e.plaid_pfc || [],
        }
        if (e.dialogType == 'addCategory'){
          const randomId = 'client_id_' + Math.random().toString(36).substring(2, 12);
            d.client_id = randomId,
            d.originalCategoryName = e.categoryName
          }
          if (e.dialogType == 'editCategory'){
              d._id = e._id
              d.originalCategoryName = this.dialogBody.currentCategoryDetails.originalCategoryName ? this.dialogBody.currentCategoryDetails.originalCategoryName : ''
            }
        }

        this.isLoading = true;
        handleDialogSubmit(JSON.stringify(d))
        .then(async data => {
          if(d.updateType == 'editCategory'){
            this.updatedCategory = {...data}
            this.categoryClickers[d.originalCategoryName] = !this.categoryClickers[d.originalCategoryName]
            if (e.pendingRuleRemovals?.length) {
              for (const { ruleType, ruleValue } of e.pendingRuleRemovals) {
                await deleteRule(e._id, ruleType, ruleValue);
                store.commit('updateCategoryRules', { categoryId: e._id, ruleType, ruleValue });
              }
            }
            if (e.pendingRuleAdditions?.length) {
              for (const { ruleType, ruleValue } of e.pendingRuleAdditions) {
                await saveRule(e._id, data.categoryNameBEResponse, ruleType, ruleValue);
                store.commit('addCategoryRule', { categoryId: e._id, ruleType, ruleValue });
              }
            }
          }
          if(d.updateType == 'transaction'){
            this.updatedTransaction = {...data}
            if (this.transactionClickers[e.transaction_id]) {
              this.transactionClickers[e.transaction_id] = false
            }
            this.tableDialogOpen = false
          }
          if(d.updateType == 'addCategory'){
            this.newCategory = false
            this.addedCategory = {...data}
          }
        })
        .catch(error => {
          console.log('Error:', error)
        })
        .finally(() => {
          this.isLoading = false;
        })
      }, 
      formatDate(date) {
        return dayjs(date).format('MMM D, YYYY');
      },
      merchantInitials(row) {
        const key = (row.merchant_name || row.name || '?').trim();
        const words = key.split(/\s+/);
        if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
        return key.substring(0, 2).toUpperCase();
      },
      merchantColor(row) {
        const key = row.merchant_name || row.name || '?';
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
          hash = (hash << 5) - hash + key.charCodeAt(i);
          hash |= 0;
        }
        const palette = [
          '#b07d4a', '#4a8b6c', '#5a7fb5', '#8b5a4a',
          '#6b8b4a', '#7a5ab5', '#b54a6a', '#4a8b8b',
          '#b58b4a', '#6a7ab5',
        ];
        return palette[Math.abs(hash) % palette.length];
      },
      openTableDialog(evt, row) {
        this.dialogBody.currentTransactionDetails = {
          originalCategoryName: row.mappedCategory || ''
        };
        this.tableDialogTransaction = row;
        this.tableDialogOpen = true;
      },
      async applyBulkCategory() {
        if (!this.bulkCategory || !this.selectedRows.length) return;
        this.isLoading = true;
        const ids = this.selectedRows.map(r => r.transaction_id);
        try {
          await bulkCategorize(ids, this.bulkCategory);
          this.selectedRows.forEach(row => {
            const txn = this.transactions.find(t => t.transaction_id === row.transaction_id);
            if (txn) txn.mappedCategory = this.bulkCategory;
          });
          store.commit('setTransactions', this.transactions);
          this.groupTransactions();
          this.monthlyStats = this.monthStats(this.groupedTransactions);
          this.selectedRows = [];
          this.bulkCategory = null;
        } catch (err) {
          console.error('Bulk categorize error:', err);
        } finally {
          this.isLoading = false;
        }
      },
      toggleCategory(category) {
        this.groupedTransactionsVisible[category] =
          !this.groupedTransactionsVisible[category] || false;
        if (this.clickedCategories.includes(category)) {
          this.clickedCategories = this.clickedCategories.filter((c) => c !== category);
        } else {
          this.clickedCategories.push(category) 
        }
      },
    },
    watch: {
      monthlyStats: {
        handler(newStats, oldStats) {
          this.animateStats(oldStats || {}, newStats || {});
        },
        immediate: true,
      },
      'selectedDate.display': function(newVal){//, oldVal) {
        this.selectedDate.actual = dayjs(newVal, "MMMM YYYY");
        this.monthlyStats = this.monthStats(this.groupedTransactions) // abstract to a method setMonthlyStats
      },
      // category watchers - updates the client with response data so you don't have to hit db again
      'updatedCategory': function(t) {
        store.commit("updateCategory", t)
        this.groupTransactions();
        this.monthlyStats = this.monthStats(this.groupedTransactions) // abstract to a method setMonthlyStats
        // this.resetLastFetch();  
      },
      'addedCategory': function(t) {
        store.commit('addCategory', t)
        this.categoryMonthlyLimits = [];
        this.categoryMonthlyLimits.push(...store.state.categories)
        this.groupTransactions();
        this.monthlyStats = this.monthStats(this.groupedTransactions); // abstract to a method setMonthlyStats
        // this.resetLastFetch(); 
      },
      'updatedTransaction' : function(t) { // updates go here if you want client to auto-update w.o refresh
        store.commit('updateTransaction', t)
        this.groupTransactions();
        // this.resetLastFetch(); // alternative is to update the store
        this.monthlyStats = this.monthStats(this.groupedTransactions)
      },
    },
    async mounted() {
      this.isLoading = true;
      this.isLoggedIn = store.state.session ? store.state.session.isSessionActive ? true : false : false;
      try {
        if(store.state.session?.isSessionActive) {
          const now = Date.now();
          this.lastFetch = store.state.lastPlaidFetch;
          this.fetchInterval = 1000 * 60 * 10; // 10 minutes in milliseconds, adjust as needed          
          if (!this.lastFetch || now - this.lastFetch > this.fetchInterval) {
            await this.buildPage('sync')
            store.commit("setLastPlaidFetch", now);
          }
          else {
            // const remainingTime = this.fetchInterval - (now - this.lastFetch);
            // const minutesRemaining = Math.floor(remainingTime / 60000);
            // const secondsRemaining = Math.floor((remainingTime % 60000) / 1000);
            // console.log(`last fetch was too recent, not fetching again. Time until next fetch: ${minutesRemaining} minutes ${secondsRemaining} seconds`);
            
            await this.buildPage('refresh')
          }
        } else if(!store.state.session?.isSessionActive){
            this.isLoggedIn = false;
        } 
      } catch (error) {
        console.error(error);
        this.resetLastFetch();
        this.isLoading = false;
      }
      if(this.categoryMonthlyLimits?.length == 0 || this.transactions?.length == 0) {
        console.log('onMounted if')
          this.resetLastFetch();
        }
      console.log('this.categoryMonthlyLimits', this.categoryMonthlyLimits.length)
    },
  };
</script>