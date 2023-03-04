<template>
  <a href="/api">
    <img alt="Vue logo" src="./assets/logo.png">
  </a>
  <div id="app">
    <router-view></router-view>
  </div>
</template>

<script>
  export default {
    name: 'App',
    components: {
    }
  }
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}

.button-container {
  display: flex;
  justify-content: space-evenly;
  align-items: center;
  max-width: 900px;
  margin: 0 auto;
  margin-top: 20px;
}

.button-container * {
  vertical-align: middle;
}

button {
  background-color: #41b883;
  border: none;
  color: white;
  padding: 10px 20px;
  text-align: center;
  text-decoration: none;
  font-size: 16px;
  margin: 4px 2px;
  cursor: pointer;
  border-radius: 5px;
}

select {
  padding: 10px 40px 10px 10px;
  font-size: 16px;
  border: none;
  border-radius: 5px;
  background-color: #f5f5f5;
  color: #333;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}
select::after {
  content: "\25BE";
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
}

select:focus {
  outline: none;
}

select option {
  font-size: 16px;
  background-color: #f5f5f5;
  color: #333;
}

</style>


