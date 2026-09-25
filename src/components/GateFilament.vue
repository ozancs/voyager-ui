<script setup>
// Set what is loaded in one MMU gate / AFC lane: material, colour, name, temperature and the Spoolman spool.
// Happy Hare:  MMU_GATE_MAP GATE=n MATERIAL=.. COLOR=rrggbb NAME=.. TEMP=.. SPOOLID=..
// AFC:         SET_MATERIAL / SET_COLOR / SET_SPOOL_ID LANE=..  (only the ones this AFC version has)
// Picking a Spoolman spool fills the fields from it.
import { ref, computed, onMounted } from 'vue'
import Modal from './Modal.vue'
import { state, gcode, toast } from '../store'
import { api } from '../api/moonraker'
import { t } from '../i18n'
const props = defineProps({ gate: Object, kind: String })
const emit = defineEmits(['close'])
const MATERIALS = ['PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PA-CF', 'PC', 'PET-CF', 'PVA', 'HIPS']
const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : /^rgb/.test(c || '') ? '#' + c.match(/\d+/g).slice(0, 3).map((x) => (+x).toString(16).padStart(2, '0')).join('') : '#888888')
const f = ref({ material: props.gate.material || '', color: hex(props.gate.color), name: props.gate.name || '', temp: props.gate.temp || '', spool: props.gate.spoolId > 0 ? props.gate.spoolId : '' })
const has = (c) => Object.keys(state.commands || {}).some((k) => k.toUpperCase() === c)
const spools = ref(null)
onMounted(async () => {
  if (!state.spoolman.server) return
  try {
    const r = await api.call('server.spoolman.proxy', { request_method: 'GET', path: '/v1/spool?allow_archived=false', use_v2_response: true })
    spools.value = Array.isArray(r.response) ? r.response : []
  } catch { spools.value = [] }
})
function useSpool(id) {
  f.value.spool = id ? +id : ''
  const s = (spools.value || []).find((x) => x.id === +id)
  if (!s) return
  const fl = s.filament || {}
  if (fl.material) f.value.material = fl.material
  if (fl.color_hex) f.value.color = '#' + fl.color_hex.replace('#', '').slice(0, 6)
  if (fl.name) f.value.name = [fl.vendor?.name, fl.name].filter(Boolean).join(' ')
  if (fl.settings_extruder_temp) f.value.temp = fl.settings_extruder_temp
}
const spoolLabel = (s) => `#${s.id} ${[s.filament?.vendor?.name, s.filament?.name].filter(Boolean).join(' ')}${s.filament?.material ? ' · ' + s.filament.material : ''}`
// values go into a G-code line: keep them to what Klipper can parse
const clean = (v) => String(v ?? '').replace(/[=;\r\n"']/g, '').trim()
const mat = computed(() => clean(f.value.material).replace(/\s+/g, '_').toUpperCase())
const col = computed(() => f.value.color.replace('#', '').toLowerCase())
const busy = ref(false)
async function save() {
  busy.value = true
  try {
    if (props.kind === 'hh') {
      let c = `MMU_GATE_MAP GATE=${props.gate.id} MATERIAL=${mat.value || 'Unknown'} COLOR=${col.value}`
      if (clean(f.value.name)) c += ` NAME="${clean(f.value.name)}"` // Klipper splits parameters with shlex, quotes keep spaces
      if (+f.value.temp > 0) c += ` TEMP=${Math.round(+f.value.temp)}`
      c += ` SPOOLID=${+f.value.spool > 0 ? +f.value.spool : -1}`
      await gcode(c)
    } else {
      const L = props.gate.id
      if (has('SET_MATERIAL') && mat.value) await gcode(`SET_MATERIAL LANE=${L} MATERIAL=${mat.value}`)
      if (has('SET_COLOR')) await gcode(`SET_COLOR LANE=${L} COLOR=${col.value.toUpperCase()}`)
      if (has('SET_SPOOL_ID') && +f.value.spool > 0) await gcode(`SET_SPOOL_ID LANE=${L} SPOOL_ID=${+f.value.spool}`)
    }
    emit('close')
  } catch (e) { toast(e.message, 'error') }
  busy.value = false
}
const title = computed(() => (props.kind === 'hh' ? t('Gate {n}', { n: props.gate.label }) : props.gate.id) + ' · ' + t('Filament'))
</script>
<template>
  <Modal :title="title" width="480px" @close="emit('close')">
    <label v-if="spools && spools.length" class="col"><span class="lbl">{{ t('Spoolman spool') }}</span>
      <select class="input" :value="f.spool" @change="useSpool($event.target.value)"><option value="">{{ t('None') }}</option><option v-for="s in spools" :key="s.id" :value="s.id">{{ spoolLabel(s) }}</option></select>
    </label>
    <div class="row" style="gap:10px;align-items:flex-end">
      <label class="col grow"><span class="lbl">{{ t('Material') }}</span><input v-model="f.material" class="input" list="mmu-mats" placeholder="PLA" /></label>
      <label class="col"><span class="lbl">{{ t('Colour') }}</span><input v-model="f.color" type="color" class="clr" /></label>
    </div>
    <datalist id="mmu-mats"><option v-for="x in MATERIALS" :key="x" :value="x" /></datalist>
    <template v-if="kind === 'hh'">
      <div class="row" style="gap:10px">
        <label class="col grow"><span class="lbl">{{ t('Name') }}</span><input v-model="f.name" class="input" :placeholder="t('e.g. Galaxy Black')" /></label>
        <label class="col" style="width:110px"><span class="lbl">{{ t('Temp') }} °C</span><input v-model.number="f.temp" class="input" type="number" min="0" max="400" /></label>
      </div>
    </template>
    <code class="mu sm">{{ kind === 'hh' ? `MMU_GATE_MAP GATE=${gate.id} MATERIAL=${mat || 'Unknown'} COLOR=${col}` : `SET_MATERIAL / SET_COLOR LANE=${gate.id}` }}</code>
    <template #foot><button class="btn lg" @click="emit('close')">{{ t('Cancel') }}</button><button class="btn lg acc" :disabled="busy" @click="save">{{ t('Save') }}</button></template>
  </Modal>
</template>
<style scoped>
.clr { width: 56px; height: 42px; border: none; padding: 0; background: none; cursor: pointer; }
.sm { font-size: 11.5px; } .mu { color: var(--mu); }
</style>
