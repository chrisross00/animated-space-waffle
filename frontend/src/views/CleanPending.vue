<template>
    <div class="page-padder p-3">
      <h3>Clean Pending Transactions</h3>
    </div>
    <div>
    <pre id="json">{{ message }}</pre>
    </div>
</template>

  
  <script>
  // replace this with something else
  // import axios from 'axios';
  
  export default {
    data() {
      return {
        message: ''
      }
    },
    async mounted() {
      try {
        // console.log("fetch start")
        const response = await fetch("/api/cleanPendingTransactions")
        const data = await response.json();
        this.message = data
          document.getElementById("json").textContent = JSON.stringify(data, undefined, 2);
      } catch (err) {
        // console.log('external catch', err);
      }
    }
  }
  </script>
  
  <!-- To set up a new page and /api, copy the below files for the Test implementation
    
  [x] Api.js -> router.method(‘/path)
  [x] routes.js -> copy/paste/manipulate block and import
  [ ] ApiDir.vue -> add link
  [x] Page.vue -> copy/paste dedupe.vue
  
  Change the /url for all
  
  -->