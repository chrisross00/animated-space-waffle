<template>
    <div class="page-padder p-3">
      <h1>{{ msg }}</h1>
      <h2>
        Welcome to the API directory
      </h2>
      <p>AKA: the toolbox. The links below take you to various tools to manage your Plaid data. You shouldn't really need to run these, and this page is here mostly for completion's sake.</p>
      <em>Select an endpoint below</em>
      <ul>
        <ol><a href="/api/find" rel="noopener">Find</a> - pull all transactions (don't go here, it will slow down your browser)</ol>
        <ol><a href="/api/test" rel="noopener">Test</a> - a generic page to test end-to-end flow</ol>
        <ol><a href="/api/dedupe" rel="noopener">DeDupe</a>- run the transaction de-duplication sequence</ol>
        <ol><a href="/api/getnew" rel="noopener">Get New</a> - get new transactions from Plaid</ol>
        <ol><a href="/api/getcategories" rel="noopener">Get Categories</a> - Pull the current categories from MongoDb</ol>
        <ol><a href="/api/mapunmapped" rel="noopener">Map Unmapped Categories</a> - find the transactions that don't have mapped categories and map them. Made for an ad hoc data fix.</ol>
        <ol><a href="/api/cleanPendingTransactions" rel="noopener">Clean Pending Transactions</a> - finds pending transactions that weren't cleared, and clears them if they should be cleared (i.e.: the posted transaction exists).</ol>
      </ul>
    </div>
  </template>
  
  <script>
  export default {
    name: 'ApiDir',
    props: {
      msg: String
    }
  }
  </script>
  
  <!-- Add "scoped" attribute to limit CSS to this component only -->
  <style scoped>
  h3 {
    margin: 40px 0 0;
  }
  ul {
    list-style-type: none;
    padding: 0;
  }
  li {
    display: inline-block;
    margin: 0 10px;
  }
  a {
    color: #42b983;
  }
  </style>
  