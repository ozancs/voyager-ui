<script setup>
// A list whose rows can be dragged into a new order by their handle (mouse, touch and pen through pointer events,
// so it also works on a phone where HTML drag and drop does not). The keyboard can move the focused handle with
// the arrow keys. v-model is the array; each row is the default slot with { item, index }.
import { ref } from 'vue';
import Icon from './Icon.vue';
import { t } from '../i18n';
const props = defineProps({ modelValue: Array, itemKey: { type: Function, default: (x) => x } });
const emit = defineEmits(['update:modelValue']);
const box = ref(null);
const dragging = ref(-1);
let pid = null;
function move(from, to) {
  if (from === to || to < 0 || to >= props.modelValue.length) return from;
  const a = [...props.modelValue];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  emit('update:modelValue', a);
  return to;
}
function down(i, e) {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();
  dragging.value = i;
  pid = e.pointerId;
  e.target.setPointerCapture?.(pid);
}
function over(e) {
  if (dragging.value < 0 || e.pointerId !== pid) return;
  const rows = [...box.value.children];
  // the row whose middle the pointer passed is where the dragged one goes
  let to = dragging.value;
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k].getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) {
      to = k > dragging.value ? k - 1 : k;
      break;
    }
    to = k;
  }
  dragging.value = move(dragging.value, to);
}
function up() {
  dragging.value = -1;
  pid = null;
}
function key(i, e) {
  const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
  if (!d) return;
  e.preventDefault();
  const to = move(i, i + d);
  // keep the focus on the handle of the row that moved
  requestAnimationFrame(() => box.value?.children[to]?.querySelector('.hd')?.focus());
}
</script>
<template>
  <div ref="box" class="sl" @pointermove="over" @pointerup="up" @pointercancel="up">
    <div v-for="(item, i) in modelValue" :key="itemKey(item)" class="sr" :class="{ drag: dragging === i }">
      <button
        type="button"
        class="hd"
        :aria-label="t('Drag to reorder, or use the arrow keys')"
        @pointerdown="down(i, $event)"
        @keydown="key(i, $event)"
      >
        <Icon name="grip" :size="16" />
      </button>
      <slot :item="item" :index="i"></slot>
    </div>
  </div>
</template>
<style scoped>
.sl {
  display: flex;
  flex-direction: column;
  gap: 4px;
  user-select: none;
}
.sr {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 8px;
  background: var(--s2);
  min-width: 0;
}
.sr.drag {
  outline: 1px solid var(--ac);
  background: var(--s3);
}
.hd {
  flex: none;
  width: 26px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--mu);
  cursor: grab;
  touch-action: none;
  border-radius: 6px;
}
.hd:hover,
.hd:focus-visible {
  color: var(--tx);
}
.sr.drag .hd {
  cursor: grabbing;
}
</style>
