<template>
    <div>
      <h1>{{ msg }}</h1>
      <h2>
        Welcome to the API directory
      </h2>
      <p>The links below take you to various tools to manage your Plaid data</p>
      <em>Select an endpoint below</em>
      <ul>
        <li><a href="/api/find" rel="noopener">Find</a></li>
        <li><a href="/api/test" rel="noopener">Test</a></li>
        <li><a href="/api/dedupe" rel="noopener">DeDupe</a></li>
        <li><a href="/api/getnew" rel="noopener">Get New</a></li>
        <li><a href="/api/getcategories" rel="noopener">Get Categories</a></li>
        <li><a href="/api/mapunmapped" rel="noopener">Map Unmapped Categories</a></li>
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
  