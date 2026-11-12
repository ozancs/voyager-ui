<script setup>
// Speed and flow over the last minutes: the toolhead's live speed (mm/s) and the volumetric flow (mm³/s) from
// Klipper's motion_report, sampled four times a second. Two lines on one time axis, each with its own scale; the
// newest values in the header. The wheel zooms the time axis around the pointer (never the values), dragging
// moves along it, a double click or Live goes back to the whole five minutes.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import CardTitle from './CardTitle.vue';
import CardCollapse from './CardCollapse.vue';
import { S } from '../store';
import { t } from '../i18n';
const SPAN = 300; // seconds shown
const pts = ref([]); // [t, speed, flow]
// samples go on while other pages are open: kept outside the card
const buf = (window.__speedFlow ||= []);
function sample() {
  const mr = S('motion_report');
  const d = +(S('configfile').settings?.extruder?.filament_diameter || 1.75);
  const v = Math.abs(mr.live_velocity || 0);
  const f = Math.max(0, mr.live_extruder_velocity || 0) * Math.PI * (d / 2) ** 2;
  const now = Date.now() / 1000;
  buf.push([now, v, f]);
  while (buf.length && buf[0][0] < now - SPAN) buf.shift();
  pts.value = buf.slice();
}
let timer;
onMounted(() => {
  sample();
  timer = setInterval(sample, 250);
});
onBeforeUnmount(() => clearInterval(timer));
const W = 600,
  H = 160;
// the window shown: `span` seconds ending `ago` seconds before the newest sample
const view = ref({ span: SPAN, ago: 0 });
const zoomed = computed(() => view.value.span < SPAN || view.value.ago > 0);
const t1 = computed(() => (pts.value.length ? pts.value[pts.value.length - 1][0] : Date.now() / 1000));
const shown = computed(() => {
  const b = t1.value - view.value.ago,
    a = b - view.value.span;
  // one sample either side, so the lines run to the edges
  const l = pts.value;
  let i = l.findIndex((p) => p[0] >= a);
  if (i < 0) return [];
  let j = l.length - 1;
  while (j > 0 && l[j - 1][0] > b) j--;
  return l.slice(Math.max(0, i - 1), j + 1);
});
const scale = (i) => {
  const max = Math.max(1, ...shown.value.map((p) => p[i]));
  // a round top for the axis: 10, 20, 50, 100...
  const steps = [5, 10, 20, 25, 50, 100, 150, 200, 300, 400, 500, 750, 1000];
  return steps.find((s) => s >= max) || Math.ceil(max / 500) * 500;
};
const top = computed(() => [scale(1), scale(2)]);
function line(i) {
  const l = shown.value;
  if (l.length < 2) return '';
  const b = t1.value - view.value.ago,
    a = b - view.value.span;
  const k = top.value[i - 1];
  return l
    .map(
      (p, j) => `${j ? 'L' : 'M'}${(((p[0] - a) / view.value.span) * W).toFixed(1)},${(H - (p[i] / k) * H).toFixed(1)}`,
    )
    .join('');
}
const fmtAgo = (s) =>
  s < 1 ? t('now') : s < 90 ? '-' + Math.round(s) + ' s' : '-' + (s / 60).toFixed(s < 600 ? 1 : 0) + ' min';
const leftLabel = computed(() => fmtAgo(view.value.ago + view.value.span));
const rightLabel = computed(() => fmtAgo(view.value.ago));
const box = ref(null);
const frac = (x) => {
  const r = box.value.getBoundingClientRect();
  return Math.min(1, Math.max(0, (x - r.left) / r.width));
};
const clampView = (span, ago) => {
  span = Math.min(SPAN, Math.max(10, span));
  // never further back than the samples go
  const have = pts.value.length ? t1.value - pts.value[0][0] : 0;
  ago = Math.min(Math.max(0, Math.min(SPAN, have) - span), Math.max(0, ago));
  view.value = { span, ago };
};
function onWheel(e) {
  e.preventDefault();
  const f = frac(e.clientX);
  const { span, ago } = view.value;
  const ns = span * (e.deltaY > 0 ? 1.25 : 0.8);
  // the moment under the pointer stays under the pointer
  const at = ago + span * (1 - f);
  clampView(ns, at - ns * (1 - f));
}
let drag = null;
function onDown(e) {
  if (e.button !== 0 || !zoomed.value) return;
  drag = { x: e.clientX, ago: view.value.ago };
  e.currentTarget.setPointerCapture?.(e.pointerId);
}
function onMove(e) {
  if (!drag) return;
  const w = box.value.getBoundingClientRect().width || 1;
  clampView(view.value.span, drag.ago + ((e.clientX - drag.x) / w) * view.value.span);
}
const onUp = () => (drag = null);
const live = () => (view.value = { span: SPAN, ago: 0 });
const last = computed(() => pts.value[pts.value.length - 1] || [0, 0, 0]);
</script>
<template>
  <section class="card sfc">
    <div class="card-h">
      <CardTitle :text="t('Speed & flow graph')" />
      <button
        v-if="zoomed"
        class="btn ibtn sm acc"
        :aria-label="t('Live')"
        :data-tip="t('Back to the last five minutes')"
        @click="live"
      >
        <Icon name="play" :size="13" />
      </button>
      <span class="lg mono"
        ><i class="k1"></i>{{ Math.round(last[1]) }} mm/s <i class="k2"></i>{{ last[2].toFixed(1) }} mm³/s</span
      >
      <CardCollapse />
    </div>
    <div
      ref="box"
      class="ch"
      :class="{ pan: zoomed }"
      @wheel="onWheel"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @dblclick="live"
    >
      <span class="ax l mono">{{ top[0] }}</span
      ><span class="ax r mono">{{ top[1] }}</span>
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
        <line v-for="g in 3" :key="g" x1="0" :x2="W" :y1="(H / 4) * g" :y2="(H / 4) * g" class="gl" />
        <path :d="line(1)" class="s1" vector-effect="non-scaling-stroke" />
        <path :d="line(2)" class="s2" vector-effect="non-scaling-stroke" />
      </svg>
      <span class="tl mono">{{ leftLabel }}</span
      ><span class="tr mono">{{ rightLabel }}</span>
    </div>
  </section>
</template>
<style scoped>
.sfc {
  min-height: 0;
}
.sfc > .card-h {
  flex-wrap: nowrap;
}
.lg {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 12px;
  color: var(--mu);
}
.lg i {
  width: 10px;
  height: 3px;
  border-radius: 2px;
  display: inline-block;
}
.k1,
.s1 {
  background: var(--cool);
  stroke: var(--cool);
}
.k2,
.s2 {
  background: var(--heat);
  stroke: var(--heat);
}
.k2 {
  margin-left: 6px;
}
.ch {
  position: relative;
  flex: 1;
  min-height: 90px;
  padding: 0 28px 16px;
}
svg {
  width: 100%;
  height: 100%;
  display: block;
}
path {
  fill: none;
  stroke-width: 1.8;
}
.gl {
  stroke: var(--grid);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.ax,
.tl,
.tr {
  position: absolute;
  font-size: 10.5px;
  color: var(--mu2);
}
.ax {
  top: 0;
}
.ax.l {
  left: 0;
  color: var(--cool);
}
.ax.r {
  right: 0;
  color: var(--heat);
}
.tl {
  bottom: 0;
  left: 28px;
}
.tr {
  bottom: 0;
  right: 28px;
}
.ch {
  touch-action: pan-y;
  user-select: none;
}
.ch.pan {
  cursor: grab;
}
.ch.pan:active {
  cursor: grabbing;
}
</style>
