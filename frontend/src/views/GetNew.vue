<template>
    <div>
      <h2>Get New Plaid Transactions</h2>
      <p>{{ message }}</p>
      <!-- <pre id="json">{{ transactions }}</pre> -->
      <!-- {{ transactions }} -->
      <div>
        <p> JSON format below: </p>
        <pre id="json"> {{ transactions }} </pre>
      </div>
    </div>
  </template>

  <style>
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
  #json {
    font-size: 10px;
  }
  </style>
  
  <script>
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
    data() {
      return {
        message: '',
        transactions: [],
        columns
      }
    },
    async mounted() {
      try {
        console.log("FE Message: fetch start")
        const response = await fetch("/api/getnew")
          const data = await response.json(); // extract JSON data from response
          this.transactions = data.transactions
          this.message = data.message; // set transactions data
          document.getElementById("json").textContent = JSON.stringify(data, undefined, 2);
      } catch (error) {
        console.log('external catch', error);
      }
    }
  }
  </script>