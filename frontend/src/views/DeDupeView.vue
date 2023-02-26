<template>
  <div>
    {{ message }}
  </div>
</template>

<script>
  import axios from 'axios';
  export default {
    data() {
        return {
        message: ''
        }
    },
  async mounted() {
    try {
      console.log("fetch start")
      await axios.post('/api/dedupe');
      console.log('post complete');
      this.message = 'Dedupe Done!';
    } catch (error) {
        console.log('external catch', error);
    }
    }
  }
</script>