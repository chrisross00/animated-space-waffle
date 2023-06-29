<style src="../styles/BudgetView.css"></style>

<template>
  <div class="table-wrapper">
    
  <div v-show="isLoggedIn">
    <SpinnerComponent :isLoading="isLoading" />
      <div class="q-pa-md-page-padder p-3">

        <q-card class="my-card">
          <q-card-section horizontal>
            <q-card-section class="q-pt-xs">
              <div class="text-overline">Actuals</div>
            <div class="text-h5 q-mt-sm q-mb-xs">
              {{ formatDollar(this.monthlyStats.absoluteSpend) + " spent (so far)."}}
            </div>
            <p>Your month to date total for all spending, across all categories.</p>
            </q-card-section>
          </q-card-section>

          <q-card-section horizontal>
            <q-card-section>
              <div class="text-h5 q-mt-sm q-mb-xs">
                {{ 
                  this.monthlyStats.monthlySum > 0
                  ? formatDollar(this.monthlyStats.monthlySum) + " over budget." 
                  : formatDollar(this.monthlyStats.monthlySum) + " left over."  
                }}
              </div>
              <p>Net Cash Flow (actual). This is your ending balance if this is the last day of the month.</p>
              
            </q-card-section>
          </q-card-section>

          <q-card-section horizontal v-if="this.monthlyStats.toSortSpending > 0">
            <q-card-section>
              <div class="text-h5 q-mt-sm q-mb-xs">
                {{ 
                  formatDollar(this.monthlyStats.toSortSpending) + " in unsorted transactions"
                }}
              </div>              
            </q-card-section>
          </q-card-section>
        </q-card>

        <q-card class="my-card">
          <q-card-section horizontal>
            <q-card-section class="q-pt-xs">
              <div class="text-overline">Projections</div>
              <div class="text-h5 q-mt-sm q-mb-xs">
                {{ 
                  this.monthlyStats.projectedSum > 0 
                  ? formatDollar(this.monthlyStats.projectedSum) + " over budget." 
                  : formatDollar((this.monthlyStats.projectedSum)) + " left over."  
                }}
                </div>
              <p>Net Cash Flow (projected). Your end of month balance after all expenses have been paid.</p>
            </q-card-section>
            </q-card-section>
            
          <q-card-section horizontal>
            <q-card-section>
              <div class="text-h5 q-mt-sm q-mb-xs">
                {{ formatDollar(this.monthlyStats.budgetRemaining) }} expenses remaining.
              </div>
              <p>The total of your expenses that haven't hit their monthly limits yet.</p>
            </q-card-section>
          </q-card-section>
        </q-card>
      </div>

      <!-- Button Container -->
      <div class="q-pa-md button-container">
        <q-toggle v-model="showAll" v-if="!showAll" @click="showAll = true" label="Show all transactions" />
        <q-toggle v-model="showAll" v-if="showAll" @click="showAll = false" label="Show all transactions"  />
        <q-select outlined v-model="selectedDate.display" :options="months" label="Budgets" @touchmove.stop.prevent />
      </div>

      <!-- If show all is false -->    
      <div class="q-pa-md" style="max-width: 900px">
        <q-list bordered>
          <div v-show="!showAll" class="categories">
            <div v-for="(groupedTransactions, category) in groupedTransactions" :key="category" class="budget-container">

              <!-- Make a category List Item -->
              <q-item v-show="this.groupedTransactions[category].showOnBudgetPage" clickable v-ripple @click="toggleCategory(category)" category="category" elevated :class="{ 'active': clickedCategories.includes(category)}">
                <q-item-section>

                  <div class="budget-container header">
                    <q-item-label>{{this.groupedTransactions[category].categoryName}}</q-item-label>
                    <q-item-label class="budget-container total">
                    {{ isNaN(budgetRemaining(category)) ? (isNaN(categorySum(category)) ? "N/A" : formatDollar(categorySum(category).toFixed(0)) + " spent") 
                                                        : (isBudgetRemaining(category) ? formatDollar(budgetRemaining(category).toFixed(0)) + " left" 
                                                                                          : formatDollar(Math.abs(budgetRemaining(category).toFixed(0))) + " over" ) 
                                                        }}
                                                        <!-- need to know if budgetRemaining(category) is > 0 to say "over or left" -->

                    </q-item-label>
                  </div>
                  <div v-show="this.groupedTransactions[category].monthly_limit" class="budget-container progress">
                    <q-linear-progress :value=getProgressRatio(category) class="q-mt-sm" :color="getCategoryProgressColor(category)" size="md"/> 
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
              <div v-show="groupedTransactionsVisible[category]" class="category-transactions">
                <!-- <Table :headerLabels="tableHeaders" :tableData="filteredTransactions(groupedTransactions)" /> -->
                <div v-for="(item, index) in filteredTransactions(groupedTransactions)" :key=index>

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
              </q-list>
            </div>
          </div>
        </q-list>
      </div>

      <!-- If show all is true -->
      <div v-show="showAll" class="q-pa-md all-transactions-table">
          <q-table
            title="All Transactions"
            :rows="transactions"
            :columns="columns"
            row-key="transaction_id"
            :pagination="pagination"
          />
      </div>
    </div>
    
    <div v-show="!isLoggedIn">
      <!-- link to /profile -->
      
      You need to login <a href="/profile">here</a>
    </div>

    <q-page-sticky class="floating-button" position="bottom-right" :offset="[25,25]">
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
</template>


