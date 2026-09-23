<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, shallowRef } from 'vue'
import Icon from '../components/Icon.vue'
import ObjectMap from '../components/ObjectMap.vue'
import RangeSlider from '../components/RangeSlider.vue'
import Toggle from '../components/Toggle.vue'
import { state, S, layerInfo, printState, toast } from '../store'
import { api } from '../api/moonraker'
import { t } from '../i18n'
const emit = defineEmits(['exclude'])
const eo = computed(() => S('exclude_object'))
const canvas = ref(null)
const wrap = ref(null)
const preview = shallowRef(null)
const file = ref('')
const loading = ref('')
const layers = ref(0)
const layer = ref(0)
const follow = ref(true)
const travel = ref(false)
const tab = ref('3d')
let offsets = null
let lineLayer = null
const files = ref([])

async function ensurePreview() {
  if (preview.value) return preview.value
  const GP = await import('gcode-preview')
  const th = S('toolhead')
  const max = th.axis_maximum || [300, 300, 300]
  preview.value = GP.init({
    canvas: canvas.value,
    buildVolume: { x: max[0], y: max[1], z: Math.min(max[2], 400) },
    backgroundColor: '#0b0c0e',
    extrusionColor: state.settings.accent || '#ff6b1a',
    topLayerColor: '#ffd166',
    lastSegmentColor: '#ffffff',
    travelColor: '#5aa9ff',
    renderTravel: false,
    initialCameraPosition: [0, max[1] * 1.6, max[1] * 1.4],
  })
  return preview.value
}
async function load(fn) {
  if (!fn) return
  file.value = fn
  loading.value = t('Downloading…')
  try {
    const text = await api.getText(`/server/files/gcodes/${fn.split('/').map(encodeURIComponent).join('/')}`)
    loading.value = t('Parsing…')
    await nextTick()
    await new Promise((r) => setTimeout(r, 30))
    const p = await ensurePreview()
    p.clear?.()
    p.processGCode(text)
    // byte offset of each line, for following the print by file position
    let n = 1
    for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) n++
    offsets = new Uint32Array(n)
    let i = 0
    for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) offsets[++i] = k + 1
    lineLayer = p.layers.map((l) => l.lineNumber)
    layers.value = p.layers.length
    layer.value = layers.value
    update()
  } catch (e) { toast(t('Viewer: {err}', { err: e.message }), 'error') }
  loading.value = ''
}
function update() {
  const p = preview.value
  if (!p) return
  p.endLayer = Math.max(1, layer.value)
  p.renderTravel = travel.value
  p.render()
}
const curPrint = computed(() => S('print_stats').filename)
const active = computed(() => ['printing', 'paused'].includes(printState.value))
const printLayer = computed(() => {
  if (!offsets || !lineLayer || file.value !== curPrint.value) return null
  const pos = S('virtual_sdcard').file_position || 0
  let lo = 0, hi = offsets.length - 1
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (offsets[m] <= pos) lo = m; else hi = m - 1 }
  let li = 0
  for (let k = 0; k < lineLayer.length; k++) if (lineLayer[k] <= lo) li = k; else break
  return li + 1
})
watch(printLayer, (v) => { if (follow.value && v && v !== layer.value) { layer.value = v; update() } })
watch(travel, update)
function onResize() { preview.value?.resize() }
let ro
onMounted(async () => {
  ro = new ResizeObserver(onResize); ro.observe(wrap.value)
  try { files.value = (await api.call('server.files.list', { root: 'gcodes' })).sort((a, b) => b.modified - a.modified).slice(0, 60).map((f) => f.path) } catch {}
  if (curPrint.value) load(curPrint.value)
})
onBeforeUnmount(() => { ro?.disconnect(); preview.value?.dispose?.() })
</script>
<template>
  <div class="split" style="min-height:calc(100vh - 208px)">
    <section class="card grow">
      <div class="card-h">
        <h2>{{ t('G-code Viewer') }}</h2>
        <div class="acts">
          <div class="seg" style="width:160px"><button :class="{ on: tab === '3d' }" @click="tab = '3d'">3D</button><button :class="{ on: tab === 'map' }" @click="tab = 'map'">{{ t('Objects') }}</button></div>
          <button class="btn out" :disabled="!curPrint" @click="load(curPrint)"><Icon name="download" :size="16" />{{ t('Load current job') }}</button>
          <select class="input" style="height:34px;max-width:260px" :value="file" @change="load($event.target.value)" :aria-label="t('Open file')">
            <option value="" disabled>{{ t('Open file…') }}</option>
            <option v-for="f in files" :key="f" :value="f">{{ f }}</option>
          </select>
        </div>
      </div>
      <div v-show="tab === '3d'" ref="wrap" class="cv">
        <canvas ref="canvas"></canvas>
        <div v-if="loading" class="ld"><Icon name="refresh" :size="20" class="spin" />{{ loading }}</div>
        <div v-else-if="!file" class="ld">{{ t('Load the current job or pick a file') }}</div>
        <span v-if="file" class="fn mono">{{ file }}</span>
      </div>
      <ObjectMap v-if="tab === 'map'" style="flex:1;min-height:400px" @pick="emit('exclude')" />
      <div v-if="layers && tab === '3d'" class="row" style="gap:12px">
        <div class="grow"><RangeSlider :label="t('Layer')" :min="1" :max="layers" :model-value="layer" :display="layer + ' / ' + layers" @update:model-value="layer = $event; follow = false; update()" /></div>
      </div>
    </section>
    <div class="side-col">
      <section class="card">
        <div class="card-h"><h2>{{ t('Print') }}</h2><span class="chip" style="text-transform:capitalize"><i></i>{{ t(printState) }}</span></div>
        <div class="row" style="align-items:baseline"><b style="font-size:32px">{{ layerInfo.cur }}</b><span class="mono mu">/ {{ layerInfo.total || '--' }} · Z {{ (S('gcode_move').gcode_position?.[2] ?? 0).toFixed(2) }}</span></div>
        <div class="row" style="justify-content:space-between"><span>{{ t('Follow print') }}</span><Toggle v-model="follow" :label="t('Follow print')" @update:model-value="$event && printLayer && (layer = printLayer, update())" /></div>
        <div class="row" style="justify-content:space-between"><span>{{ t('Show travel moves') }}</span><Toggle v-model="travel" :label="t('Show travel')" /></div>
      </section>
      <section class="card">
        <div class="card-h"><h2>{{ t('Objects') }}</h2><button class="btn out" :disabled="!eo.objects?.length || !active" @click="emit('exclude')"><Icon name="excl" :size="16" />{{ t('Exclude…') }}</button></div>
        <div v-if="!eo.objects?.length" class="empty">{{ t('No object labels in this print.') }}</div>
        <div v-for="o in eo.objects" :key="o.name" class="row" style="height:32px">
          <span class="mono grow" :style="{ fontSize: '12px', color: eo.excluded_objects?.includes(o.name) ? 'var(--mu)' : o.name === eo.current_object ? 'var(--ac)' : 'var(--tx)', textDecoration: eo.excluded_objects?.includes(o.name) ? 'line-through' : 'none' }">{{ o.name }}</span>
        </div>
      </section>
    </div>
  </div>
</template>
<style scoped>
.mu { color: var(--mu); }
.cv { position: relative; flex: 1; min-height: 460px; background: #0b0c0e; border-radius: 8px; overflow: hidden; }
.cv canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.ld { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--mu); pointer-events: none; }
.fn { position: absolute; top: 10px; left: 12px; font-size: 12px; color: var(--mu); }
</style>
