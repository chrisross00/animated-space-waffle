<template>
  <div class="basil-keyboard" :class="{ 'basil-keyboard--hidden': !isOpen, 'basil-keyboard--numpad': mode === 'numpad' }">
    <!-- QWERTY layout -->
    <template v-if="mode === 'qwerty'">
      <div class="basil-keyboard__row">
        <div v-for="key in qwertyRows[0]" :key="key" class="basil-keyboard__key" @pointerdown.prevent @click="onKey(key)">{{ shifted ? key : key.toLowerCase() }}</div>
      </div>
      <div class="basil-keyboard__row" style="padding: 0 4%;">
        <div v-for="key in qwertyRows[1]" :key="key" class="basil-keyboard__key" @pointerdown.prevent @click="onKey(key)">{{ shifted ? key : key.toLowerCase() }}</div>
      </div>
      <div class="basil-keyboard__row">
        <div class="basil-keyboard__key basil-keyboard__key--modifier" @pointerdown.prevent @click="shifted = !shifted">{{ shifted ? 'abc' : 'ABC' }}</div>
        <div v-for="key in qwertyRows[2]" :key="key" class="basil-keyboard__key" @pointerdown.prevent @click="onKey(key)">{{ shifted ? key : key.toLowerCase() }}</div>
        <div class="basil-keyboard__key basil-keyboard__key--modifier basil-keyboard__key--wide" @pointerdown.prevent @click="onBackspace">
          <svg width="20" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
        </div>
      </div>
      <div class="basil-keyboard__row">
        <div class="basil-keyboard__key basil-keyboard__key--modifier" @pointerdown.prevent>123</div>
        <div class="basil-keyboard__key" @pointerdown.prevent @click="onKey('.')">.</div>
        <div class="basil-keyboard__key basil-keyboard__key--space" @pointerdown.prevent @click="onKey(' ')">space</div>
        <div class="basil-keyboard__key basil-keyboard__key--action" @pointerdown.prevent @click="onDone">Done</div>
      </div>
    </template>

    <!-- Numpad layout -->
    <template v-else>
      <div class="basil-keyboard__row">
        <div v-for="key in ['1','2','3']" :key="key" class="basil-keyboard__key" @pointerdown.prevent @click="onKey(key)">{{ key }}</div>
      </div>
      <div class="basil-keyboard__row">
        <div v-for="key in ['4','5','6']" :key="key" class="basil-keyboard__key" @pointerdown.prevent @click="onKey(key)">{{ key }}</div>
      </div>
      <div class="basil-keyboard__row">
        <div v-for="key in ['7','8','9']" :key="key" class="basil-keyboard__key" @pointerdown.prevent @click="onKey(key)">{{ key }}</div>
      </div>
      <div class="basil-keyboard__row">
        <div class="basil-keyboard__key" @pointerdown.prevent @click="onKey('.')">.</div>
        <div class="basil-keyboard__key" @pointerdown.prevent @click="onKey('0')">0</div>
        <div class="basil-keyboard__key basil-keyboard__key--modifier" @pointerdown.prevent @click="onBackspace">
          <svg width="22" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
        </div>
      </div>
      <div class="basil-keyboard__row">
        <div class="basil-keyboard__key basil-keyboard__key--action" @pointerdown.prevent @click="onDone">Done</div>
      </div>
    </template>
  </div>
</template>

<script>
import { keyboardState, emitKey, emitBackspace, emitDone, dismissKeyboard } from '@/utils/basilKeyboard'

export default {
  name: 'BasilKeyboard',
  data() {
    return {
      shifted: false,
      qwertyRows: [
        ['Q','W','E','R','T','Y','U','I','O','P'],
        ['A','S','D','F','G','H','J','K','L'],
        ['Z','X','C','V','B','N','M'],
      ],
    }
  },
  computed: {
    isOpen() { return keyboardState.isOpen },
    mode() { return keyboardState.mode },
  },
  mounted() {
    // Set keyboard height after first render
    this.$nextTick(() => {
      keyboardState.height = this.$el.offsetHeight
    })
    // Dismiss on tap outside keyboard/input
    // Use requestAnimationFrame so the tap event lands on the target element
    // (e.g. q-select) before we dismiss and re-render
    this._onPointerDown = (e) => {
      if (!keyboardState.isOpen) return
      if (e.target.closest('.basil-keyboard') || e.target.closest('.basil-input')) return
      requestAnimationFrame(() => dismissKeyboard())
    }
    document.addEventListener('pointerdown', this._onPointerDown)
  },
  beforeUnmount() {
    document.removeEventListener('pointerdown', this._onPointerDown)
  },
  watch: {
    isOpen(val) {
      // Update CSS variable on :root
      if (val) {
        this.$nextTick(() => {
          keyboardState.height = this.$el.offsetHeight
          document.documentElement.style.setProperty('--basil-keyboard-height', keyboardState.height + 'px')
        })
      } else {
        document.documentElement.style.setProperty('--basil-keyboard-height', '0px')
      }
    }
  },
  methods: {
    onKey(char) {
      try { navigator.vibrate?.(10) } catch {}
      emitKey(this.shifted ? char.toUpperCase() : char)
    },
    onBackspace() {
      try { navigator.vibrate?.(10) } catch {}
      emitBackspace()
    },
    onDone() {
      try { navigator.vibrate?.(10) } catch {}
      emitDone()
    },
  },
}
</script>
