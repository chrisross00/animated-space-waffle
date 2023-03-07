<template>
  <div>
    <div class="page-padder p-3">
      <h2>
        Monthly Budgets
      </h2>
    </div>

    <!-- Button Container -->
    <div class="q-pa-md button-container">
      <q-btn v-if="!showAll" @click="showAll = true" label="Show all transactions" />
      <q-btn v-if="showAll" @click="showAll = false" label="Show transactions by category"  />
      <q-select outlined v-model="selectedDate" :options="months" label="Budgets" />
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
                  <q-item-label>{{category}}</q-item-label>
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
                  <q-dialog
                    class="dialog"
                    v-model="clicker"
                    :maximized="maximizedToggle"
                    transition-show="slide-up"
                    transition-hide="slide-down">

                      <!-- Dialog: Top Bar -->
                    <q-card class="bg-white">
                      <q-bar class="bg-primary titlebar">
                        <q-space />
                        <q-btn dense flat icon="minimize" @click="maximizedToggle = false" :disable="!maximizedToggle">
                          <q-tooltip v-if="maximizedToggle" class="bg-white text-primary">Minimize</q-tooltip>
                        </q-btn>
                        <q-btn dense flat icon="crop_square" @click="maximizedToggle = true" :disable="maximizedToggle">
                          <q-tooltip v-if="!maximizedToggle" class="bg-white text-primary">Maximize</q-tooltip>
                        </q-btn>
                        <q-btn dense flat icon="close" v-close-popup>
                          <q-tooltip class="bg-white text-primary">Close</q-tooltip>
                        </q-btn>
                      </q-bar>

                      <!-- Dialog: Body Form -->
                      <div class="dialog-body-form">
                        <q-card-section>
                          <div class="text-h2">{{this.dialogHeader}}</div>
                        </q-card-section>

                        <!-- Q-Form -->
                        <q-form
                          @submit="onSubmit"
                          @reset="onFormReset"
                          class="q-gutter-md"
                        >
                          <q-input
                            filled
                            v-model="this.dialogBody.categoryName"
                            label="Category Name"
                            hint="The display name for the category"
                            lazy-rules
                            :rules="[ val => val && val.length > 0 || 'Please type something']"
                          />

                          <q-input
                            filled
                            type="number"
                            v-model="this.dialogBody.monthly_limit"
                            label="Monthly Limit"
                            hint="Upper limit for the category"
                            lazy-rules
                            :rules="[
                              val => val !== null && val !== '' || 'Please enter a monthly limit',
                            ]"
                          />

                          <q-toggle color="primary" label="Show on View Budgets screen" v-model="this.dialogBody.showOnBudgetPage" />

                          <div class="button-container">
                            <div>
                              <q-btn label="Submit" type="submit" color="primary"/>
                              <q-btn label="Reset" type="reset" color="secondary" flat class="q-ml-sm" />
                            </div>
                            <div>
                              <q-btn label="Cancel" v-close-popup  color="accent"/>
                            </div>
                          </div>
                        </q-form>
                      </div>
                    </q-card>
                  </q-dialog>
                </q-icon>
              </q-item-section>
            </q-item>
            
          <!-- Make the nested rows grouped under each category List Item -->
          <q-list>
            <div v-show="groupedTransactionsVisible[category]" class="category-transactions">
              <!-- <Table :headerLabels="tableHeaders" :tableData="filteredTransactions(groupedTransactions)" /> -->
              <div v-for="(item, index) in filteredTransactions(groupedTransactions)" :key=index>

                <q-item clickable v-ripple :class="[item.pending ? 'pending' : 'posted']">
                  <q-item-section avatar>
                  </q-item-section>

                  <q-item-section>
                    <q-item-label lines="1">{{item.name}}</q-item-label>
                    <q-item-label caption lines="2">{{ item.date }}</q-item-label>
                  </q-item-section>

                  <q-item-section side top>
                    {{ isNaN(item.amount) ? "N/A" : "$" + item.amount.toFixed(2) }}                    
                  </q-item-section>

                  </q-item>
                </div>
              </div>
            </q-list>
          </div>
        </div>
      </q-list>
    </div>

    <!-- If show all is true -->
    <div v-show="showAll" class="q-pa-md">
        <q-table
          title="All Transactions"
          :rows="transactions"
          :columns="columns"
          row-key="transaction_id"
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

.dialog-body-form {
  margin: 16px;
}

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
</style>