<script>
  import {ref} from 'vue'
  import dayjs from 'dayjs'
  import minMax from 'dayjs/plugin/minMax';
  import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
  import customParseFormat from 'dayjs/plugin/customParseFormat'
  import DialogComponent from '../components/DialogComponent.vue'
  import SpinnerComponent from '../components/SpinnerComponent.vue'
  import store from '../store'
  import { fetchTransactions, handleDialogSubmit, fetchCategories } from '@/firebase';

// import e from 'express';

  dayjs().format()
  dayjs.extend(minMax);
  dayjs.extend(isSameOrBefore);
  dayjs.extend(customParseFormat);

  const columns = [
  {
    name: 'date',
    required: true,
    label: 'Date',
    align: 'left',
    field: row => row.date,
    format: val => `${val}`,
    sortable: true //"date", "name", "mappedCategory", "amount", "pending"
  },
  { name: 'amount', label: 'Amount', field: 'amount'  ,format: val => val < 0 ? `-$${Math.abs(val)}` : `$${val}`, sortable: true},
  { name: 'name', align: 'center', label: 'Name', field: 'name', sortable: true },
  { name: 'mappedCategory', label: 'Category', field: 'mappedCategory', sortable: true },
  { name: 'pending', label: 'Pending', field: 'pending' },
  ]
  export default {
    components: {
      DialogComponent,
      SpinnerComponent
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
        monthlyStats:{}
      };
    },
    computed: {
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
      monthStats() {
        return (groupedTransactions) => {
          let absoluteSpend = 0; // sum of everything except payment category
          let monthlySum = 0; // sum of all categories
          let toSortSpending = 0; // sum of expenses + to sort
          let projectedSum = 0; // sum of spending + 
          let budgetRemaining = 0;
          let totalExp = 0;
          for (const category in groupedTransactions) {
            if(category !== 'Payment' ){
              console.log('absolute spend: category = ', category);
              absoluteSpend += this.categorySum(category)
            }
            if(this.groupedTransactions[category].type == 'expense'){
              console.log('category.type', this.groupedTransactions[category].type)
              totalExp += this.categorySum(category)
            }
            if (this.isBudgetRemaining(category) == true) { // what to do with budget remaining when it's huge positive (lots of income) and when 
              projectedSum += (Number(this.groupedTransactions[category].monthly_limit))
              if (this.groupedTransactions[category].monthly_limit >= this.categorySum(category)){
                if (groupedTransactions[category].type == 'expense') budgetRemaining += this.budgetRemaining(category)
              }
              
            }
            if (this.isBudgetRemaining(category) == false && category !== 'Payment'){
              projectedSum += this.categorySum(category)
            }
            
            if (this.categorySum(category) && groupedTransactions[category].showOnBudgetPage == true) {
              // if (category == 'Income') {
              //   budgetRemaining += (this.budgetRemaining(category))
              // }
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
          let monthStats = {
            monthlySum,
            toSortSpending,
            projectedSum,
            budgetRemaining,
            totalExp,
            absoluteSpend
          }

          return monthStats
        }
      },
    },
    methods: {
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
          let isOriginalCategoryNameSet = false;
          this.dialogBody.currentCategoryDetails = {
            _id: this.dialogBody._id = this.groupedTransactions[category]._id,
            type: this.dialogBody.type = this.groupedTransactions[category].type,
            monthly_limit: this.dialogBody.monthly_limit = this.groupedTransactions[category].monthly_limit,
            categoryName: this.dialogBody.categoryName = this.groupedTransactions[category].categoryName,
            showOnBudgetPage: this.dialogBody.showOnBudgetPage = this.groupedTransactions[category].showOnBudgetPage,
            originalCategoryName: isOriginalCategoryNameSet ? this.dialogBody.currentCategoryDetails.originalCategoryName : this.groupedTransactions[category].originalName
          }
          isOriginalCategoryNameSet = true;
          if (!this.dialogBody.currentCategoryDetails.originalCategoryName){
            this.dialogBody.currentCategoryDetails.originalCategoryName = this.groupedTransactions[category].categoryName
          } 
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
          progressRatio = categorySpend / monthlyLimit
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

        handleDialogSubmit(JSON.stringify(d))
        .then(data => {
          if(d.updateType == 'editCategory'){
            this.updatedCategory = {...data} 
            this.categoryClickers[d.originalCategoryName] = !this.categoryClickers[d.originalCategoryName]
          }
          if(d.updateType == 'transaction'){
            this.updatedTransaction = {...data}
            this.transactionClickers[e.transaction_id] = !this.transactionClickers[e.transaction_id]
          }
          if(d.updateType == 'addCategory'){
            this.newCategory = false
            this.addedCategory = {...data} 
          }
        })
        .catch(error => {
          console.log('Error:', error)
        })
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
            const remainingTime = this.fetchInterval - (now - this.lastFetch);
            const minutesRemaining = Math.floor(remainingTime / 60000);
            const secondsRemaining = Math.floor((remainingTime % 60000) / 1000);
            // console.log(`last fetch was too recent, not fetching again. Time until next fetch: ${minutesRemaining} minutes ${secondsRemaining} seconds`);
            
            await this.buildPage('refresh')
          }
        } else if(!store.state.session?.isSessionActive){
            this.isLoggedIn = false;
        } 
      } catch (error) {
        console.error(error);
        this.resetLastFetch();
      }
      if(this.categoryMonthlyLimits?.length == 0 || this.transactions?.length == 0) {
        console.log('onMounted if')
          this.resetLastFetch();
        }
      console.log('this.categoryMonthlyLimits', this.categoryMonthlyLimits.length)
    },
  };
</script>