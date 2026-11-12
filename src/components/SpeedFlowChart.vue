<script setup>
// Speed and flow over the last minutes: the toolhead's live speed (mm/s) and the volumetric flow (mm³/s) from
// Klipper's motion_report, sampled every second while this card is on the page. Two lines on one time axis, each
// with its own scale; the newest values in the header.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
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
  timer = setInterval(sample, 1000);
});
onBeforeUnmount(() => clearInterval(timer));
const W = 600,
  H = 160;
const scale = (i) => {
  const max = Math.max(1, ...pts.value.map((p) => p[i]));
  // a round top for the axis: 10, 20, 50, 100...
  const steps = [5, 10, 20, 25, 50, 100, 150, 200, 300, 400, 500, 750, 1000];
  return steps.find((s) => s >= max) || Math.ceil(max / 500) * 500;
};
const top = computed(() => [scale(1), scale(2)]);
function line(i) {
  const l = pts.value;
  if (l.length < 2) return '';
  const t1 = l[l.length - 1][0];
  const k = top.value[i - 1];
  return l
    .map(
      (p, j) => `${j ? 'L' : 'M'}${(((p[0] - (t1 - SPAN)) / SPAN) * W).toFixed(1)},${(H - (p[i] / k) * H).toFixed(1)}`,
    )
    .join('');
}
const last = computed(() => pts.value[pts.value.length - 1] || [0, 0, 0]);
</script>
<template>
  <section class="card sfc">
    <div class="card-h">
      <CardTitle :text="t('Speed & flow graph')" />
      <span class="lg mono"
        ><i class="k1"></i>{{ Math.round(last[1]) }} mm/s <i class="k2"></i>{{ last[2].toFixed(1) }} mm³/s</span
      >
      <CardCollapse />
    </div>
    <div class="ch">
      <span class="ax l mono">{{ top[0] }}</span
      ><span class="ax r mono">{{ top[1] }}</span>
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
        <line v-for="g in 3" :key="g" x1="0" :x2="W" :y1="(H / 4) * g" :y2="(H / 4) * g" class="gl" />
        <path :d="line(1)" class="s1" vector-effect="non-scaling-stroke" />
        <path :d="line(2)" class="s2" vector-effect="non-scaling-stroke" />
      </svg>
      <span class="tl mono">-5 min</span><span class="tr mono">{{ t('now') }}</span>
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
</style>
