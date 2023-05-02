<template>
  <div>
    {{ message }}
  </div>
  
  <div v-if="data">
    <pre id="json">{{ data }}</pre>
  </div>
</template>

<script>
import { findSimilarTransactionGroups  } from '@/firebase'
// replace this with something else
// import axios from 'axios';

export default {
  data() {
    return {
      message: '',
      data: {}
    }
  },
  async mounted() {
    try {
      const response = await findSimilarTransactionGroups()
      const data = await response;
      this.message = data.message
      this.data = data.data
      document.getElementById("json").textContent = JSON.stringify(data, undefined, 2);
    } catch (err) {
      // console.log('external catch', err);
    }
  }
}
</script>

<!-- To set up a new page and /api, copy the below files for the Test implementation
  
[ ] Api.js -> router.method(‘/path)
[ ] routes.js -> copy/paste/manipulate block and import
[ ] ApiDir.vue -> add link
[ ] Page.vue -> copy/paste dedupe.vue

Change the /url for all

-->