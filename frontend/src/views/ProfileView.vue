<template>
    <div class="q-pa-md-page-padder p-3">
      <q-card class="my-card">
        <q-card-section horizontal>
          <q-card-section class="q-pt-xs">
            <div class="text-overline">Profile</div>
          </q-card-section>
        </q-card-section>
      </q-card>
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
[x] routes.js -> copy/paste/manipulate block and import
[x] ApiDir.vue -> add link
[x] Page.vue -> copy/paste dedupe.vue

Change the /url for all

-->