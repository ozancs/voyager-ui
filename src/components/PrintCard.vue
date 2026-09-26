<script setup>
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { state, S, printState, progress, printTimes, layerInfo, fmtTime, gcode, toast } from '../store'
import { api } from '../api/moonraker'
import { go } from '../router'
import { t } from '../i18n'
const emit = () => { state.showExclude = true }
const ask = ref(false)
const ps = computed(() => S('print_stats'))
const active = computed(() => ['printing', 'paused'].includes(printState.value))
const thumb = computed(() => {
  const m = state.currentMeta
  if (!m?.thumbnails?.length) return null
  const t = [...m.thumbnails].sort((a, b) => b.width - a.width)[0]
  const dir = (ps.value.filename || '').split('/').slice(0, -1).join('/')
  return api.fileUrl('gcodes', (dir ? dir + '/' : '') + t.relative_path)
})
const color = computed(() => ({ printing: 'var(--ac)', paused: 'var(--wn)', error: 'var(--dg)', complete: 'var(--bl)', cancelled: 'var(--mu)' }[printState.value] || 'var(--mu)'))
const eo = computed(() => S('exclude_object'))
const remaining = computed(() => (eo.value.objects?.length || 0) - (eo.value.excluded_objects?.length || 0))
const z = computed(() => (S('gcode_move').gcode_position?.[2] ?? 0).toFixed(2))
// live speed and volumetric flow from Klipper's motion_report (flow = extruder speed x filament cross section)
const mr = computed(() => S('motion_report'))
const speed = computed(() => (active.value && mr.value.live_velocity != null ? Math.round(mr.value.live_velocity) + ' mm/s' : '--'))
const flow = computed(() => {
  const v = mr.value.live_extruder_velocity
  if (!active.value || v == null) return '--'
  const d = +(S('configfile').settings?.extruder?.filament_diameter || 1.75)
  return (Math.max(0, v) * Math.PI * (d / 2) ** 2).toFixed(1) + ' mm³/s'
})
const slicer = computed(() => (state.currentMeta?.estimated_time ? fmtTime(state.currentMeta.estimated_time) : '--'))
const filament = computed(() => ((ps.value.filament_used || 0) / 1000).toFixed(2) + ' m')
const eta = computed(() => printTimes.value.eta ? printTimes.value.eta.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '--')
// the "why" of the finish time, shown when the ETA is clicked
const showWhy = ref(false)
const why = computed(() => {
  const w = printTimes.value.why || {}
  const out = []
  if (w.slicerLeft != null) out.push(w.k ? t('Slicer {time} × {k} (learned from {n} prints)', { time: fmtTime(w.slicerLeft / (w.k || 1) * (w.sf || 1)), k: w.k.toFixed(2), n: w.n }) : t('Slicer {time}', { time: fmtTime(w.slicerLeft * (w.sf || 1)) }))
  if (w.sf && Math.abs(w.sf - 1) > 0.01) out.push(t('speed {n}%', { n: Math.round(w.sf * 100) }))
  if (w.fileLeft != null) out.push(t('measured pace {time}', { time: fmtTime(w.fileLeft) }))
  if (w.slicerLeft != null && w.fileLeft != null) out.push(t('{n}% weight on pace', { n: Math.round(w.w * 100) }))
  return out
})
function cancel() { ask.value = false; gcode('CANCEL_PRINT') }
function reprint() { if (ps.value.filename) api.call('printer.print.start', { filename: ps.value.filename }).catch((e) => toast(e.message, 'error')) }
</script>
<template>
  <section class="card pc">
    <div class="th">
      <img v-if="thumb" :src="thumb" alt="" />
      <Icon v-else name="cube" :size="44" :stroke="1.6" />
    </div>
    <div class="grow col" style="gap:10px">
      <div class="row" style="gap:10px;min-width:0">
        <span class="chip" :style="{ color }"><i></i>{{ t(printState) }}</span>
        <span class="fn">{{ ps.filename || t('No file loaded') }}</span>
      </div>
      <div class="stats">
        <div><span class="lbl">{{ t('Layer') }}</span><b class="mono">{{ layerInfo.cur }} / {{ layerInfo.total || '--' }}</b></div>
        <div><span class="lbl">Z</span><b class="mono">{{ z }} mm</b></div>
        <div><span class="lbl">{{ t('Speed') }}</span><b class="mono">{{ speed }}</b></div>
        <div><span class="lbl">{{ t('Flow') }}</span><b class="mono">{{ flow }}</b></div>
        <div><span class="lbl">{{ t('Filament') }}</span><b class="mono">{{ filament }}</b></div>
        <div><span class="lbl">{{ t('Print time') }}</span><b class="mono">{{ fmtTime(ps.print_duration) }}</b></div>
        <div><span class="lbl">{{ t('Slicer') }}</span><b class="mono">{{ slicer }}</b></div>
        <div><span class="lbl">{{ t('Left') }}</span><b class="mono">{{ active ? fmtTime(printTimes.left) : '--' }}</b></div>
        <button class="etab" :class="{ on: showWhy }" :disabled="!active" :data-tip="active ? why.join(' · ') : ''" :aria-label="t('How the finish time is estimated')" @click="showWhy = !showWhy"><span class="lbl">{{ t('ETA') }} <Icon name="sparkle" :size="11" :stroke="2.4" /></span><b class="mono">{{ active ? '~' + eta : '--' }}</b></button>
      </div>
      <div v-if="showWhy && active" class="why">{{ why.join(' · ') }}</div>
      <div class="row" style="gap:12px"><div class="bar grow state" :style="{ height: '12px', '--pst': color }"><div :style="{ width: progress * 100 + '%' }"></div></div><b class="mono" style="font-size:16px">{{ (progress * 100).toFixed(1) }}%</b></div>
    </div>
    <div class="acts">
      <template v-if="active">
        <div class="row">
          <button v-if="printState === 'paused'" class="btn lg acc grow" @click="gcode('RESUME')"><Icon name="play" :stroke="2.4" />{{ t('Resume') }}</button>
          <button v-else class="btn lg grow" @click="gcode('PAUSE')"><Icon name="pause" :stroke="2.4" />{{ t('Pause') }}</button>
          <button class="btn lg dg grow" @click="ask = true"><Icon name="sq" :stroke="2.4" />{{ t('Cancel') }}</button>
        </div>
        <button class="btn lg out" :disabled="!eo.objects?.length" @click="emit()"><Icon name="excl" :size="18" :stroke="2.4" />{{ t('Exclude Object') }}<span v-if="eo.objects?.length" class="mono cnt">{{ remaining }}/{{ eo.objects.length }}</span></button>
      </template>
      <template v-else>
        <button class="btn lg acc" @click="go('files')"><Icon name="file" :stroke="2.4" />{{ t('Choose file') }}</button>
        <button class="btn lg" :disabled="!ps.filename" @click="reprint"><Icon name="refresh" :stroke="2.4" />{{ t('Reprint') }}</button>
      </template>
    </div>
  </section>
  <Modal v-if="ask" :title="t('Cancel print?')" @close="ask = false">
    <p style="margin:0" class="mu">{{ t('The current print will be cancelled.') }}</p>
    <template #foot><button class="btn lg" @click="ask = false">{{ t('Keep printing') }}</button><button class="btn lg dgf" @click="cancel">{{ t('Cancel print') }}</button></template>
  </Modal>
