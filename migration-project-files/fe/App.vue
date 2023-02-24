<template>
  <div>
    <header>
      <nav>
        <router-link to="/">Home</router-link> |
        <router-link to="/find">Find</router-link>
      </nav>
    </header>
    <main>
      <h1>Welcome to my web app!</h1>
      <router-view></router-view>
    </main>
  </div>
</template>

<script>
export default {
  name: 'App'
}
</script>

<style>
/* Add your styles here */
</style>
