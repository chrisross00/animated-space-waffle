<template>
  <div>
    <div class="page-padder p-3">
      <h3>
        Monthly Budgets
      </h3>
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
                  {{ isNaN(budgetRemaining(category)) ? (isNaN(categorySum(category)) ? "N/A" : "$" + categorySum(category).toFixed(0) + " spent") 
                                                      : (budgetRemaining(category) > 0 ? "$" + budgetRemaining(category).toFixed(0) + " left" 
                                                                                        : "$" + Math.abs(budgetRemaining(category).toFixed(0)) + " over" ) 
                                                      }}
                                                      <!-- need to know if budgetRemaining(category) is > 0 to say "over or left" -->

                  </q-item-label>
                </div>
                <div v-show="this.groupedTransactions[category].monthly_limit" class="budget-container progress">
                  <q-linear-progress :value=getProgressRatio(category) class="q-mt-sm" :color="getProgressColor(category)" size="md"/> 
                </div>

                <q-item-label caption class="budget-container" v-show="this.groupedTransactions[category].monthly_limit">
                  {{ isNaN(categorySum(category)) ? "N/A" : "$" + categorySum(category).toFixed(this.decimalPlaces) }} 
                  {{ isNaN(this.groupedTransactions[category].monthly_limit) || 
                      this.groupedTransactions[category].monthly_limit == 0 ? "" : " out of $" + this.groupedTransactions[category].monthly_limit }}
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
                    <DialogComponent :dialogType="'category'" :item="this.dialogBody.currentCategoryDetails" @update-category="onSubmit"/>
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
                    <q-item-section avatar>
                    </q-item-section>
                    <q-item-section>
                      <q-item-label lines="1">{{item.name}}</q-item-label>
                      <q-item-label caption lines="2">{{ item.date }}</q-item-label>
                    </q-item-section>
                    <q-item-section side top>
                      {{ isNaN(item.amount) ? "N/A" : "$" + item.amount.toFixed(2) }}                    
                    </q-item-section>
                    <q-dialog v-model="transactionClickers[item.transaction_id]" class="dialog" :maximized="maximizedToggle" transition-show="slide-up" transition-hide="slide-down">
                      <DialogComponent :dialogType="'transaction'" :item="item" @update-transaction="onSubmit"/>
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
</template>

<style>
.budget-container .pending {
  font-style: italic;
  color: rgba(0, 0, 0, 0.54);
  
}
.budget-container .progress .q-mt-sm {
    margin-top: 0.3rem;
    margin-bottom: 0.23rem;
}

.budget-container .header {
  display: flex;
  justify-content: space-between;
}

.budget-container .total {
  font-size: 14px;
  margin-top: 0px !important;
  color: rgba(0, 0, 0, 0.54);
}

.budget-container .dialog {
  color: red;
}

.all-transactions-table {
  min-width: 350px;
  max-width: 600px;
}

.dialog-body-form {
  margin: 16px;
  text-align: center;
}

/* .q-dialog__backdrop {
  background: none;
} */

.q-dialog__content {
  background-color: #f1f1f1 !important; /* replace with your desired color */
}

.dialog .titlebar {
  box-shadow: 0 1px 5px rgb(0 0 0 / 20%), 0 2px 2px rgb(0 0 0 / 14%), 0 3px 1px -2px rgb(0 0 0 / 12%);
}

.dialog .button-container {
  display:flex;
  justify-content: space-between;
}

