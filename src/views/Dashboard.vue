<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import Toggle from '../components/Toggle.vue'
import CmdInput from '../components/CmdInput.vue'
import DeviceStrip from '../components/DeviceStrip.vue'
import TempsCard from '../components/TempsCard.vue'
import TempChartCard from '../components/TempChartCard.vue'
import WebcamCard from '../components/WebcamCard.vue'
import ConsoleCard from '../components/ConsoleCard.vue'
import ToolheadCard from '../components/ToolheadCard.vue'
import ExtruderCard from '../components/ExtruderCard.vue'
import LimitsCard from '../components/LimitsCard.vue'
import PrintCard from '../components/PrintCard.vue'
import ObjectsCard from '../components/ObjectsCard.vue'
import MiniMeshCard from '../components/MiniMeshCard.vue'
import SystemLoads from '../components/SystemLoads.vue'
import CustomCard from '../components/CustomCard.vue'
import { state, DEFAULT_LAYOUT, DEFAULT_SETTINGS, layoutSnapshot, pushLayoutBackup, restoreLayout } from '../store'
import { ICON_NAMES } from '../icons'

const MODULES = {
  console: { c: ConsoleCard, n: 'Console', min: [4, 4], def: [12, 7] },
  temps: { c: TempsCard, n: 'Temperatures', min: [3, 4], def: [6, 8] },
  tempchart: { c: TempChartCard, n: 'Temperature Graph', min: [3, 4], def: [12, 6] },
  webcam: { c: WebcamCard, n: 'Webcam', min: [3, 4], def: [6, 8] },
  toolhead: { c: ToolheadCard, n: 'Toolhead', min: [5, 5], def: [12, 5] },
  extruder: { c: ExtruderCard, n: 'Extruder', min: [3, 5], def: [6, 7] },
  limits: { c: LimitsCard, n: 'Machine Limits', min: [3, 5], def: [6, 7] },
  print: { c: PrintCard, n: 'Print Status', min: [5, 3], def: [12, 3] },
  objects: { c: ObjectsCard, n: 'Objects Map', min: [3, 4], def: [4, 7] },
  mesh: { c: MiniMeshCard, n: 'Bed Mesh', min: [2, 4], def: [3, 6] },
  system: { c: SystemLoads, n: 'System Loads', min: [4, 4], def: [6, 6] },
}
const isCustom = (i) => i.startsWith('c_')
const minOf = (i) => (isCustom(i) ? (state.settings.customCards?.[i]?.type === 'btn' ? [1, 2] : [2, 3]) : MODULES[i]?.min || [2, 2])
const nameOf = (i) => (isCustom(i) ? state.settings.customCards?.[i]?.name || 'Custom' : MODULES[i]?.n)

const width = ref(window.innerWidth)
const onResize = () => (width.value = window.innerWidth)
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
const wide = computed(() => width.value > 1000)

