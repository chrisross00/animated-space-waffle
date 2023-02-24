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
      console.log("fetch start")
      fetch("/api/test")
        .then(data=>data.json().then(console.log))
        .then(await(setTimeout(() => { this.message = "CORS Done!" }, 3000)))
    } catch (error) {
      console.log('external catch', error);
    }
  }
}
</script>