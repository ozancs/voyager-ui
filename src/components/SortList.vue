<script setup>
// A list whose rows can be dragged into a new order by their handle (mouse, touch and pen through pointer events,
// so it also works on a phone where HTML drag and drop does not). The keyboard can move the focused handle with
// the arrow keys. v-model is the array; each row is the default slot with { item, index }. Held near the top or
// bottom edge of the scrolling area, the list scrolls so a row can be taken past what is on screen.
import { ref, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import { t } from '../i18n';
const props = defineProps({ modelValue: Array, itemKey: { type: Function, default: (x) => x } });
const emit = defineEmits(['update:modelValue']);
const box = ref(null);
const dragging = ref(-1);
let pid = null;
let lastY = 0;
let scroller = null;
let raf = 0;
// the nearest parent that scrolls (the page's main area on a phone), the page itself when none does
function scrollParent(el) {
  for (let x = el?.parentElement; x; x = x.parentElement) {
    const o = getComputedStyle(x).overflowY;
    if (/auto|scroll/.test(o) && x.scrollHeight > x.clientHeight) return x;
  }
  return document.scrollingElement;
}
// while the pointer is held within EDGE px of the top or bottom of the visible area, scroll toward it, faster the
// closer it is, and place the row again for the content that moved under the pointer
const EDGE = 70;
function tick() {
  raf = 0;
  if (dragging.value < 0 || !scroller) return;
  const r = scroller === document.scrollingElement ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
  const top = Math.max(r.top, 0),
    bottom = Math.min(r.bottom, innerHeight);
  let d = 0;
  if (lastY < top + EDGE) d = -Math.ceil(((top + EDGE - lastY) / EDGE) * 14);
  else if (lastY > bottom - EDGE) d = Math.ceil(((lastY - (bottom - EDGE)) / EDGE) * 14);
  if (!d) return;
  const before = scroller.scrollTop;
  scroller.scrollTop += d;
  if (scroller.scrollTop !== before) place(lastY);
  raf = requestAnimationFrame(tick);
}
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
  scroller = scrollParent(box.value);
  // the row moves in the page while it is dragged, which can drop the capture: end the drag wherever the button
  // is released
  window.addEventListener('pointermove', over);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
function over(e) {
  if (dragging.value < 0 || e.pointerId !== pid) return;
  if (e.pointerType === 'mouse' && e.buttons === 0) return up(); // released somewhere the event did not reach
  lastY = e.clientY;
  place(e.clientY);
  if (!raf) raf = requestAnimationFrame(tick);
}
function place(y) {
  const rows = [...box.value.children];
  // the row whose middle the pointer passed is where the dragged one goes
  let to = dragging.value;
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k].getBoundingClientRect();
    if (y < r.top + r.height / 2) {
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
  scroller = null;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  window.removeEventListener('pointermove', over);
  window.removeEventListener('pointerup', up);
  window.removeEventListener('pointercancel', up);
}
onBeforeUnmount(up);
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
  <div ref="box" class="sl">
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
  /* drawn inside the row: an outline outside it was cut off by the scrolling list around it */
  box-shadow: inset 0 0 0 1px var(--ac);
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