<script>
import {ref} from 'vue'
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
  { name: 'name', align: 'center', label: 'Name', field: 'name', sortable: true },
  { name: 'mappedCategory', label: 'Category', field: 'mappedCategory', sortable: true },
  { name: 'amount', label: 'Amount', field: 'amount'  ,format: val => val < 0 ? `-$${Math.abs(val)}` : `$${val}`, sortable: true},
  { name: 'pending', label: 'Pending', field: 'pending' },
]
  export default {
    components: {
    },
    data() {
      const currentDate = new Date();
      const selectedDate = `${currentDate.toLocaleString('default', { month: 'long' })} ${currentDate.getFullYear()}`;
      return {   
        clicker: ref(false),
        maximizedToggle: ref(true),
        decimalPlaces: 0,
        columns,
        tableHeaders: ["date", "name", "mappedCategory", "amount", "pending"],
        currentMonth: "",
        selectedDate, 
        months: [], // array of month/year strings
        transactions: [],
        groupedTransactions: {},
        groupedTransactionsVisible: {},
        showAll: false,
        clickedCategories: [], // stores the clicked categories
        categoryMonthlyLimits: [],
        dialogHeader:'',
        dialogBody:{},
      };
    },
    computed: {
      filteredTransactions() {
        return (groupedTransactions) => {
          const selectedDate = new Date(this.selectedDate);
          const filtered = groupedTransactions.filter(
            (transaction) =>
              new Date(transaction.date).getFullYear() === selectedDate.getFullYear() &&
              new Date(transaction.date).getMonth() === selectedDate.getMonth()
          );
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
      buildEditCategoryDialog(category){
        let clickedCategory = category
        this.clicker = !this.clicker;

        this.categoryMonthlyLimits.filter(categoryProps => {
          if( categoryProps.category == clickedCategory) {
            this.dialogBody.categoryDetails = categoryProps 
            this.dialogBody.monthly_limit = categoryProps.monthly_limit
            this.dialogBody.categoryName = categoryProps.category
            this.dialogBody.showOnBudgetPage = categoryProps.showOnBudgetPage
          } // categoryProps is the full category body in categoryMonthlyLimits
        })

    // Important: whatever props you want to build the popup; example: `this.dialogBody.foobar = 'bootylicious' `
        this.dialogHeader = clickedCategory
        return this.clicker;
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
      onFormReset (){
        this.dialogBody.categoryName = this.dialogBody.categoryDetails.category
        this.dialogBody.monthly_limit = this.dialogBody.categoryDetails.monthly_limit
        this.dialogBody.showOnBudgetPage = this.dialogBody.categoryDetails.showOnBudgetPage
      },
      onSubmit() { // Stubbed out for now: how do we get the form data in here?
        console.log(this.dialogBody.categoryName)
        console.log(this.dialogBody.monthly_limit)
        console.log(this.dialogBody.showOnBudgetPage)

        let d = {
          'categoryName': this.dialogBody.categoryName,
          'monthly_limit': this.dialogBody.monthly_limit,
          'showOnBudgetPage': this.dialogBody.showOnBudgetPage,
        }

        fetch("/api/testCategoryUpdate", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(d)
        })
        .then(response => response.json())
        .then(data => {
          console.log(data)
        })
        .then(this.clicker = !this.clicker)
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
    // request json Transaction data from the server
    async mounted() {
      try {
        // Get category monthlyLimit info
        const categoryResponse = await fetch('/api/getcategories');
        const categoryData = await categoryResponse.json();
        this.categoryMonthlyLimits.push(...categoryData) //
        // console.log(JSON.stringify(this.categoryMonthlyLimits), '\n', 'monthly limits')
        // Get txn info
        const response = await fetch("/api/find");
        const data = await response.json(); // extract JSON data from response
        this.transactions = data;

        // Use the transaction.mappedCategory to push to the groupedTransactions array
        this.transactions.forEach((transaction) => {
          const category = transaction.mappedCategory;
          if (!this.groupedTransactions[category]) {
            this.groupedTransactions[category] = []; 
            this.groupedTransactionsVisible[category] = false; 
          }
          this.groupedTransactions[category].push(transaction);
        });
        
        // Get the monthly_limits from each category and match to the groupedTransactions
        // IMPORTANT!!! groupedTransactions has a few things added to it, which are usually accessed as this.groupedTransactions[category].parameterOfChoice
        this.categoryMonthlyLimits.forEach(category => {
          // console.log('category, ', category.monthly_limit)
          if(this.groupedTransactions[category.category]){

        // ADD PROPS TO groupedTransactions
        // This implementation allows you to set and get things like this.groupedTransactions[category].monthly_limit, rather than pushing props as arrays along with the txns (push({key:value}))
        // Let's you treat groupedTransactions object as a cross section of category and transaction data
            this.groupedTransactions[category.category].monthly_limit = category.monthly_limit 
            this.groupedTransactions[category.category].showOnBudgetPage = category.showOnBudgetPage 
          }
        });

        // Build a picker
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        const monthNames = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December"
        ];
        // Get the min/max date range from the transaction data
        const dateRange = this.transactions.reduce(
          (range, transaction) => {
            const date = new Date(transaction.date);
            if (!range.minDate || date < range.minDate) {
              range.minDate = date;
            }
            if (!range.maxDate || date > range.maxDate) {
              range.maxDate = date;
            }
            return range;
          },
          { minDate: null, maxDate: null }
        );

        const months = [];
        for (let year = dateRange.minDate.getFullYear(); year <= currentYear; year++) {
          const startMonth = year === dateRange.minDate.getFullYear() ? dateRange.minDate.getMonth() : 0;
          const endMonth = year === currentYear ? currentMonth : 11;
          for (let month = startMonth; month <= endMonth; month++) {
            const monthString = `${monthNames[month]} ${year}`;
            months.push(monthString);
          }
        }
        this.months = months.reverse();
        // end Build a picker (good lord get rid of this)

      } catch (error) {
        // console.log(error);
      }
    },
  };
</script>