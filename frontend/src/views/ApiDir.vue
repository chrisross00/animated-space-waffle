<template>
    <div class="hello">
      <h1>{{ msg }}</h1>
      <h2>
        Welcome to the API directory
      </h2>
      <em>Select an endpoint below</em>
      <h3>Find Transactions</h3>
      <ul>
        <li><a href="/api/find" target="_blank" rel="noopener">Find</a></li>
        <li><a href="/api/test" target="_blank" rel="noopener">Test</a></li>
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
  