.icon-hover:hover {
  color: #424242;
  font-size: 20px;
}


  .active {
    background-color: #f0f0f0;
  }
  .categories {
    /* display: flex; */
    flex-direction: column;
    flex-wrap: wrap;
    justify-content: space-between;
    max-width: 900px; /* set max width to limit the number of boxes */
    margin: 0 auto; /* center the boxes horizontally */
    border-radius: 10px; /* round the corners of the container */
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); /* add a subtle drop shadow */
  }

  .category {
    max-height: 200px;
    overflow: hidden;
    border: 1px solid black;
    border-radius: 10px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    padding: 20px;
    width: calc(66.33% - 20px);
    margin-bottom: 20px;
    background-color: #fff;
  }

  .category table tbody {
    overflow-y: auto;
  }
  .category-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    padding: 12px;
    background-color: #f5f5f5;
    border-bottom: 1px solid #ddd;
    transition: background-color 0.2s ease-in-out;
  }

  .category-row:hover {
    background-color: #e0e0e0;
  }


  .category-transactions {
    padding-top: 8px;
  }

  .category-transactions table {
    width: 100%;
    border-collapse: collapse;
  }

  .transaction-table {
    position: sticky;
    top: 0;
    overflow-y: auto;
    max-height: calc(100% - 40px);
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  th,
  td {
    padding: 10px;
    text-align: left;
    border-bottom: 1px solid #ddd;
  }

  th {
    background-color: #f2f2f2;
    position: sticky;
    top: 0;
  }
  .text-p{
    padding-top: 0px;
  }
</style>

<script>
  import {ref} from 'vue'
  import dayjs from 'dayjs'
  import minMax from 'dayjs/plugin/minMax';
  import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
  import customParseFormat from 'dayjs/plugin/customParseFormat'
  import DialogComponent from '../components/DialogComponent.vue'

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
      DialogComponent
    },
    data() {
      const currentDate = dayjs();
      const selectedDate = {
        display: dayjs(currentDate).format('MMMM YYYY'),
        actual: dayjs(currentDate)
      }
      return {   
        selectedDate, 
        currentDate,
        clicker: ref(false),
        clicker2: ref(false),
        transactionClickers: {},
        categoryClickers: {},
        maximizedToggle: ref(true),
        transactionDetails: {},
        decimalPlaces: 0,
        columns,
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
        updatedCategoryName:'',
        updatedCategoryLimit:0,
        updatedShowOnBudgetPage: ref(true),
        updatedCategory:{},
        updatedTransaction:{},
        pagination: {
          rowsPerPage: 30 // current rows per page being displayed
        },
      };
    },
    computed: {
      filteredTransactions: function() {
        let selectedDate = this.selectedDate.actual;
        return function (groupedTransactions) {
          // console.log('this.selectedDate',selectedDate.year())
          const filtered = groupedTransactions.filter(
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
            sum += parseFloat(transaction.amount);
          }
          return Number.isNaN(sum) ? NaN : sum;
        };
      },
    },
    methods: {
      saveTransactionChanges() { // think the .then() method in OnSubmit handles this now ... consider deleting
        // this.transactionClickers[e.transaction_id] = !this.transactionClickers[e.transaction_id] // Clsoe the window by passing the txn_id back to transactionClickers 

        //   // after the API call is done... this code should go after the update transaction response comes back
        //   console.log('category', e)
        //   if(!this.transactionClickers[e.transaction_id]){
        //     this.transactionClickers[e.transaction_id] = true
        //   } else{
        //     this.transactionClickers[e.transaction_id] = !this.transactionClickers[e.transaction_id]
        //   }
        //   this.transactionDetails = e
        //   return this.transactionClickers[e.transaction_id];
      },

      buildEditCategoryDialog(category){ // Should this code live on DialogComponent
          console.log('buildEditCategoryDialog', category)
        this.clicker = !this.clicker;

        if(!this.categoryClickers[category]){
            this.categoryClickers[category] = true
          } else{
            this.categoryClickers[category] = !this.categoryClickers[category]
          }
          // this.transactionDetails = e
          
          this.dialogBody.monthly_limit = this.groupedTransactions[category].monthly_limit
          this.dialogBody.categoryName = this.groupedTransactions[category].categoryName
          this.dialogBody.showOnBudgetPage = this.groupedTransactions[category].showOnBudgetPage
          
          // // Set up the client-side tracking for what to display at the category level
          let isOriginalCategoryNameSet = false;
          this.dialogBody.currentCategoryDetails = {
            monthly_limit: this.dialogBody.monthly_limit,
            categoryName: this.dialogBody.categoryName,
            showOnBudgetPage: this.dialogBody.showOnBudgetPage,
            originalCategoryName: isOriginalCategoryNameSet ? this.dialogBody.currentCategoryDetails.originalCategoryName : this.groupedTransactions[category].originalName
          }
          isOriginalCategoryNameSet = true;
          if (!this.dialogBody.currentCategoryDetails.originalCategoryName){
            console.log('if statement')
            this.dialogBody.currentCategoryDetails.originalCategoryName = this.groupedTransactions[category].categoryName
          } 
          // console.log('this.dialogBody.currentCategoryDetails.originalCategoryName', this.dialogBody.currentCategoryDetails.originalCategoryName)
          
          // Important: whatever props you want to build the popup; example: `this.dialogBody.foobar = 'bootylicious' `
          console.log('buildEditCategoryDialog', this.categoryClickers[category])
          return this.categoryClickers[category.categoryName];
        // return this.clicker;
      },
      buildEditTransactionDialog(e){ // Should this live on DialogComponent?
          console.log('buildEditTransactionDialog', e)
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
          console.log('buildDateList starting')
          const dates = transactions.map(transaction => dayjs(transaction.date));
          const minDate = dayjs.min(dates).$d
          const maxDate = dayjs.max(dates).$d
          const dateList = [];
          let currentDate = dayjs(minDate).startOf('month');
          
          while (currentDate.isSameOrBefore(maxDate)) {
            dateList.push(currentDate.format('MMMM YYYY'));
            currentDate = currentDate.add(1, 'month').startOf('month');
            // console.log('currentDate =', currentDate)
          }
          // console.log('dateList=', dateList)
          return dateList;
        } catch (err) {
            console.log("error trying to buildDateList...", err)
        }
      },
      budgetRemaining(category){ // does math between monthlyLimit and Category sum to get budget
        // console.log('budget Remaining running...')
        let diff = 0
        const monthlyLimit = this.groupedTransactions[category].monthly_limit
        const categorySpend = this.categorySum(category).valueOf()
        diff = monthlyLimit - categorySpend

        // set up income for UI (negative)
        if (category == "Income") diff = Math.abs(diff)
        if (monthlyLimit == 0) diff = NaN//if the monthly_limit was already zero, then just mark it NaN so it gets labeled 'spent' in UI
        this.groupedTransactions[category].budgetRemaining = diff
        return Number.isNaN(diff) ? NaN : diff
      },
      getProgressColor(category) {
        let budgetRemaining = this.groupedTransactions[category].budgetRemaining
        let progressRatio = this.groupedTransactions[category].progressRatio
        
        return budgetRemaining >= 0 
                ? (progressRatio >= 1 
                    ? "positive" 
                    : (progressRatio < 1 && progressRatio > 0.9 
                        ? "warning" 
                        : "secondary"))
                : "negative"
      },
      getProgressRatio (category) {
        // console.log('getprogressRatio running')
        let progressRatio;
        const monthlyLimit = this.groupedTransactions[category].monthly_limit
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
        console.log('this.groupTransactions.length!: ', this.groupedTransactions)
        // this.groupedTransactions = {}
        // Use the transaction.mappedCategory to push to the groupedTransactions array
        this.transactions.forEach((transaction) => {
          console.log('starting foreach...') 
          const category = transaction.mappedCategory;
          if (!this.groupedTransactions[category]) {
            this.groupedTransactions[category] = []; 
            this.groupedTransactionsVisible[category] = false; 
          }
          // need logic here to check to see if a transaction already exists 
          // const transaction_exists = transactions.some(transaction => transaction.transaction_id === transaction_id_to_check);

          this.groupedTransactions[category].push(transaction);
        });
      },
      onFormReset (){
        this.dialogBody.categoryName = this.dialogBody.currentCategoryDetails.categoryName
        this.dialogBody.monthly_limit = this.dialogBody.currentCategoryDetails.monthly_limit
        this.dialogBody.showOnBudgetPage = this.dialogBody.currentCategoryDetails.showOnBudgetPage
      },
      onSubmit(e) { 
        // can we merge saveTransactionChanges into this? 
        // if e.dialogType == 'category' 
        // if e.dialogType == 'transaction'
        let d = {}

        if (e.dialogType == 'transaction') {
          console.log('e.dialogtype == ', e)
          d = {
            'updateType': e.dialogType,
            'mappedCategory': e.mappedCategory,
            'date': e.date,
            'transaction_id': e.transaction_id,
            'originalCategoryName': this.dialogBody.currentTransactionDetails.originalCategoryName ? this.dialogBody.currentTransactionDetails.originalCategoryName : '',//e.originalCategoryName,
          }
        }
        
        if (e.dialogType == 'category'){
          d = {
          'updateType': e.dialogType,
          'categoryName': e.categoryName,
          'monthly_limit': e.monthly_limit,
          'showOnBudgetPage': e.showOnBudgetPage,
          'originalCategoryName': this.dialogBody.currentCategoryDetails.originalCategoryName ? this.dialogBody.currentCategoryDetails.originalCategoryName : '',
          }
        }
        console.log('onsubmit hit! ', d)
        // TODO: Need to add logic to check the difference from original values before sending post request

        fetch("/api/testCategoryUpdate", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(d)
        })
        .then(response => response.json())
        .then(data => {
          // TODO: Need to add logic to check the response - should only update client props if success
          // for now, they'll revert when you refresh

          d.updateType == 'category' ? this.updatedCategory = {...data} : this.updatedTransaction = {...data}
        })
        .then(
          e.dialogType == 'category' ? this.categoryClickers[e.categoryName] = !this.categoryClickers[e.categoryName] : this.transactionClickers[e.transaction_id] = !this.transactionClickers[e.transaction_id] // Clsoe the window by passing the txn_id back to transactionClickers 
          )
        .catch(error => {
          console.log('Error:', error)
        })
      }, 
      toggleCategory(category) {
        this.groupedTransactionsVisible[category] =
          !this.groupedTransactionsVisible[category] || false;

        if (this.clickedCategories.includes(category)) {
          // remove category from clickedCategories if it's already clicked
          this.clickedCategories = this.clickedCategories.filter((c) => c !== category);
        } else {
          // add category to clickedCategories if it's not already clicked
          this.clickedCategories.push(category) 
        }
      },
    },
    watch: {
      'selectedDate.display': function(newVal){//, oldVal) {
        this.selectedDate.actual = dayjs(newVal, "MMMM YYYY");
      },
      
      // category watchers
      // What if all of this is in one object
      'updatedCategory': function(t) {
        console.log('updatedCategory, this.groupedTransactions[Slush]', this.groupedTransactions['Slush'])
        this.groupedTransactions[t.originalCategoryName].categoryName = t.categoryNameBEResponse
        this.groupedTransactions[t.originalCategoryName].monthly_limit = t.monthlyLimitBEResponse
        this.groupedTransactions[t.originalCategoryName].showOnBudgetPage = t.showOnBudgetPageBEResponse
      },
      'updatedTransaction' : function(t) {
        console.log('updatedTransaction watcher: trying to find transaction first ...', t)
        this.groupedTransactions[t.originalCategoryName].filter(transaction => {
          if (transaction.transaction_id == t.transaction_id) {
            console.log('transaction match!', transaction.transaction_id, 'vs.', t.transaction_id)
            transaction.mappedCategory = t.mappedCategory
            const index = this.groupedTransactions[t.originalCategoryName].indexOf(transaction)
            if (index !== -1) {

            // 3/13: Currently working... leaving off, need to make sure to see if can insert with respect to date, because txns end up on bottom from the push method
              // Remove transaction from its current category
              this.groupedTransactions[t.originalCategoryName].splice(index, 1)
              // Add transaction to the new category
              this.groupedTransactions[transaction.mappedCategory].push(transaction)
              console.log('index is !== -1!')
            }
          }
        })
      }
      // don't want to do this for now... because then how do you show it again, blah blah blah
      // 'updatedShowOnBudgetPage': function(t) {
      //   console.log('updatedShowOnBudgetPage watcher', t)
      //   // this.groupedTransactions[t].showOnBudgetPage = t
      // },
    },
    // request json Transaction data from the server
    async mounted() {
      try {
        // Get category monthlyLimit info
        const categoryResponse = await fetch('/api/getcategories');
        const categoryData = await categoryResponse.json();
        this.categoryMonthlyLimits.push(...categoryData) //
        
        // Get txn info
        const response = await fetch("/api/find");
        const data = await response.json(); // extract JSON data from response
        this.transactions = data;
        console.log("Haven't called groupTransactions yet, this.groupedTransactions = ", this.groupedTransactions)
        this.groupTransactions();
        
        // Get the monthly_limits from each category and match to the groupedTransactions
        // IMPORTANT!!! groupedTransactions has a few things added to it, which are usually accessed as this.groupedTransactions[category].parameterOfChoice
        this.categoryMonthlyLimits.forEach(category => {
        // console.log('category, ', category.monthly_limit)
          if(this.groupedTransactions[category.category]){

        // ADD PROPS TO groupedTransactions
        // This implementation allows you to set and get things like this.groupedTransactions[category].monthly_limit, rather than pushing props as arrays along with the txns (push({key:value}))
        // Let's you treat groupedTransactions object as a cross section of category and transaction data
            this.groupedTransactions[category.category].categoryName = category.category 
            this.groupedTransactions[category.category].monthly_limit = category.monthly_limit 
            this.groupedTransactions[category.category].showOnBudgetPage = category.showOnBudgetPage 
            this.groupedTransactions[category.category].originalName = category.category 
          }
        });
        this.months = this.buildDateList(this.transactions).reverse()
        
      } catch (error) {
        console.error(error);
      }
    },
  };
</script>