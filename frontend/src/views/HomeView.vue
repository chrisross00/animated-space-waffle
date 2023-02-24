<template>
  <div>
    <h1>{{ message }}</h1>
    <p>{{ message2 }}</p>
    <h3>Navigation</h3>
    <ul>
      <li><a href="/api" target="_blank" rel="noopener">API Directory</a></li>
    </ul>
  </div>
</template>

<script>
export default {
  name: 'HomeView',
  data () {
    return {
      message: 'This is the home page!',
      message2: 'front end'
    }
  }
}
</script>
