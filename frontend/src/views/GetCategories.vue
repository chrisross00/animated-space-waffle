<template>
    <h2>Get Categories</h2>
    <div>
      <pre id="json">{{ message }}</pre>
    </div>
  </template>

<style>
#json {
    text-align: left;
    }
</style>
  
  <script>
    export default {
      data() {
          return {
          message: ''
          }
      },
    async mounted() {
      try {
          // console.log("fetch start")
          const response = await fetch('/api/getcategories');
          const data = await response.json();
          this.message = data;
          document.getElementById("json").textContent = JSON.stringify(data, undefined, 2);
      } catch (error) {
          // console.log('external catch', error);
      }
      }
    }
  </script>