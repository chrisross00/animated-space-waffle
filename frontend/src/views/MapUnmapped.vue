<template>
    <div>
      {{ message }}
    </div>
  </template>
  
  <script>
  import { mapUnmapped } from '../firebase';

  export default {
    data() {
      return {
        message: ''
      }
    },
    async mounted() {
      try {
        const data = await mapUnmapped();
        this.message = data && data.length > 0 ? data : 'No unmapped transactions found';
      } catch (err) {
        console.error('mapUnmapped error:', err);
      }
    }
  }
  </script>