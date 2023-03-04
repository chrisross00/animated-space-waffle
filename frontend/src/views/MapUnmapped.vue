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
        const response = await fetch("/api/mapunmapped")
        const data = await response.json();
        this.message = data.length > 0 ? data : 'No unmapped transactions found'
      } catch (err) {
        // console.log('external catch', err);
      }
    }
  }
  </script>