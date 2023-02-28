<template>
    <div>
      <h1>Get New Plaid Transactions</h1>
      <p>{{ message }}</p>
      {{ transactions }}
    </div>
  </template>
  
  <script>
  
  export default {
    data() {
      return {
        message: '',
      }
    },
    async mounted() {
      try {
        console.log("FE Message: fetch start")
        const response = await fetch("/api/getnew")
          const data = await response.json(); // extract JSON data from response
          this.transactions = data; // set transactions data
          this.message = 'Welp, here they are.'
      } catch (error) {
        console.log('external catch', error);
      }
    }
  }
  </script>