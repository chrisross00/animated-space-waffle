<style src="../styles/BudgetView.css"></style>

<template>
  <div :class="['basil-page-wrapper', { 'basil-page-wrapper--show-all': showAll }]">

  <EmptyState
    v-if="!isLoggedIn"
    icon="account_circle"
    heading="Sign in to see your budget"
    body="Connect your bank accounts to start tracking spending and income."
  >
    <BasilButton label="Go to Profile" to="/profile" class="basil-mt-2" />
  </EmptyState>

  <div v-show="isLoggedIn">

    <!-- Not onboarded — show only the setup CTA -->
    <div v-if="!isOnboarded" class="basil-container">
      <BasilCard flat bordered class="basil-setup-card">
        <div class="basil-card__body">
          <div class="basil-card-head">
            <span class="basil-card-label">Get started</span>
          </div>
          <div class="basil-setup-card__body">
            <BasilIcon name="auto_awesome" color="primary" size="2rem" />
            <div>
              <div class="basil-setup-card__heading">Set up Basil</div>
              <div class="basil-setup-card__hint">Connect your bank and configure your budget in a few quick steps.</div>
            </div>
          </div>
          <BasilButton label="Set up Basil" to="/onboarding" class="basil-mt-4" />
        </div>
      </BasilCard>
    </div>

    <!-- Onboarded — full dashboard -->
    <SkeletonBudget v-if="isOnboarded && isLoading" />
      <div v-show="isOnboarded && !isLoading" class="basil-container">

        <!-- Hero card — always visible when data exists -->
        <BasilCard v-if="budgetSummary" flat bordered class="basil-mb-4">
          <div class="basil-card__body">
            <div class="basil-card-head">
              <span class="basil-card-label">{{ budgetSummary.incomeState === 'none' ? 'Spending' : 'Flexible spending' }}</span>
              <span class="basil-card-period">{{ selectedDate.display }}</span>
            </div>

            <!-- No income at all: spent so far -->
            <template v-if="budgetSummary.incomeState === 'none'">
              <div class="basil-display basil-hero-amount">
                ${{ Math.round(displayedSummary.spent).toLocaleString() }}
              </div>
              <div class="basil-hero-sub">spent this month</div>
              <div class="basil-card-rule"></div>
              <div class="basil-hero-hint">
                <router-link to="/plan" class="basil-hero-link">Set your income</router-link> to see what's left to spend.
              </div>
            </template>

            <!-- Full mode: left to spend -->
            <template v-else>
              <div class="basil-display basil-hero-amount basil-hero-amount--positive">
                ${{ Math.round(displayedSummary.remaining).toLocaleString() }}
              </div>
              <div class="basil-hero-sub">left to spend this month</div>
              <div v-if="budgetSummary.pace" :class="['basil-pace-badge', `basil-pace-badge--${budgetSummary.pace}`]">
                <BasilIcon :name="budgetSummary.pace === 'on-track' ? 'trending_flat' : 'trending_up'" size="14px" />
                {{ budgetSummary.pace === 'on-track' ? 'On track' : 'Spending faster than usual' }}
              </div>
              <div class="basil-hero-progress">
                <BasilProgress
                  :value="Math.min(displayedSummary.ratio, 1)"
                  :color="displayedSummary.ratio > 1 ? 'negative' : displayedSummary.ratio > 0.85 ? 'warning' : 'primary'"
                  :class="`basil-progress--${displayedSummary.ratio > 1 ? 'negative' : displayedSummary.ratio > 0.85 ? 'warning' : 'positive'}`"
                />
              </div>
              <div class="basil-hero-progress-label">
                ${{ Math.round(displayedSummary.spent).toLocaleString() }} of ${{ Math.round(displayedSummary.pool).toLocaleString() }} spent
              </div>
              <div class="basil-card-rule"></div>
              <div v-if="hasFixedCategories" class="basil-hero-detail">
                <span>Fixed costs</span>
                <span class="basil-mono">${{ Math.round(displayedSummary.fixedSpent).toLocaleString() }} of ${{ Math.round(displayedSummary.fixedBudget).toLocaleString() }}</span>
              </div>
              <div class="basil-flex-detail-row" :class="{ 'basil-flex-detail-row--bordered': hasFixedCategories }">
                <span>Savings</span>
                <span class="basil-mono">${{ Math.round(displayedSummary.savingsAmount).toLocaleString() }} of ${{ Math.round(displayedSummary.savingsBudget).toLocaleString() }}</span>
              </div>
              <div v-if="forecastedEndOfMonth && forecastedEndOfMonth.expectedRemaining > 0" class="basil-hero-detail basil-flex-detail-row--bordered">
                <span>Recurring expected</span>
                <span class="basil-mono">~${{ Math.round(forecastedEndOfMonth.expectedRemaining).toLocaleString() }}</span>
              </div>
              <div v-if="budgetSummary.incomeState === 'estimated'" class="basil-hero-estimated">
                Based on deposits this month. <router-link to="/plan" class="basil-hero-link">Set your income</router-link> for a more accurate number.
              </div>
            </template>

            <!-- Spending breakdown -->
            <template v-if="expenseTransactions.length > 0">
              <div class="basil-card-rule"></div>
              <SpendingBreakdown
                :transactions="expenseTransactions"
                :categories="$store.state.categories || []"
                :month="selectedDate.actual.format('YYYY-MM')"
                @edit-category="openEditCategoryFromBreakdown"
              />
            </template>
          </div>
        </BasilCard>

        <!-- Actuals — compact (budget summary mode) -->
        <BasilCard v-if="budgetSummary" flat bordered class="basil-mb-4">
          <div class="basil-card__body">
            <div class="basil-card-head">
              <span class="basil-card-label">Actuals</span>
            </div>
            <div class="basil-actuals-3col">
              <div class="basil-actuals-col">
                <div class="basil-primary-stat__amount basil-display" style="color: var(--basil-positive)">
                  ${{ Math.round(displayedStats.incomeAmount).toLocaleString() }}
                </div>
                <div class="basil-primary-stat__label">earned</div>
              </div>
              <div class="basil-primary-stats__divider"></div>
              <div class="basil-actuals-col">
                <div class="basil-primary-stat__amount basil-display">
                  ${{ Math.round(displayedStats.expenseSpend).toLocaleString() }}
                </div>
                <div class="basil-primary-stat__label">spent</div>
              </div>
              <div class="basil-primary-stats__divider"></div>
              <div class="basil-actuals-col">
                <div class="basil-primary-stat__amount basil-display" :style="{ color: netPositive ? 'var(--basil-positive)' : 'var(--basil-negative)' }">
                  {{ netPositive ? '+' : '−' }}${{ Math.round(Math.abs(displayedStats.netPosition)).toLocaleString() }}
                </div>
                <div class="basil-primary-stat__label">free cash flow</div>
              </div>
            </div>
            <div v-if="monthlyStats.savingsAmount > 0" class="basil-secondary-stat">
              <BasilIcon name="savings" size="xs" color="info" />
              ${{ Math.round(monthlyStats.savingsAmount).toLocaleString() }} saved
            </div>
            <div v-if="monthlyStats.toSortSpending > 0" class="basil-secondary-stat basil-secondary-stat--warn">
              <BasilIcon name="warning_amber" size="xs" />
              ${{ Math.round(monthlyStats.toSortSpending).toLocaleString() }} unsorted
            </div>
          </div>
        </BasilCard>

        <!-- Actuals + Projections — side by side (no budget summary) -->
        <div v-if="!budgetSummary" style="display: flex; gap: var(--basil-space-4); flex-wrap: wrap;" class="basil-mb-4">
            <BasilCard flat bordered style="flex: 1; min-width: 220px;">
              <div class="basil-card__body">
                <div class="basil-card-head">
                  <span class="basil-card-label">Actuals</span>
                  <span class="basil-card-period">{{ selectedDate.display }}</span>
                </div>
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
                <div :class="['basil-net', netPositive ? 'basil-net--positive' : 'basil-net--negative']">
                  <div class="basil-net__amount basil-display">
                    {{ netPositive ? '+' : '−' }}${{ Math.round(Math.abs(displayedStats.netPosition)).toLocaleString() }}
                  </div>
                  <div class="basil-net__label">{{ netPositive ? 'free cash flow' : 'over budget' }}</div>
                </div>
                <div v-if="monthlyStats.savingsAmount > 0" class="basil-secondary-stat">
                  <BasilIcon name="savings" size="xs" color="info" />
                  ${{ Math.round(monthlyStats.savingsAmount).toLocaleString() }} saved
                </div>
                <div v-if="monthlyStats.toSortSpending > 0" class="basil-secondary-stat basil-secondary-stat--warn">
                  <BasilIcon name="warning_amber" size="xs" />
                  ${{ Math.round(monthlyStats.toSortSpending).toLocaleString() }} unsorted
                </div>
              </div>
            </BasilCard>
            <BasilCard flat bordered style="flex: 1; min-width: 220px;">
              <div class="basil-card__body">
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
              </div>
            </BasilCard>
        </div>

        <!-- To Sort Nudge Card -->
        <BasilCard
          v-if="isOnboarded && toSortSuggestionStats.total > 0 && !showAll && !isLoading && !isRefreshing"
          flat bordered class="basil-tosort-card basil-mb-4"
          @click="openTriageFlow()" @keydown.enter="openTriageFlow()" role="button" tabindex="0" aria-label="Sort transactions"
        >
          <div class="basil-card__body">
            <div class="basil-card-head">
              <span class="basil-card-label">To Sort</span>
              <BasilIcon name="chevron_right" size="20px" />
            </div>
            <div class="basil-tosort-card__body">
              <span class="basil-tosort-card__count">{{ toSortSuggestionStats.total }}</span>
              <div>
                <div class="basil-tosort-card__headline">transaction{{ toSortSuggestionStats.total !== 1 ? 's' : '' }} to sort</div>
                <div v-if="toSortSuggestionStats.withSuggestion > 0" class="basil-tosort-card__hint">
                  {{ toSortSuggestionStats.withSuggestion }} suggested
                </div>
              </div>
            </div>
          </div>
        </BasilCard>

        <!-- Detected Relationships Card -->
        <BasilCard
          v-if="isOnboarded && pendingRelationships.length > 0 && !showAll && !isLoading && !isRefreshing"
          flat bordered
          :class="['basil-relationships-card basil-mb-4', { 'basil-relationships-card--expanded': relationshipsExpanded }]"
          @click="!relationshipsExpanded && (relationshipsExpanded = true)"
        >
          <div class="basil-card__body">
            <div class="basil-card-head" @click.stop="relationshipsExpanded = !relationshipsExpanded" role="button" tabindex="0" style="cursor: pointer;">
              <span class="basil-card-label">Detected Relationships</span>
              <BasilIcon :name="relationshipsExpanded ? 'expand_less' : 'expand_more'" size="20px" />
            </div>
            <div v-if="!relationshipsExpanded" class="basil-relationships-card__body">
              <span class="basil-tosort-card__count">{{ pendingRelationships.length }}</span>
              <div>
                <div class="basil-tosort-card__headline">possible {{ pendingRelationships.length === 1 ? 'match' : 'matches' }} to review</div>
              </div>
            </div>
            <div v-if="relationshipsExpanded" class="basil-relationships-card__list">
              <RelationshipCard
                v-for="rel in pendingRelationships"
                :key="relKey(rel)"
                :relationship="rel"
                :disable="relationshipSaving"
                @confirm="relationshipConfirm"
                @dismiss="relationshipDismiss"
              />
            </div>
          </div>
        </BasilCard>

        <!-- Post-onboarding nudge card -->
        <BasilCard
          v-if="nudgeCard && !showAll && !isLoading && !isRefreshing"
          flat bordered class="basil-mb-4"
        >
          <div class="basil-card__body">
            <div class="basil-card-head">
              <span class="basil-card-label">{{ nudgeCard.type === 'budget' ? 'Get started' : nudgeCard.type === 'category' ? 'Budget tip' : 'Next step' }}</span>
              <BasilButton variant="icon" icon="close" dense @click.stop="dismissNudge()" />
            </div>
            <div style="color: var(--basil-text-secondary); font-size: 0.875rem; margin-bottom: var(--basil-space-3);">{{ nudgeCard.text }}</div>
            <BasilButton
              :label="nudgeCard.cta"
              @click="handleNudgeCta()"
            />
          </div>
        </BasilCard>

        <!-- Controls row -->
        <div v-if="isOnboarded" class="button-container basil-mb-4">
          <BasilToggle v-model="showAll" v-if="!showAll" @click="showAll = true" label="Show all transactions" />
          <BasilToggle v-model="showAll" v-if="showAll" @click="showAll = false" label="Show all transactions" />
          <BasilSelect v-if="!showAll" v-model="selectedDate.display" :options="months" label="Budgets" dense />
        </div>

        <!-- Category cards -->
        <div v-show="isOnboarded && !showAll">
        <BasilList>
          <div class="basil-categories">
            <div
              v-for="(groupedTransactions, category, categoryIndex) in visibleGroupedTransactions"
              :key="category"
              class="basil-budget-row"
              :class="{ 'basil-category-reveal': barsReady, 'basil-category--expanded': clickedCategories.includes(category) }"
              :style="barsReady ? { animationDelay: `${categoryIndex * 35}ms` } : {}"
            >

              <!-- Make a category List Item -->
              <BasilListItem
                clickable
                @click="toggleCategory(category)"
                :class="[
                  { 'active': clickedCategories.includes(category) },
                  'basil-category-row'
                ]"
              >
                <div class="basil-budget-row header">
                  <div class="basil-list-item__label">
                    {{this.groupedTransactions[category].categoryName}}
                    <BasilIcon
                      v-if="recurringByCategory[this.groupedTransactions[category].categoryName]"
                      name="autorenew"
                      size="sm"
                      color="var(--basil-text-muted)"
                      style="vertical-align: middle; margin-left: 4px;"
                    >
                      <BasilTooltip>Contains recurring transactions</BasilTooltip>
                    </BasilIcon>
                  </div>
                  <div class="basil-budget-row total basil-mono">
                    {{ categoryAmountLabel(category) }}
                  </div>
                </div>
                <div v-show="this.groupedTransactions[category].monthly_limit" class="basil-budget-row progress">
                  <BasilProgress
                    :value="barsReady ? getProgressRatio(category) : 0"
                    :class="['basil-mt-2', `basil-progress--${getCategoryProgressColor(category)}`]"
                    :color="getCategoryProgressColor(category)"
                    size="6px"
                  />
                </div>

                <div class="basil-list-item__caption basil-budget-row basil-mono" v-show="this.groupedTransactions[category].monthly_limit">
                  {{ isNaN(categorySum(category)) ? "N/A" : formatDollar(categorySum(category).toFixed(this.decimalPlaces)) }}
                  {{ isNaN(this.groupedTransactions[category].monthly_limit) ||
                      this.groupedTransactions[category].monthly_limit == 0 ? "" : " out of " + formatDollar(this.groupedTransactions[category].monthly_limit) }}
                </div>
                <!-- PFC sub-breakdown (inside header) -->
                <div v-if="groupedTransactionsVisible[category] && detailedPfcBreakdown(groupedTransactions).length >= 1" class="basil-pfc-breakdown">
                  <div v-for="item in detailedPfcBreakdown(groupedTransactions)" :key="item.label"
                       class="basil-pfc-breakdown__row">
                    <span class="basil-pfc-breakdown__label">{{ item.label }}</span>
                    <span class="basil-pfc-breakdown__amount basil-mono">{{ formatDollar(item.total.toFixed(2)) }}</span>
                  </div>
                </div>

              </BasilListItem>

            <!-- Make the nested rows grouped under each category List Item -->
            <div>
              <Transition
                @before-enter="txnBeforeEnter"
                @enter="txnEnter"
                @after-enter="txnAfterEnter"
                @leave="txnLeave"
                @after-leave="txnAfterLeave"
                :css="false"
              >
              <div v-if="groupedTransactionsVisible[category]" class="category-transactions">

                <div
                  v-for="(item, index) in filteredTransactions(groupedTransactions)"
                  :key="index"
                  class="category-txn-item"
                  :style="{ '--txn-i': index }"
                >
                  <div
                    :class="['basil-txn-row', 'basil-txn-row--nested', { 'basil-txn-row--excluded': item.excludeFromTotal }, item.pending ? 'pending' : '']"
                    @click.stop="buildEditTransactionDialog(item)"
                  >
                    <div class="basil-txn-row__name">
                      <div class="basil-txn-cell">
                        <div
                          class="basil-txn-avatar"
                          :style="{ background: merchantColor(item) }"
                        >{{ merchantInitials(item) }}</div>
                        <div class="basil-txn-label">
                          <div class="basil-txn-label__primary">
                            <span class="basil-txn-label__text">{{ item.venmo_note || item.merchant_name || (item.name == 'Venmo' ? item.name + (item.note ? ': ' + item.note : '') : item.name) }}</span>
                            <span v-if="item.tags?.length" class="basil-tag-badges">
                              <span v-for="tag in item.tags.slice(0, 2)" :key="tag.id" class="basil-tag-badge">{{ tag.name }}</span>
                              <span v-if="item.tags.length > 2" class="basil-tag-overflow">+{{ item.tags.length - 2 }}</span>
                            </span>
                            <span
                              v-if="relationshipMap[item.transaction_id] && !item.linkedTransaction && !item.dismissedRelationship"
                              class="basil-relationship-badge basil-relationship-badge--pending"
                            >
                              Possible Match
                              <BasilTooltip>{{ relationshipTooltip(item) }}</BasilTooltip>
                            </span>
                            <span
                              v-else-if="relationshipMap[item.transaction_id] && item.linkedTransaction"
                              class="basil-relationship-badge basil-relationship-badge--confirmed"
                            >
                              {{ relationshipMap[item.transaction_id].type === 'split' ? 'Payback' : 'Return' }}
                              <BasilTooltip>{{ relationshipTooltip(item) }}</BasilTooltip>
                            </span>
                            <BasilIcon
                              v-if="item.parentTransactionId"
                              name="call_split"
                              size="14px"
                              class="basil-split-icon"
                            >
                              <BasilTooltip>Part of a split transaction</BasilTooltip>
                            </BasilIcon>
                          </div>
                          <div class="basil-txn-label__secondary">
                            {{ formatDate(item.date) }}
                            <BasilIcon
                              v-if="item.effectiveDate && item.effectiveDate !== item.date"
                              name="event_repeat"
                              size="12px"
                              class="basil-effective-date-icon"
                            >
                              <BasilTooltip>Moved from {{ formatDate(item.date) }} to {{ formatDate(item.effectiveDate) }}</BasilTooltip>
                            </BasilIcon>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="basil-txn-row__amount">
                      <span
                        class="basil-txn-amount"
                        :class="item.amount < 0 ? 'basil-txn-amount--income' : `basil-txn-amount--${categoryTypeMap[item.mappedCategory] || 'expense'}`"
                      >
                        {{ item.amount < 0 ? '+' : '' }}${{ Math.abs(item.amount).toFixed(2) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              </Transition>
              </div>
            </div>
          </div>
          <div v-if="!hasVisibleCategories && !$store.state.bootstrapping" class="basil-budget-empty-month basil-pa-5" style="text-align: center;">
            <BasilIcon name="event_busy" size="2rem" color="grey-5" />
            <div class="basil-mt-2" style="color: var(--basil-text-secondary)">
              No transactions this month yet.
            </div>
            <div class="basil-mt-1" style="color: var(--basil-text-secondary); font-size: 0.85rem">
              Try selecting a previous month, or sync to pull in new transactions.
            </div>
          </div>
        </BasilList>
      </div>
      </div><!-- close basil-container -->

      <!-- If show all is true -->
      <div v-show="isOnboarded && showAll" class="basil-pa-4 all-transactions-table">

        <!-- Toolbar: filters when nothing selected, bulk actions when rows are selected -->
        <div class="basil-mb-2" style="display: flex; flex-wrap: wrap; align-items: center; gap: var(--basil-space-2);">
          <template v-if="selectedRows.length === 0 || isMobile">
            <BasilSearch
              v-model="tableSearch"
              dense
              placeholder="Search name or merchant"
              style="flex: 1; min-width: 150px"
            />
            <BasilSelect
              v-model="tableMonth"
              :options="[{ label: 'All months', value: null }, ...months.map(m => ({ label: m, value: m }))]"
              option-label="label"
              option-value="value"
              emit-value
              dense
              style="min-width: 140px"
            />
            <BasilAmount v-model="amountMin" dense placeholder="Min $" style="width: 90px" class="basil-desktop-only" />
            <BasilAmount v-model="amountMax" dense placeholder="Max $" style="width: 90px" class="basil-desktop-only" />
            <BasilSelect
              v-if="$store.state.tags.length > 0"
              v-model="tagFilter"
              :options="$store.state.tags.map(t => ({ label: t.name, value: t.id }))"
              emit-value
              option-label="label"
              option-value="value"
              label="Tag"
              dense
              style="min-width: 120px"
              class="basil-desktop-only"
            />
            <BasilButton
              variant="flat"
              label="Clear"
              :disabled="!tableSearch && tableMonth === null && amountMin === null && amountMax === null && !tagFilter"
              @click="tableSearch = ''; tableMonth = null; amountMin = null; amountMax = null; tagFilter = null; tableServerResults = null"
            />
          </template>

          <template v-else>
            <div class="basil-desktop-only basil-full-width" style="display: flex; align-items: center; gap: var(--basil-space-2);">
              <span class="basil-bulk-label">{{ selectedRows.length }} selected</span>
              <BasilSelect
                v-model="bulkCategory"
                :options="categoryMonthlyLimits.map(c => c.category).sort()"
                label="Move to category"
                dense
                filterable
                style="min-width: 180px"
              />
              <BasilButton label="Apply" :disabled="!bulkCategory" @click="applyBulkCategory" />
              <BasilButton variant="flat" dense icon="sell" label="Tag" @click="openBulkTag()" />
              <BasilButton variant="flat" label="Clear selection" @click="selectedRows = []" />
              <span v-if="bulkCategory" class="basil-bulk-disclosure">
                Moves {{ selectedRows.length }} transaction{{ selectedRows.length === 1 ? '' : 's' }} to {{ bulkCategory }}. No rule is created.
              </span>
            </div>
          </template>
        </div>

        <!-- Sticky header (desktop only — mobile rows are self-explanatory) -->
        <div class="basil-txn-list__header basil-desktop-only">
          <div class="basil-txn-row__checkbox"></div>
          <div class="basil-txn-row__name basil-txn-list__sort" @click="toggleSort('name')">
            Name
            <BasilIcon v-if="sortField === 'name'" :name="sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'" size="14px" />
          </div>
          <div class="basil-txn-row__amount basil-txn-list__sort" @click="toggleSort('amount')">
            Amount
            <BasilIcon v-if="sortField === 'amount'" :name="sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'" size="14px" />
          </div>
          <div class="basil-txn-row__category basil-txn-list__sort" @click="toggleSort('mappedCategory')">
            Category
            <BasilIcon v-if="sortField === 'mappedCategory'" :name="sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'" size="14px" />
          </div>
          <div class="basil-txn-row__date basil-txn-list__sort" @click="toggleSort('date')">
            Date
            <BasilIcon v-if="sortField === 'date'" :name="sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'" size="14px" />
          </div>
          <div class="basil-txn-row__status">Status</div>
        </div>

        <!-- Virtual scroll rows -->
        <div
          ref="virtualScrollRef"
          class="basil-txn-table"
          style="max-height: calc(100dvh - 200px); min-height: calc(100vh - 300px); overflow-y: auto; -webkit-overflow-scrolling: touch"
          @scroll="onVirtualScroll"
        >
          <div :style="{ height: `${virtualizer?.getTotalSize() || 0}px`, width: '100%', position: 'relative' }">
            <template v-for="vRow in (virtualizer?.getVirtualItems() || [])" :key="sortedTableTransactions[vRow.index]?.transaction_id || vRow.index">
              <div
                :style="{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${vRow.size}px`, transform: `translateY(${vRow.start}px)` }"
                :class="['basil-txn-row', { 'basil-txn-row--excluded': sortedTableTransactions[vRow.index]?.excludeFromTotal, 'basil-txn-row--selected': isRowSelected(sortedTableTransactions[vRow.index]) }]"
                @click="onRowClick($event, sortedTableTransactions[vRow.index])"
                @touchstart="onRowTouchStart($event, sortedTableTransactions[vRow.index])"
                @touchend="onRowTouchEnd"
                @touchmove="onRowTouchCancel"
                @contextmenu.prevent
              >
                <!-- Checkbox (desktop only) -->
                <div class="basil-txn-row__checkbox basil-desktop-only">
                  <BasilToggle variant="checkbox" dense :model-value="isRowSelected(sortedTableTransactions[vRow.index])" @update:model-value="toggleRowSelection(sortedTableTransactions[vRow.index])" @click.stop />
                </div>

                <!-- Name -->
                <div class="basil-txn-row__name">
                  <div class="basil-txn-cell">
                    <div
                      class="basil-txn-avatar"
                      :class="{ 'basil-txn-avatar--selected': isMobile && isRowSelected(sortedTableTransactions[vRow.index]) }"
                      :style="isRowSelected(sortedTableTransactions[vRow.index]) && isMobile ? {} : { background: merchantColor(sortedTableTransactions[vRow.index]) }"
                      @click="isMobile && selectedRows.length > 0 ? ($event.stopPropagation(), toggleRowSelection(sortedTableTransactions[vRow.index])) : null"
                    >
                      <BasilIcon v-if="isMobile && isRowSelected(sortedTableTransactions[vRow.index])" name="check" size="18px" />
                      <template v-else>{{ merchantInitials(sortedTableTransactions[vRow.index]) }}</template>
                    </div>
                    <div class="basil-txn-label">
                      <div class="basil-txn-label__primary">
                        <span class="basil-txn-label__text">{{ sortedTableTransactions[vRow.index]?.venmo_note || sortedTableTransactions[vRow.index]?.merchant_name || sortedTableTransactions[vRow.index]?.name }}</span>
                        <span v-if="sortedTableTransactions[vRow.index]?.tags?.length" class="basil-tag-badges">
                          <span v-for="tag in sortedTableTransactions[vRow.index].tags.slice(0, 2)" :key="tag.id" class="basil-tag-badge">{{ tag.name }}</span>
                          <span v-if="sortedTableTransactions[vRow.index].tags.length > 2" class="basil-tag-overflow">+{{ sortedTableTransactions[vRow.index].tags.length - 2 }}</span>
                        </span>
                        <span
                          v-if="relationshipMap[sortedTableTransactions[vRow.index]?.transaction_id] && !sortedTableTransactions[vRow.index]?.linkedTransaction && !sortedTableTransactions[vRow.index]?.dismissedRelationship"
                          class="basil-relationship-badge basil-relationship-badge--pending"
                        >
                          Possible Match
                          <BasilTooltip>{{ relationshipTooltip(sortedTableTransactions[vRow.index]) }}</BasilTooltip>
                        </span>
                        <span
                          v-else-if="relationshipMap[sortedTableTransactions[vRow.index]?.transaction_id] && sortedTableTransactions[vRow.index]?.linkedTransaction"
                          class="basil-relationship-badge basil-relationship-badge--confirmed"
                        >
                          {{ relationshipMap[sortedTableTransactions[vRow.index]?.transaction_id]?.type === 'split' ? 'Payback' : 'Return' }}
                          <BasilTooltip>{{ relationshipTooltip(sortedTableTransactions[vRow.index]) }}</BasilTooltip>
                        </span>
                        <span
                          v-if="sortedTableTransactions[vRow.index]?.parentTransactionId"
                          class="basil-relationship-badge"
                        >
                          Split
                          <BasilTooltip>Part of a split transaction</BasilTooltip>
                        </span>
                      </div>
                      <div class="basil-txn-label__secondary">
                        {{ formatDate(sortedTableTransactions[vRow.index]?.date) }}
                        <BasilIcon
                          v-if="sortedTableTransactions[vRow.index]?.effectiveDate && sortedTableTransactions[vRow.index]?.effectiveDate !== sortedTableTransactions[vRow.index]?.date"
                          name="event_repeat"
                          size="12px"
                          class="basil-effective-date-icon"
                        >
                          <BasilTooltip>Moved from {{ formatDate(sortedTableTransactions[vRow.index]?.date) }} to {{ formatDate(sortedTableTransactions[vRow.index]?.effectiveDate) }}</BasilTooltip>
                        </BasilIcon>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Amount -->
                <div class="basil-txn-row__amount">
                  <span
                    class="basil-txn-amount"
                    :class="sortedTableTransactions[vRow.index]?.amount < 0 ? 'basil-txn-amount--income' : `basil-txn-amount--${categoryTypeMap[sortedTableTransactions[vRow.index]?.mappedCategory] || 'expense'}`"
                  >
                    {{ sortedTableTransactions[vRow.index]?.amount < 0 ? '+' : '' }}${{ Math.abs(sortedTableTransactions[vRow.index]?.amount || 0).toFixed(2) }}
                  </span>
                </div>

                <!-- Category (desktop only) -->
                <div class="basil-txn-row__category basil-desktop-only">
                  {{ sortedTableTransactions[vRow.index]?.mappedCategory }}
                </div>

                <!-- Date (desktop only) -->
                <div class="basil-txn-row__date basil-desktop-only">
                  {{ formatDate(sortedTableTransactions[vRow.index]?.date) }}
                  <BasilIcon
                    v-if="sortedTableTransactions[vRow.index]?.effectiveDate && sortedTableTransactions[vRow.index]?.effectiveDate !== sortedTableTransactions[vRow.index]?.date"
                    name="event_repeat"
                    size="12px"
                    class="basil-effective-date-icon"
                  >
                    <BasilTooltip>Moved from {{ formatDate(sortedTableTransactions[vRow.index]?.date) }} to {{ formatDate(sortedTableTransactions[vRow.index]?.effectiveDate) }}</BasilTooltip>
                  </BasilIcon>
                </div>

                <!-- Status (desktop only) -->
                <div class="basil-txn-row__status basil-desktop-only">
                  <span v-if="sortedTableTransactions[vRow.index]?.pending" class="basil-txn-pending">Pending</span>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div v-if="tableLoadingMore" class="basil-table-load-more">
          <BasilSpinner size="20px" color="primary" />
          <span>Loading older transactions...</span>
        </div>

      </div>

    </div>

    <!-- Mobile bulk action bar — sits above bottom nav -->
    <div
      v-if="showAll && selectedRows.length > 0"
      class="basil-mobile-only basil-mobile-bulk basil-pa-3"
      style="position: fixed; left: 0; right: 0; bottom: var(--basil-bottom-nav-height); z-index: 2000"
    >
      <div class="basil-mb-1" style="display: flex; align-items: center; gap: var(--basil-space-2);">
        <span class="basil-bulk-label">{{ selectedRows.length }} selected</span>
        <BasilButton variant="icon" icon="close" dense @click="selectedRows = []" />
      </div>
      <div style="display: flex; align-items: center; gap: var(--basil-space-2);">
        <BasilSelect
          v-model="bulkCategory"
          :options="categoryMonthlyLimits.map(c => c.category).sort()"
          label="Move to category"
          dense
          filterable
          style="flex: 1"
        />
        <BasilButton label="Apply" :disabled="!bulkCategory" @click="applyBulkCategory" />
        <BasilButton variant="flat" dense icon="sell" label="Tag" @click="openBulkTag()" />
      </div>
      <div v-if="bulkCategory" class="basil-bulk-disclosure basil-mt-1">
        Moves {{ selectedRows.length }} transaction{{ selectedRows.length === 1 ? '' : 's' }} to {{ bulkCategory }}. No rule is created.
      </div>
    </div>
    

    <!-- Shared transaction edit dialog — used by both category rows and show-all table -->
    <BasilTray v-model="tableDialogOpen">
      <DialogComponent
        v-if="tableDialogTransaction"
        :key="tableDialogTransaction.transaction_id + '-' + tableDialogKey"
        :dialogType="'transaction'"
        :item="tableDialogTransaction"
        :dropDown="categoryMonthlyLimits"
        :similarity-data="tableDialogSimilarityData"
        :attribution="getTransactionAttribution(tableDialogTransaction)"
        :relationship="!tableDialogTransaction.linkedTransaction && !tableDialogTransaction.dismissedRelationship ? relationshipMap[tableDialogTransaction.transaction_id]?.rel : null"
        @update-transaction="onSubmit"
        @view-rule="handleViewRule"
        @relationship-confirm="relationshipConfirm"
        @relationship-dismiss="relationshipDismiss"
        @save-split="handleSplit"
        @unsplit="handleUnsplit"
      />
    </BasilTray>

    <BasilTray v-model="newCategory">
      <DialogComponent :dialogType="'addCategory'" @add-category="onSubmit"/>
    </BasilTray>

    <!-- Triage Flow Dialog -->
    <BasilTray v-model="triageOpen" max-width="440px">
      <BasilCard flat>

        <!-- Done state -->
        <template v-if="triageDone">
          <div class="basil-triage__done">
            <BasilIcon name="check_circle" size="48px" color="positive" />
            <div class="basil-triage__done-heading">All caught up!</div>
          </div>
          <div v-if="triageVenmoCount > 0 && !enrichmentOffered" class="basil-triage__venmo-nudge">
            <div class="basil-triage__venmo-nudge-text">
              You sorted {{ triageVenmoCount }} Venmo {{ triageVenmoCount === 1 ? 'payment' : 'payments' }} without details.
            </div>
            <BasilButton
              variant="flat" dense
              color="primary"
              icon="upload_file"
              label="Import Venmo CSV"
              @click="triageOpen = false; venmoLaunchedFromTriage = true; $nextTick(() => openVenmoImport())"
            />
          </div>
          <div class="basil-triage__actions">
            <BasilButton label="Done" class="basil-full-width" @click="showBulkTagDialog = false" />
          </div>
        </template>

        <!-- Enrichment prompt -->
        <template v-else-if="triageShowEnrichmentPrompt">
          <div class="basil-triage__done">
            <BasilIcon name="upload_file" size="48px" style="color: var(--basil-green)" />
            <div class="basil-triage__done-heading">Add Venmo details before sorting?</div>
            <div style="color: var(--basil-text-secondary); font-size: 0.875rem; text-align: center; padding: 0 var(--basil-space-4);">
              You have <b>{{ triageUnenrichedP2PCount }}</b> Venmo {{ triageUnenrichedP2PCount === 1 ? 'transaction' : 'transactions' }} without names or notes. Importing a CSV will make them easier to categorize.
            </div>
          </div>
          <div class="basil-triage__actions">
            <BasilButton variant="flat" label="Skip" @click="triageShowEnrichmentPrompt = false; enrichmentOffered = true" />
            <BasilButton
              icon="upload_file"
              label="Import CSV"
              @click="triageOpen = false; enrichmentOffered = true; venmoLaunchedFromTriage = true; $nextTick(() => openVenmoImport())"
            />
          </div>
        </template>

        <!-- Triage state -->
        <template v-else-if="triageItems.length > 0">
          <!-- Header -->
          <div class="basil-triage__header">
            <span class="basil-triage__title">Sort Transactions</span>
            <span class="basil-triage__progress">{{ triageTotal - triageItems.length + 1 }} of {{ triageTotal }}</span>
            <BasilButton variant="icon" icon="close" @click="showTriageFlow = false" class="basil-dialog-close" aria-label="Close" />
          </div>

          <!-- Transaction -->
          <div class="basil-triage__txn">
            <div class="basil-triage__amount basil-mono">
              {{ triageItems[0].amount < 0 ? `-$${Math.abs(triageItems[0].amount).toFixed(2)}` : `$${triageItems[0].amount.toFixed(2)}` }}
            </div>
            <div class="basil-triage__merchant">{{ triageItems[0].venmo_note || triageItems[0].merchant_name || triageItems[0].name }}</div>
            <div v-if="!triageItems[0].merchant_name && triageItems[0].account && triageItems[0].account !== '?'" class="basil-triage__institution">{{ triageItems[0].account }}</div>
            <div class="basil-triage__date">{{ formatDate(triageItems[0].date) }}</div>
            <div
              v-if="triageAttribution && triageAttribution.type !== 'unsorted'"
              class="basil-triage__attribution"
            >
              <BasilIcon :name="triageAttribution.icon" size="14px" />
              {{ triageAttribution.label }}
            </div>
          </div>

          <!-- Split mode -->
          <template v-if="triageSplitMode">
            <div style="text-align: center; padding: var(--basil-space-2) 0 var(--basil-space-3);">
              <span class="basil-split__remaining" :class="{ 'basil-split__remaining--done': Math.abs(triageSplitRemaining) < 0.01 }">
                {{ Math.abs(triageSplitRemaining) < 0.01 ? 'Balanced' : `$${triageSplitRemaining.toFixed(2)} remaining` }}
              </span>
            </div>
            <div class="basil-split__rows" style="padding: 0 var(--basil-space-4);">
              <div v-for="(row, i) in triageSplitRows" :key="i" class="basil-split__row">
                <BasilAmount :model-value="row.amount" @update:model-value="triageUpdateSplitAmount(i, $event)" dense class="basil-split__amount" />
                <BasilSelect dense :model-value="row.categoryName"
                  @update:model-value="triageUpdateSplitCategory(i, $event)"
                  :options="categoryMonthlyLimits.map(c => c.category).filter(c => c !== 'To Sort').sort()"
                  label="Category" class="basil-split__category" />
                <BasilButton v-if="triageSplitRows.length > 2" variant="icon" icon="close" dense color="negative"
                  @click="triageSplitRows.splice(i, 1)" />
                <div v-else style="width: 36px" />
              </div>
            </div>
            <div v-if="triageSplitRemaining > 0.01" style="text-align: center; padding: var(--basil-space-1) 0;">
              <BasilButton variant="flat" dense label="+ Add row" color="primary" @click="triageSplitRows.push({ amount: triageSplitRemaining, categoryName: '' })" />
            </div>
          </template>
          <!-- Normal triage category picker + similar -->
          <template v-else>
            <!-- Suggestion chip -->
            <div v-if="triageItems[0].suggestion" class="basil-triage__suggestion-area">
              <BasilChip
                clickable
                :color="triageCategory === triageItems[0].suggestion ? 'primary' : undefined"
                @click="triageCategory = triageItems[0].suggestion"
              >
                <BasilIcon name="auto_awesome" size="sm" /> {{ triageItems[0].suggestion }}
              </BasilChip>
              <div class="basil-triage__reason">{{ triageItems[0].reason }}</div>
            </div>

            <!-- Category / Note / Tags — matches DialogComponent field sizing -->
            <div class="basil-triage__fields">
              <BasilSelect
                v-model="triageCategory"
                :options="categoryMonthlyLimits.map(c => c.category).filter(c => c !== 'To Sort').sort()"
                label="Category"
                filterable
              />
              <BasilNote v-model="triageNote" label="Note" />
            </div>
            <div class="basil-px-4 basil-mb-2">
              <TagPicker v-model="triageTags" />
            </div>

            <div class="basil-px-4">
              <BasilToggle
                v-model="triageExclude"
                label="Exclude from total"
              />
            </div>

            <!-- Similar transactions toggle -->
            <div v-if="triageSimilar && triageSimilar.allCount > 0" class="basil-triage__similar-area">
              <BasilToggle v-model="triageCreateRule" variant="checkbox" dense>
                <span v-if="triageActionableCount > 0">
                  Also categorize {{ triageActionableCount }} similar
                </span>
                <span v-else>Remember for future "{{ triageSimilar.label }}" ({{ triageSimilar.allCount }} similar)</span>
              </BasilToggle>
              <div class="basil-triage__similar-hint">
                Matched by {{ { merchant_name: 'merchant', exact_name: 'name', name_account: 'name + institution', name_prefix: 'name pattern', amount_account: 'amount + institution', amount: 'amount' }[triageSimilar.strategy] || triageSimilar.strategy }}
              </div>
            </div>
          </template>

          <!-- Actions -->
          <div class="basil-triage__actions">
            <template v-if="triageSplitMode">
              <BasilButton variant="flat" label="Cancel" @click="triageSplitMode = false; triageSplitRows = []" />
              <BasilButton label="Save split"
                :disabled="Math.abs(triageSplitRemaining) > 0.01 || triageSplitRows.length < 2 || !triageSplitRows.every(r => r.amount > 0 && r.categoryName) || triageSaving"
                :loading="triageSaving"
                @click="handleSplit({ transaction_id: triageItems[0].transaction_id, splits: triageSplitRows })" />
            </template>
            <template v-else>
              <BasilButton variant="flat" label="Skip" @click="triageSkip()" :disabled="triageSaving" />
              <BasilButton v-if="triageCanSplit" variant="flat" label="Split" @click="triageEnterSplitMode()" :disabled="triageSaving" />
              <BasilButton
                label="Save"
                :disabled="!triageCategory || triageSaving"
                :loading="triageSaving"
                @click="triageAccept()"
              />
            </template>
          </div>

          <!-- Auto-learn feedback toast -->
          <div v-if="triageLearnToast" class="basil-triage-learn-toast">
            <BasilIcon name="auto_awesome" size="16px" />
            Got it — future {{ triageLearnToast.merchant }} transactions go to {{ triageLearnToast.category }}
          </div>
        </template>

      </BasilCard>
    </BasilTray>

    <!-- Venmo Enrichment Dialog -->
    <VenmoEnrichmentDialog v-model="venmoDialogOpen" />

    <!-- Bulk Tag tray -->
    <BasilTray v-model="bulkTagOpen" max-width="440px">
      <BasilCard flat>
        <div class="basil-dialog-header">
          <div class="basil-dialog-title">
            <span class="basil-dialog-title__sub">BULK TAG</span>
            <span class="basil-dialog-title__main">Tag {{ selectedRows.length }} transaction{{ selectedRows.length !== 1 ? 's' : '' }}</span>
          </div>
          <BasilButton variant="icon" icon="close" class="basil-dialog-close" @click="bulkTagOpen = false" />
        </div>
        <div class="basil-card__body">
          <TagPicker v-model="bulkTagSelection" />
        </div>
        <div class="basil-card__actions basil-px-4 basil-pb-4">
          <BasilButton variant="flat" label="Cancel" @click="bulkTagOpen = false" />
          <BasilButton
            label="Apply"
            :disabled="!bulkTagSelection.length"
            @click="applyBulkTag"
          />
        </div>
      </BasilCard>
    </BasilTray>

  </div>
</template>


<script>
  import { ref, computed, watch, shallowRef } from 'vue'
  import { useVirtualizer } from '@tanstack/vue-virtual'
  import dayjs from 'dayjs'
  import minMax from 'dayjs/plugin/minMax';
  import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
  import customParseFormat from 'dayjs/plugin/customParseFormat'
  import DialogComponent from '../components/DialogComponent.vue'
  import RelationshipCard from '../components/RelationshipCard.vue'
  import SkeletonBudget from '../components/SkeletonBudget.vue'
  import EmptyState from '../components/EmptyState.vue'
  import TagPicker from '../components/TagPicker.vue'
  import store from '../store'
  import { ensureAppData, handleDialogSubmit, bulkCategorize, deleteRule, fetchMerchants, saveRule, saveCompoundRule, updateCompoundRule, triggerSync, fetchTransactionsForMonth, fetchMonthRange, searchTransactions, linkTransactions, dismissRelationship, unlinkTransactions, undoDismissRelationship, tagTransactionsApi, untagTransactionsApi, splitTransaction, unsplitTransaction, updatePreferences } from '@/api';
  import { sweepStore, applyMerchantRuleToStore, applyCompoundRuleToStore, findSimilarTransactions, getAttribution } from '@/utils/ruleUtils';
  import { evaluateNudge } from '@/utils/budgetSetup';
  import { humanizeDetailedPfc } from '@/utils/pfcLabels';
  import { detectRelationships, isP2PTransaction } from '@/utils/relationshipDetector';
  import VenmoEnrichmentDialog from '@/components/VenmoEnrichmentDialog.vue';
  import SpendingBreakdown from '@/components/SpendingBreakdown.vue';
  import BasilTray from '@/components/BasilTray.vue';
  import BasilSearch from '@/components/BasilSearch';
  import BasilAmount from '@/components/BasilAmount';
  import BasilNote from '@/components/BasilNote';
  import { screen } from '@/composables/useScreen';
  import { toast } from '@/composables/useToast';
  import { merchantInitials as _merchantInitials, merchantColor as _merchantColor } from '@/utils/merchantDisplay';

// import e from 'express';

  function amountBucket(abs) {
    if (abs < 10)  return 'xs';
    if (abs < 30)  return 'sm';
    if (abs < 100) return 'md';
    if (abs < 300) return 'lg';
    return 'xl';
  }

  dayjs().format()
  dayjs.extend(minMax);
  dayjs.extend(isSameOrBefore);
  dayjs.extend(customParseFormat);

  export default {
    name: 'BudgetView',
    components: {
      DialogComponent,
      RelationshipCard,
      SkeletonBudget,
      EmptyState,
      BasilTray,
      BasilSearch,
      BasilAmount,
      BasilNote,
      VenmoEnrichmentDialog,
      TagPicker,
      SpendingBreakdown,
    },

    setup() {
      const virtualScrollRef = ref(null)
      const virtualItemCount = ref(0)
      const virtualizer = useVirtualizer(computed(() => ({
        count: virtualItemCount.value,
        getScrollElement: () => virtualScrollRef.value,
        estimateSize: () => 56,
        overscan: 10,
      })))

      return { virtualScrollRef, virtualItemCount, virtualizer }
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
        categoryClickers: {},
        venmoDialogOpen: false,
        venmoLaunchedFromTriage: false,
        bulkTagOpen: false,
        bulkTagSelection: [],
        bulkTagOriginal: [],
        tagFilter: null,
        transactionDetails: {},
        decimalPlaces: 0,
        fetchInterval: 0,
        sortField: null,
        sortDir: 'asc',
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
        displayedSummary: { pool: 0, spent: 0, remaining: 0, ratio: 0, fixedSpent: 0, fixedBudget: 0, savingsAmount: 0, savingsBudget: 0 },
        barsReady: false,
        selectedRows: [],
        longPressTimer: null,
        longPressTriggered: false,
        bulkCategory: null,
        tableDialogOpen: false,
        tableDialogTransaction: null,
        tableDialogKey: 0,
        dialogSimilarityData: null,
        tableDialogSimilarityData: null,
        tableSearch: '',
        tableMonth: null,
        amountMin: null,
        amountMax: null,
        tableServerResults: null,
        tableSearchDebounce: null,
        tableLoadingMore: false,
        tableNoMoreMonths: false,
        triageSkipped: new Set(),
        triageOpen: false,
        triageCategory: null,
        triageNote: '',
        triageExclude: false,
        nudgeDismissedThisSession: false,
        triageTags: [],
        triageCreateRule: false,
        triageSaving: false,
        triageDone: false,
        triageTotal: 0,
        triageVenmoCount: 0,
        enrichmentOffered: false,
        triageShowEnrichmentPrompt: false,
        triageLearnToast: null,
        relationshipsExpanded: false,
        relationshipSaving: false,
        splitUndoData: null,
        triageSplitMode: false,
        triageSplitRows: [],
      };
    },
    computed: {
      isMobile() { return screen.isMobile },
      isDesktop() { return screen.isDesktop },
      storeTransactions() {
        return store.state.transactions;
      },
      isOnboarded() {
        return !!store.state.user?.onboarded_at;
      },
      expenseTransactions() {
        const expenseNames = new Set(
          (store.state.categories || [])
            .filter(c => c.type === 'expense')
            .map(c => c.category)
        )
        const sel = this.selectedDate.actual
        return (this.transactions || []).filter(t => {
          if (!expenseNames.has(t.mappedCategory) || t.excludeFromTotal) return false
          const d = dayjs(t.effectiveDate || t.date)
          return d.year() === sel.year() && d.month() === sel.month()
        })
      },
      categoryTypeMap() {
        const map = {};
        for (const c of store.state.categories || []) map[c.category] = c.type;
        return map;
      },
      relationshipMap() {
        const relationships = detectRelationships(this.transactions);
        const map = {};
        for (const rel of relationships) {
          if (rel.type === 'split') {
            const purchase = rel.purchaseTxn;
            const p2p = rel.p2pTxn;
            map[purchase.transaction_id] = { type: 'split', confidence: rel.confidence, partner: p2p, role: 'purchase', rel };
            map[p2p.transaction_id] = { type: 'split', confidence: rel.confidence, partner: purchase, role: 'p2p', rel };
          } else if (rel.type === 'return') {
            const charge = rel.chargeTxn;
            const refund = rel.refundTxn;
            map[charge.transaction_id] = { type: 'return', confidence: rel.confidence, partner: refund, role: 'charge', rel };
            map[refund.transaction_id] = { type: 'return', confidence: rel.confidence, partner: charge, role: 'refund', rel };
          }
        }
        return map;
      },
      netPositive() {
        return (this.monthlyStats.netPosition || 0) >= 0;
      },
      hasVisibleCategories() {
        return Object.keys(this.groupedTransactions).some(cat => this.shouldShowCategory(cat));
      },
      visibleGroupedTransactions() {
        const result = {};
        for (const [category, group] of Object.entries(this.groupedTransactions)) {
          if (this.shouldShowCategory(category)) {
            result[category] = group;
          }
        }
        return result;
      },
      tableTransactions() {
        let rows = this.tableServerResults !== null
          ? this.tableServerResults
          : this.transactions;
        // Client-side search filter (replaces QTable's built-in :filter)
        if (this.tableServerResults === null && this.tableSearch && this.tableSearch.trim()) {
          const q = this.tableSearch.trim().toLowerCase();
          rows = rows.filter(t =>
            (t.name && t.name.toLowerCase().includes(q)) ||
            (t.merchant_name && t.merchant_name.toLowerCase().includes(q)) ||
            (t.mappedCategory && t.mappedCategory.toLowerCase().includes(q)) ||
            (t.venmo_counterparty && t.venmo_counterparty.toLowerCase().includes(q)) ||
            (t.venmo_note && t.venmo_note.toLowerCase().includes(q))
          );
        }
        if (this.tableMonth) {
          const m = dayjs(this.tableMonth, 'MMMM YYYY');
          rows = rows.filter(t =>
            dayjs(t.effectiveDate || t.date).year() === m.year() &&
            dayjs(t.effectiveDate || t.date).month() === m.month()
          );
        }
        if (this.amountMin !== null && this.amountMin !== '') {
          rows = rows.filter(t => Math.abs(t.amount) >= Number(this.amountMin));
        }
        if (this.amountMax !== null && this.amountMax !== '') {
          rows = rows.filter(t => Math.abs(t.amount) <= Number(this.amountMax));
        }
        if (this.tagFilter) {
          rows = rows.filter(t => t.tags?.some(tag => tag.id === this.tagFilter));
        }
        return rows;
      },
      sortedTableTransactions() {
        const rows = this.tableTransactions;
        if (!this.sortField) return rows;
        const field = this.sortField;
        const dir = this.sortDir === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
          let va, vb;
          if (field === 'name') {
            va = (a.merchant_name || a.name || '').toLowerCase();
            vb = (b.merchant_name || b.name || '').toLowerCase();
          } else if (field === 'amount') {
            va = a.amount;
            vb = b.amount;
          } else if (field === 'date') {
            va = a.date;
            vb = b.date;
          } else {
            va = (a[field] || '').toString().toLowerCase();
            vb = (b[field] || '').toString().toLowerCase();
          }
          if (va < vb) return -1 * dir;
          if (va > vb) return 1 * dir;
          return 0;
        });
      },
      filteredTransactions: function() {
        let selectedDate = this.selectedDate.actual;
        return function (groupedTransactions) {
          // console.log('this.selectedDate',selectedDate.year())
          const filtered = groupedTransactions.length === 0
            ? []
            : groupedTransactions.filter(
                (transaction) =>
                  dayjs(transaction.effectiveDate || transaction.date).year() === selectedDate.year() &&
                  dayjs(transaction.effectiveDate || transaction.date).month() === selectedDate.month()
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
          const m = dayjs(txn.effectiveDate || txn.date).format('YYYY-MM');
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
      historicalCategoryMap() {
        const byMerchant = {};
        const byMerchantBucket = {};
        const cutoff = dayjs().subtract(12, 'month');
        const resolveBest = (freqObj) => {
          let best = null, bestCount = 0;
          for (const [cat, count] of Object.entries(freqObj)) {
            if (count > bestCount) { best = cat; bestCount = count; }
          }
          return best ? { category: best, count: bestCount } : null;
        };
        for (const txn of store.state.transactions || []) {
          if (txn.pending || !txn.mappedCategory || txn.mappedCategory === 'To Sort') continue;
          if (dayjs(txn.date).isBefore(cutoff)) continue;
          const key = (txn.merchant_name || txn.name || '').toLowerCase().trim();
          if (!key) continue;
          const bucket = amountBucket(Math.abs(txn.amount));
          if (!byMerchant[key]) byMerchant[key] = {};
          byMerchant[key][txn.mappedCategory] = (byMerchant[key][txn.mappedCategory] || 0) + 1;
          const mbKey = `${key}::${bucket}`;
          if (!byMerchantBucket[mbKey]) byMerchantBucket[mbKey] = {};
          byMerchantBucket[mbKey][txn.mappedCategory] = (byMerchantBucket[mbKey][txn.mappedCategory] || 0) + 1;
        }
        const merchant = {};
        for (const [key, cats] of Object.entries(byMerchant)) {
          const r = resolveBest(cats);
          if (r) merchant[key] = r;
        }
        const merchantBucket = {};
        for (const [mbKey, cats] of Object.entries(byMerchantBucket)) {
          const r = resolveBest(cats);
          if (r) merchantBucket[mbKey] = r;
        }
        return { merchant, merchantBucket };
      },
      toSortTransactions() {
        const sel = this.selectedDate.actual;
        return (store.state.transactions || []).filter(txn =>
          !txn.pending && txn.mappedCategory === 'To Sort' &&
          dayjs(txn.effectiveDate || txn.date).year() === sel.year() &&
          dayjs(txn.effectiveDate || txn.date).month() === sel.month()
        );
      },
      toSortWithSuggestions() {
        const { merchant: merchantMap, merchantBucket: bucketMap } = this.historicalCategoryMap;
        const recurring = this.recurringMerchants;
        const sameDayMap = {};
        for (const txn of store.state.transactions || []) {
          if (txn.pending || !txn.mappedCategory || txn.mappedCategory === 'To Sort') continue;
          const d = txn.effectiveDate || txn.date;
          if (!sameDayMap[d]) sameDayMap[d] = new Set();
          sameDayMap[d].add(txn.mappedCategory);
        }
        return this.toSortTransactions.map(txn => {
          const key = (txn.merchant_name || txn.name || '').toLowerCase().trim();
          const bucket = amountBucket(Math.abs(txn.amount));
          const mbKey = `${key}::${bucket}`;
          let suggestion = null, confidence = null, reason = null;
          const bucketMatch = key ? bucketMap[mbKey] : null;
          const merchantMatch = key ? merchantMap[key] : null;
          if (bucketMatch && bucketMatch.count >= 2) {
            suggestion = bucketMatch.category;
            confidence = bucketMatch.count >= 3 ? 'high' : 'medium';
            reason = `Previously categorized (${bucketMatch.count}x, similar amount)`;
            if (recurring.has(txn.merchant_name || txn.name)) confidence = 'high';
          } else if (merchantMatch) {
            suggestion = merchantMatch.category;
            confidence = merchantMatch.count >= 3 ? 'medium' : 'low';
            reason = `Previously categorized (${merchantMatch.count}x)`;
            if (recurring.has(txn.merchant_name || txn.name)) confidence = 'medium';
          } else {
            const dayCats = sameDayMap[txn.effectiveDate || txn.date];
            if (dayCats && dayCats.size === 1) {
              suggestion = [...dayCats][0];
              confidence = 'low';
              reason = 'Same-day context';
            }
          }
          return { ...txn, suggestion, confidence, reason };
        });
      },
      toSortSuggestionStats() {
        const items = this.toSortWithSuggestions;
        return { total: items.length, withSuggestion: items.filter(t => t.suggestion).length };
      },
      triageItems() {
        return this.toSortWithSuggestions.filter(t => !this.triageSkipped.has(t.transaction_id));
      },
      triageUnenrichedP2PCount() {
        return this.toSortWithSuggestions.filter(t => this.isUnenrichedP2P(t)).length;
      },
      triageSimilar() {
        const first = this.triageItems[0];
        if (!first) return null;
        return findSimilarTransactions(first, store.state.transactions);
      },
      triageActionableCount() {
        if (!this.triageSimilar?.matches || !this.triageCategory) return 0;
        return this.triageSimilar.matches.filter(t =>
          t.mappedCategory !== this.triageCategory && !t.manually_set
        ).length;
      },
      triageCanSplit() {
        const txn = this.triageItems[0];
        if (!txn) return false;
        return !txn.pending && txn.amount >= 0 && !txn.parentTransactionId && !txn.isSplitParent;
      },
      triageSplitRemaining() {
        const txn = this.triageItems[0];
        const total = Number(txn?.amount || 0);
        const used = this.triageSplitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        return Math.round((total - used) * 100) / 100;
      },
      triageAttribution() {
        if (!this.triageItems?.length) return null;
        return this.getTransactionAttribution(this.triageItems[0]);
      },
      pendingRelationships() {
        const relationships = detectRelationships(this.transactions);
        return relationships.filter(rel => {
          const ids = rel.type === 'split'
            ? [rel.purchaseTxn.transaction_id, rel.p2pTxn.transaction_id]
            : [rel.chargeTxn.transaction_id, rel.refundTxn.transaction_id];
          return !ids.some(id => {
            const txn = this.transactions.find(t => t.transaction_id === id);
            return txn?.linkedTransaction || txn?.dismissedRelationship;
          });
        });
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
              .filter(t => (t.merchant_name || t.name) === key && dayjs(t.effectiveDate || t.date).format('YYYY-MM') === m)
              .reduce((s, t) => s + Math.abs(t.amount), 0);
            if (monthTotal > 0) { total += monthTotal; count++; }
          }
          merchantAvg[key] = count > 0 ? total / count : 0;
        }
        // Which recurring merchants have already appeared this month?
        const appearedThisMonth = new Set(
          allTxns
            .filter(t => dayjs(t.effectiveDate || t.date).format('YYYY-MM') === currentMonth && recurring.has(t.merchant_name || t.name))
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
      hasFixedCategories() {
        if (!this.groupedTransactions) return false;
        return Object.values(this.groupedTransactions).some(g => g.fixed && g.type === 'expense');
      },
      budgetSummary() {
        if (!this.monthlyStats || !this.groupedTransactions) return null;

        // Income: prefer budget limit, fall back to actual
        const incomeCategory = Object.values(this.groupedTransactions).find(g => g.type === 'income');
        const incomeBudget = Number(incomeCategory?.monthly_limit) || 0;
        const incomeActual = this.monthlyStats.incomeAmount || 0;
        const hasIncomeBudget = incomeBudget > 0;
        const income = hasIncomeBudget ? incomeBudget : incomeActual;

        // Total expense spending (needed for both modes)
        const spent = Object.entries(this.groupedTransactions).reduce((sum, [name, g]) => {
          if (g.type === 'expense') {
            const catSpend = this.categorySum(name);
            return sum + (isNaN(catSpend) ? 0 : Math.abs(catSpend));
          }
          return sum;
        }, 0);

        // Pace: compare spending rate to days elapsed in month (works without income)
        const sel = this.selectedDate.actual;
        const daysInMonth = sel.daysInMonth();
        const today = dayjs();
        const dayOfMonth = (sel.month() === today.month() && sel.year() === today.year())
          ? today.date() : daysInMonth;

        // No income at all — show "spent so far" mode
        if (income <= 0) {
          return {
            incomeState: 'none',
            spent: Math.round(spent),
            pace: null,
          };
        }

        // Has income transactions but no budget limit — show card but flag as estimated
        const incomeState = hasIncomeBudget ? 'set' : 'estimated';

        // Fixed costs (optional — only when user has flagged categories)
        let fixedCosts = 0;
        let fixedSpent = 0;
        for (const [name, g] of Object.entries(this.groupedTransactions)) {
          if (g.fixed && g.type === 'expense') {
            const limit = Number(g.monthly_limit) || 0;
            const actual = this.categorySum(name);
            const actualAbs = isNaN(actual) ? 0 : Math.abs(actual);
            fixedCosts += limit > 0 ? limit : actualAbs;
            fixedSpent += actualAbs;
          }
        }

        const savingsLimit = Object.values(this.groupedTransactions).reduce(
          (sum, g) => g.type === 'savings' ? sum + (Number(g.monthly_limit) || 0) : sum, 0
        );

        const pool = income - savingsLimit;
        if (pool <= 0) return {
          incomeState: 'none',
          spent: Math.round(spent),
          pace: null,
        };

        const remaining = income - savingsLimit - spent;

        const expectedSpendRate = dayOfMonth / daysInMonth;
        const actualSpendRate = pool > 0 ? spent / pool : 0;
        const pace = actualSpendRate <= expectedSpendRate + 0.15 ? 'on-track' : 'caution';

        return {
          incomeState,
          pool: Math.round(income - savingsLimit),
          spent: Math.round(spent),
          remaining: Math.round(remaining),
          ratio: pool > 0 ? spent / pool : 0,
          fixedSpent: Math.round(fixedSpent),
          fixedBudget: Math.round(fixedCosts),
          savingsAmount: Math.round(this.monthlyStats.savingsAmount || 0),
          savingsBudget: Math.round(savingsLimit),
          pace,
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
            if(groupedTransactions[category].type !== 'payment' ){
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
            if (this.isBudgetRemaining(category) == false && groupedTransactions[category].type !== 'payment'){
              projectedSum += this.categorySum(category)
            }
            if (this.categorySum(category) && this.shouldShowCategory(category)) {
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
      nudgeCard() {
        if (this.nudgeDismissedThisSession) return null;
        const user = this.$store.state.user;
        return evaluateNudge({
          isOnboarded: !!user?.onboarded_at,
          toSortCount: this.toSortSuggestionStats.total,
          pendingRelationshipCount: this.pendingRelationships?.length || 0,
          categories: this.$store.state.categories || [],
          preferences: user?.preferences || {},
          getCategorySpend: (name) => {
            if (!this.groupedTransactions?.[name]) return 0;
            return Math.abs(this.categorySum(name) || 0);
          },
        });
      },
    },
    watch: {
      venmoDialogOpen(val) {
        if (!val && this.venmoLaunchedFromTriage) {
          this.venmoLaunchedFromTriage = false;
          this.$nextTick(() => {
            this.triageOpen = true;
          });
        }
      },
      tableDialogOpen(val) {
        if (!val) {
          // Clear so DialogComponent unmounts and remounts fresh with new data
          this.tableDialogTransaction = null;
        }
      },
      showAll(val) {
        if (!val) {
          this.tableNoMoreMonths = false;
        }
      },
      tableSearch(val) {
        clearTimeout(this.tableSearchDebounce);
        if (!val || !val.trim()) {
          this.tableServerResults = null;
          return;
        }
        this.tableSearchDebounce = setTimeout(async () => {
          const result = await searchTransactions(val.trim());
          if (result) this.tableServerResults = result.transactions;
        }, 300);
      },
    },
    methods: {
      async dismissNudge() {
        const card = this.nudgeCard;
        if (!card) return;
        let prefs = {};
        if (card.type === 'budget') {
          prefs.dismissed_budget_nudge = true;
        } else if (card.type === 'category') {
          const existing = this.$store.state.user.preferences?.dismissed_category_nudges || [];
          prefs.dismissed_category_nudges = [...existing, card.category];
        } else if (card.type === 'trends') {
          prefs.dismissed_trends_nudge = true;
        }
        const result = await updatePreferences(prefs);
        if (result) this.$store.commit('updatePreferences', prefs);
        this.nudgeDismissedThisSession = true;
      },
      async handleNudgeCta() {
        const card = this.nudgeCard;
        if (!card) return;
        if (card.type === 'category') {
          await this.dismissNudge();
          this.$router.push('/plan');
        } else if (card.to) {
          await this.dismissNudge();
          this.$router.push(card.to);
        }
      },
      relationshipTooltip(txn) {
        const rel = this.relationshipMap[txn.transaction_id];
        if (!rel) return '';
        const partnerName = rel.partner.merchant_name || rel.partner.name;
        const partnerAmt = this.formatDollar(Math.abs(rel.partner.amount).toFixed(2));
        if (txn.linkedTransaction) {
          return rel.type === 'split'
            ? `Split with ${partnerName} (${partnerAmt}) · confirmed`
            : `Return from ${partnerName} (${partnerAmt}) · confirmed`;
        }
        return rel.type === 'split'
          ? `Possible split with ${partnerName} (${partnerAmt})`
          : `Possible return from ${partnerName} (${partnerAmt})`;
      },
      detailedPfcBreakdown(group) {
        const txns = this.filteredTransactions(group);
        const map = {};
        for (const txn of txns) {
          if (txn.excludeFromTotal) continue;
          const detailed = txn.plaidPfcDetail;
          const primary = txn.plaid_pfc?.[0] || null;
          const label = humanizeDetailedPfc(detailed, primary);
          if (!map[label]) map[label] = 0;
          map[label] += Math.abs(txn.amount);
        }
        return Object.entries(map)
          .map(([label, total]) => ({ label, total }))
          .sort((a, b) => b.total - a.total);
      },

      // Shared number animation helper — ease-out cubic over 600ms
      _animateFields(target, to, fields, frameKey) {
        if (!to) return;
        const startVals = {};
        for (const f of fields) startVals[f] = target[f] || 0;
        const endVals = {};
        for (const f of fields) endVals[f] = to[f] || 0;

        const duration = 600;
        const startTime = performance.now();

        if (this[frameKey]) {
          cancelAnimationFrame(this[frameKey]);
          this[frameKey] = null;
        }

        const tick = (now) => {
          const t = 1 - Math.pow(1 - Math.min((now - startTime) / duration, 1), 3);
          for (const f of fields) {
            target[f] = startVals[f] + (endVals[f] - startVals[f]) * t;
          }
          if (t < 1) {
            this[frameKey] = requestAnimationFrame(tick);
          } else {
            this[frameKey] = null;
          }
        };
        this[frameKey] = requestAnimationFrame(tick);
      },
      animateStats(from, to) {
        if (!to || !Object.keys(to).length) return;
        this._animateFields(this.displayedStats, to,
          ['expenseSpend', 'incomeAmount', 'savingsAmount', 'netPosition'], '_animFrame');
      },
      animateSummary(to) {
        this._animateFields(this.displayedSummary, to,
          ['pool', 'spent', 'remaining', 'ratio', 'fixedSpent', 'fixedBudget', 'savingsAmount', 'savingsBudget'], '_summaryAnimFrame');
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
      shouldShowCategory(category) {
        const group = this.groupedTransactions[category];
        if (!group) return false;
        const hasLimit = Number(group.monthly_limit) > 0;
        const hasActivity = this.categorySum(category) !== 0;
        const hasTransactions = this.filteredTransactions(group).length > 0;
        return hasLimit || hasActivity || hasTransactions;
      },
      // ---- Transaction expand/collapse animation (JS hooks) ----
      txnBeforeEnter(el) {
        el.style.overflow = 'hidden';
        el.style.height = '0';
      },
      txnEnter(el, done) {
        // Measure natural height, then animate from 0
        const height = el.scrollHeight;
        el.style.transition = 'height 400ms cubic-bezier(0.34, 1.4, 0.64, 1)';
        requestAnimationFrame(() => {
          el.style.height = height + 'px';
        });
        el.addEventListener('transitionend', done, { once: true });
      },
      txnAfterEnter(el) {
        el.style.height = '';
        el.style.overflow = '';
        el.style.transition = '';
      },
      txnLeave(el, done) {
        el.style.overflow = 'hidden';
        el.style.height = el.scrollHeight + 'px';
        // Force reflow so the browser registers the starting height
        el.offsetHeight; // eslint-disable-line no-unused-expressions
        el.style.transition = 'height 350ms cubic-bezier(0.5, 0, 0, 1)';
        requestAnimationFrame(() => {
          el.style.height = '0';
        });
        el.addEventListener('transitionend', done, { once: true });
      },
      txnAfterLeave(el) {
        el.style.height = '';
        el.style.overflow = '';
        el.style.transition = '';
        // Now remove expanded class (margin/shadow/border-radius collapse)
        if (this._pendingCollapse) {
          this.clickedCategories = this.clickedCategories.filter(c => c !== this._pendingCollapse);
          this._pendingCollapse = null;
        }
      },

      formatDollar(value, Prefix = null) {
        let prefix = Prefix == null ? '' : Prefix;
        if (value < 0) {
          prefix = ''; // change to `prefix = '-'` for negative income values
        }
        const num = Math.abs(Number(value));
        if (isNaN(num)) return prefix + '$0';
        // Preserve caller's decimal precision: if value was passed as "591.50" keep 2 decimals
        const str = String(value);
        const decimalPlaces = str.includes('.') ? str.split('.')[1].length : 0;
        const formatted = num.toFixed(decimalPlaces);
        return prefix + '$' + formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      },
      addCategoryDialog(){
        this.newCategory = !this.newCategory;
        return this.newCategory
      },
      openEditCategoryFromBreakdown(categoryName) {
        if (this.groupedTransactions[categoryName]) {
          this.buildEditCategoryDialog(categoryName)
        }
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
            fixed: this.dialogBody.fixed = this.groupedTransactions[category].fixed || false,
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
      getTransactionAttribution(txn) {
        return getAttribution(txn, store.state.categories, store.state.rules);
      },
      handleViewRule(attribution) {
        // Close whichever dialog is open
        Object.keys(this.transactionClickers).forEach(k => { this.transactionClickers[k] = false; });
        this.tableDialogOpen = false;
        // Navigate to RulesView, with ruleId for compound rules
        const query = attribution.ruleId ? { rule: attribution.ruleId } : {};
        this.$router.push({ path: '/rules', query });
      },
      buildEditTransactionDialog(e) {
          this.openTableDialog(null, e);
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
            console.error("error trying to buildDateList...", err)
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
          this.groupedTransactions[category.category].fixed = category.fixed || false
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
      async resetLastFetch (){
        const now = Date.now();
        store.commit("setLastPlaidFetch", now - this.fetchInterval)
      },
      async buildPage (mode){
        try {
          if(mode == 'sync'){
            // Trigger Plaid sync (updates DB + balances), then re-fetch current month from DB
            const syncResult = await triggerSync();
            if (syncResult) {
              store.commit('setLastSyncedAt', syncResult.syncedAt);
              if (syncResult.balances) store.commit('setAccountBalances', syncResult.balances);
              if (syncResult.balanceSnapshots) store.commit('setBalanceSnapshots', syncResult.balanceSnapshots);
              store.commit('setItemErrors', syncResult.itemErrors);
            }
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const result = await fetchTransactionsForMonth(currentMonth);
            if (result) store.commit('setMonthTransactions', { month: currentMonth, transactions: result.transactions });
          }
          // All modes read from the store
          this.transactions = store.state.transactions || [];
          this.categoryMonthlyLimits = [...(store.state.categories || [])];
        } catch (error) {
          console.error('error setting up transactions and categories:', error)
        }
        this.groupTransactions();
        this.months = this.buildDateList(this.transactions).reverse()
        this.monthlyStats = this.monthStats(this.groupedTransactions)
        this.isLoading = false
        // Flip barsReady after the next paint so bars transition from 0 → value
        this.$nextTick(() => setTimeout(() => { this.barsReady = true; }, 80));
      },
      onSubmit(e) { 
        let d = {}
        if (e.dialogType == 'transaction') {
          const sim = e.similarityData;
          const wantsRule = e.createRule && sim?.allCount > 0;
          d = {
            'updateType': e.dialogType,
            'mappedCategory': e.mappedCategory,
            'date': e.date,
            'note':e.note,
            'name': e.name,
            'merchantName': e.merchantName,
            'createRule': wantsRule && sim?.ruleType === 'merchant',
            'ruleMode': wantsRule ? sim?.ruleType : null,
            'transaction_id': e.transaction_id,
            'originalCategoryName': this.dialogBody.currentTransactionDetails.originalCategoryName ? this.dialogBody.currentTransactionDetails.originalCategoryName : '',
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
          'fixed': e.fixed || false,
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

        // Only show full-page skeleton for category add/edit (which rebuilds the page).
        // Transaction updates apply in-place without hiding the page.
        const needsFullReload = d.updateType !== 'transaction';
        if (needsFullReload) this.isLoading = true;
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
            const sim = e.similarityData;
            const wantsRule = e.createRule && sim?.allCount > 0;
            if (wantsRule && sim.ruleType === 'merchant') {
              sweepStore(store, sim.conditions, e.mappedCategory);
              applyMerchantRuleToStore(store, sim.ruleField, sim.ruleValue, e.mappedCategory);
            }
            if (wantsRule && sim.ruleType === 'compound') {
              const payload = {
                label: sim.label,
                conditions: sim.conditions,
                action: { type: 'categorize', categoryName: e.mappedCategory },
                createdFrom: 'dialog',
              };
              await applyCompoundRuleToStore(store, payload, e.mappedCategory, { saveCompoundRule, updateCompoundRule });
            }
            this.tableDialogOpen = false
          }
          if(d.updateType == 'addCategory'){
            this.newCategory = false
            this.addedCategory = {...data}
          }
        })
        .catch(error => {
          console.error('Error:', error)
        })
        .finally(() => {
          if (needsFullReload) this.isLoading = false;
        })
      }, 
      openTriageFlow() {
        this.triageSkipped = new Set();
        this.triageDone = false;
        this.triageCreateRule = false;
        this._triageToastShown = false;
        this.triageLearnToast = null;
        this.triageVenmoCount = 0;
        this.triageTotal = this.triageItems.length;
        const first = this.triageItems[0];
        this.triageCategory = first?.suggestion || null;
        this.triageShowEnrichmentPrompt = !this.enrichmentOffered && this.triageUnenrichedP2PCount > 0;
        this.triageOpen = true;
      },
      async triageAccept() {
        const txn = this.triageItems[0];
        if (!txn || !this.triageCategory) return;
        if (this.isUnenrichedP2P(txn)) this.triageVenmoCount++;
        this.triageSaving = true;
        const sim = this.triageSimilar;
        const wantsRule = this.triageCreateRule && sim?.allCount > 0;
        const d = {
          updateType: 'transaction',
          mappedCategory: this.triageCategory,
          date: txn.date,
          note: this.triageNote || txn.note || '',
          name: txn.name,
          merchantName: txn.merchant_name || '',
          createRule: wantsRule && sim.ruleType === 'merchant',
          ruleMode: wantsRule ? sim.ruleType : null,
          transaction_id: txn.transaction_id,
          originalCategoryName: txn.mappedCategory || '',
          excludeFromTotal: this.triageExclude,
        };
        try {
          const data = await handleDialogSubmit(JSON.stringify(d));
          this.updatedTransaction = { ...data };

          // Apply tags if any were selected
          if (this.triageTags.length > 0) {
            const tagIds = this.triageTags.map(t => t.id || t.value);
            await tagTransactionsApi([txn.transaction_id], tagIds);
            store.commit('setTransactionTags', {
              transactionIds: [txn.transaction_id],
              tags: this.triageTags.map(t => ({ id: t.id || t.value, name: t.label || t.name })),
            });
          }

          const targetCategory = this.triageCategory;

          if (wantsRule && sim.ruleType === 'merchant') {
            sweepStore(store, sim.conditions, targetCategory);
            applyMerchantRuleToStore(store, sim.ruleField, sim.ruleValue, targetCategory);
          }

          if (wantsRule && sim.ruleType === 'compound') {
            const payload = {
              label: sim.label,
              conditions: sim.conditions,
              action: { type: 'categorize', categoryName: targetCategory },
              createdFrom: 'triage',
            };
            await applyCompoundRuleToStore(store, payload, targetCategory, { saveCompoundRule, updateCompoundRule });
          }
          if (wantsRule && !this._triageToastShown) {
            const merchantName = txn?.merchant_name || txn?.name || 'similar';
            this.triageLearnToast = { merchant: merchantName, category: this.triageCategory };
            this._triageToastShown = true;
            setTimeout(() => { this.triageLearnToast = null; }, 4000);
          }
        } catch (e) {
          console.error('Triage save error:', e);
        } finally {
          this.triageSaving = false;
        }
        this.triageAdvance();
      },
      triageSkip() {
        const txn = this.triageItems[0];
        if (!txn) return;
        if (this.isUnenrichedP2P(txn)) this.triageVenmoCount++;
        const newSkipped = new Set(this.triageSkipped);
        newSkipped.add(txn.transaction_id);
        this.triageSkipped = newSkipped;
        this.triageAdvance();
      },
      triageAdvance() {
        this.triageSplitMode = false;
        this.triageSplitRows = [];
        this.triageNote = '';
        this.triageTags = [];
        this.triageExclude = false;
        this.$nextTick(() => {
          if (this.triageItems.length === 0) {
            this.triageDone = true;
          } else {
            const next = this.triageItems[0];
            this.triageCategory = next?.suggestion || null;
            this.triageCreateRule = false;
          }
        });
      },
      async handleSplit({ transaction_id, splits }) {
        const fromTriage = this.triageOpen && this.triageSplitMode;
        if (fromTriage) this.triageSaving = true;
        const result = await splitTransaction(transaction_id, splits);
        if (fromTriage) this.triageSaving = false;
        if (!result) return;
        this.$store.commit('splitTransaction', result);
        // Close dialogs (but not triage — it advances instead)
        this.clicker = false;
        this.tableDialogOpen = false;
        Object.keys(this.transactionClickers).forEach(k => { this.transactionClickers[k] = false; });
        // Rebuild page data
        this.groupTransactions();
        // If from triage, advance to next item instead of closing
        if (fromTriage) {
          this.triageAdvance();
        }
        // Undo toast
        this.splitUndoData = { transaction_id, result };
        toast.show({
          message: `Split into ${splits.length} categories`,
          timeout: 5000,
          actions: [{ label: 'Undo', handler: () => this.undoSplit() }],
        });
      },
      async handleUnsplit({ transaction_id }) {
        const result = await unsplitTransaction(transaction_id);
        if (!result) return;
        this.$store.commit('unsplitTransaction', result);
        // Close dialog
        this.clicker = false;
        this.tableDialogOpen = false;
        Object.keys(this.transactionClickers).forEach(k => { this.transactionClickers[k] = false; });
        // Rebuild page data
        this.groupTransactions();
        // Undo toast (re-split with previous data)
        const previousSplits = result.previousSplits;
        if (previousSplits?.length) {
          toast.show({
            message: 'Restored original transaction',
            timeout: 5000,
            actions: [{
              label: 'Undo',
              handler: async () => {
                const reSplit = await splitTransaction(
                  result.parent.transaction_id,
                  previousSplits.map(c => ({
                    amount: Number(c.amount),
                    categoryName: c.mappedCategory,
                    note: c.note,
                  }))
                );
                if (reSplit) {
                  this.$store.commit('splitTransaction', reSplit);
                  this.groupTransactions();
                }
              },
            }],
          });
        }
      },
      async undoSplit() {
        if (!this.splitUndoData) return;
        const { transaction_id } = this.splitUndoData;
        const result = await unsplitTransaction(transaction_id);
        if (result) {
          this.$store.commit('unsplitTransaction', result);
          this.groupTransactions();
        }
        this.splitUndoData = null;
      },
      triageEnterSplitMode() {
        this.triageSplitMode = true;
        this.triageSplitRows = [
          { amount: null, categoryName: '' },
          { amount: null, categoryName: '' },
        ];
      },
      triageUpdateSplitAmount(index, value) {
        const num = Number(value) || 0;
        const total = Number(this.triageItems[0].amount);
        const othersSum = this.triageSplitRows.reduce((sum, r, i) => i === index ? sum : sum + (Number(r.amount) || 0), 0);
        const max = Math.round((total - othersSum) * 100) / 100;
        this.triageSplitRows[index].amount = Math.min(Math.max(num, 0), max);
      },
      triageUpdateSplitCategory(index, value) {
        this.triageSplitRows[index].categoryName = value;
      },
      relKey(rel) {
        const ids = rel.type === 'split'
          ? [rel.purchaseTxn.transaction_id, rel.p2pTxn.transaction_id]
          : [rel.chargeTxn.transaction_id, rel.refundTxn.transaction_id];
        return ids.sort().join('::');
      },
      relPrimary(rel) {
        return rel.type === 'split' ? rel.purchaseTxn : rel.chargeTxn;
      },
      relSecondary(rel) {
        return rel.type === 'split' ? rel.p2pTxn : rel.refundTxn;
      },
      relationshipConfirm(rel) {
        const [txnA, txnB] = [this.relPrimary(rel), this.relSecondary(rel)];
        const signals = { confidence: rel.confidence, type: rel.type };
        if (rel.ratio) signals.ratio = rel.ratio;

        // If months differ, align the secondary transaction to the primary's month
        const primaryMonth = (txnA.effectiveDate || txnA.date)?.substring(0, 7);
        const secondaryMonth = (txnB.effectiveDate || txnB.date)?.substring(0, 7);
        const effectiveDate = (primaryMonth !== secondaryMonth) ? txnA.date : null;

        // Auto-recategorize secondary if it's unsorted
        const recategorize = (txnB.mappedCategory === 'To Sort') ? txnA.mappedCategory : null;

        // Optimistic update + immediate API call
        store.commit('linkTransaction', {
          transactionId: txnA.transaction_id,
          partnerId: txnB.transaction_id,
          type: rel.type,
          effectiveDate,
          recategorize,
        });
        // Re-sync local transactions from store and regroup
        this.transactions = store.state.transactions || [];
        this.groupTransactions();
        linkTransactions(txnA.transaction_id, txnB.transaction_id, rel.type, signals, effectiveDate, recategorize);

        const details = [];
        if (effectiveDate) details.push(`moved to ${dayjs(effectiveDate).format('MMM YYYY')}`);
        if (recategorize) details.push(`filed under ${recategorize}`);
        const suffix = details.length ? ` · ${details.join(' · ')}` : '';
        const label = (rel.type === 'split' ? 'Payback confirmed' : 'Return confirmed') + suffix;
        toast.show({
          message: label,
          timeout: 5000,
          actions: [{
            label: 'Undo',
            handler: () => {
              store.commit('unlinkTransaction', {
                transactionId: txnA.transaction_id,
                partnerId: txnB.transaction_id,
                revertCategory: recategorize ? 'To Sort' : null,
              });
              this.transactions = store.state.transactions || [];
              this.groupTransactions();
              unlinkTransactions(txnA.transaction_id, txnB.transaction_id, recategorize ? 'To Sort' : null);
            },
          }],
        });
      },
      relationshipDismiss(rel) {
        const txnA = this.relPrimary(rel);
        const txnB = this.relSecondary(rel);

        // Optimistic update + immediate API call — mark both transactions
        store.commit('dismissRelationship', { transactionId: txnA.transaction_id, partnerId: txnB.transaction_id });
        this.transactions = store.state.transactions || [];
        this.groupTransactions();
        dismissRelationship(txnA.transaction_id, txnB.transaction_id);

        toast.show({
          message: 'Relationship dismissed',
          timeout: 5000,
          actions: [{
            label: 'Undo',
            handler: () => {
              store.commit('undoDismissRelationship', { transactionId: txnA.transaction_id, partnerId: txnB.transaction_id });
              this.transactions = store.state.transactions || [];
              this.groupTransactions();
              undoDismissRelationship(txnA.transaction_id, txnB.transaction_id);
            },
          }],
        });
      },
      isUnenrichedP2P(txn) {
        return txn && isP2PTransaction(txn) && !txn.venmo_note;
      },
      openVenmoImport() {
        this.venmoDialogOpen = true;
      },
      formatDate(date) {
        return dayjs(date).format('MMM D, YYYY');
      },
      merchantInitials(row) {
        return _merchantInitials(row);
      },
      merchantColor(row) {
        return _merchantColor(row);
      },
      toggleSort(field) {
        if (this.sortField === field) {
          if (this.sortDir === 'asc') {
            this.sortDir = 'desc';
          } else {
            // Third click clears sort
            this.sortField = null;
            this.sortDir = 'asc';
          }
        } else {
          this.sortField = field;
          this.sortDir = 'asc';
        }
      },
      onVirtualScroll() {
        if (!this.virtualizer?.value) return;
        const items = this.virtualizer?.getVirtualItems() || [];
        if (items.length === 0) return;
        const to = items[items.length - 1].index;
        this.checkLoadMore(to);
      },
      async checkLoadMore(to) {
        // Only fetch more when viewing all transactions (not searching), not already loading,
        // and near the bottom of the list
        if (this.tableServerResults !== null) return;
        if (this.tableLoadingMore || this.tableNoMoreMonths) return;
        const total = this.sortedTableTransactions.length;
        if (total === 0 || to < total - 20) return;

        // Determine the oldest loaded month and fetch 3 months before it
        const loadedMonths = Object.keys(store.state.transactionsByMonth).sort();
        if (loadedMonths.length === 0) return;
        const oldestLoaded = loadedMonths[0]; // e.g. "2025-10"
        const [y, m] = oldestLoaded.split('-').map(Number);
        const endDate = new Date(y, m - 2, 1); // month before oldest (0-indexed)
        const startDate = new Date(y, m - 4, 1); // 3 months before oldest
        const endMonth = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
        const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

        this.tableLoadingMore = true;
        try {
          const beforeCount = Object.keys(store.state.transactionsByMonth).length;
          await fetchMonthRange(store, startMonth, endMonth);
          const afterCount = Object.keys(store.state.transactionsByMonth).length;

          // Re-sync local transactions array from store
          this.transactions = store.state.transactions || [];
          this.months = this.buildDateList(this.transactions).reverse();

          // If no new months were added, we've reached the end
          if (afterCount === beforeCount) {
            this.tableNoMoreMonths = true;
          }
        } catch (err) {
          console.error('Failed to load more transactions:', err);
        } finally {
          this.tableLoadingMore = false;
        }
      },
      isRowSelected(row) {
        return this.selectedRows.some(r => r.transaction_id === row.transaction_id);
      },
      toggleRowSelection(row) {
        const idx = this.selectedRows.findIndex(r => r.transaction_id === row.transaction_id);
        if (idx >= 0) {
          this.selectedRows.splice(idx, 1);
        } else {
          this.selectedRows.push(row);
        }
      },
      onRowClick(evt, row) {
        if (this.longPressTriggered) {
          this.longPressTriggered = false;
          return;
        }
        if (this.isMobile && this.selectedRows.length > 0) {
          this.toggleRowSelection(row);
          return;
        }
        this.openTableDialog(evt, row);
      },
      onRowTouchStart(evt, row) {
        this.longPressTriggered = false;
        this.longPressTimer = setTimeout(() => {
          this.longPressTimer = null;
          this.longPressTriggered = true;
          if (!this.isRowSelected(row)) {
            this.selectedRows.push(row);
          }
          if (navigator.vibrate) navigator.vibrate(30);
        }, 500);
      },
      onRowTouchEnd() {
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
      },
      onRowTouchCancel() {
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
      },
      openTableDialog(evt, row) {
        this.dialogBody.currentTransactionDetails = {
          originalCategoryName: row.mappedCategory || ''
        };
        this.tableDialogTransaction = row;
        this.tableDialogSimilarityData = findSimilarTransactions(row, store.state.transactions);
        this.tableDialogKey++;
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
            if (txn) {
              txn.mappedCategory = this.bulkCategory;
              txn.manually_set = true;
            }
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
      openBulkTag() {
        this.bulkTagSelection = [];
        this.bulkTagOpen = true;
      },
      async applyBulkTag() {
        if (!this.bulkTagSelection.length || !this.selectedRows.length) return;
        const txnIds = this.selectedRows.map(r => r.transaction_id);
        const tagIds = this.bulkTagSelection.map(t => t.id || t.value);
        const result = await tagTransactionsApi(txnIds, tagIds);
        if (result) {
          store.commit('addTransactionTags', { transactionIds: txnIds, tagIds });
          this.bulkTagOpen = false;
          this.bulkTagSelection = [];
          this.selectedRows = [];
        }
      },
      toggleCategory(category) {
        const isExpanded = this.clickedCategories.includes(category);
        this.groupedTransactionsVisible[category] = !isExpanded;
        if (isExpanded) {
          // Collapsing — delay removing expanded class until height transition finishes
          this._pendingCollapse = category;
        } else {
          this.clickedCategories.push(category);
        }
      },
    },
    watch: {
      sortedTableTransactions: {
        handler(newVal) {
          this.virtualItemCount = newVal.length;
        },
        immediate: true,
      },
      monthlyStats: {
        handler(newStats, oldStats) {
          this.animateStats(oldStats || {}, newStats || {});
        },
        immediate: true,
      },
      budgetSummary: {
        handler(newFlex) {
          if (!newFlex) return;
          this.animateSummary(newFlex);
        },
        immediate: true,
      },
      'selectedDate.display': function(newVal){//, oldVal) {
        this.selectedDate.actual = dayjs(newVal, "MMMM YYYY");
        this.monthlyStats = this.monthStats(this.groupedTransactions) // abstract to a method setMonthlyStats
      },
      // category watchers - updates the client with response data so you don't have to hit db again
      'updatedCategory': function(t) {
        this._internalMutation = true;
        store.commit("updateCategory", t)
        this.groupTransactions();
        this.monthlyStats = this.monthStats(this.groupedTransactions) // abstract to a method setMonthlyStats
        this.$nextTick(() => { this._internalMutation = false; });
      },
      'addedCategory': function(t) {
        this._internalMutation = true;
        store.commit('addCategory', t)
        this.categoryMonthlyLimits = [];
        this.categoryMonthlyLimits.push(...store.state.categories)
        this.groupTransactions();
        this.monthlyStats = this.monthStats(this.groupedTransactions);
        this.$nextTick(() => { this._internalMutation = false; });
      },
      'updatedTransaction' : function(t) { // updates go here if you want client to auto-update w.o refresh
        this._internalMutation = true;
        store.commit('updateTransaction', t)
        this.groupTransactions();
        this.monthlyStats = this.monthStats(this.groupedTransactions)
        this.$nextTick(() => { this._internalMutation = false; });
      },
      // Rebuild when store transactions change from external sources (sync button, pull-to-refresh).
      // Skip when triggered by internal mutations (updatedTransaction, etc.) to avoid double-regroup.
      storeTransactions(newTxns) {
        if (!newTxns || !this.isLoggedIn || this._internalMutation) return;
        this.transactions = newTxns;
        this.groupTransactions();
        this.monthlyStats = this.monthStats(this.groupedTransactions);
      },
    },
    async mounted() {
      this.isLoading = true;
      this.isLoggedIn = !!store.state.session?.isSessionActive;
      if (!this.isLoggedIn) { this.isLoading = false; return; }

      try {
        // Bootstrap: fetches categories, rules, and current + 3 prior months from DB (no Plaid call)
        await ensureAppData(store);
        // Render from cached DB data immediately
        await this.buildPage('refresh');

        // Auto-open triage if directed from onboarding (?triage=1)
        if (this.$route.query.triage) {
          this.$router.replace({ path: '/budget' }); // strip query param
          // Wait for DOM + data to settle, then open triage if items exist
          setTimeout(() => {
            if (this.triageItems.length > 0) this.openTriageFlow();
          }, 300);
        }

        // Background sync: if data is stale (>4 hours), sync with Plaid without blocking the UI
        const STALE_MS = 4 * 60 * 60 * 1000;
        const lastSync = store.state.lastSyncedAt ? new Date(store.state.lastSyncedAt).getTime() : 0;
        if (Date.now() - lastSync > STALE_MS && store.state.user?.accounts?.length > 0) {
          // Set immediately so rapid refreshes don't trigger duplicate syncs
          store.commit('setLastSyncedAt', new Date().toISOString());
          triggerSync().then(async (syncResult) => {
            if (!syncResult) return;
            store.commit('setLastSyncedAt', syncResult.syncedAt);
            if (syncResult.balances) store.commit('setAccountBalances', syncResult.balances);
            if (syncResult.balanceSnapshots) store.commit('setBalanceSnapshots', syncResult.balanceSnapshots);
            store.commit('setItemErrors', syncResult.itemErrors);
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const fresh = await fetchTransactionsForMonth(currentMonth);
            if (fresh) {
              store.commit('setMonthTransactions', { month: currentMonth, transactions: fresh.transactions });
              this.transactions = store.state.transactions || [];
              this.groupTransactions();
              this.monthlyStats = this.monthStats(this.groupedTransactions);
            }
          }).catch(err => console.error('Background sync failed:', err));
        }
      } catch (error) {
        console.error(error);
        this.isLoading = false;
      }
    },
  };
</script>