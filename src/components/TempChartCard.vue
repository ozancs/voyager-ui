<script setup>
// Temperature graph drawn as SVG. Ranges from 5 minutes to 24 hours: the short ones come from the store's 1-second
// buffers (hist), the long ones from the long history kept in this browser (temphist.js, one sample per 15 s).
// Mouse wheel or pinch zooms the time axis around the pointer, drag pans into the past, "Live" (or a double
// click) comes back to now. Hovering shows the values at that time in the legend. Sensors picked with the eye
// button, dashed lines for targets.
import SensorPicker from './SensorPicker.vue';
import Icon from './Icon.vue';
import { computed, ref, onBeforeUnmount } from 'vue';
import { state, sensors, hist } from '../store';
import { longHist, STEP, MAX_AGE, oldestLong } from '../temphist';
import { t } from '../i18n';
import { sensorColor } from '../sensorStyle';
const colorOf = (i, name) => sensorColor(state.settings.sensorColors, name, i);
const W = 600,
  H = 160;
const RANGES = [300, 600, 1200, 3600, 21600, 86400];
const rangeLabel = (r) => (r >= 3600 ? r / 3600 + 'h' : r / 60 + 'm');
const SHORT = 1200; // seconds the 1-second buffers hold
// the window: span seconds ending `end` seconds ago (0 = now). zoom overrides the chosen range while set.
const zoom = ref(null);
const range = computed(() => state.settings.tempRange || 600);
const span = computed(() => zoom.value?.span || range.value);
const end = computed(() => zoom.value?.end || 0);
const live = computed(() => !zoom.value || zoom.value.end === 0);
function pickRange(r) {
  state.settings.tempRange = r;
  zoom.value = null;
}
function goLive() {
  zoom.value = zoom.value && zoom.value.span !== range.value ? { span: zoom.value.span, end: 0 } : null;
}

// one series for the window: [{a: seconds ago, v, g}], thinned to ~300 points at fixed positions so the line does
// not jitter as time passes; `brk` marks a gap in the long history (nothing recorded in between)
function series(name) {
  const sp = span.value,
    en = end.value;
  const out = [];
  const h = hist[name];
  if (sp + en <= SHORT && h && h.t.length) {
    const len = h.t.length;
    const first = (h.n ?? len) - len; // absolute index of t[0]
    const step = Math.max(1, Math.round(sp / 300));
    const k0 = Math.max(0, len - 1 - (en + sp)),
      k1 = len - 1 - Math.floor(en);
    for (let k = k0; k <= k1; k++) {
      if ((first + k) % step && k !== k1) continue;
      out.push({ a: len - 1 - k, v: h.t[k], g: h.target[k] });
    }
    return out;
  }
  const l = longHist[name];
  if (!l || !l.ts.length) return out;
  const now = Date.now() / 1000;
  const step = Math.max(1, Math.round(sp / STEP / 300));
  const tEnd = now - en,
    tStart = tEnd - sp;
  let prev = null;
  for (let k = 0; k < l.ts.length; k++) {
    const ts = l.ts[k];
    if (ts < tStart - STEP * step) continue;
    if (ts > tEnd) break;
    const last = k === l.ts.length - 1 || l.ts[k + 1] > tEnd;
    if (Math.floor(ts / STEP) % step && !last) continue;
    out.push({ a: now - ts, v: l.t[k], g: l.g[k], brk: prev != null && ts - prev > STEP * step * 3 });
    prev = ts;
  }
  return out;
}
const data = computed(() => {
  state.histTick;
  zoom.value;
  return sensors.value.map((s, i) => ({ s, i, pts: series(s.name) }));
});
// auto scale to the visible data (values + targets that are set)
const scale = computed(() => {
  let lo = Infinity,
    hi = -Infinity;
  for (const { pts } of data.value)
    for (const p of pts) {
      if (p.v < lo) lo = p.v;
      if (p.v > hi) hi = p.v;
      if (p.g > 0) {
        if (p.g < lo) lo = p.g;
        if (p.g > hi) hi = p.g;
      }
    }
  if (!isFinite(lo)) {
    lo = 0;
    hi = 100;
  }
  const sp = Math.max(hi - lo, 10);
  const raw = sp / 5;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw);
  const min = Math.max(0, Math.floor((lo - sp * 0.05) / step) * step);
  const max = Math.ceil((hi + sp * 0.05) / step) * step;
  const ticks = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(3));
  return { min, max, ticks };
});
const y = (v) => H - ((v - scale.value.min) / (scale.value.max - scale.value.min)) * H;
const x = (a) => Math.min(W, Math.max(0, W * (1 - (a - end.value) / span.value)));
const lines = computed(() =>
  data.value
    .map(({ s, i, pts }) => {
      if (!pts.length) return null;
      let d = '',
        dt = '',
        pen = false;
      for (const p of pts) {
        const px = x(p.a).toFixed(1);
        d += (d && !p.brk ? 'L' : 'M') + px + ',' + y(p.v).toFixed(1);
        if ((s.isHeater || s.isTempFan) && p.g > 0) {
          dt += (pen && !p.brk ? 'L' : 'M') + px + ',' + y(p.g).toFixed(1);
          pen = true;
        } else pen = false;
      }
      return { name: s.name, d, dt, color: colorOf(i, s.name) };
    })
    .filter(Boolean),
);
// time labels along the bottom, on round wall-clock times
const xticks = computed(() => {
  state.histTick;
  const sp = span.value;
  const step = [60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200].find((s) => sp / s <= 6) || 43200;
  const now = Date.now() / 1000;
  const tEnd = now - end.value,
    tStart = tEnd - sp;
  const out = [];
  for (let tk = Math.ceil(tStart / step) * step; tk <= tEnd; tk += step) {
    const px = x(now - tk);
    if (px < W * 0.03 || px > W * 0.97) continue;
    out.push({ x: px, label: clock(tk) });
  }
  return out;
});
const clock = (sec, day) =>
  new Date(sec * 1000).toLocaleTimeString(
    [],
    day ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' },
  );
