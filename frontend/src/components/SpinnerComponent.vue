<template>
    <div class="overlay" :class="{ 'is-visible': isLoading }">
        <div class="spinner-container">
            <BasilSpinner color="primary" size="3em" />
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
