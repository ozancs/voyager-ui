<script setup>
import SensorPicker from './SensorPicker.vue'
import { computed } from 'vue'
import { state, sensors, hist } from '../store'
import { t } from '../i18n'
const COLORS = ['var(--ac)', '#5aa9ff', '#3dd68c', '#f5c451', '#c38bff', '#ff7ab6', '#4fd1c5', '#a3a7ae', '#e8a87c', '#9bd5ff']
const colorOf = (i) => COLORS[i % COLORS.length]
const W = 600, H = 160
const range = computed(() => state.settings.tempRange || 600)
// auto scale to the visible data (values + targets that are set)
const scale = computed(() => {
  state.histTick
  let lo = Infinity, hi = -Infinity
  for (const s of sensors.value) {
    const h = hist[s.name]
    if (!h) continue
    for (const v of h.t.slice(-range.value)) { if (v < lo) lo = v; if (v > hi) hi = v }
    for (const v of h.target.slice(-range.value)) if (v > 0) { if (v < lo) lo = v; if (v > hi) hi = v }
  }
  if (!isFinite(lo)) { lo = 0; hi = 100 }
  const span = Math.max(hi - lo, 10)
  const raw = span / 5
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw)
  const min = Math.max(0, Math.floor((lo - span * 0.05) / step) * step)
  const max = Math.ceil((hi + span * 0.05) / step) * step
  const ticks = []
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(3))
  return { min, max, ticks }
})
const y = (v) => H - ((v - scale.value.min) / (scale.value.max - scale.value.min)) * H
const lines = computed(() => {
  state.histTick
  return sensors.value.map((s, i) => {
    const h = hist[s.name]
    if (!h || !h.t.length) return null
    const t = h.t.slice(-range.value), tg = h.target.slice(-range.value)
    const n = range.value, off = n - t.length
    // thin out to ~300 points. The kept samples are chosen by their absolute index (h.n counts every sample),
    // so the same samples stay on screen as the graph scrolls. Picking every step-th point from the start of the
    // window made the kept points change every second and the line jumped on 10m and 20m.
    const step = Math.max(1, Math.round(n / 300))
    const first = (h.n ?? h.t.length) - t.length // absolute index of t[0]
    const ks = []
    for (let k = (step - (first % step)) % step; k < t.length; k += step) ks.push(k)
    if (ks[ks.length - 1] !== t.length - 1) ks.push(t.length - 1) // always end at the current value
    let d = '', dt = ''
    for (const k of ks) {
      const x = ((off + k) / (n - 1)) * W
      d += (d ? 'L' : 'M') + x.toFixed(1) + ',' + y(t[k]).toFixed(1)
      if ((s.isHeater || s.isTempFan) && tg[k] > 0) dt += (dt ? 'L' : 'M') + x.toFixed(1) + ',' + y(tg[k]).toFixed(1)
    }
    return { name: s.name, d, dt, color: colorOf(i) }
  }).filter(Boolean)
})
</script>
<template>
  <section class="card">
    <div class="card-h">
      <h2>{{ t('Temperature Graph') }}</h2>
      <div class="acts"><div class="seg" style="width:180px"><button v-for="r in [300, 600, 1200]" :key="r" :class="{ on: range === r }" @click="state.settings.tempRange = r">{{ r / 60 }}m</button></div><SensorPicker lines /></div>
    </div>
    <div class="lg"><span v-for="(s, i) in sensors" :key="s.name"><i :style="{ background: colorOf(i) }"></i>{{ s.label }} <b class="mono">{{ s.temperature?.toFixed(1) }}°</b></span></div>
    <div class="chart">
      <div class="plot">
        <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" :aria-label="t('Temperature graph')">
          <line v-for="g in scale.ticks" :key="g" x1="0" :x2="W" :y1="y(g)" :y2="y(g)" stroke="var(--grid)" stroke-width="1" vector-effect="non-scaling-stroke" />
          <path v-for="l in lines" :key="l.name + 't'" v-show="l.dt" :d="l.dt" fill="none" :stroke="l.color" stroke-width="1" stroke-dasharray="4 4" opacity=".5" vector-effect="non-scaling-stroke" />
          <path v-for="l in lines" :key="l.name" :d="l.d" fill="none" :stroke="l.color" :stroke-width="state.settings.graphLine || 2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        </svg>
        <span v-for="g in scale.ticks" :key="'l' + g" class="yl mono" :style="{ top: (y(g) / H) * 100 + '%' }">{{ g }}°</span>
      </div>
    </div>
  </section>
</template>
<style scoped>
.chart { position: relative; flex: 1; min-height: 80px; padding-left: 38px; }
.plot { position: relative; height: 100%; }
.plot svg { width: 100%; height: 100%; display: block; overflow: visible; }
.yl { position: absolute; left: -38px; width: 32px; text-align: right; transform: translateY(-50%); font-size: 10px; color: var(--mu2); }
.lg { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; font-weight: 700; color: var(--mu); }
.lg i { display: inline-block; width: 10px; height: 10px; border-radius: 5px; margin-right: 6px; vertical-align: -1px; }
.lg b { color: var(--tx); margin-left: 4px; }
</style>
