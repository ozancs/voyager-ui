<script setup>
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { state, S, printState, progress, printTimes, layerInfo, fmtTime, gcode } from '../store'
import { api } from '../api/moonraker'
import { go } from '../router'
const emit = () => { state.showExclude = true }
const ask = ref(false)
const ps = computed(() => S('print_stats'))
const active = computed(() => ['printing', 'paused'].includes(printState.value))
const thumb = computed(() => {
  const m = state.currentMeta
  if (!m?.thumbnails?.length) return null
  const t = [...m.thumbnails].sort((a, b) => b.width - a.width)[0]
  const dir = (ps.value.filename || '').split('/').slice(0, -1).join('/')
  return api.url(`/server/files/gcodes/${dir ? dir + '/' : ''}${encodeURI(t.relative_path)}`)
})
const color = computed(() => ({ printing: 'var(--ok)', paused: 'var(--wn)', error: 'var(--dg)', complete: 'var(--bl)', cancelled: 'var(--mu)' }[printState.value] || 'var(--mu)'))
const eo = computed(() => S('exclude_object'))
const remaining = computed(() => (eo.value.objects?.length || 0) - (eo.value.excluded_objects?.length || 0))
const z = computed(() => (S('gcode_move').gcode_position?.[2] ?? 0).toFixed(2))
const filament = computed(() => ((ps.value.filament_used || 0) / 1000).toFixed(2) + ' m')
const eta = computed(() => printTimes.value.eta ? printTimes.value.eta.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '--')
function cancel() { ask.value = false; gcode('CANCEL_PRINT') }
function reprint() { if (ps.value.filename) api.call('printer.print.start', { filename: ps.value.filename }) }
</script>
<template>
  <section class="card pc">
    <div class="th">
      <img v-if="thumb" :src="thumb" alt="" />
      <Icon v-else name="cube" :size="44" :stroke="1.6" />
    </div>
    <div class="grow col" style="gap:10px">
      <div class="row" style="gap:10px;min-width:0">
        <span class="chip" :style="{ color }"><i></i>{{ printState }}</span>
        <span class="fn">{{ ps.filename || 'No file loaded' }}</span>
      </div>
      <div class="stats">
        <div><span class="lbl">Layer</span><b class="mono">{{ layerInfo.cur }} / {{ layerInfo.total || '--' }}</b></div>
        <div><span class="lbl">Z</span><b class="mono">{{ z }} mm</b></div>
        <div><span class="lbl">Filament</span><b class="mono">{{ filament }}</b></div>
        <div><span class="lbl">Print time</span><b class="mono">{{ fmtTime(ps.print_duration) }}</b></div>
        <div><span class="lbl">Left</span><b class="mono">{{ active ? fmtTime(printTimes.left) : '--' }}</b></div>
        <div><span class="lbl">ETA</span><b class="mono">{{ active ? eta : '--' }}</b></div>
      </div>
      <div class="row" style="gap:12px"><div class="bar grow" style="height:12px"><div :style="{ width: progress * 100 + '%' }"></div></div><b class="mono" style="font-size:16px">{{ (progress * 100).toFixed(1) }}%</b></div>
    </div>
    <div class="acts">
      <template v-if="active">
        <div class="row">
          <button v-if="printState === 'paused'" class="btn lg acc grow" @click="gcode('RESUME')"><Icon name="play" :stroke="2.4" />Resume</button>
          <button v-else class="btn lg grow" @click="gcode('PAUSE')"><Icon name="pause" :stroke="2.4" />Pause</button>
          <button class="btn lg dg grow" @click="ask = true"><Icon name="sq" :stroke="2.4" />Cancel</button>
        </div>
        <button class="btn lg out" :disabled="!eo.objects?.length" @click="emit()"><Icon name="excl" :size="18" :stroke="2.4" />Exclude Object<span v-if="eo.objects?.length" class="mono cnt">{{ remaining }}/{{ eo.objects.length }}</span></button>
      </template>
      <template v-else>
        <button class="btn lg acc" @click="go('files')"><Icon name="file" :stroke="2.4" />Choose file</button>
        <button class="btn lg" :disabled="!ps.filename" @click="reprint"><Icon name="refresh" :stroke="2.4" />Reprint</button>
      </template>
    </div>
  </section>
  <Modal v-if="ask" title="Cancel print?" @close="ask = false">
    <p style="margin:0" class="mu">The current print will be cancelled.</p>
    <template #foot><button class="btn lg" @click="ask = false">Keep printing</button><button class="btn lg dgf" @click="cancel">Cancel print</button></template>
  </Modal>
</template>
<style scoped>
.pc { flex-direction: row; align-items: center; gap: 16px; }
.th { width: 96px; height: 96px; flex-shrink: 0; border-radius: 8px; background: var(--s2); border: 1px solid var(--bd); display: flex; align-items: center; justify-content: center; color: var(--mu); overflow: hidden; }
.th img { width: 100%; height: 100%; object-fit: contain; }
.fn { font-size: 20px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip { text-transform: capitalize; }
.stats { display: flex; gap: 24px; flex-wrap: wrap; }
.stats > div { display: flex; flex-direction: column; gap: 2px; }
.stats b { font-size: 15px; }
.acts { display: flex; flex-direction: column; gap: 8px; width: 230px; flex-shrink: 0; }
.cnt { font-size: 11px; padding: 2px 6px; border-radius: 6px; background: var(--s2); color: var(--tx); }
@media (max-width: 900px) { .pc { flex-wrap: wrap; } .acts { width: 100%; } }
</style>