</template>
<style scoped>
.pc { flex-direction: row; align-items: center; gap: 16px; }
.th { width: 96px; height: 96px; flex-shrink: 0; border-radius: 8px; background: var(--s2); border: 1px solid var(--bd); display: flex; align-items: center; justify-content: center; color: var(--mu); overflow: hidden; }
.th img { width: 100%; height: 100%; object-fit: contain; }
.fn { font-size: 20px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip { text-transform: capitalize; }
.stats { display: flex; gap: 10px 24px; flex-wrap: wrap; }
.stats > div { display: flex; flex-direction: column; gap: 2px; }
.stats b { font-size: 15px; }
.etab { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; background: none; border: none; padding: 0; color: var(--tx); cursor: pointer; }
.etab .lbl { display: inline-flex; align-items: center; gap: 3px; }
.etab .lbl :deep(svg) { color: var(--ac); }
.etab:disabled { opacity: 1; cursor: default; }
.etab:disabled .lbl :deep(svg) { display: none; }
.etab.on b, .etab:hover:not(:disabled) b { color: var(--ac); }
.why { font-size: 12px; color: var(--mu); padding: 8px 10px; border-radius: 8px; background: var(--s2); }
.acts { display: flex; flex-direction: column; gap: 8px; width: 230px; flex-shrink: 0; }
.cnt { font-size: 11px; padding: 2px 6px; border-radius: 6px; background: var(--s2); color: var(--tx); }
@media (max-width: 900px) { .pc { flex-wrap: wrap; } .acts { width: 100%; } }
</style>
