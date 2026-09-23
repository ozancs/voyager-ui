<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import { S, gcode, isPrinting } from '../store'
import { go } from '../router'
const bm = computed(() => S('bed_mesh'))
const m = computed(() => { const x = bm.value.probed_matrix; return x?.length && x[0].length ? x : null })
const st = computed(() => { if (!m.value) return null; const a = m.value.flat(); const mn = Math.min(...a), mx = Math.max(...a); return { mn, mx, lim: Math.max(Math.abs(mn), Math.abs(mx), 0.01) } })
function col(z) {
  const t = Math.max(-1, Math.min(1, z / st.value.lim)), base = [46, 50, 56], c = t >= 0 ? [255, 107, 26] : [56, 120, 255], k = Math.abs(t)
  return `rgb(${base.map((b, i) => Math.round(b + (c[i] - b) * k)).join(',')})`
}
</script>
<template>
  <section class="card">
    <div class="card-h"><h2>Bed Mesh</h2><div class="acts"><button class="btn" :disabled="isPrinting" @click="gcode('BED_MESH_CALIBRATE')"><Icon name="mesh" :size="16" />Calibrate</button><button class="btn" aria-label="Open heightmap" @click="go('heightmap')"><Icon name="ext" :size="16" /></button></div></div>
    <div v-if="!m" class="empty">No mesh loaded</div>
    <template v-else>
      <div class="g" :style="{ gridTemplateColumns: `repeat(${m[0].length}, 1fr)` }"><template v-for="(r, ri) in [...m].reverse()" :key="ri"><div v-for="(z, ci) in r" :key="ci" :style="{ background: col(z) }" :title="z.toFixed(3)"></div></template></div>
      <div class="row mono" style="justify-content:space-between;font-size:12px"><span>{{ bm.profile_name }}</span><span>range {{ (st.mx - st.mn).toFixed(3) }}</span></div>
    </template>
  </section>
</template>
<style scoped>
.g { flex: 1; min-height: 0; display: grid; gap: 2px; }
.g > div { border-radius: 2px; min-height: 4px; }
</style>
