<template>
  <div class="page-padder p-3">
    <h2>Get transactions</h2>
  </div>
  <div class="centered-text">
      <pre id="json">{{ transactions }}</pre>
    </div>
  </template>

<style>
#json {
    text-align: left;
    }
.centered-text {
    text-align: center !important; 
}
</style>
  
  <script>
    export default {
      data() {
          return {
            transactions: ''
          }
      },
    async mounted() {
      try {
          // console.log("fetch start")
          const response = await fetch('/api/getnew');
          const data = await response.json();
          this.transactions = data;
          document.getElementById("json").textContent = JSON.stringify(data,undefined, 2)// (data, undefined);
      } catch (error) {
          // console.log('external catch', error);
      }
      }
    }
  </script>