function clean(l) {
  const hidden = state.settings.hiddenCards || []
  const seen = new Set()
  const ok = (i) => MODULES[i] || (isCustom(i) && state.settings.customCards?.[i])
  const out = (l || []).filter((x) => ok(x.i) && !seen.has(x.i) && seen.add(x.i)).map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
  for (const d of DEFAULT_LAYOUT()) if (!seen.has(d.i) && !hidden.includes(d.i)) out.push({ ...d, y: 999 })
  return out
}
const layout = ref(clean(state.settings.layout || DEFAULT_LAYOUT()))
function reload() { layout.value = clean(state.settings.layout || DEFAULT_LAYOUT()) }
watch(() => state.settingsLoaded, (v) => v && reload())
const sorted = computed(() => [...layout.value].sort((a, b) => a.y - b.y || a.x - b.x))
function persist() { state.settings.layout = layout.value.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })) }
const bottom = () => Math.max(0, ...layout.value.map((x) => x.y + x.h))
function removeCard(i) {
  if (MODULES[i] && DEFAULT_LAYOUT().some((d) => d.i === i)) state.settings.hiddenCards = [...new Set([...(state.settings.hiddenCards || []), i])]
  layout.value = layout.value.filter((x) => x.i !== i)
  if (isCustom(i)) { const cc = { ...state.settings.customCards }; delete cc[i]; state.settings.customCards = cc }
  persist()
}
const available = computed(() => Object.keys(MODULES).filter((k) => !layout.value.some((x) => x.i === k)))
function addModule(k) {
  state.settings.hiddenCards = (state.settings.hiddenCards || []).filter((x) => x !== k)
  const [w, h] = MODULES[k].def
  layout.value = [...layout.value, { i: k, x: 0, y: bottom(), w, h }]
  persist(); addOpen.value = false
}
function addCustom(type) {
  const id = 'c_' + Date.now().toString(36)
  state.settings.customCards = { ...(state.settings.customCards || {}), [id]: type === 'btn' ? { type, name: 'Button', icon: 'star', gcode: '', highlight: false } : { type, name: 'Macros', buttons: [] } }
  const [w, h] = type === 'btn' ? [2, 3] : [4, 4]
  layout.value = [...layout.value, { i: id, x: 0, y: bottom(), w, h }]
  persist(); addOpen.value = false
  editCard(id)
}

// ---- customize session with undo / backups ----
let entry = null
const addOpen = ref(false)
const restoreOpen = ref(false)
const askReset = ref(false)
function startEdit() { entry = layoutSnapshot(); state.editDash = true }
function done() {
  persist()
  if (entry && JSON.stringify(entry) !== JSON.stringify(layoutSnapshot())) pushLayoutBackup(entry, 'Before last edit')
  entry = null; state.editDash = false
}
function cancel() { if (entry) restoreLayout(entry); entry = null; reload(); state.editDash = false }
function undoSession() { if (entry) { restoreLayout(entry); reload() } }
function factoryReset() {
  pushLayoutBackup(layoutSnapshot(), 'Before reset')
  const d = DEFAULT_SETTINGS()
  restoreLayout({ layout: null, hiddenCards: [], strip: d.strip, customCards: {} })
  reload(); persist(); askReset.value = false
}
function restore(b) {
  pushLayoutBackup(layoutSnapshot(), 'Before restore')
  restoreLayout(b.data); reload(); restoreOpen.value = false
}
const fmtT = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
watch(() => state.editDash, (v) => document.body.classList.toggle('dash-edit', v), { immediate: true })
onBeforeUnmount(() => { if (state.editDash) done(); document.body.classList.remove('dash-edit') })

// ---- custom card editor ----
const editing = ref(null) // { id, data }
const iconFor = ref(null)
function editCard(id) { editing.value = { id, data: JSON.parse(JSON.stringify(state.settings.customCards[id])) } }
function saveCard() { state.settings.customCards = { ...state.settings.customCards, [editing.value.id]: editing.value.data }; editing.value = null }
</script>

