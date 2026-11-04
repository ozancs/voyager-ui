<script setup>
// Dialog frame: title, close button, content and a footer row for buttons. Escape closes only the dialog on top.
import Icon from './Icon.vue';
import { t } from '../i18n';
// z: stacking for dialogs that must come over everything else (the print guard over a macro prompt)
// locked: cannot be closed for now (no X, Escape and a click outside do nothing)
const props = defineProps({
  title: String,
  width: { type: String, default: '520px' },
  z: { type: Number, default: 0 },
  locked: Boolean,
});
const emit = defineEmits(['close']);
// Esc closes the topmost dialog only (a confirm on top of another dialog must not close both)
import { nextTick, onMounted, onBeforeUnmount, ref } from 'vue';
const stack = (window.__modalStack ||= []);
const dialog = ref(null);
const me = { z: () => props.z || 100 };
const top = () => stack.reduce((a, b) => (!a || b.z() >= a.z() ? b : a), null);
let previous;
function focusables() {
  return [
    ...dialog.value.querySelectorAll('button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]'),
  ].filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length);
}
function keepFocus(e) {
  if (top() === me && !dialog.value.contains(e.target)) (focusables()[0] || dialog.value).focus();
}
const esc = (e) => {
  if (top() !== me) return;
  if (e.key === 'Tab') {
    const items = focusables();
    const index = items.indexOf(document.activeElement);
    if (index < 0 || (e.shiftKey ? index === 0 : index === items.length - 1)) {
      e.preventDefault();
      (items[e.shiftKey ? items.length - 1 : 0] || dialog.value).focus();
    }
  }
  if (e.key === 'Escape') {
    e.stopPropagation();
    if (!props.locked) emit('close');
  }
};
onMounted(() => {
  previous = document.activeElement;
  stack.push(me);
  document.addEventListener('focusin', keepFocus);
  nextTick(() => {
    if (top() === me && !dialog.value.contains(document.activeElement)) dialog.value.focus();
  });
  window.addEventListener('keydown', esc);
});
onBeforeUnmount(() => {
  const i = stack.indexOf(me);
  if (i >= 0) stack.splice(i, 1);
  window.removeEventListener('keydown', esc);
  document.removeEventListener('focusin', keepFocus);
  if (previous?.isConnected) nextTick(() => previous.focus());
});
</script>
<template>
  <Teleport to="body">
    <div class="ov" :style="z ? { zIndex: z } : null" @mousedown.self="!locked && emit('close')">
      <div
        class="md card"
        :style="{ width }"
        ref="dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-label="title"
      >
        <div class="card-h">
          <h2>{{ title }}</h2>
          <button v-if="!locked" class="btn clear ibtn sm" :aria-label="t('Close')" @click="emit('close')">
            <Icon name="x" :size="18" />
          </button>
        </div>
        <slot />
        <div v-if="$slots.foot" class="row ft"><slot name="foot" /></div>
      </div>
    </div>
  </Teleport>
</template>
<style scoped>
.ov {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}
.md {
  max-width: 100%;
  max-height: calc(90vh / var(--zoom, 1));
  overflow: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
/* a long file name as the title breaks instead of widening the dialog past the screen */
.md > .card-h h2 {
  min-width: 0;
  overflow-wrap: anywhere;
}
/* footer buttons wrap onto a second row on a phone instead of running off the side */
.ft {
  justify-content: flex-end;
  flex-wrap: wrap;
  row-gap: 8px;
}
</style>
