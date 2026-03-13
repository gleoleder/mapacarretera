<template>
  <div v-click-outside='looseFocus' class='can-drag'>
    <div class='editable-label'>
      <span :class='{printable}'>{{modelValue}}</span>
      <input
        v-bind:value="modelValue"
        v-on:input="$emit('update:modelValue', $event.target.value)"
        ref='input'
      >
    </div>
  </div>
</template>
<script>
import ClickOutside from './clickOutside.js'

export default {
  name: 'EditableLabel',
  props: ['modelValue', 'printable', 'overlayManager'],
  emits: ['update:modelValue'],
  directives: { ClickOutside },
  mounted() {
    this.$el.receiveFocus = this.focus;
    this.$el.style.pointerEvents = 'none';
  },
  methods: {
    looseFocus() {
      this.$refs.input.blur();
    },
    focus() {
      this.$refs.input.focus();
    }
  }
}
</script>
<style lang="stylus">
@import('../vars.styl');

.editable-label {
  position: relative;

  span {
    position: relative;
    top: 0;
    left: 0;
    display: flex;
    align-items: center;
    font-family: body-font;
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: pre;
    padding: 8px;
    border: 1px solid transparent;
    text-shadow: 0 2px 20px rgba(0,0,0,0.6);
  }

  input {
    caret-color: accent;
    color: transparent;
    font-family: body-font;
    font-weight: 700;
    letter-spacing: -0.02em;
    background: transparent;
    display: flex;
    align-items: center;
    position: absolute;
    overflow: hidden;
    top: 0;
    left: 0;
    width: 100%;
    padding: 8px;
    border: none;
  }
}
</style>