<template>
  <div class="page">
    <div v-if="state.editDash" class="dbar on">
      <template v-if="state.editDash">
        <Icon name="move" :size="18" style="color:var(--ac)" />
        <b>Customize</b>
        <span class="mu hint">Drag by title, resize from the corner. Top cards: drag to reorder, eye to hide.</span>
        <div class="grow"></div>
        <div class="rel">
          <button class="btn acc" @click="addOpen = !addOpen; restoreOpen = false"><Icon name="plus" :size="16" :stroke="2.6" />Add card</button>
          <div v-if="addOpen" class="dd card">
            <span class="sec-lbl">Modules</span>
            <button v-for="k in available" :key="k" class="btn clear di" @click="addModule(k)">{{ MODULES[k].n }}</button>
            <span v-if="!available.length" class="mu" style="font-size:12px">All modules are on the dashboard</span>
            <span class="sec-lbl" style="margin-top:8px">Custom</span>
            <button class="btn clear di" @click="addCustom('btn')"><Icon name="star" :size="16" />Command button (square)</button>
            <button class="btn clear di" @click="addCustom('macros')"><Icon name="dash" :size="16" />Macro group</button>
          </div>
        </div>
        <div class="rel">
          <button class="btn" :disabled="!(state.settings.layoutBackups || []).length" @click="restoreOpen = !restoreOpen; addOpen = false"><Icon name="clock" :size="16" />Restore</button>
          <div v-if="restoreOpen" class="dd card" style="width:280px">
            <span class="sec-lbl">Saved layouts</span>
            <button v-for="(b, k) in state.settings.layoutBackups" :key="k" class="btn clear di" style="justify-content:space-between" @click="restore(b)"><span>{{ b.label }}</span><span class="mono mu" style="font-size:11px">{{ fmtT(b.t) }}</span></button>
          </div>
        </div>
        <button class="btn" aria-label="Undo changes since Customize was opened" @click="undoSession"><Icon name="rot" :size="16" />Undo</button>
        <button class="btn dg" @click="askReset = true"><Icon name="refresh" :size="16" />Reset</button>
        <button class="btn" @click="cancel">Cancel</button>
        <button class="btn acc" @click="done"><Icon name="check" :size="16" :stroke="2.6" />Done</button>
      </template>
    </div>
    <div class="top">
      <DeviceStrip v-if="state.klippy === 'ready'" />
      <div v-else class="grow"></div>
      <button v-if="!state.editDash" class="btn cz" aria-label="Customize dashboard" @click="startEdit"><Icon name="layout" :size="18" /></button>
    </div>
    <GridLayout v-if="wide" v-model:layout="layout" class="grid" :class="{ editing: state.editDash }" :col-num="12" :row-height="40" :margin="[16, 16]"
      :is-draggable="state.editDash" :is-resizable="state.editDash" vertical-compact use-css-transforms @layout-updated="persist">
      <GridItem v-for="it in layout" :key="it.i" :i="it.i" :x="it.x" :y="it.y" :w="it.w" :h="it.h" :min-w="minOf(it.i)[0]" :min-h="minOf(it.i)[1]"
        drag-allow-from=".card-h, .cb" drag-ignore-from="button, input, select, textarea, a, .seg">
        <div class="cell">
          <CustomCard v-if="isCustom(it.i)" :id="it.i" class="fill" @edit="editCard" />
          <component v-else :is="MODULES[it.i].c" class="fill" />
          <div v-if="state.editDash" class="tools">
            <button v-if="isCustom(it.i)" class="btn ibtn sm" :aria-label="'Edit ' + nameOf(it.i)" @click="editCard(it.i)"><Icon name="pencil" :size="14" /></button>
            <button class="btn ibtn sm" :aria-label="'Remove ' + nameOf(it.i)" @click="removeCard(it.i)"><Icon name="x" :size="16" /></button>
          </div>
        </div>
      </GridItem>
    </GridLayout>
    <div v-else class="col" style="gap:16px">
      <template v-for="it in sorted" :key="it.i">
        <CustomCard v-if="isCustom(it.i)" :id="it.i" :style="{ minHeight: it.h * 40 + 'px' }" @edit="editCard" />
        <component v-else :is="MODULES[it.i].c" :style="{ minHeight: it.h * 40 + 'px' }" />
      </template>
    </div>
  </div>

  <Modal v-if="askReset" title="Reset dashboard?" @close="askReset = false">
    <p class="mu" style="margin:0">Layout, top cards and custom cards go back to defaults. The current layout is saved under Restore, so you can go back.</p>
    <template #foot><button class="btn lg" @click="askReset = false">Cancel</button><button class="btn lg dgf" @click="factoryReset">Reset</button></template>
  </Modal>

  <Modal v-if="editing" :title="editing.data.type === 'btn' ? 'Command button' : 'Macro group'" width="620px" @close="editing = null">
    <label class="col"><span class="lbl">{{ editing.data.type === 'btn' ? 'Label' : 'Title' }}</span><input v-model="editing.data.name" class="input" /></label>
    <template v-if="editing.data.type === 'btn'">
      <div class="row">
        <button class="btn ibtn" aria-label="Change icon" @click="iconFor = editing.data"><Icon :name="editing.data.icon" :size="22" style="color:var(--ac)" /></button>
        <CmdInput v-model="editing.data.gcode" input-class="input" placeholder="G-code or macro, e.g. CHAMBER TEMP=50" aria-label="Command" />
        <Toggle v-model="editing.data.highlight" label="Highlight" />
      </div>
    </template>
    <template v-else>
      <div v-for="(b, k) in editing.data.buttons" :key="k" class="row">
        <button class="btn ibtn" style="width:40px;height:40px" aria-label="Change icon" @click="iconFor = b"><Icon :name="b.icon || 'star'" :size="20" style="color:var(--ac)" /></button>
        <input v-model="b.name" class="input" style="width:130px" aria-label="Button name" />
        <CmdInput v-model="b.gcode" input-class="input" placeholder="command" aria-label="Command" />
        <Toggle v-model="b.highlight" label="Highlight" />
        <button class="btn clear ibtn sm" aria-label="Remove button" @click="editing.data.buttons.splice(k, 1)"><Icon name="trash" :size="16" /></button>
      </div>
      <button class="btn" style="align-self:flex-start" @click="editing.data.buttons.push({ name: 'New', icon: 'star', gcode: '', highlight: false })"><Icon name="plus" :size="16" />Add button</button>
    </template>
    <template #foot><button class="btn lg dg" style="margin-right:auto" @click="removeCard(editing.id); editing = null">Delete card</button><button class="btn lg" @click="editing = null">Cancel</button><button class="btn lg acc" @click="saveCard">Save</button></template>
  </Modal>
  <Modal v-if="iconFor" title="Choose icon" width="560px" @close="iconFor = null">
    <div class="ig"><button v-for="n in ICON_NAMES" :key="n" class="btn" :class="{ acc: iconFor.icon === n }" style="height:48px" :aria-label="n" @click="iconFor.icon = n; iconFor = null"><Icon :name="n" :size="22" /></button></div>
  </Modal>
