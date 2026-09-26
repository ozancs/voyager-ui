<script setup>
// Pop-up panel for buttons inside dashboard cards (sensor picker, presets). It is moved to <body> so the card's
// scroll area, the page's scroll area and the side menu cannot cut it off or cover it, and it is placed under
// its button, right edges lined up, kept inside the window. Closes on a click outside, Escape or scrolling.
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
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
  const w = props.width,
    h = el.value.offsetHeight;
  let left = r.right / k - w;
  left = Math.max(8, Math.min(left, vw - w - 8));
  let top = r.bottom / k + 6;
  if (top + h > vh - 8 && r.top / k - h - 6 > 8) top = r.top / k - h - 6; // no room below: open upwards
  pos.value = { left: left + 'px', top: top + 'px' };
}
function outside(e) {
  if (el.value?.contains(e.target) || props.anchor?.contains(e.target)) return;
  emit('close');
}
const key = (e) => e.key === 'Escape' && emit('close');
const scrolled = (e) => {
  if (!el.value?.contains(e.target)) emit('close');
};
onMounted(async () => {
  await nextTick();
  place();
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('keydown', key);
  window.addEventListener('scroll', scrolled, true);
  window.addEventListener('resize', place);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('keydown', key);
  window.removeEventListener('scroll', scrolled, true);
  window.removeEventListener('resize', place);
});
</script>
<template>
  <Teleport to="body">
    <div ref="el" class="po pop card" :style="{ ...pos, width: width + 'px' }" @click.stop>
      <slot />
    </div>
  </Teleport>
</template>
<style scoped>
.po {
  position: fixed;
  z-index: 150;
  gap: 6px;
  padding: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  cursor: default;
}
</style>
