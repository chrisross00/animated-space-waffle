<template>
  <div>
    <h1>Top 5 Transactions</h1>
    <ul>
      <li v-for="(transaction, index) in transactions" :key="index">
        {{ transaction.description }} - {{ transaction.amount }}
      </li>
    </ul>
  </div>
</template>

<script>
export default {
  data() {
    return {
      transactions: []
    }
  },
  mounted() {
    fetch('/find')
      .then(response => response.json())
      .then(data => {
        this.transactions = data.slice(0, 5);
        console.log('Rendered the data, boss')
      });
  }
}
</script>
