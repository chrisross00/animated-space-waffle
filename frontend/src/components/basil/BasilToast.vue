<template>
  <Teleport to="body">
    <TransitionGroup name="basil-toast" tag="div" class="basil-toast-container">
      <div v-for="item in toastState.items" :key="item.id"
           class="basil-toast" :class="`basil-toast--${item.type}`">
        <span class="basil-toast__message">{{ item.message }}</span>
        <div v-if="item.actions?.length" class="basil-toast__actions">
          <button
            v-for="(action, i) in item.actions"
            :key="i"
            class="basil-toast__action"
            @click="handleAction(item, action)"
          >{{ action.label }}</button>
        </div>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script>
import { toastState, toast } from '../../composables/useToast'

export default {
  name: 'BasilToast',
  setup() {
    function handleAction(item, action) {
      toast.dismiss(item.id)
      action.handler?.()
    }
    return { toastState, handleAction }
  }
}
</script>
