<template>
  <div>
    {{ message }}
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
      const response = await fetch("/api/test")
      const data = await response.json();
      this.message = data.message
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