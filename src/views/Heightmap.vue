<script setup>
import { computed, ref } from 'vue'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import { defineAsyncComponent } from 'vue'
const Surface3D = defineAsyncComponent(() => import('../components/Surface3D.vue'))
import { S, gcode, isPrinting } from '../store'
import { t } from '../i18n'
const bm = computed(() => S('bed_mesh'))
const useProbed = ref(true)
const flat = ref(false)
const mode3d = ref(true)
const saveName = ref('')
const showSave = ref(false)
const matrix = computed(() => {
  const m = useProbed.value ? bm.value.probed_matrix : bm.value.mesh_matrix
  return m && m.length && m[0].length ? m : null
})
const stats = computed(() => {
  if (!matrix.value) return null
  const all = matrix.value.flat()
  const mn = Math.min(...all), mx = Math.max(...all)
  return { mn, mx, range: mx - mn, rows: matrix.value.length, cols: matrix.value[0].length }
})
function color(z) {
  const s = stats.value
  const lim = flat.value ? 0.1 : Math.max(Math.abs(s.mn), Math.abs(s.mx), 0.01)
  const f = Math.max(-1, Math.min(1, z / lim))
  const base = [46, 50, 56], hi = [255, 107, 26], lo = [56, 120, 255]
  const c = f >= 0 ? hi : lo
  const k = Math.abs(f)
  return `rgb(${base.map((b, i) => Math.round(b + (c[i] - b) * k)).join(',')})`
}
const rows = computed(() => (matrix.value ? [...matrix.value].reverse() : []))
const profiles = computed(() => Object.keys(bm.value.profiles || {}))
function doSave() {
  if (!saveName.value) return
  gcode(`BED_MESH_PROFILE SAVE="${saveName.value}"`)
  showSave.value = false
  saveName.value = ''
}
</script>
<template>
  <div class="split" style="min-height:calc(100vh / var(--zoom, 1) - 208px)">
    <section class="card grow">
      <div class="card-h">
        <h2>{{ t('Heightmap') }} · {{ bm.profile_name || t('no mesh loaded') }}</h2>
        <div class="acts"><div class="seg" style="width:130px"><button :class="{ on: mode3d }" @click="mode3d = true">3D</button><button :class="{ on: !mode3d }" @click="mode3d = false">2D</button></div><div class="seg" style="width:180px"><button :class="{ on: useProbed }" @click="useProbed = true">{{ t('Probed') }}</button><button :class="{ on: !useProbed }" @click="useProbed = false">{{ t('Mesh') }}</button></div></div>
      </div>
      <div v-if="!matrix" class="empty" style="flex:1;display:flex;align-items:center;justify-content:center">{{ t('No bed mesh loaded. Calibrate or load a profile.') }}</div>
      <div v-else-if="mode3d" style="flex:1;min-height:0"><Surface3D :z="matrix" :min="bm.mesh_min" :max="bm.mesh_max" :lim="flat ? 0.1 : Math.max(Math.abs(stats.mn), Math.abs(stats.mx), 0.01)" /></div>
      <div v-else class="hm">
        <div class="grid" :style="{ gridTemplateColumns: `repeat(${stats.cols}, minmax(0, 1fr))` }">
          <template v-for="(r, ri) in rows" :key="ri">
            <div v-for="(z, ci) in r" :key="ci" class="cell mono" :style="{ background: color(z) }" :title="z.toFixed(4)">{{ stats.cols <= 15 ? (z >= 0 ? '+' : '') + z.toFixed(2) : '' }}</div>
          </template>
        </div>
        <div class="legend"><span class="mono">{{ flat ? '+0.100' : '+' + Math.max(Math.abs(stats.mn), Math.abs(stats.mx)).toFixed(3) }}</span><div class="lgd"></div><span class="mono">{{ flat ? '-0.100' : '-' + Math.max(Math.abs(stats.mn), Math.abs(stats.mx)).toFixed(3) }}</span></div>
      </div>
      <div class="mono mu" style="font-size:12px" v-if="matrix && !mode3d">{{ t('front of bed is at the bottom') }}</div>
    </section>
    <div class="side-col">
      <section class="card">
        <div class="card-h"><h2>{{ t('Mesh') }}</h2></div>
        <div v-if="stats" class="st">
          <div><span class="lbl">{{ t('Max') }}</span><b class="mono" style="color:var(--ac)">{{ stats.mx.toFixed(3) }}</b></div>
          <div><span class="lbl">{{ t('Min') }}</span><b class="mono" style="color:var(--bl)">{{ stats.mn.toFixed(3) }}</b></div>
          <div><span class="lbl">{{ t('Range') }}</span><b class="mono">{{ stats.range.toFixed(3) }}</b></div>
          <div><span class="lbl">{{ t('Points') }}</span><b class="mono">{{ stats.cols }}×{{ stats.rows }}</b></div>
        </div>
        <div class="g2">
          <button class="btn lg acc" :disabled="isPrinting" @click="gcode('BED_MESH_CALIBRATE')"><Icon name="mesh" :stroke="2.4" />{{ t('Calibrate') }}</button>
          <button class="btn lg" :disabled="!bm.profile_name" @click="gcode('BED_MESH_CLEAR')"><Icon name="x" :stroke="2.4" />{{ t('Clear') }}</button>
        </div>
      </section>
      <section class="card">
        <div class="card-h"><h2>{{ t('Profiles') }}</h2><button class="btn" :disabled="!matrix" @click="showSave = true"><Icon name="save" :size="16" />{{ t('Save as') }}</button></div>
        <div v-if="!profiles.length" class="empty">{{ t('No saved profiles') }}</div>
        <div v-for="p in profiles" :key="p" class="pr">
          <b class="grow">{{ p }}</b>
          <span v-if="p === bm.profile_name" class="chip" style="color:var(--ok)"><i></i>{{ t('Active') }}</span>
          <button v-else class="btn" @click="gcode(`BED_MESH_PROFILE LOAD=${p}`)">{{ t('Load') }}</button>
          <button class="btn clear ibtn sm" :aria-label="t('Remove')" @click="gcode(`BED_MESH_PROFILE REMOVE=${p}`)"><Icon name="trash" :size="16" /></button>
        </div>
        <span class="mu" style="font-size:12px">{{ t('Removing or saving a profile needs SAVE_CONFIG to persist.') }}</span>
      </section>
      <section class="card">
        <div class="card-h"><h2>{{ t('View') }}</h2></div>
        <div class="row" style="justify-content:space-between"><span>{{ t('Fixed scale ±0.1 mm') }}</span><button class="toggle" :class="{ on: flat }" @click="flat = !flat" :aria-label="t('Fixed scale')"><span></span></button></div>
      </section>
    </div>
  </div>
  <Modal v-if="showSave" :title="t('Save mesh profile')" @close="showSave = false">
    <input v-model="saveName" class="input" :placeholder="t('profile name')" :aria-label="t('Profile name')" @keydown.enter="doSave" />
    <template #foot><button class="btn lg" @click="showSave = false">{{ t('Cancel') }}</button><button class="btn lg acc" @click="doSave">{{ t('Save') }}</button></template>
  </Modal>
</template>
<style scoped>
.hm { flex: 1; display: flex; align-items: center; justify-content: center; gap: 20px; min-height: 0; }
.grid { display: grid; gap: 3px; width: min(100%, 620px); }
.cell { aspect-ratio: 1; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #f2f2ef; }
.legend { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11px; color: var(--mu); }
.lgd { width: 14px; height: 360px; border-radius: 7px; background: linear-gradient(#ff6b1a, #2e3238, #3878ff); }
.st { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.st > div { display: flex; flex-direction: column; gap: 4px; padding: 12px; background: var(--s2); border-radius: 10px; }
.st b { font-size: 20px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pr { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--bd); }
.mu { color: var(--mu); }
</style>
