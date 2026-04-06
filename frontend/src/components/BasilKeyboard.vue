<template>
  <div ref="keyboard" class="basil-keyboard" :class="{ 'basil-keyboard--hidden': !isOpen, 'basil-keyboard--numpad': mode === 'numpad' }" @pointerdown.stop>
    <!-- QWERTY layout -->
    <template v-if="mode === 'qwerty' && !numberSymbol">
      <div class="basil-keyboard__row">
        <div v-for="key in qwertyRows[0]" :key="key" class="basil-keyboard__key" @pointerdown.prevent="onKey(key)">{{ shifted ? key : key.toLowerCase() }}</div>
      </div>
      <div class="basil-keyboard__row" style="padding: 0 4%;">
        <div v-for="key in qwertyRows[1]" :key="key" class="basil-keyboard__key" @pointerdown.prevent="onKey(key)">{{ shifted ? key : key.toLowerCase() }}</div>
      </div>
      <div class="basil-keyboard__row">
        <div class="basil-keyboard__key basil-keyboard__key--modifier basil-keyboard__key--shift" :class="{ 'basil-keyboard__key--shift-active': shifted, 'basil-keyboard__key--shift-locked': capsLock }" @pointerdown.prevent="onShift">
          <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :fill="shifted ? 'currentColor' : 'none'"><path d="M12 3l-8 9h5v8h6v-8h5z"/></svg>
        </div>
        <div v-for="key in qwertyRows[2]" :key="key" class="basil-keyboard__key" @pointerdown.prevent="onKey(key)">{{ shifted ? key : key.toLowerCase() }}</div>
        <div class="basil-keyboard__key basil-keyboard__key--modifier basil-keyboard__key--wide" @pointerdown.prevent="onBackspace">
          <svg width="20" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
        </div>
      </div>
      <div class="basil-keyboard__row">
        <div class="basil-keyboard__key basil-keyboard__key--modifier" @pointerdown.prevent="numberSymbol = true">123</div>
        <div class="basil-keyboard__key basil-keyboard__key--modifier" @pointerdown.prevent="onKey('.')">.</div>
        <div class="basil-keyboard__key basil-keyboard__key--space" @pointerdown.prevent="onKey(' ')">space</div>
        <div class="basil-keyboard__key basil-keyboard__key--action basil-keyboard__key--modifier" @pointerdown.prevent="onDone">Done</div>
      </div>
    </template>

    <!-- Number/symbol layer -->
    <template v-else-if="mode === 'qwerty' && numberSymbol">
      <div class="basil-keyboard__row">
        <div v-for="key in symbolRows[0]" :key="key" class="basil-keyboard__key" @pointerdown.prevent="onSymbolKey(key)">{{ key }}</div>
      </div>
      <div class="basil-keyboard__row" style="padding: 0 4%;">
        <div v-for="key in symbolRows[1]" :key="key" class="basil-keyboard__key" @pointerdown.prevent="onSymbolKey(key)">{{ key }}</div>
      </div>
      <div class="basil-keyboard__row">
        <div class="basil-keyboard__key basil-keyboard__key--modifier basil-keyboard__key--wide" @pointerdown.prevent="symbolPage = symbolPage === 0 ? 1 : 0">{{ symbolPage === 0 ? '#+=': '123' }}</div>
        <div v-for="key in symbolRows[2]" :key="key" class="basil-keyboard__key" @pointerdown.prevent="onSymbolKey(key)">{{ key }}</div>
        <div class="basil-keyboard__key basil-keyboard__key--modifier basil-keyboard__key--wide" @pointerdown.prevent="onBackspace">
          <svg width="20" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
        </div>
      </div>
      <div class="basil-keyboard__row">
        <div class="basil-keyboard__key basil-keyboard__key--modifier" @pointerdown.prevent="numberSymbol = false">ABC</div>
        <div class="basil-keyboard__key basil-keyboard__key--modifier" @pointerdown.prevent="onSymbolKey('.')">.</div>
        <div class="basil-keyboard__key basil-keyboard__key--space" @pointerdown.prevent="onSymbolKey(' ')">space</div>
        <div class="basil-keyboard__key basil-keyboard__key--action basil-keyboard__key--modifier" @pointerdown.prevent="onDone">Done</div>
      </div>
    </template>

    <!-- Numpad layout -->
    <template v-else>
      <div class="basil-keyboard__row">
        <div v-for="key in ['1','2','3']" :key="key" class="basil-keyboard__key" @pointerdown.prevent="onKey(key)">{{ key }}</div>
      </div>
      <div class="basil-keyboard__row">
        <div v-for="key in ['4','5','6']" :key="key" class="basil-keyboard__key" @pointerdown.prevent="onKey(key)">{{ key }}</div>
      </div>
      <div class="basil-keyboard__row">
        <div v-for="key in ['7','8','9']" :key="key" class="basil-keyboard__key" @pointerdown.prevent="onKey(key)">{{ key }}</div>
      </div>
      <div class="basil-keyboard__row">
        <div class="basil-keyboard__key" @pointerdown.prevent="onKey('.')">.</div>
        <div class="basil-keyboard__key" @pointerdown.prevent="onKey('0')">0</div>
        <div class="basil-keyboard__key basil-keyboard__key--modifier" @pointerdown.prevent="onBackspace">
          <svg width="22" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
        </div>
      </div>
      <div class="basil-keyboard__row">
        <div class="basil-keyboard__key basil-keyboard__key--action" @pointerdown.prevent="onDone">Done</div>
      </div>
    </template>
  </div>
