<template>
  <div class="basil-container" style="padding: var(--basil-space-4)">

    <!-- Header -->
    <div class="basil-card-head" style="margin-bottom: var(--basil-space-2)">
      <span class="basil-card-label">Accounts</span>
    </div>

    <!-- Loading skeleton -->
    <template v-if="$store.state.bootstrapping || syncing">
      <BasilListItem v-for="i in 3" :key="i">
        <BasilSkeleton type="text" width="55%" />
        <BasilSkeleton type="text" width="35%" />
      </BasilListItem>
    </template>

    <!-- Empty state: no accounts linked -->
    <EmptyState
      v-else-if="!hasAccounts"
      icon="account_balance"
      heading="No accounts linked"
      body="Connect a bank account to start tracking your balances."
    >
      <BasilButton
        icon="add" label="Add account"
        style="margin-top: var(--basil-space-2)"
        @click="showPlaidLink = true"
      />
      <BasilButton
        variant="flat" icon="edit_note" label="Add manually"
        style="margin-top: var(--basil-space-1); color: var(--basil-text-secondary)"
        @click="openManualForm()"
      />
      <PlaidLinkHandler v-if="showPlaidLink" @onPlaidSuccess="handlePlaidSuccess" />
    </EmptyState>

    <!-- Main content: accounts linked -->
    <template v-else>

      <!-- Item error banner -->
      <div v-if="hasItemErrors" class="basil-banner basil-accounts__error-banner" style="margin-bottom: var(--basil-space-4)">
        <BasilIcon name="warning" style="color: var(--basil-warning)" />
        <div>
          <strong>Account{{ Object.keys(itemErrors).length > 1 ? 's need' : ' needs' }} attention</strong>
          <div class="basil-accounts__error-detail">
            {{ Object.keys(itemErrors).join(', ') }} — tap Reconnect below to re-authorize.
          </div>
        </div>
      </div>

      <!-- Reconnect Plaid Link (update mode) -->
      <PlaidLinkHandler
        v-if="reconnectToken"
        :link-token="reconnectToken"
        @onPlaidSuccess="handleReconnectSuccess"
        @onPlaidExit="reconnectToken = null; reconnecting = null"
      />

      <!-- Net Worth hero card (only when balances loaded) -->
      <BasilCard v-if="hasBalances" class="my-card basil-accounts__card" style="margin-bottom: var(--basil-space-4)">
        <div class="basil-card-head">
          <span class="basil-card-label">Net Worth</span>
        </div>
        <div :class="['basil-net', netWorth.net >= 0 ? 'basil-net--positive' : 'basil-net--negative']">
          <div class="basil-net__amount basil-display">
            {{ netWorth.net >= 0 ? '' : '-' }}{{ formatCurrency(Math.abs(netWorth.net)) }}
          </div>
          <div class="basil-net__label">net worth</div>
        </div>

        <!-- Cumulative net trend -->
        <v-chart v-if="snapshots.length > 0" :option="netWorthChartOption" autoresize class="basil-accounts__sparkline" />

        <div class="basil-card-rule"></div>
        <div class="basil-accounts__net-row">
          <span class="basil-accounts__net-label">Assets</span>
          <span class="basil-mono" style="color: var(--basil-positive)">{{ formatCurrency(netWorth.assets) }}</span>
        </div>
        <div class="basil-accounts__net-row">
          <span class="basil-accounts__net-label">Liabilities</span>
          <span class="basil-mono" style="color: var(--basil-negative)">
            {{ netWorth.liabilities > 0 ? '-' : '' }}{{ formatCurrency(netWorth.liabilities) }}
          </span>
        </div>
      </BasilCard>

      <!-- Accounts + Cash Runway side by side -->
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">

        <!-- Accounts card -->
        <BasilCard class="my-card basil-accounts__card" style="flex: 1; min-width: 220px; margin-bottom: var(--basil-space-4)">
          <div class="basil-card-head">
            <span class="basil-card-label">Accounts</span>
          </div>

          <div
            v-for="institution in institutions"
            :key="institution.name"
            class="basil-accounts__institution" style="margin-bottom: var(--basil-space-2)"
          >
            <div class="basil-accounts__institution-header">
              <span class="basil-accounts__institution-name">{{ institution.name }}</span>
              <BasilChip
                v-if="institution.manual"
                dense
                style="margin-left: var(--basil-space-1); background: var(--basil-surface-alt); color: var(--basil-text-secondary)"
              >
                <BasilIcon name="edit_note" style="font-size: 12px; margin-right: 2px;" />Manual
              </BasilChip>
              <BasilChip
                v-if="institution.error"
                dense color="warning"
                style="margin-left: var(--basil-space-1)"
              >
                <BasilIcon name="warning" style="font-size: 12px; margin-right: 2px;" />Needs reconnect
              </BasilChip>
              <div class="basil-spacer"></div>
              <BasilButton
                v-if="institution.error && !institution.manual"
                variant="flat" dense color="warning" icon="refresh" label="Reconnect"
                :loading="reconnecting === institution.name"
                style="margin-right: var(--basil-space-1)"
                @click="reconnect(institution.name)"
              />
              <template v-if="!preDelete[institution.name]">
                <BasilButton variant="icon" icon="link_off" dense color="negative"
                  @click="preDelete[institution.name] = true" />
              </template>
              <template v-else>
                <div style="display: flex; gap: var(--basil-space-1)">
                  <BasilButton variant="icon" icon="check" dense color="positive"
                    @click="unlinkAccount(institution.name)" />
                  <BasilButton variant="icon" icon="close" dense color="negative"
                    @click="preDelete[institution.name] = false" />
                </div>
              </template>
            </div>

            <BasilList v-if="institution.accounts.length" separator class="basil-accounts__list" style="border: 1px solid var(--basil-border); border-radius: var(--basil-radius-md);">
              <template v-for="acct in institution.accounts" :key="acct.account_id">
                <SwipeReveal
                  v-if="acct.manual"
                  :ref="el => setSwipeRef(acct.account_id, el)"
                  class="basil-accounts__swipe-edit"
                  @action="openEditManualAcct(institution, acct)"
                  @click="openEditManualAcct(institution, acct)"
                >
                  <template #action>
                    <BasilIcon name="edit" color="white" size="24px" />
                  </template>
                  <BasilListItem clickable>
                    <template #label><span class="basil-accounts__acct-name">{{ acct.name }}</span></template>
                    <template #caption>{{ formatSubtype(acct.subtype) }}</template>
                    <template #side>
                      <span class="basil-mono basil-accounts__balance" :style="{ color: balanceColor(acct) }">
                        {{ formatBalance(acct) }}
                      </span>
                    </template>
                  </BasilListItem>
                </SwipeReveal>
                <BasilListItem v-else>
                  <template #label>
                    <span class="basil-accounts__acct-name">
                      {{ acct.name }}
                      <span v-if="acct.mask" class="basil-accounts__mask">{{ acct.mask }}</span>
                    </span>
                  </template>
                  <template #caption>
                    {{ formatSubtype(acct.subtype) }}
                    <!-- Credit utilization -->
                    <template v-if="acct.type === 'credit' && acct.limit">
                      <div class="basil-accounts__utilization" style="margin-top: var(--basil-space-1)">
                        <BasilProgress
                          :value="Math.abs(acct.current) / acct.limit"
                          size="6px"
                          :color="utilizationColor(Math.abs(acct.current) / acct.limit)"
                          class="basil-accounts__utilization-bar"
                        />
                        <span class="basil-accounts__utilization-label">
                          {{ Math.round((Math.abs(acct.current) / acct.limit) * 100) }}% of {{ formatCurrency(acct.limit) }}
                        </span>
                      </div>
                    </template>
                  </template>
                  <template #side>
                    <span
                      class="basil-mono basil-accounts__balance"
                      :style="{ color: balanceColor(acct) }"
                    >
                      {{ formatBalance(acct) }}
                    </span>
                  </template>
                </BasilListItem>
              </template>
            </BasilList>
            <div v-else class="basil-accounts__no-balances">
              No balance data
            </div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: var(--basil-space-2); margin-top: var(--basil-space-1)">
            <BasilButton variant="flat" dense color="primary" icon="add" label="Add account"
              @click="showPlaidLink = true" />
            <BasilButton variant="flat" dense icon="edit_note" label="Add manually"
              style="color: var(--basil-text-secondary)"
              @click="openManualForm()" />
          </div>
          <PlaidLinkHandler v-if="showPlaidLink" @onPlaidSuccess="handlePlaidSuccess" />
        </BasilCard>

        <!-- Cash Runway card (only when balances loaded) -->
        <BasilCard v-if="hasBalances" class="my-card basil-accounts__card" style="flex: 1; min-width: 220px; margin-bottom: var(--basil-space-4)">
          <div class="basil-card-head">
            <span class="basil-card-label">Cash Runway</span>
          </div>
          <div class="basil-accounts__runway">
            <template v-if="runway.months !== null">
              <div class="basil-primary-stat">
                <div class="basil-primary-stat__amount basil-display" :style="{ color: runwayColor }">
                  {{ runway.months.toFixed(1) }} months
                </div>
              </div>
              <div class="basil-secondary-stat" style="justify-content: center">
                {{ formatCurrency(runway.liquid) }} liquid &divide; {{ formatCurrency(runway.burn) }}/mo avg
              </div>
              <div class="basil-accounts__runway-note">
                Based on your last 3 months of expenses (excl. savings &amp; income).
              </div>
            </template>
            <template v-else>
              <div class="basil-primary-stat">
                <div class="basil-primary-stat__amount basil-display" style="color: var(--basil-text-muted)">
                  &mdash;
                </div>
              </div>
              <div class="basil-accounts__runway-note">
                {{ runway.reason }}
              </div>
            </template>
          </div>
        </BasilCard>

      </div>

      <!-- Last updated -->
      <div v-if="lastUpdatedText" class="basil-accounts__updated">
        {{ lastUpdatedText }}
      </div>
    </template>

    <!-- Add Manual Account tray -->
    <BasilTray v-model="showManualForm" max-width="440px">
      <BasilCard flat>
        <div class="basil-dialog-header">
          <div class="basil-dialog-title">
            <span class="basil-dialog-title__sub">NEW ACCOUNT</span>
            <span class="basil-dialog-title__main">Add Manual Account</span>
          </div>
          <BasilButton variant="icon" icon="close" class="basil-dialog-close" @click="showManualForm = false" />
        </div>

        <!-- Step 1: Pick institution (no text input — avoids iOS keyboard jitter) -->
        <template v-if="manualStep === 'institution'">
          <div class="basil-card__body">
            <div style="color: var(--basil-text-secondary); font-size: 0.875rem; margin-bottom: var(--basil-space-3);">
              Which institution is this account at?
            </div>
            <BasilList style="border: 1px solid var(--basil-border); border-radius: var(--basil-radius-md);">
              <BasilListItem
                v-for="name in existingInstitutions" :key="name"
                clickable
                @click="manualInstitution = name; manualIsNewInstitution = false; manualStep = 'details'"
              >
                <template #avatar><BasilIcon name="account_balance" color="var(--basil-text-muted)" /></template>
                <template #label>{{ name }}</template>
                <template #side><BasilIcon name="chevron_right" color="var(--basil-text-muted)" /></template>
              </BasilListItem>
              <BasilListItem
                clickable
                @click="manualInstitution = ''; manualIsNewInstitution = true; manualStep = 'details'"
              >
                <template #avatar><BasilIcon name="add" color="primary" /></template>
                <template #label><span style="color: var(--basil-green)">New institution</span></template>
                <template #side><BasilIcon name="chevron_right" color="var(--basil-text-muted)" /></template>
              </BasilListItem>
            </BasilList>
          </div>
        </template>

        <!-- Step 2: Account details -->
        <template v-else-if="manualStep === 'details'">
          <div class="basil-card__body">
            <BasilText v-if="manualIsNewInstitution" v-model="manualInstitution" label="Institution name" dense placeholder="e.g. Fidelity, My Credit Union" style="margin-bottom: var(--basil-space-2)" />
            <div v-else style="color: var(--basil-text-secondary); font-size: 0.8125rem; margin-bottom: var(--basil-space-3);">
              Adding to <strong>{{ manualInstitution }}</strong>
            </div>
            <BasilText v-model="manualAccountName" label="Account name" dense placeholder="e.g. Brokerage, Checking" class="basil-mb-2" />
            <BasilSelect
              v-model="manualAccountType" label="Account type" dense
              :options="accountTypeOptions"
              option-label="label"
              option-value="value"
              emit-value
              placeholder="Select account type"
              class="basil-mb-2"
            />
            <BasilAmount v-model="manualBalance" label="Current balance" dense />
            <div style="color: var(--basil-text-muted); font-size: 0.75rem; margin-top: var(--basil-space-2)">
              Manual accounts track balances only. You'll need to update the balance yourself &mdash; no transactions will be imported.
            </div>
          </div>
          <div class="basil-card__actions basil-px-4 basil-pb-4">
            <BasilButton variant="flat" label="Back" @click="manualStep = 'institution'" />
            <BasilButton
              label="Add Account"
              :disabled="!manualInstitution?.trim() || !manualAccountName || !manualAccountType || manualBalance == null"
              :loading="manualSaving"
              @click="saveManualAccount"
            />
          </div>
        </template>
      </BasilCard>
    </BasilTray>

    <!-- Edit Manual Account tray -->
    <BasilTray v-model="showEditManual" max-width="440px">
      <BasilCard flat>
        <div class="basil-dialog-header">
          <div class="basil-dialog-title">
            <span class="basil-dialog-title__sub">UPDATE BALANCE</span>
            <span class="basil-dialog-title__main">Edit Account</span>
          </div>
          <BasilButton variant="icon" icon="close" class="basil-dialog-close" @click="showEditManual = false" />
        </div>
        <div class="basil-card__body">
          <BasilText v-model="editAccountName" label="Account name" dense class="basil-mb-2" />
          <BasilAmount v-model="editBalance" label="Current balance" dense />
        </div>
        <div class="basil-card__actions basil-px-4 basil-pb-4" style="justify-content: space-between;">
          <BasilButton variant="flat" icon="delete" label="Delete" color="negative"
            :loading="editManualDeleting"
            @click="confirmDeleteManual = true"
          />
          <div>
            <BasilButton variant="flat" label="Cancel" @click="showEditManual = false" />
            <BasilButton
              label="Save"
              :disabled="editBalance == null"
              :loading="editManualSaving"
              @click="saveEditManual"
            />
          </div>
        </div>
        <div v-if="confirmDeleteManual" class="basil-px-4 basil-pb-4" style="text-align: center;">
          <div style="color: var(--basil-text-secondary); font-size: 0.8125rem; margin-bottom: var(--basil-space-2);">
            Remove this account? This cannot be undone.
          </div>
          <div style="display: flex; justify-content: center; gap: var(--basil-space-2);">
            <BasilButton variant="flat" dense label="Keep" @click="confirmDeleteManual = false" />
            <BasilButton variant="flat" dense label="Remove" color="negative"
              :loading="editManualDeleting"
              @click="deleteManualAccount"
            />
          </div>
        </div>
      </BasilCard>
    </BasilTray>
  </div>
