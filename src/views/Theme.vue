<script setup>
import { ref, computed, watch } from 'vue'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import Toggle from '../components/Toggle.vue'
import CmdInput from '../components/CmdInput.vue'
import { state, saveSettings, macroList, prettyName, DEFAULT_SETTINGS, S, VERSION, toast, APP, APP_NAME } from '../store'
import { api } from '../api/moonraker'
import { ICON_NAMES } from '../icons'
import { playSound } from '../features'
if (!state.settings.sound) state.settings.sound = DEFAULT_SETTINGS().sound
const snd = computed(() => state.settings.sound)
const SOUNDS = [['complete', 'Print finished', 'complete'], ['paused', 'Print paused (e.g. runout)', 'paused'], ['error', 'Error / Klipper shutdown', 'error'], ['heated', 'Heater reached target', 'heated']]
const favs = computed(() => state.settings.favorites)
const iconFor = ref(null)
const dragI = ref(null)
function add() { favs.value.push({ id: 'f' + Date.now(), name: 'New', icon: 'star', gcode: '', highlight: false }) }
function remove(i) { favs.value.splice(i, 1) }
function move(i, d) { const j = i + d; if (j < 0 || j >= favs.value.length) return; const a = favs.value; [a[i], a[j]] = [a[j], a[i]] }
function onDrop(i) { if (dragI.value == null || dragI.value === i) return; const a = favs.value; const [x] = a.splice(dragI.value, 1); a.splice(i, 0, x); dragI.value = null }
const ACCENTS = ['#ff6b1a', '#38d6ff', '#3dd68c', '#f5c451', '#8b6cff', '#ff3d7f', '#e5484d']
const heaters = computed(() => (S('heaters').available_heaters || []))
function addPreset() { state.settings.presets.push({ id: 'p' + Date.now(), name: 'New', temps: Object.fromEntries(heaters.value.map((h) => [h, 0])) }) }
const allDevices = computed(() => state.objects.filter((o) => /^(fan|fan_generic|heater_fan|controller_fan|temperature_fan|output_pin|neopixel|led|dotstar|filament_switch_sensor|filament_motion_sensor|smart_filament_sensor)( |$)/.test(o) && !o.startsWith('output_pin _')))
function toggleHidden(list, id) { const i = list.indexOf(id); i >= 0 ? list.splice(i, 1) : list.push(id) }
const confirmReset = ref(false)
// ---- backup / restore of all UI settings ----
const restoreFile = ref(null)
const pending = ref(null)
const prev = ref(null)
api.call('server.database.get_item', { namespace: APP, key: 'settings_prev' }).then((r) => (prev.value = r.value)).catch(() => {})
function download() {
  const data = { app: APP, version: VERSION, date: new Date().toISOString(), settings: JSON.parse(JSON.stringify(state.settings)) }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  a.download = `${APP}-settings-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
}
async function pickFile(e) {
  const f = e.target.files[0]; e.target.value = ''
  if (!f) return
  try {
    const d = JSON.parse(await f.text())
    if (![APP, 'carbon-ui'].includes(d.app) || !d.settings) throw new Error('not a ' + APP_NAME + ' settings file')
    pending.value = { ...d, name: f.name }
  } catch (err) { toast('Could not read backup: ' + err.message, 'error') }
}
async function apply(data, label) {
  const cur = JSON.parse(JSON.stringify(state.settings))
  try { await api.call('server.database.post_item', { namespace: APP, key: 'settings_prev', value: { date: new Date().toISOString(), settings: cur } }) } catch {}
  prev.value = { date: new Date().toISOString(), settings: cur }
  const def = DEFAULT_SETTINGS()
  state.settings = { ...def, ...data, devices: { ...def.devices, ...(data.devices || {}) }, strip: { ...def.strip, ...(data.strip || {}) } }
  saveSettings()
  toast(label)
}
function applyPending() { const p = pending.value; pending.value = null; apply(p.settings, 'Settings restored from ' + p.name) }
function undoRestore() { if (prev.value) apply(prev.value.settings, 'Previous settings restored') }
const fmtD = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
function reset() { confirmReset.value = false; apply(DEFAULT_SETTINGS(), 'Settings reset to defaults') }
</script>
<template>
  <div class="split">
    <div class="col grow" style="gap:16px">
      <section id="set-favorites" class="card">
        <div class="card-h"><h2>Favorite Macros</h2><button class="btn acc" @click="add"><Icon name="plus" :size="16" :stroke="2.4" />Add macro</button></div>
        <span class="mu">Drag to reorder. G-code can be any command or several lines. Highlight fills the button with the accent color.</span>
        <div class="col" style="gap:6px">
          <div v-for="(f, i) in favs" :key="f.id" class="fr" draggable="true" @dragstart="dragI = i" @dragover.prevent @drop="onDrop(i)" :class="{ drag: dragI === i }">
            <span class="grip" aria-hidden="true"><Icon name="grip" :size="18" :stroke="3" /></span>
            <button class="btn ibtn" style="width:40px;height:40px" aria-label="Change icon" @click="iconFor = f"><Icon :name="f.icon" :size="22" style="color:var(--ac)" /></button>
            <input v-model="f.name" class="input" style="width:150px;font-weight:700" aria-label="Button name" />
            <CmdInput v-model="f.gcode" input-class="input gc" placeholder="type a command, e.g. CHAMBER TEMP=50" aria-label="G-code command" />
            <Toggle v-model="f.highlight" label="Highlight" />
            <div class="col" style="gap:2px"><button class="btn clear ibtn sm" style="height:18px" aria-label="Move up" @click="move(i, -1)"><Icon name="up" :size="14" /></button><button class="btn clear ibtn sm" style="height:18px" aria-label="Move down" @click="move(i, 1)"><Icon name="down" :size="14" /></button></div>
            <button class="btn clear ibtn sm" aria-label="Remove" @click="remove(i)"><Icon name="trash" :size="16" /></button>
          </div>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:6px"><span class="lbl">Your macros:</span><button v-for="m in macroList.slice(0, 40)" :key="m" class="chip mb" @click="favs.push({ id: 'f' + Date.now(), name: m.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()), icon: 'star', gcode: m, highlight: false })">+ {{ m }}</button></div>
      </section>
      <section id="set-presets" class="card">
        <div class="card-h"><h2>Temperature Presets</h2><button class="btn" @click="addPreset"><Icon name="plus" :size="16" />Add preset</button></div>
        <div v-for="(p, i) in state.settings.presets" :key="p.id" class="pr">
          <input v-model="p.name" class="input" style="width:120px;font-weight:700" aria-label="Preset name" />
          <label v-for="h in heaters" :key="h" class="col" style="gap:4px"><span class="lbl">{{ prettyName(h) }}</span><input v-model.number="p.temps[h]" type="number" class="input mono" style="width:90px" /></label>
          <button class="btn clear ibtn sm" aria-label="Remove preset" style="margin-top:18px" @click="state.settings.presets.splice(i, 1)"><Icon name="trash" :size="16" /></button>
        </div>
      </section>
    </div>
    <div class="side-col" style="width:400px">
      <section id="set-accent" class="card">
        <div class="card-h"><h2>Accent</h2></div>
        <div class="row" style="flex-wrap:wrap;gap:10px">
          <button v-for="c in ACCENTS" :key="c" class="swc" :class="{ on: state.settings.accent === c }" :style="{ background: c }" :aria-label="'Accent ' + c" @click="state.settings.accent = c"></button>
          <label class="swc cu" aria-label="Custom accent"><input type="color" v-model="state.settings.accent" /></label>
        </div>
      </section>
      <section id="set-controls" class="card">
        <div class="card-h"><h2>Controls</h2></div>
        <label class="col" style="gap:4px"><span class="lbl">Printer name (empty = name from Mainsail / hostname)</span><input v-model="state.settings.printerName" class="input" :placeholder="state.printerName || 'Printer'" /></label>
        <div class="row" style="justify-content:space-between"><span>Invert Z jog buttons (bed moves in Z)</span><Toggle v-model="state.settings.invertZ" label="Invert Z" /></div>
      </section>
      <section id="set-sounds" class="card">
        <div class="card-h"><h2>Sounds &amp; alerts</h2><button class="btn" :disabled="!snd.enabled" @click="playSound('complete')"><Icon name="volume" :size="16" />Test</button></div>
        <div class="row" style="justify-content:space-between"><span>Play sounds</span><Toggle v-model="snd.enabled" label="Play sounds" /></div>
        <template v-if="snd.enabled">
          <label class="row" style="gap:10px"><Icon name="volume" :size="16" style="color:var(--mu)" /><input v-model.number="snd.volume" type="range" min="0.1" max="1" step="0.05" class="rng" :style="{ '--p': snd.volume * 100 + '%' }" aria-label="Volume" /></label>
          <div v-for="[k, l, t] in SOUNDS" :key="k" class="row" style="justify-content:space-between">
            <span>{{ l }}</span>
            <div class="row" style="gap:6px"><button class="btn clear ibtn sm" :aria-label="'Play ' + l" @click="playSound(t)"><Icon name="play" :size="14" /></button><Toggle v-model="snd[k]" :label="l" /></div>
          </div>
          <span class="mu">Sounds play in this browser tab, so the page has to be open somewhere.</span>
        </template>
        <div class="row" style="justify-content:space-between;border-top:1px solid var(--bd);padding-top:12px"><span>Show Klipper errors as pop-ups</span><Toggle v-model="state.settings.errorToasts" label="Error pop-ups" /></div>
        <div class="row" style="justify-content:space-between"><span>Separate dashboard while printing</span><Toggle v-model="state.settings.autoLayout" label="Separate dashboard while printing" /></div>
      </section>
      <section id="set-sensors" class="card">
        <div class="card-h"><h2>Temperatures card &amp; graph</h2></div>
        <span class="mu">Sensors shown in the temperatures card and graph.</span>
        <div class="row" style="flex-wrap:wrap;gap:6px">
          <button v-for="s in S('heaters').available_sensors || []" :key="s" class="sch" :class="{ on: !state.settings.hiddenSensors.includes(s) }" :aria-pressed="!state.settings.hiddenSensors.includes(s)" @click="toggleHidden(state.settings.hiddenSensors, s)">{{ prettyName(s) }}</button>
        </div>
      </section>
      <section id="set-backup" class="card">
        <div class="card-h"><h2>Backup &amp; restore</h2></div>
        <span class="mu">Favorites, dashboard layout, cards, presets, theme and all other UI settings in one file.</span>
        <div class="row" style="flex-wrap:wrap">
          <button class="btn acc" @click="download"><Icon name="download" :size="16" :stroke="2.4" />Download backup</button>
          <button class="btn" @click="restoreFile.click()"><Icon name="upload" :size="16" />Restore from file</button>
          <input ref="restoreFile" type="file" accept=".json,application/json" hidden @change="pickFile" />
        </div>
        <button v-if="prev" class="btn clear" style="align-self:flex-start" @click="undoRestore"><Icon name="rot" :size="16" />Go back to settings before {{ fmtD(prev.date) }}</button>
      </section>
      <button class="btn dg" @click="confirmReset = true">Reset all UI settings</button>
    </div>
  </div>
  <Modal v-if="iconFor" :title="'Icon for “' + iconFor.name + '”'" width="560px" @close="iconFor = null">
    <div class="ig">
      <button v-for="n in ICON_NAMES" :key="n" class="btn" :class="{ acc: iconFor.icon === n }" style="height:48px" :aria-label="n" :title="n" @click="iconFor.icon = n; iconFor = null"><Icon :name="n" :size="22" /></button>
    </div>
  </Modal>
 <Modal v-if="pending" title="Restore settings?" @close="pending = null">
    <p style="margin:0">Replace all current UI settings with <b>{{ pending.name }}</b><span class="mu"> (saved {{ fmtD(pending.date) }}, v{{ pending.version }})</span>?</p>
    <span class="mu">Your current settings are kept so you can go back.</span>
    <template #foot><button class="btn lg" @click="pending = null">Cancel</button><button class="btn lg acc" @click="applyPending">Restore</button></template>
  </Modal>
  <Modal v-if="confirmReset" title="Reset UI settings?" @close="confirmReset = false">
    <p class="mu" style="margin:0">Favorites, presets and card settings go back to defaults.</p>
    <template #foot><button class="btn lg" @click="confirmReset = false">Cancel</button><button class="btn lg dgf" @click="reset">Reset</button></template>
  </Modal>
</template>
<style scoped>
.mu { color: var(--mu); font-size: 13px; }
.fr { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--bd); border-radius: 10px; background: var(--s1); }
.fr.drag { opacity: .5; }
.grip { color: var(--mu); cursor: grab; display: flex; }
:deep(.gc) { flex: 1; min-width: 120px; font-size: 12px; }
.mb { border: 1px solid var(--bd); color: var(--mu); cursor: pointer; font-family: var(--fm); font-size: 11px; }
.mb:hover { color: var(--ac); border-color: var(--ac); }
.pr { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; padding: 8px 0; border-bottom: 1px solid var(--bd); }
.pr > .input:first-child { margin-top: 18px; }
.swc { width: 44px; height: 44px; border-radius: 22px; border: 3px solid var(--s1); outline: 2px solid var(--bd); cursor: pointer; }
.swc.on { outline-color: var(--tx); }
.cu { background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); position: relative; overflow: hidden; }
.cu input { opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.sch { height: 30px; padding: 0 12px; border-radius: 15px; border: none; background: var(--s2); color: var(--mu2); font-size: 12.5px; font-weight: 500; text-decoration: line-through; }
.sch.on { background: var(--heat-bg); color: var(--heat); text-decoration: none; }
.ig { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; }
</style>