</template>

<script>
import { keyboardState, emitKey, emitBackspace, emitDone, dismissKeyboard, getActiveInputEl } from '@/utils/basilKeyboard'

export default {
  name: 'BasilKeyboard',
  data() {
    return {
      shifted: false,
      capsLock: false,
      numberSymbol: false,
      symbolPage: 0,
      lastShiftTap: 0,
      qwertyRows: [
        ['Q','W','E','R','T','Y','U','I','O','P'],
        ['A','S','D','F','G','H','J','K','L'],
        ['Z','X','C','V','B','N','M'],
      ],
      symbolPages: [
        // Page 0: numbers + common symbols
        [
          ['1','2','3','4','5','6','7','8','9','0'],
          ['-','/',':',';','(',')','$','&','@','"'],
          ['.',',','?','!','\''],
        ],
        // Page 1: additional symbols
        [
          ['[',']','{','}','#','%','^','*','+','='],
          ['_','\\','|','~','<','>','€','£','¥','·'],
          ['.',',','?','!','\''],
        ],
      ],
      originalParent: null,
    }
  },
  computed: {
    isOpen() { return keyboardState.isOpen },
    mode() { return keyboardState.mode },
    symbolRows() { return this.symbolPages[this.symbolPage] },
  },
  mounted() {
    this.originalParent = this.$refs.keyboard.parentElement

    // Dismiss on tap outside keyboard/input
    this._onPointerDown = (e) => {
      if (!keyboardState.isOpen) return
      if (e.target.closest('.basil-keyboard') || e.target.closest('.basil-input')) return
      dismissKeyboard()
    }
    document.addEventListener('pointerdown', this._onPointerDown)
  },
  beforeUnmount() {
    document.removeEventListener('pointerdown', this._onPointerDown)
  },
  watch: {
    isOpen: {
      handler(val) {
        if (val) {
          const el = this.$refs.keyboard
          if (!el) return

          this.$nextTick(() => {
            keyboardState.height = el.offsetHeight
            document.documentElement.style.setProperty('--basil-keyboard-height', keyboardState.height + 'px')
          })
        } else {
          this.numberSymbol = false
          this.symbolPage = 0
          document.documentElement.style.setProperty('--basil-keyboard-height', '0px')
        }
      },
      immediate: true,
    },
  },
  methods: {
    onKey(char) {
      if (this.shifted && !this.capsLock) this.shifted = false
      emitKey(this.shifted ? char : char.toLowerCase())
    },
    onBackspace() {
      emitBackspace()
    },
    onDone() {
      emitDone()
    },
    onSymbolKey(char) {
      emitKey(char)
    },
    onShift() {
      const now = Date.now()
      if (now - this.lastShiftTap < 300) {
        this.capsLock = !this.capsLock
        this.shifted = this.capsLock
      } else {
        if (this.capsLock) {
          this.capsLock = false
          this.shifted = false
        } else {
          this.shifted = !this.shifted
        }
      }
      this.lastShiftTap = now
    },
  },
}
</script>
