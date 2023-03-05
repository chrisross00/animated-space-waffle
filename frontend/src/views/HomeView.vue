<template>
  <div class="page-padder">
    <h2>{{ message }}</h2>
  </div>
</template>

<script>
export default {
  name: 'HomeView',
  data () {
    return {
      message: 'This is technically the home page',
      message2: 'front end'
    }
  }
}
</script>
