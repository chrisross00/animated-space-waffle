<template>
    <div class="overlay" :class="{ 'is-visible': isLoading }">
        <div class="spinner-container">
            <q-spinner
            color="primary"
            size="3em"
            :thickness="10"
            />
        </div>
      </div>
</template>

<style>
</style>

<script>
export default {
  name: 'SpinnerComponent',
  props: {
    isLoading: {
      type: Boolean,
      required: true,
    },
  }
}
</script>
