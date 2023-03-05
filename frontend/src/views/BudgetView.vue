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
          <div v-for="(groupedTransactions, category) in groupedTransactions" :key="category">
            <q-item clickable v-ripple @click="toggleCategory(category)" category="category" elevated :class="{ 'active': clickedCategories.includes(category)}">
              <q-item-section>
                <q-item-label>{{category}}</q-item-label>
                <q-item-label caption>
                  {{ isNaN(categorySum(category)) ? "N/A" : "$" + categorySum(category).toFixed(this.decimalPlaces) }} 
                  {{ isNaN(monthlyLimitVal(category)) ? "" : " out of $" + monthlyLimitVal(category).toFixed(this.decimalPlaces) }}
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                {{ isNaN(budgetRemaining(category)) ? (isNaN(categorySum(category)) ? "N/A" : "$" + categorySum(category).toFixed(0) + " spent") 
                                                    : (budgetRemaining(category) > 0 ? "$" + budgetRemaining(category).toFixed(0) + " left" 
                                                                                      : "$" + Math.abs(budgetRemaining(category).toFixed(0)) + " over" ) 
                                                    }}
                                                    <!-- need to know if budgetRemaining(category) is > 0 to say "over or left" -->
              </q-item-section>
              <q-item-section side>
                <q-icon 
                  style="font-size: 16px;"
                  name="edit"
                  class="icon-hover"
                  clickable
                  @click.stop="handleIconClick(category)"
                />
              </q-item-section>
            </q-item>
            
          <!-- When clicking the category row, show the nested rows grouped under each category -->
          <q-list>
            <div v-show="groupedTransactionsVisible[category]" class="category-transactions">
              <!-- <Table :headerLabels="tableHeaders" :tableData="filteredTransactions(groupedTransactions)" /> -->
              <div v-for="(item, index) in filteredTransactions(groupedTransactions)" :key=index>

                <q-item clickable v-ripple>
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
        decimalPlaces: 0,
        columns,
        model: ref(null),
        tableHeaders: ["date", "name", "mappedCategory", "amount", "pending"],
        currentMonth: "",
        selectedDate, //: "February 2023", // How to make this default? do I need a date to display date converter?
        months: [], // array of month/year strings
        transactions: [],
        groupedTransactions: {},
        groupedTransactionsVisible: {},
        showAll: false,
        clickedCategories: [], // stores the clicked categories
        categorymonthlyLimits: []
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
      monthlyLimitVal() { // gets the monthly limit for each category
        return (category) => { 
          const filtered = this.groupedTransactions[category];
          let monthly_limit = 0;
          filtered.filter(transaction => {
            if(!transaction.monthly_limit) {
              monthly_limit = NaN
            }
            if(transaction.monthly_limit && transaction.monthly_limit !== 0){
              monthly_limit = transaction.monthly_limit
            }
          })
          return Number.isNaN(monthly_limit) ? NaN : monthly_limit;
        };
      },
      budgetRemaining(){ // does math between monthlyLimit and Category sum to get budget
        return (category) =>{
          let diff = 0
          const monthlyLimit = this.monthlyLimitVal(category)
          const categorySpend = this.categorySum(category)
          diff = monthlyLimit - categorySpend
          if (category == "Income") diff = Math.abs(diff)
          return Number.isNaN(diff) ? NaN : diff
        }
      }
    },
    created() {      
      this.currentMonth = Date.now()
      return this.currentMonth
    },
    methods: {
      handleIconClick(category){
        console.log('Stubbed out: handleIconClick() handler code starts here. Receieved category from click as:', category)
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
        this.categorymonthlyLimits.push(...categoryData) // push the monthlyLimit data to the categorymonthlyLimits array

        // Get txn info
        const response = await fetch("/api/find");
        const data = await response.json(); // extract JSON data from response
        this.transactions = data;

        // Use the transaction.mappedCategory to push to the groupedTransactions array
        this.transactions.forEach((transaction) => {
          const category = transaction.mappedCategory;
          if (!this.groupedTransactions[category]) {
            this.groupedTransactions[category] = []; // category for this txn's array doesn't exist in grouped Transactions, so make one
            this.groupedTransactionsVisible[category] = false; // set visibility to false, since we know it's empty
          }
          this.groupedTransactions[category].push(transaction);
        });
        
        // Get the monthly_limits from each category and match to the groupedTransactions
        this.categorymonthlyLimits.forEach(category => {
          if(this.groupedTransactions[category.category]){
            this.groupedTransactions[category.category].push({"monthly_limit":category.monthly_limit})
          }
        });
        
        // console.log('done build this.categorymonthlyLimits', this.categorymonthlyLimits)
        // console.log('done build this.groupedTransactions', this.groupedTransactions)
        
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
