<script setup>
// Floating webcam: the "float" button on a webcam card lifts its camera into a small window that stays on screen
// while scrolling and on every page. Drag it by its bar, resize it from the corner, close it and the camera is
// back in its card. Position and size are kept for this browser.
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import WebcamView from './WebcamView.vue';
import { state } from '../store';
import { t } from '../i18n';

const KEY = 'voyager-ui-pip';
const cam = computed(() => state.webcams.find((w) => w.name === state.pip?.cam) || null);
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
};
const box = ref({ x: null, y: null, w: 360, ...(load() || {}) });
const vw = () => window.innerWidth / (state.uiZoom || 1),
  vh = () => window.innerHeight / (state.uiZoom || 1);
const H = () => Math.round((box.value.w * 9) / 16) + 34;
function clamp() {
  const b = box.value;
  b.w = Math.max(220, Math.min(b.w, vw() - 16));
  if (b.x == null) b.x = vw() - b.w - 20;
  if (b.y == null) b.y = vh() - H() - 90;
  b.x = Math.max(8, Math.min(b.x, vw() - b.w - 8));
  b.y = Math.max(8, Math.min(b.y, vh() - H() - 8));
}
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(box.value));
  } catch {}
};
// pointer positions are in screen pixels, the window lives in the zoomed page
let drag = null;
function down(e, kind) {
  if (e.button !== 0) return;
  e.preventDefault();
  const z = state.uiZoom || 1;
  drag = { kind, sx: e.clientX / z, sy: e.clientY / z, ...box.value };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
}
function move(e) {
  if (!drag) return;
  const z = state.uiZoom || 1;
  const dx = e.clientX / z - drag.sx,
    dy = e.clientY / z - drag.sy;
  if (drag.kind === 'move') box.value = { ...box.value, x: drag.x + dx, y: drag.y + dy };
  else box.value = { ...box.value, w: drag.w + dx };
  clamp();
}
function up() {
  drag = null;
  window.removeEventListener('pointermove', move);
  save();
}
function key(e) {
  // arrow keys move it when its bar has focus
  const d = e.shiftKey ? 40 : 10;
  const m = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
  if (!m) return;
  e.preventDefault();
  box.value = { ...box.value, x: box.value.x + m[0], y: box.value.y + m[1] };
  clamp();
  save();
}
const onResize = () => clamp();
onMounted(() => {
  clamp();
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('pointermove', move);
});
</script>
<template>
  <div
    v-if="cam"
    class="fc card"
    role="dialog"
    :aria-label="cam.name"
    :style="{ left: box.x + 'px', top: box.y + 'px', width: box.w + 'px' }"
  >
    <div
      class="bar"
      tabindex="0"
      :aria-label="t('Move with the arrow keys')"
      @pointerdown="down($event, 'move')"
      @keydown="key"
    >
      <Icon name="grip" :size="14" />
      <b class="grow">{{ cam.name }}</b>
      <button
        class="btn clear ibtn sm"
        :aria-label="t('Back to the card')"
        :data-tip="t('Back to the card')"
        @pointerdown.stop
        @click="state.pip = null"
      >
        <Icon name="x" :size="15" />
      </button>
    </div>
    <div class="vw"><WebcamView :cam="cam" :overlay="false" /></div>
    <span class="rs" :aria-label="t('Resize')" @pointerdown="down($event, 'size')"></span>
  </div>
</template>
<style scoped>
.fc {
  position: fixed;
  z-index: 95; /* over the pages and the side menu, under dialogs and pop-ups */
  padding: 0;
  gap: 0;
  overflow: hidden;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
  border: 1px solid var(--bd);
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 4px 0 10px;
  cursor: grab;
  touch-action: none;
  user-select: none;
  font-size: 13px;
  color: var(--mu);
}
.bar:active {
  cursor: grabbing;
}
.bar b {
  color: var(--tx);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vw {
  aspect-ratio: 16 / 9;
  background: #000;
}
.vw > :deep(*) {
  height: 100%;
}
.rs {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
  touch-action: none;
  background: linear-gradient(
    135deg,
    transparent 50%,
    var(--mu2) 50%,
    var(--mu2) 60%,
    transparent 60%,
    transparent 70%,
    var(--mu2) 70%,
    var(--mu2) 80%,
    transparent 80%
  );
}
</style>
