<script setup>
// Global tooltip: any element with aria-label or data-tip shows it after hovering ~0.8s.
import { ref, onMounted, onBeforeUnmount } from 'vue';
const tip = ref(null);
let timer = null,
  cur = null;
function text(el) {
  if (el.dataset.tip) return el.dataset.tip;
  const a = el.getAttribute('aria-label');
  if (!a) return '';
  // skip when the visible text already says the same thing
  const vis = (el.innerText || '').trim();
  return vis && vis.toLowerCase() === a.toLowerCase() ? '' : a;
}
let touchAt = 0; // hover tooltips make no sense on a touch screen and would stick after a tap
function over(e) {
  if (Date.now() - touchAt < 1500) return;
  const el = e.target.closest?.('[data-tip],button[aria-label],a[aria-label],label[aria-label]');
  if (el === cur) return;
  cur = el;
  clearTimeout(timer);
  tip.value = null;
  if (!el) return;
  const t = text(el);
  if (!t) return;
  timer = setTimeout(() => {
    if (!document.body.contains(el)) return;
    // rects are in screen pixels, the tooltip is placed inside the zoomed page
    const z = window.__uiZoom || 1;
    const r = el.getBoundingClientRect();
    const below = r.top < 60;
    tip.value = {
      t,
      x: Math.min(window.innerWidth - 10, Math.max(10, r.left + r.width / 2)) / z,
      y: (below ? r.bottom + 8 : r.top - 8) / z,
      below,
    };
  }, 800);
}
function hide() {
  clearTimeout(timer);
  tip.value = null;
  cur = null;
}
function touch() {
  touchAt = Date.now();
  hide();
}
onMounted(() => {
  document.addEventListener('mouseover', over);
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('touchstart', touch, { capture: true, passive: true });
  window.addEventListener('scroll', hide, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('mouseover', over);
  document.removeEventListener('mousedown', hide, true);
  document.removeEventListener('touchstart', touch, true);
  window.removeEventListener('scroll', hide, true);
});
</script>
<template>
  <div v-if="tip" class="tt" :class="{ below: tip.below }" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
    {{ tip.t }}
  </div>
</template>
<style scoped>
.tt {
  position: fixed;
  z-index: 500;
  transform: translate(-50%, -100%);
  background: #2a2e34;
  color: var(--tx);
  border: 1px solid var(--bd);
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}
.tt.below {
  transform: translate(-50%, 0);
}
</style>
