<template>
    <div>
      <h1>Get Categories</h1>
      <p>{{ message }}</p>
    </div>
  </template>
  
  <script>
    export default {
      data() {
          return {
          message: ''
          }
      },
    async mounted() {
      try {
        console.log("fetch start")
        const response = await fetch('/api/getcategories');
        const data = await response.json();
        console.log('FE post complete: ', data);
        this.message = data.message;
      } catch (error) {
          console.log('external catch', error);
      }
      }
    }
  </script>
<!-- const response = await fetch('/example');
const data = await response.json();
console.log(data.customProperty); -->