const windowText = computed(() => {
  state.histTick;
  const now = Date.now() / 1000;
  const day = span.value >= 6 * 3600; // over a day the clock alone reads as "08:21 – 08:21"
  return clock(now - end.value - span.value, day) + ' – ' + clock(now - end.value, day);
});

// hover: values at the pointer's time shown in the legend
const hover = ref(null); // seconds ago
function valueAt(entry) {
  if (hover.value == null) return entry.s.temperature;
  let best = null;
  for (const p of entry.pts) if (!best || Math.abs(p.a - hover.value) < Math.abs(best.a - hover.value)) best = p;
  return best && Math.abs(best.a - hover.value) < span.value / 50 ? best.v : null;
}
const fmt = (v) => (v != null ? v.toFixed(1) + '°' : '--');

// zoom and pan
const plot = ref(null);
const maxAgo = () => {
  const o = oldestLong();
  return Math.max(SHORT, o ? Math.min(MAX_AGE, Date.now() / 1000 - o + STEP) : 0);
};
function setWindow(sp, en) {
  sp = Math.min(Math.max(sp, 60), MAX_AGE);
  en = Math.max(0, Math.min(en, Math.max(0, maxAgo() - sp)));
  zoom.value = { span: Math.round(sp), end: Math.round(en) };
}
const frac = (clientX) => {
  const r = plot.value.getBoundingClientRect();
  return Math.min(1, Math.max(0, (clientX - r.left) / (r.width || 1)));
};
function onWheel(e) {
  e.preventDefault();
  const f = frac(e.clientX);
  const ac = end.value + span.value * (1 - f); // seconds ago under the pointer stays put
  const sp = span.value * Math.exp(Math.sign(e.deltaY) * 0.25);
  setWindow(sp, ac - Math.min(Math.max(sp, 60), MAX_AGE) * (1 - f));
}
const ptrs = new Map();
let drag = null; // { end, x } at pointerdown, or { span, end, d, c } for a pinch
function onDown(e) {
  ptrs.set(e.pointerId, e.clientX);
  plot.value.setPointerCapture?.(e.pointerId);
  if (ptrs.size === 1) drag = { end: end.value, x: e.clientX, moved: false };
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    drag = { span: span.value, end: end.value, d: Math.abs(a - b) || 1, c: frac((a + b) / 2) };
  }
}
function onMove(e) {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, e.clientX);
  if (drag && ptrs.size === 2 && drag.d) {
    const [a, b] = [...ptrs.values()];
    const k = drag.d / (Math.abs(a - b) || 1);
    const ac = drag.end + drag.span * (1 - drag.c);
    const sp = Math.min(Math.max(drag.span * k, 60), MAX_AGE);
    setWindow(sp, ac - sp * (1 - drag.c));
    return;
  }
  if (drag && ptrs.size === 1 && drag.x != null) {
    const r = plot.value.getBoundingClientRect();
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 3) drag.moved = true;
    if (drag.moved) setWindow(span.value, drag.end + (dx / (r.width || 1)) * span.value);
    return;
  }
  if (e.pointerType === 'mouse') hover.value = end.value + span.value * (1 - frac(e.clientX));
}
function onUp(e) {
  ptrs.delete(e.pointerId);
  if (!ptrs.size) drag = null;
  else if (ptrs.size === 1) drag = { end: end.value, x: [...ptrs.values()][0], moved: true };
}
function onLeave() {
  hover.value = null;
}
onBeforeUnmount(() => ptrs.clear());
</script>
<template>
  <section class="card">
    <div class="card-h">
      <h2>{{ t('Temperature Graph') }}</h2>
      <div class="acts">
        <button v-if="!live" class="btn sm acc" @click="goLive"><Icon name="play" :size="14" />{{ t('Live') }}</button>
        <div class="seg rng">
          <!-- prettier-ignore -->
          <button v-for="r in RANGES" :key="r" :class="{ on: !zoom && range === r }" @click="pickRange(r)">{{ rangeLabel(r) }}</button>
        </div>
        <SensorPicker lines />
      </div>
    </div>
    <div class="lg">
      <span v-for="e in data" :key="e.s.name"
        ><i :style="{ background: colorOf(e.i, e.s.name) }"></i>{{ e.s.label }}
        <b class="mono">{{ fmt(valueAt(e)) }}</b></span
      >
      <span class="mono mu win">{{ hover != null ? clock(Date.now() / 1000 - hover) : windowText }}</span>
    </div>
    <div class="chart">
      <div
        class="plot"
        ref="plot"
        :class="{ drag: !!drag }"
        @wheel="onWheel"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @pointerleave="onLeave"
        @dblclick="pickRange(range)"
      >
        <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" :aria-label="t('Temperature graph')">
          <line
            v-for="g in scale.ticks"
            :key="g"
            x1="0"
            :x2="W"
            :y1="y(g)"
            :y2="y(g)"
            stroke="var(--grid)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <line
            v-for="tk in xticks"
            :key="'x' + tk.x"
            :x1="tk.x"
            :x2="tk.x"
            y1="0"
            :y2="H"
            stroke="var(--grid)"
            stroke-width="1"
            stroke-dasharray="2 4"
            vector-effect="non-scaling-stroke"
          />
          <path
            v-for="l in lines"
            :key="l.name + 't'"
            v-show="l.dt"
            :d="l.dt"
            fill="none"
            :stroke="l.color"
            stroke-width="1"
            stroke-dasharray="4 4"
            opacity=".5"
            vector-effect="non-scaling-stroke"
          />
          <path
            v-for="l in lines"
            :key="l.name"
            :d="l.d"
            fill="none"
            :stroke="l.color"
            :stroke-width="state.settings.graphLine || 2.5"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
          <line
            v-if="hover != null"
            :x1="x(hover)"
            :x2="x(hover)"
            y1="0"
            :y2="H"
            stroke="var(--mu)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <span v-for="g in scale.ticks" :key="'l' + g" class="yl mono" :style="{ top: (y(g) / H) * 100 + '%' }"
          >{{ g }}°</span
        >
        <span v-for="tk in xticks" :key="'xl' + tk.x" class="xl mono" :style="{ left: (tk.x / W) * 100 + '%' }">{{
          tk.label
        }}</span>
      </div>
    </div>
  </section>
</template>
<style scoped>
.chart {
  position: relative;
  flex: 1;
  min-height: 80px;
  padding-left: 38px;
  padding-bottom: 14px;
}
.plot {
  position: relative;
  height: 100%;
  touch-action: pan-y;
  cursor: crosshair;
  user-select: none;
}
.plot.drag {
  cursor: grabbing;
}
.plot svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}
.yl {
  position: absolute;
  left: -38px;
  width: 32px;
  text-align: right;
  transform: translateY(-50%);
  font-size: 10px;
  color: var(--mu2);
}
.xl {
  position: absolute;
  bottom: -14px;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--mu2);
  white-space: nowrap;
}
.rng {
  width: 240px;
}
.rng button {
  padding: 0 4px;
  min-width: 0;
}
.lg {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: 12px;
  font-weight: 700;
  color: var(--mu);
}
.lg i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 5px;
  margin-right: 6px;
  vertical-align: -1px;
}
.lg b {
  color: var(--tx);
  margin-left: 4px;
}
.win {
  margin-left: auto;
  font-weight: 500;
  font-size: 11px;
}
.mu {
  color: var(--mu);
}
@media (max-width: 720px) {
  .rng {
    width: 200px;
  }
}
</style>
