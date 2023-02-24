<template>
  <div>
    <button v-if="!showAll" @click="showAll = true">Show all transactions</button>
    <button v-if="showAll" @click="showAll = false">Show transactions by category</button>
    <!-- If show all is false -->
    <div v-if="!showAll" class="categories">
      <div v-for="(groupedTransactions, category) in groupedTransactions" :key="category">
        <div class="category-row" @click="toggleCategory(category)">
          <span>{{ category }}</span>
          <span>{{ groupedTransactions.length }}</span>
        </div>
        <div v-if="groupedTransactionsVisible[category]" class="category-transactions">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant Name</th>
                <th>Category</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="transaction in groupedTransactions" :key="transaction._id">
                <td>{{ transaction.Date }}</td>
                <td>{{ transaction["Merchant Name"] }}</td>
                <td>{{ transaction.Category }}</td>
                <td>${{ transaction.Amount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  <!-- If show all is true -->
    <div v-if="showAll" class="categories">
      <table v-if="showAll">
        <thead>
          <tr>
            <th>Date</th>
            <th>Merchant Name</th>
            <th>Category</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="transaction in transactions" :key="transaction._id">
            <td>{{ transaction.Date }}</td>
            <td>{{ transaction["Merchant Name"] }}</td>
            <td>{{ transaction.Category }}</td>
            <td>${{ transaction.Amount }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style>
  .categories {
    display: flex;
    flex-direction: column;
  }

  .category-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .category-transactions {
    margin-left: 16px;
  }

  .categories {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    max-width: 960px; /* set max width to limit the number of boxes */
    margin: 0 auto; /* center the boxes horizontally */
  }

  .category {
    max-height: 200px; /* set max height */
    overflow: hidden;
    border: 1px solid black; /* add a black border */
    border-radius: 10px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    padding: 20px;
    width: calc(30.33% - 20px); /* set width to 33.33% minus 20px margin */
    margin-bottom: 20px;
    background-color: #fff;
  }
  .category table tbody {
    overflow-y: auto; /* enable vertical scrolling only for the tbody element */
  }

  .category-row {
    display: flex;
    justify-content: space-between;
    cursor: pointer;
    padding: 8px;
    background-color: #eee;
  }

  .category-transactions {
    padding: 8px;
  }

  .category-transactions table {
    width: 100%;
    border-collapse: collapse;
  }

  .transaction-table {
    position: sticky;
    top: 0;
    overflow-y: auto; /* make the table scrollable */
    max-height: calc(100% - 40px); /* subtract the padding from max-height */
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

  button {
    background-color: #41b883;
    border: none;
    color: white;
    padding: 10px 20px;
    text-align: center;
    text-decoration: none;
    display: inline-block;
    font-size: 16px;
    margin: 4px 2px;
    cursor: pointer;
    border-radius: 5px;
  }
</style>

<script>
  export default {
    data() {
      return {
        transactions: [],
        groupedTransactions: {},
        groupedTransactionsVisible: {},
        showAll: false
      }
    },
    methods: {
      toggleCategory(category) {
        this.groupedTransactionsVisible[category] =
          !this.groupedTransactionsVisible[category] || false;
      },
    },
    // request json data from the server
    async mounted() {
      try {
        const response = await fetch('/api/find');
        const data = await response.json(); // extract JSON data from response
        this.transactions = data; // set transactions data

        // Group transactions by category
        this.transactions.forEach((transaction) => {
          const category = transaction.Category;
          if (!this.groupedTransactions[category]) {
            this.groupedTransactions[category] = [];
            this.groupedTransactionsVisible[category] = false;
          }
          this.groupedTransactions[category].push(transaction);
        });
      } catch (error) {
        console.log(error);
      }
    }
  }
</script>

<!-- Original template -->
<!-- 


<style>
  .categories {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    max-width: 960px; /* set max width to limit the number of boxes */
    margin: 0 auto; /* center the boxes horizontally */
  }

  .category {
    max-height: 200px; /* set max height */
    overflow: hidden;
    border: 1px solid black; /* add a black border */
    border-radius: 10px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    padding: 20px;
    width: calc(30.33% - 20px); /* set width to 33.33% minus 20px margin */
    margin-bottom: 20px;
    background-color: #fff;
  }
  .category table tbody {
    overflow-y: auto; /* enable vertical scrolling only for the tbody element */
  }

  .category-row {
    display: flex;
    justify-content: space-between;
    cursor: pointer;
    padding: 8px;
    background-color: #eee;
  }

  .category-transactions {
    padding: 8px;
  }

  .category-transactions table {
    width: 100%;
    border-collapse: collapse;
  }

  .transaction-table {
    position: sticky;
    top: 0;
    overflow-y: auto; /* make the table scrollable */
    max-height: calc(100% - 40px); /* subtract the padding from max-height */
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

  button {
    background-color: #41b883;
    border: none;
    color: white;
    padding: 10px 20px;
    text-align: center;
    text-decoration: none;
    display: inline-block;
    font-size: 16px;
    margin: 4px 2px;
    cursor: pointer;
    border-radius: 5px;
  }

</style>

<script>
  export default {
    data() {
      return {
        transactions: [],
        groupedTransactions: {},
        groupedTransactionsVisible: {},
        showAll: false
      }
    },
    methods: {
      toggleCategory(category) {
        this.groupedTransactionsVisible[category] =
          !this.groupedTransactionsVisible[category] || false;
      },
    },
    // request json data from the server
    async mounted() {
      try {
        const response = await fetch('/api/find');
        const data = await response.json(); // extract JSON data from response
        this.transactions = data; // set transactions data

        // Group transactions by category
        this.transactions.forEach((transaction) => {
          const category = transaction.Category;
          if (!this.groupedTransactions[category]) {
            this.groupedTransactions[category] = [];
            this.groupedTransactionsVisible[category] = false;
          }
          this.groupedTransactions[category].push(transaction);
        });
      } catch (error) {
        console.log(error);
      }
    }
  }
</script>
 -->