</template>

<style scoped>
.dbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.top { display: flex; gap: 10px; align-items: flex-start; }
.cz { width: 34px; height: 96px; padding: 0; flex-shrink: 0; color: var(--mu); background: var(--s1); }
.cz:hover { color: var(--ac); }
.dbar.on { padding: 10px 14px; background: var(--s1); border: 1px solid var(--ac); border-radius: 12px; position: sticky; top: -20px; z-index: 20; }
.mu { color: var(--mu); font-size: 13px; }
@media (max-width: 1500px) { .hint { display: none; } }
.rel { position: relative; }
.dd { position: absolute; right: 0; top: 40px; width: 240px; z-index: 40; gap: 2px; box-shadow: 0 12px 40px rgba(0,0,0,.5); }
.di { justify-content: flex-start; height: 36px; color: var(--tx); }
.grid { margin: -16px; }
.cell { position: relative; height: 100%; }
.fill { height: 100%; overflow: auto; }
.tools { position: absolute; top: 8px; right: 8px; z-index: 5; display: flex; gap: 4px; }
.tools .btn { background: var(--s1); }
.editing :deep(.card) { border-style: dashed; border-color: var(--mu2); }
.editing :deep(.card-h) { cursor: move; }
.editing :deep(.card-h .acts) { visibility: hidden; }
.editing :deep(.vgl-item__resizer) { width: 22px; height: 22px; }
.editing :deep(.vgl-item__resizer::before) { border-color: var(--ac); border-right-width: 3px; border-bottom-width: 3px; }
.grid :deep(.vgl-item--placeholder) { background: var(--ac); opacity: .15; border-radius: 12px; }
.grid :deep(.vgl-item__resizer) { display: none; }
.grid.editing :deep(.vgl-item__resizer) { display: block; }
.ig { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; }
</style>
