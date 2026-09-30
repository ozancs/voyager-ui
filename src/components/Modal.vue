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
import { onMounted, onBeforeUnmount } from 'vue';
const stack = (window.__modalStack ||= []);
const me = {};
const esc = (e) => {
  if (e.key === 'Escape' && stack[stack.length - 1] === me) {
    e.stopPropagation();
    if (!props.locked) emit('close');
  }
};
onMounted(() => {
  stack.push(me);
  window.addEventListener('keydown', esc);
});
onBeforeUnmount(() => {
  const i = stack.indexOf(me);
  if (i >= 0) stack.splice(i, 1);
  window.removeEventListener('keydown', esc);
});
</script>
<template>
  <Teleport to="body">
    <div class="ov" :style="z ? { zIndex: z } : null" @mousedown.self="!locked && emit('close')">
      <div class="md card" :style="{ width }" role="dialog" :aria-label="title">
        <div class="card-h">
          <h2>{{ title }}</h2>
          <button v-if="!locked" class="btn clear ibtn sm" :aria-label="t('Close')" @click="emit('close')">
            <Icon name="x" :size="18" />
          </button>
        </div>
        <slot />
        <div v-if="$slots.foot" class="row" style="justify-content: flex-end"><slot name="foot" /></div>
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
</style>
