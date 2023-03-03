<template>
  <div>
    <!-- Button Container -->
    <div class="button-container">
      <button v-if="!showAll" @click="showAll = true">Show all transactions</button>
      <button v-if="showAll" @click="showAll = false">Show transactions by category</button>
      <select v-model="selectedDate" @change="setDate">
        <option v-for="month in months" :key="month" :value="month">{{ month }}</option>
      </select>
    </div>

    <!-- If show all is false -->
    <div v-if="!showAll" class="categories">
      <div v-for="(groupedTransactions, category) in groupedTransactions" :key="category">
        <div class="category-row" @click="toggleCategory(category)"> <!-- Build the clickable category summary row -->
          <span>{{ category }}</span>
          <span>{{ isNaN(categorySum(category)) ? "N/A" : "$" + categorySum(category).toFixed(2) }}</span>
        </div>
        <div v-if="groupedTransactionsVisible[category]" class="category-transactions">
          <Table :headerLabels="tableHeaders" :tableData="filteredTransactions(groupedTransactions)" />
        </div>
      </div>
    </div>

    <!-- If show all is true -->
    <div v-if="showAll" class="categories">
      <Table :headerLabels="tableHeaders" :tableData="transactions" />
    </div>
  </div>
</template>

<style>
  .categories {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    justify-content: space-between;
    max-width: 500px; /* set max width to limit the number of boxes */
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
    width: calc(30.33% - 20px);
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
  import Table from "../components/TableView.vue";

  export default {
    components: {
      Table,
    },
    data() {
      const currentDate = new Date();
      const selectedDate = `${currentDate.toLocaleString('default', { month: 'long' })} ${currentDate.getFullYear()}`;
      return {      
        tableHeaders: ["date", "name", "mappedCategory", "amount"],
        currentMonth: "",
        selectedDate, //: "February 2023", // How to make this default? do I need a date to display date converter?
        months: [], // array of month/year strings
        transactions: [],
        groupedTransactions: {},
        groupedTransactionsVisible: {},
        showAll: false,
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
      categorySum() {
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
    },
    created() {      
      this.currentMonth = Date.now()
      return this.currentMonth
    },
    methods: {
      setDate() {
        // this.selectedDate = date;
        // console.log('selected: ', this.selectedDate)
      },
      toggleCategory(category) {
        this.groupedTransactionsVisible[category] =
          !this.groupedTransactionsVisible[category] || false;
      },
    },
    // request json Transaction data from the server
    async mounted() {
      try {
        const response = await fetch("/api/find");
        const data = await response.json(); // extract JSON data from response
        this.transactions = data;

        this.transactions.forEach((transaction) => {
          const category = transaction.mappedCategory;
          if (!this.groupedTransactions[category]) {
            this.groupedTransactions[category] = [];
            this.groupedTransactionsVisible[category] = false;
          }
          this.groupedTransactions[category].push(transaction);
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
