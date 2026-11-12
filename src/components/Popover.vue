<script setup>
// Pop-up panel for buttons inside dashboard cards (sensor picker, presets). It is moved to <body> so the card's
// scroll area, the page's scroll area and the side menu cannot cut it off or cover it, and it is placed under
// its button, right edges lined up, kept inside the window. Closes on a click outside, Escape or scrolling
// the page under it.
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useDragBox } from '../dragBox';
const props = defineProps({ anchor: Object, width: { type: Number, default: 280 } });
const emit = defineEmits(['close']);
const el = ref(null);
const pos = ref({ left: 0, top: 0, visibility: 'hidden' });

// screen pixels per CSS pixel: the interface scale is a CSS zoom on <html>, so measure it
function place() {
  const a = props.anchor;
  if (!a || !el.value) return;
  const r = a.getBoundingClientRect();
  const k = r.width / (a.offsetWidth || r.width) || 1;
  const vw = window.innerWidth / k,
    vh = window.innerHeight / k;
  // the panel's real width: its content can make it wider than asked
  const w = Math.max(props.width, el.value.offsetWidth),
    h = el.value.offsetHeight;
  let left = r.right / k - w;
  left = Math.max(8, Math.min(left, vw - w - 8));
  let top = r.bottom / k + 6;
  if (top + h > vh - 8 && r.top / k - h - 6 > 8) top = r.top / k - h - 6; // no room below: open upwards
  pos.value = { left: left + 'px', top: top + 'px' };
  // then measured where it really landed: whatever still reaches past the window is moved back in
  requestAnimationFrame(() => {
    const b = el.value?.getBoundingClientRect();
    if (!b) return;
    let dx = 0,
      dy = 0;
    if (b.right > window.innerWidth - 8) dx = window.innerWidth - 8 - b.right;
    if (b.left + dx < 8) dx = 8 - b.left;
    if (b.bottom > window.innerHeight - 8) dy = window.innerHeight - 8 - b.bottom;
    if (b.top + dy < 8) dy = 8 - b.top;
    if (dx || dy) pos.value = { ...pos.value, left: left + dx / k + 'px', top: top + dy / k + 'px' };
  });
}
// it can be dragged aside by any spot that is not a control, to see the card it changes
const { down: dragDown, style: dragStyle } = useDragBox(el, { anywhere: true });
function outside(e) {
  if (el.value?.contains(e.target) || props.anchor?.contains(e.target)) return;
  emit('close');
}
const key = (e) => e.key === 'Escape' && emit('close');
// part of the dialog stack while open (Modal.vue), above what was open when it came up: Escape closes this pop-up
// and not the dialog it was opened from, and that dialog does not pull the focus back out of it. A dialog opened
// from the pop-up comes later in the stack, so it is the one Escape closes.
const stack = (window.__modalStack ||= []);
let z = 100;
const me = { z: () => z };
// only a scroll that moves the button closes it: a console scrolling down to a new line elsewhere does not
const scrolled = (e) => {
  const t = e.target;
  if (el.value?.contains(t)) return;
  if (t === document || t === document.documentElement || t?.contains?.(props.anchor)) emit('close');
};
onMounted(async () => {
  z = Math.max(100, ...stack.map((x) => x.z()));
  stack.push(me);
  await nextTick();
  place();
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('keydown', key);
  window.addEventListener('scroll', scrolled, true);
  window.addEventListener('resize', place);
});
onBeforeUnmount(() => {
  const i = stack.indexOf(me);
  if (i >= 0) stack.splice(i, 1);
  document.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('keydown', key);
  window.removeEventListener('scroll', scrolled, true);
  window.removeEventListener('resize', place);
});
</script>
<template>
  <Teleport to="body">
    <div
      ref="el"
      class="po pop card"
      :style="{ ...pos, width: width + 'px', ...dragStyle() }"
      @click.stop
      @pointerdown="dragDown"
    >
      <slot />
    </div>
  </Teleport>
</template>
<style scoped>
.po {
  position: fixed;
  max-height: calc(100vh / var(--zoom, 1) - 16px);
  overflow: auto;
  z-index: 150;
  gap: 6px;
  padding: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  cursor: default;
}
</style>