</template>

<script>
import { ensureAppData, getOrAddUser, removeAccount, triggerSync, fetchTransactionsForMonth, createUpdateLinkToken, clearItemError, createManualAccount, updateManualAccount, deleteManualAccountApi } from '@/api';
import BasilTray from '../components/BasilTray.vue';
import BasilText from '@/components/BasilText';
import BasilAmount from '@/components/BasilAmount';
import SwipeReveal from '../components/SwipeReveal.vue';
import store from '../store';
import EmptyState from '../components/EmptyState.vue';
import PlaidLinkHandler from '../components/PlaidLinkHandler.vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import dayjs from 'dayjs';

use([LineChart, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

const ANIMATION = { animation: true, animationDuration: 800, animationEasing: 'cubicOut' };

export default {
  name: 'AccountsView',
  components: { EmptyState, PlaidLinkHandler, VChart, BasilTray, SwipeReveal, BasilText, BasilAmount },

  data() {
    return {
      showPlaidLink: false,
      syncing: false,           // true while syncing after Plaid Link success
      preDelete: {},
      reconnecting: null,       // institution name currently reconnecting
      reconnectToken: null,     // link token for update mode
      // Manual account form
      showManualForm: false,
      manualSaving: false,
      manualInstitution: '',
      manualAccountName: '',
      manualStep: 'institution',  // 'institution' | 'details'
      manualIsNewInstitution: false,
      manualAccountType: null,
      manualBalance: null,
      swipeRefs: {},
      // Edit manual account
      showEditManual: false,
      editManualSaving: false,
      editItemId: null,
      editAccountId: null,
      editAccountName: '',
      editBalance: null,
      editManualDeleting: false,
      confirmDeleteManual: false
    };
  },

  computed: {
    hasAccounts() {
      return this.$store.state.user?.accounts?.length > 0;
    },

    balances() {
      return this.$store.state.accountBalances;
    },

    hasBalances() {
      if (!this.balances) return false;
      return Object.values(this.balances).some(arr => arr?.length > 0);
    },

    itemErrors() {
      return this.$store.state.itemErrors || {};
    },

    hasItemErrors() {
      return Object.keys(this.itemErrors).length > 0;
    },

    manualSet() {
      return new Set(this.$store.state.user?.manualInstitutions || []);
    },

    itemIdMap() {
      return this.$store.state.user?.itemIdByInstitution || {};
    },

    institutions() {
      const names = this.$store.state.user?.accounts || [];
      const balances = this.balances || {};
      return names
        .map(name => ({
          name,
          accounts: balances[name] || [],
          error: this.itemErrors[name] || null,
          manual: this.manualSet.has(name),
          itemId: this.itemIdMap[name] || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    allAccounts() {
      if (!this.balances) return [];
      return Object.values(this.balances).flat();
    },

    netWorth() {
      const accts = this.allAccounts;
      let assets = 0;
      let liabilities = 0;

      for (const acct of accts) {
        const isLiability = acct.type === 'credit' || acct.type === 'loan';
        const bal = isLiability ? (acct.current ?? 0) : (acct.available ?? acct.current ?? 0);
        if (acct.type === 'depository' || acct.type === 'investment') {
          assets += bal;
        } else if (isLiability) {
          liabilities += Math.abs(bal);
        }
      }

      return { assets, liabilities, net: assets - liabilities };
    },

    runway() {
      const accts = this.allAccounts;
      const liquid = accts
        .filter(a => a.type === 'depository')
        .reduce((sum, a) => sum + (a.available ?? a.current ?? 0), 0);

      if (liquid <= 0) {
        return { months: null, reason: 'No liquid balance available.' };
      }

      const transactions = this.$store.state.transactions || [];
      const categories = this.$store.state.categories || [];

      // Determine excluded category types
      const excludedTypes = new Set(['income', 'payment', 'savings']);
      const excludedCategories = new Set(
        categories
          .filter(c => excludedTypes.has(c.type))
          .map(c => c.category)
      );

      // Get last 3 complete months
      const now = new Date();
      const months = [];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(d.toISOString().slice(0, 7)); // YYYY-MM
      }

      let totalExpenses = 0;
      let monthsWithData = 0;

      for (const month of months) {
        const monthTxns = transactions.filter(t => {
          if (!(t.effectiveDate || t.date)?.startsWith(month)) return false;
          if (t.excludeFromTotal) return false;
          if (excludedCategories.has(t.mappedCategory)) return false;
          return t.amount > 0; // Plaid: positive = debit
        });
        if (monthTxns.length > 0) {
          totalExpenses += monthTxns.reduce((sum, t) => sum + t.amount, 0);
          monthsWithData++;
        }
      }

      if (monthsWithData < 2) {
        return { months: null, reason: 'Need at least 2 months of transaction history to calculate runway.' };
      }

      const burn = totalExpenses / monthsWithData;
      if (burn <= 0) {
        return { months: null, reason: 'No expense data found in recent months.' };
      }

      return { months: liquid / burn, liquid, burn };
    },

    runwayColor() {
      if (!this.runway.months) return 'var(--basil-text-secondary)';
      if (this.runway.months > 6) return 'var(--basil-positive)';
      if (this.runway.months >= 3) return 'var(--basil-warning)';
      return 'var(--basil-negative)';
    },

    snapshots() {
      return this.$store.state.balanceSnapshots || [];
    },

    netWorthChartOption() {
      const data = this.snapshots;
      const labels = data.map(d => dayjs(d.date).format('MMM D'));
      const values = data.map(d => d.net);
      const min = Math.min(...values, 0);
      const max = Math.max(...values, 0);

      const series = [{
        type: 'line',
        data: values,
        smooth: true,
        symbol: data.length === 1 ? 'circle' : 'none',
        symbolSize: 8,
        areaStyle: { opacity: 0.15 },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#c8c0b0', type: 'dashed', width: 1 },
          data: [{ yAxis: 0 }],
          label: { show: false },
        },
      }];

      return {
        ...ANIMATION,
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            const p = params[0];
            if (p?.value == null) return '';
            return `<strong>${p.axisValue}</strong><br/>Net worth: ${this.formatCurrency(p.value)}`;
          },
        },
        visualMap: [{
          show: false,
          type: 'continuous',
          seriesIndex: 0,
          min,
          max,
          inRange: { color: min < 0 ? ['#b83c2b', '#c8c0b0', '#2d7a4f'] : ['#2d7a4f'] },
        }],
        grid: { left: 0, right: 0, top: 8, bottom: 0, containLabel: false },
        xAxis: { type: 'category', data: labels, show: false },
        yAxis: { type: 'value', show: false },
        series,
      };
    },

    existingInstitutions() {
      return (this.$store.state.user?.accounts || []).sort();
    },

    accountTypeOptions() {
      return [
        { label: 'Checking', value: 'depository:checking' },
        { label: 'Savings', value: 'depository:savings' },
        { label: 'Money market', value: 'depository:money market' },
        { label: 'CD', value: 'depository:cd' },
        { label: 'Credit card', value: 'credit:credit card' },
        { label: 'Auto loan', value: 'loan:auto' },
        { label: 'Mortgage', value: 'loan:mortgage' },
        { label: 'Student loan', value: 'loan:student' },
        { label: 'Personal loan', value: 'loan:loan' },
        { label: 'Brokerage', value: 'investment:brokerage' },
        { label: '401k', value: 'investment:401k' },
        { label: 'IRA', value: 'investment:ira' },
        { label: 'Other investment', value: 'investment:other' },
      ];
    },

    lastUpdatedText() {
      const accts = this.allAccounts;
      if (accts.length === 0) return '';
      const oldest = Math.min(...accts.map(a => a.fetchedAt).filter(Boolean));
      if (!oldest) return '';
      const mins = Math.round((Date.now() - oldest) / 60000);
      if (mins < 1) return 'Last updated just now';
      if (mins < 60) return `Last updated ${mins} minute${mins !== 1 ? 's' : ''} ago`;
      const hrs = Math.round(mins / 60);
      if (hrs < 24) return `Last updated ${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
      const days = Math.round(hrs / 24);
      return `Last updated ${days} day${days !== 1 ? 's' : ''} ago`;
    },
  },

  methods: {
    formatCurrency(val) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(val);
    },

    formatBalance(acct) {
      const isLiability = acct.type === 'credit' || acct.type === 'loan';
      const val = isLiability ? (acct.current ?? 0) : (acct.available ?? acct.current ?? 0);
      const display = isLiability ? -Math.abs(val) : val;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
      }).format(display);
    },

    balanceColor(acct) {
      const isLiability = acct.type === 'credit' || acct.type === 'loan';
      if (isLiability) return 'var(--basil-negative)';
      const bal = acct.available ?? acct.current ?? 0;
      return bal >= 0 ? 'var(--basil-positive)' : 'var(--basil-negative)';
    },

    formatSubtype(subtype) {
      if (!subtype) return '';
      return subtype.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },

    utilizationColor(ratio) {
      if (ratio > 0.7) return 'negative';
      if (ratio > 0.3) return 'warning';
      return 'positive';
    },

    async reconnect(institution) {
      this.reconnecting = institution;
      try {
        const data = await createUpdateLinkToken(institution);
        if (data?.link_token) {
          this.reconnectToken = data.link_token;
        } else {
          this.reconnecting = null;
        }
      } catch (err) {
        console.error('reconnect error:', err);
        this.reconnecting = null;
      }
    },

    async handleReconnectSuccess() {
      const institution = this.reconnecting;
      this.reconnectToken = null;
      try {
        await clearItemError(institution);
        store.commit('clearItemError', institution);
        // Trigger a full sync to refresh balances + transactions
        const syncResult = await triggerSync();
        if (syncResult) {
          store.commit('setLastSyncedAt', syncResult.syncedAt);
          if (syncResult.balances) store.commit('setAccountBalances', syncResult.balances);
          if (syncResult.balanceSnapshots) store.commit('setBalanceSnapshots', syncResult.balanceSnapshots);
          store.commit('setItemErrors', syncResult.itemErrors);
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const result = await fetchTransactionsForMonth(currentMonth);
          if (result) store.commit('setMonthTransactions', { month: currentMonth, transactions: result.transactions });
        }
      } catch (err) {
        console.error('handleReconnectSuccess error:', err);
      } finally {
        this.reconnecting = null;
      }
    },

    async handlePlaidSuccess() {
      this.showPlaidLink = false;
      this.syncing = true;
      try {
        const user = await getOrAddUser();
        this.$store.commit('setUser', user);
      } catch (error) {
        console.error('handlePlaidSuccess error:', error);
      }
      try {
        const syncResult = await triggerSync();
        if (syncResult) {
          this.$store.commit('setLastSyncedAt', syncResult.syncedAt);
          if (syncResult.balances) this.$store.commit('setAccountBalances', syncResult.balances);
          if (syncResult.balanceSnapshots) this.$store.commit('setBalanceSnapshots', syncResult.balanceSnapshots);
          this.$store.commit('setItemErrors', syncResult.itemErrors);
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const result = await fetchTransactionsForMonth(currentMonth);
          if (result) this.$store.commit('setMonthTransactions', { month: currentMonth, transactions: result.transactions });
        }
      } catch (error) {
        console.error('handlePlaidSuccess: sync error:', error);
      } finally {
        this.syncing = false;
      }
    },

    async unlinkAccount(institution) {
      try {
        await removeAccount(institution);
        const user = this.$store.state.user;
        this.$store.commit('setUser', {
          ...user,
          accounts: user.accounts.filter(a => a !== institution),
        });
        // Remove balances and clear any item error for the unlinked institution
        const balances = { ...this.$store.state.accountBalances };
        delete balances[institution];
        this.$store.commit('setAccountBalances', balances);
        this.$store.commit('clearItemError', institution);
      } catch (error) {
        console.error('unlinkAccount error:', error);
      }
      this.preDelete[institution] = false;
    },

    async refreshAccountData() {
      const user = await getOrAddUser();
      this.$store.commit('setUser', user);
      if (user.accountBalances) this.$store.commit('setAccountBalances', user.accountBalances);
      if (user.balanceSnapshots) this.$store.commit('setBalanceSnapshots', user.balanceSnapshots);
    },

    openManualForm() {
      this.resetManualForm();
      this.showManualForm = true;
    },

    resetManualForm() {
      this.manualStep = 'institution';
      this.manualIsNewInstitution = false;
      this.manualInstitution = '';
      this.manualAccountName = '';
      this.manualAccountType = null;
      this.manualBalance = null;
    },

    async saveManualAccount() {
      this.manualSaving = true;
      try {
        const [type, subtype] = this.manualAccountType.split(':');
        const result = await createManualAccount({
          institution: this.manualInstitution.trim(),
          accountName: this.manualAccountName.trim(),
          accountType: type,
          accountSubtype: subtype,
          balance: this.manualBalance,
        });
        if (result) {
          // Refresh user data to pick up the new institution
          await this.refreshAccountData();
          this.showManualForm = false;
          this.resetManualForm();
        }
      } catch (err) {
        console.error('saveManualAccount error:', err);
      } finally {
        this.manualSaving = false;
      }
    },

    setSwipeRef(key, el) {
      if (el) this.swipeRefs[key] = el;
      else delete this.swipeRefs[key];
    },

    resetAllSwipes() {
      for (const ref of Object.values(this.swipeRefs)) {
        if (ref?.reset) ref.reset();
      }
    },

    openEditManualAcct(institution, acct) {
      this.resetAllSwipes();
      this.editItemId = institution.itemId;
      this.editAccountId = acct?.account_id;
      this.editAccountName = acct?.name || '';
      this.editBalance = acct?.current ?? acct?.balance ?? 0;
      this.confirmDeleteManual = false;
      this.showEditManual = true;
    },

    async saveEditManual() {
      this.editManualSaving = true;
      try {
        const result = await updateManualAccount(this.editAccountId, {
          balance: this.editBalance,
          accountName: this.editAccountName.trim(),
        });
        if (result) {
          // Refresh to pick up updated balances + snapshots
          await this.refreshAccountData();
          this.showEditManual = false;
        }
      } catch (err) {
        console.error('saveEditManual error:', err);
      } finally {
        this.editManualSaving = false;
      }
    },

    async deleteManualAccount() {
      this.editManualDeleting = true;
      try {
        const result = await deleteManualAccountApi(this.editAccountId);
        if (result) {
          await this.refreshAccountData();
          this.showEditManual = false;
        }
      } catch (err) {
        console.error('deleteManualAccount error:', err);
      } finally {
        this.editManualDeleting = false;
      }
    },
  },

  async mounted() {
    await ensureAppData(this.$store);
  },
};
</script>

<style scoped>
@import '../styles/accounts.css';

.basil-accounts__swipe-edit :deep(.basil-swipe__action) {
  background-color: var(--basil-info);
}
</style>
