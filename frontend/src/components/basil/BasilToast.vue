<template>
  <Teleport to="body">
    <TransitionGroup name="basil-toast" tag="div" class="basil-toast-container">
      <div v-for="item in toastState.items" :key="item.id"
           class="basil-toast" :class="`basil-toast--${item.type}`">
        {{ item.message }}
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script>
import { toastState } from '../../composables/useToast'

export default {
  name: 'BasilToast',
  setup() {
    return { toastState }
  }
}
</script>
