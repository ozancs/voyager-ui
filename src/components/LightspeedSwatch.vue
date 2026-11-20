<script setup>
// A Lightspeed strip drawn as it runs: the same effect engine as the plugin paints the swatch (a rainbow or a chase
// as a moving gradient) and the tile's glow (--lsc on the tile around it). Runs outside Vue's updates, about 20
// times a second and only while the effect moves and the page is visible; a solid colour or off is drawn once.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { lsStrips, frame, frameCss, frameGlow, parseEffect, moving } from '../lightspeed';
const props = defineProps({ strips: { type: Array, required: true }, glow: { type: Boolean, default: true } });
const el = ref(null);
const list = computed(() => props.strips.map((n) => lsStrips.value[n]).filter(Boolean));
const anyMoving = computed(() => list.value.some((s) => !s.disabled && moving(parseEffect(s.effect)[0])));
let raf = 0,
  last = 0;
function draw() {
  if (!el.value) return;
  const t = performance.now() / 1000;
  const px = list.value.flatMap((s) => (s.disabled ? [] : frame(s.effect, s.count, t)));
  el.value.style.background = frameCss(px) || 'var(--s2)';
  const tile = props.glow && el.value.closest('.dc');
  if (tile) {
    const g = frameGlow(px);
    if (g) tile.style.setProperty('--lsc', g);
    else tile.style.removeProperty('--lsc');
  }
}
function loop(now) {
  raf = 0;
  if (document.hidden || !anyMoving.value) return;
  if (now - last > 50) {
    last = now;
    draw();
  }
  raf = requestAnimationFrame(loop);
}
function start() {
  draw();
  if (!raf && anyMoving.value && !document.hidden) raf = requestAnimationFrame(loop);
}
const onVis = () => !document.hidden && start();
onMounted(() => {
  start();
  document.addEventListener('visibilitychange', onVis);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  document.removeEventListener('visibilitychange', onVis);
  el.value?.closest('.dc')?.style.removeProperty('--lsc');
});
// a new effect from the printer: draw it now, and start or stop the loop
watch(list, start);
</script>
<template>
  <span ref="el" class="lsw"></span>
</template>
<style scoped>
.lsw {
  display: inline-block;
  width: 30px;
  height: 22px;
  border-radius: 6px;
  flex: none;
  background: var(--s2);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx) 14%, transparent);
}
</style>
