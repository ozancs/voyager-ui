<script setup>
// Interface settings as a dialog (like Mainsail's), categories on the left. Opened from the gear in the top bar.
import { ref, computed, watch, onMounted } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import Toggle from './Toggle.vue'
import ChipList from './ChipList.vue'
import NotifierSettings from './NotifierSettings.vue'
import { state, saveSettings, prettyName, tempSensors, DEFAULT_SETTINGS, S, VERSION, toast, APP, OLD_APPS, APP_NAME, uiZoomFor } from '../store'
import { api } from '../api/moonraker'
import { playSound } from '../features'
import { sync, detect, importFrom, push } from '../sync'
import { go } from '../router'
import { iconUrl, initials, readIcon } from '../printerIcon'
import { printerName } from '../store'
import { t, LANGS } from '../i18n'

const TABS = [
  ['general', 'gear', 'General'], ['dashboard', 'layout', 'Dashboard'], ['control', 'move', 'Control'], ['presets', 'flame', 'Presets'],
  ['console', 'term', 'Console'], ['appearance', 'palette', 'Appearance'], ['sounds', 'volume', 'Sounds & alerts'], ['notify', 'bell', 'Phone notifications'],
  ['webcams', 'cam', 'Webcams'], ['sync', 'refresh', 'Mainsail / Fluidd'], ['backup', 'save', 'Backup & reset'],
]
const tab = computed({ get: () => (TABS.some(([k]) => k === state.settingsOpen) ? state.settingsOpen : 'general'), set: (v) => (state.settingsOpen = v) })
const close = () => (state.settingsOpen = null)
const esc = (e) => { if (e.key === 'Escape' && !sub.value) close() }
onMounted(() => window.addEventListener('keydown', esc))
import { onBeforeUnmount } from 'vue'
onBeforeUnmount(() => window.removeEventListener('keydown', esc))

if (!state.settings.sound) state.settings.sound = DEFAULT_SETTINGS().sound
if (!state.settings.control) state.settings.control = DEFAULT_SETTINGS().control
const snd = computed(() => state.settings.sound)
const ctl = computed(() => state.settings.control)
// printer icon (tab icon + top bar logo)
const pi = computed(() => state.settings.printerIcon)
const piFile = ref(null)
async function pickIcon(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  try { const img = await readIcon(f); state.settings.printerIcon = { ...pi.value, kind: 'image', img } } catch { toast(t('This file is not an image'), 'error') }
}
const zoomNow = computed(() => uiZoomFor(state.settings.uiScale ?? 100))
const SOUNDS = [['complete', 'Print finished', 'complete'], ['paused', 'Print paused (e.g. runout)', 'paused'], ['error', 'Error / Klipper shutdown', 'error'], ['heated', 'Heater reached target', 'heated']]
const ACCENTS = ['#ff6b1a', '#f5b23a', '#38d6ff', '#3dd68c', '#f5c451', '#8b6cff', '#ff3d7f', '#e5484d']
const heaters = computed(() => S('heaters').available_heaters || [])
function addPreset() { state.settings.presets.push({ id: 'p' + Date.now(), name: t('New'), temps: Object.fromEntries(heaters.value.map((h) => [h, 0])) }) }
function toggleHidden(list, id) { const i = list.indexOf(id); i >= 0 ? list.splice(i, 1) : list.push(id) }
function customize() { close(); go('dashboard'); state.dashEditReq = Date.now() }
function editFavs() { close(); go('dashboard'); state.favEdit = true }

// ---- sync ----
const syncMsg = ref('')
async function doImport(which) {
  syncMsg.value = ''
  try {
    const took = await importFrom(which)
    syncMsg.value = took.length ? t('Taken over from {ui}: {what}', { ui: which === 'mainsail' ? 'Mainsail' : 'Fluidd', what: took.map((k) => t({ name: 'printer name', control: 'jog and extrusion presets', presets: 'temperature presets' }[k])).join(', ') }) : t('Nothing to take over.')
  } catch (e) { toast(e.message, 'error') }
}
async function doPush() { try { await push(); toast(t('Shared settings written to Mainsail / Fluidd. They show up there after a page reload.')) } catch (e) { toast(e.message, 'error') } }
watch(() => state.settingsOpen, (v) => { if (v && !sync.checked) detect() }, { immediate: true })

// ---- webcams (Moonraker's list, shared with every UI) ----
const SERVICES = [['mjpegstreamer', 'MJPEG stream'], ['mjpegstreamer-adaptive', 'MJPEG adaptive'], ['webrtc-camerastreamer', 'WebRTC (camera-streamer)'], ['webrtc-go2rtc', 'WebRTC (go2rtc)'], ['hlsstream', 'HLS'], ['ipstream', 'Video / IP stream'], ['iframe', 'Web page (iframe)']]
const cam = ref(null)
function newCam() { cam.value = { name: '', service: 'mjpegstreamer', stream_url: '/webcam/?action=stream', snapshot_url: '/webcam/?action=snapshot', target_fps: 15, flip_horizontal: false, flip_vertical: false, rotation: 0, enabled: true } }
function editCam(c) { cam.value = { ...c, _old: c.name } }
async function saveCam() {
  const c = { ...cam.value }; const old = c._old; delete c._old
  if (!c.name.trim()) return
  try {
    if (old && old !== c.name) await api.call('server.webcams.delete_item', { name: old }).catch(() => {})
    await api.call('server.webcams.post_item', c)
    state.webcams = (await api.call('server.webcams.list')).webcams || state.webcams
    cam.value = null
  } catch (e) { toast(e.message, 'error') }
}
const delCam = ref(null)
async function removeCam() {
  const n = delCam.value.name; delCam.value = null
  try { await api.call('server.webcams.delete_item', { name: n }); state.webcams = state.webcams.filter((w) => w.name !== n) } catch (e) { toast(e.message, 'error') }
}
const sub = computed(() => cam.value || delCam.value || pending.value || confirmReset.value)

// ---- backup / restore / reset ----
const confirmReset = ref(false)
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
    if (![APP, ...OLD_APPS].includes(d.app) || !d.settings) throw new Error(t('not a {app} settings file', { app: APP_NAME }))
    pending.value = { ...d, name: f.name }
  } catch (err) { toast(t('Could not read backup: {msg}', { msg: err.message }), 'error') }
}
async function apply(data, label) {
  const cur = JSON.parse(JSON.stringify(state.settings))
  try { await api.call('server.database.post_item', { namespace: APP, key: 'settings_prev', value: { date: new Date().toISOString(), settings: cur } }) } catch {}
  prev.value = { date: new Date().toISOString(), settings: cur }
  const def = DEFAULT_SETTINGS()
  state.settings = { ...def, ...data, devices: { ...def.devices, ...(data.devices || {}) }, strip: { ...def.strip, ...(data.strip || {}) }, control: { ...def.control, ...(data.control || {}) } }
  saveSettings()
  toast(label)
}
function applyPending() { const p = pending.value; pending.value = null; apply(p.settings, t('Settings restored from {name}', { name: p.name })) }
function undoRestore() { if (prev.value) apply(prev.value.settings, t('Previous settings restored')) }
const fmtD = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
function reset() { confirmReset.value = false; apply({ ...DEFAULT_SETTINGS(), lang: state.settings.lang, setupDone: true, syncImported: true }, t('Settings reset to defaults')) }
</script>

<template>
  <Teleport to="body">
    <div class="ov" @mousedown.self="close">
      <div class="dlg" role="dialog" :aria-label="t('Interface settings')">
        <div class="hd"><Icon name="gear" :size="20" /><h2>{{ t('Interface settings') }}</h2><button class="btn clear ibtn sm" :aria-label="t('Close')" @click="close"><Icon name="x" :size="18" /></button></div>
        <div class="bd">
          <nav class="nv" role="tablist">
            <button v-for="[k, ic, l] in TABS" :key="k" role="tab" :aria-selected="tab === k" :class="{ on: tab === k }" @click="tab = k"><Icon :name="ic" :size="17" /><span>{{ t(l) }}</span></button>
          </nav>
          <div class="pn">
            <!-- General -->
            <template v-if="tab === 'general'">
              <div class="rw"><div class="k"><b>{{ t('Printer name') }}</b><span>{{ t('Empty: the name from Mainsail or the hostname') }}</span></div><input v-model="state.settings.printerName" class="input v" :placeholder="state.printerName || 'Printer'" :aria-label="t('Printer name')" /></div>
              <div class="rw"><div class="k"><b>{{ t('Language') }}</b></div><select class="input v" :value="state.settings.lang || 'en'" :aria-label="t('Language')" @change="state.settings.lang = $event.target.value"><option v-for="[k, n] in LANGS" :key="k" :value="k">{{ n }}</option></select></div>
              <div class="rw"><div class="k"><b>{{ t('Search inside scripts and notes') }}</b><span>{{ t('Ctrl+K also finds lines in .py, .sh and .txt files of the config folder. Turn off on slow hosts.') }}</span></div><Toggle v-model="state.settings.searchContent" :label="t('Search inside scripts and notes')" /></div>
              <div class="rw"><div class="k"><b>{{ t('Check for updates automatically') }}</b><span>{{ t('Asks Moonraker to look for new versions every 6 hours, not while printing. Off: only when you press Check.') }}</span></div><Toggle :model-value="state.settings.autoUpdateCheck !== false" :label="t('Check for updates automatically')" @update:model-value="state.settings.autoUpdateCheck = $event" /></div>
              <div class="rw"><div class="k"><b>{{ t('Show Klipper errors as pop-ups') }}</b></div><Toggle v-model="state.settings.errorToasts" :label="t('Error pop-ups')" /></div>
              <div class="rw"><div class="k"><b>{{ t('First-start setup') }}</b><span>{{ t('Runs the short setup again: language, favorites, sounds.') }}</span></div><button class="btn" @click="close(); state.settings.setupDone = false">{{ t('Run again') }}</button></div>
              <div v-if="api.auth.token" class="rw"><div class="k"><b>{{ t('Signed in to Moonraker as {user}', { user: api.auth.user }) }}</b></div><button class="btn" @click="api.logout()"><Icon name="lock" :size="15" />{{ t('Sign out') }}</button></div>
            </template>

            <!-- Dashboard -->
            <template v-else-if="tab === 'dashboard'">
              <div class="rw"><div class="k"><b>{{ t('Cards and layout') }}</b><span>{{ t('Add, remove, move and resize cards, choose card colours, hide top tiles.') }}</span></div><button class="btn acc" @click="customize"><Icon name="layout" :size="16" />{{ t('Customize') }}</button></div>
              <div class="rw"><div class="k"><b>{{ t('Compact cards') }}</b><span>{{ t('Less padding, a thinner title bar and smaller gaps, so more fits on the screen.') }}</span></div><Toggle :model-value="state.settings.compactCards !== false" :label="t('Compact cards')" @update:model-value="state.settings.compactCards = $event" /></div>
              <div class="rw"><div class="k"><b>{{ t('Separate dashboard while printing') }}</b><span>{{ t('A second layout that is shown while a print runs.') }}</span></div><Toggle v-model="state.settings.autoLayout" :label="t('Separate dashboard while printing')" /></div>
              <div class="rw"><div class="k"><b>{{ t('Favorites bar') }}</b><span>{{ t('Macro buttons under the top bar. Also available as a Favorites card for the dashboard.') }}</span></div><div class="row" style="gap:8px"><div class="seg"><button v-for="[k, l] in [['always', 'Everywhere'], ['dashboard', 'Dashboard only'], ['off', 'Off']]" :key="k" :class="{ on: (state.settings.favBar || 'always') === k }" @click="state.settings.favBar = k">{{ t(l) }}</button></div><button class="btn" @click="editFavs"><Icon name="pencil" :size="15" />{{ t('Edit') }}</button></div></div>
              <div class="rw col"><div class="k"><b>{{ t('Temperatures card & graph') }}</b><span>{{ t('Sensors shown in the temperatures card and graph.') }}</span></div>
                <div class="row" style="flex-wrap:wrap;gap:6px"><button v-for="s in tempSensors" :key="s" class="sch" :class="{ on: !state.settings.hiddenSensors.includes(s) }" :aria-pressed="!state.settings.hiddenSensors.includes(s)" @click="toggleHidden(state.settings.hiddenSensors, s)">{{ prettyName(s) }}</button></div>
              </div>
              <div class="rw"><div class="k"><b>{{ t('Graph range') }}</b></div><div class="seg v"><button v-for="r in [300, 600, 1200]" :key="r" :class="{ on: (state.settings.tempRange || 600) === r }" @click="state.settings.tempRange = r">{{ r / 60 }} {{ t('min') }}</button></div></div>
            </template>

            <!-- Control -->
            <template v-else-if="tab === 'control'">
              <h3 class="sec"><Icon name="move" :size="16" />{{ t('Toolhead') }}</h3>
              <div class="rw"><div class="k"><b>{{ t('Invert Z jog buttons (bed moves in Z)') }}</b></div><Toggle v-model="state.settings.invertZ" :label="t('Invert Z')" /></div>
              <div class="rw"><div class="k"><b>{{ t('Movement speed X & Y axes') }}</b></div><label class="unit v"><input v-model.number="ctl.feedXY" type="number" min="1" max="1000" class="input mono" :aria-label="t('Movement speed X & Y axes')" /><span>mm/s</span></label></div>
              <div class="rw"><div class="k"><b>{{ t('Movement speed Z axis') }}</b></div><label class="unit v"><input v-model.number="ctl.feedZ" type="number" min="1" max="200" class="input mono" :aria-label="t('Movement speed Z axis')" /><span>mm/s</span></label></div>
              <div class="rw"><div class="k"><b>{{ t('Move distance increments X & Y axes (in mm)') }}</b><span>{{ t('Buttons left and right of the axis letter, up to 4.') }}</span></div><ChipList v-model="ctl.stepsXY" class="v" :max="4" desc :label="t('Move distance increments X & Y axes (in mm)')" /></div>
              <div class="rw"><div class="k"><b>{{ t('Move distance increments Z axis (in mm)') }}</b></div><ChipList v-model="ctl.stepsZ" class="v" :max="4" desc :label="t('Move distance increments Z axis (in mm)')" /></div>
              <div class="rw"><div class="k"><b>{{ t('D-pad steps (in mm)') }}</b><span>{{ t('Step choices next to the arrow pad.') }}</span></div><ChipList v-model="ctl.dpad" class="v" :max="6" desc :label="t('D-pad steps (in mm)')" /></div>
              <div class="rw"><div class="k"><b>{{ t('Z-Offset increments (in mm)') }}</b></div><ChipList v-model="ctl.zOffset" class="v" :max="5" :label="t('Z-Offset increments (in mm)')" /></div>
              <h3 class="sec"><Icon name="load" :size="16" />{{ t('Extruder') }}</h3>
              <div class="rw"><div class="k"><b>{{ t('Extrusion amount presets (in mm)') }}</b></div><ChipList v-model="ctl.extAmounts" class="v" :max="6" :label="t('Extrusion amount presets (in mm)')" /></div>
              <div class="rw"><div class="k"><b>{{ t('Extrusion speed presets (in mm/s)') }}</b></div><ChipList v-model="ctl.extFeeds" class="v" :max="6" :label="t('Extrusion speed presets (in mm/s)')" /></div>
            </template>

            <!-- Presets -->
            <template v-else-if="tab === 'presets'">
              <div class="rw"><div class="k"><b>{{ t('Temperature presets') }}</b><span>{{ t('Tip: type a preset name in the search (Ctrl+K) to preheat.') }}</span></div><button class="btn" @click="addPreset"><Icon name="plus" :size="16" />{{ t('Add preset') }}</button></div>
              <div v-for="(p, i) in state.settings.presets" :key="p.id" class="pr">
                <label class="col" style="gap:4px"><span class="lbl">{{ t('Name') }}</span><input v-model="p.name" class="input" style="width:120px;font-weight:700" :aria-label="t('Preset name')" /></label>
                <label v-for="h in heaters" :key="h" class="col" style="gap:4px"><span class="lbl">{{ prettyName(h) }}</span><input v-model.number="p.temps[h]" type="number" class="input mono" style="width:84px" /></label>
                <button class="btn clear ibtn sm" :aria-label="t('Remove preset')" style="margin-top:20px" @click="state.settings.presets.splice(i, 1)"><Icon name="trash" :size="16" /></button>
              </div>
            </template>

            <!-- Console -->
            <template v-else-if="tab === 'console'">
              <div class="rw"><div class="k"><b>{{ t('Hide temperature lines') }}</b><span>{{ t('M105 / temperature reports are filtered out of the console.') }}</span></div><Toggle v-model="state.settings.consoleHideTemps" :label="t('Hide temperature lines')" /></div>
            </template>

            <!-- Appearance -->
            <template v-else-if="tab === 'appearance'">
              <div class="rw"><div class="k"><b>{{ t('Mode') }}</b></div><div class="seg v"><button v-for="[k, l, ic] in [['dark', 'Dark', 'moon'], ['light', 'Light', 'sun'], ['auto', 'Auto', 'contrast']]" :key="k" :class="{ on: (state.settings.theme || 'dark') === k }" @click="state.settings.theme = k"><Icon :name="ic" :size="14" style="margin-right:6px;vertical-align:-2px" />{{ t(l) }}</button></div></div>
              <div class="rw"><div class="k"><b>{{ t('Accent') }}</b><span>{{ t('Colour of actions, section headings and the logo.') }}</span></div>
                <div class="row v" style="flex-wrap:wrap;gap:10px;justify-content:flex-end"><button v-for="c in ACCENTS" :key="c" class="swc" :class="{ on: state.settings.accent === c }" :style="{ background: c }" :aria-label="t('Accent') + ' ' + c" @click="state.settings.accent = c"></button><label class="swc cu" :aria-label="t('Custom accent')"><input v-model="state.settings.accent" type="color" /></label></div>
              </div>
              <div class="rw"><div class="k"><b>{{ t('Printer icon') }}</b><span>{{ t('Shown in the browser tab and the top bar, so each printer is easy to find among open tabs.') }}</span></div>
                <div class="col v" style="gap:10px;align-items:flex-end">
                  <div class="row" style="gap:10px">
                    <img v-if="iconUrl()" :src="iconUrl()" width="34" height="34" alt="" style="border-radius:8px;object-fit:contain" />
                    <div class="seg"><button v-for="[k, l] in [['voyager', 'Voyager'], ['letters', 'Letters'], ['image', 'Image']]" :key="k" :class="{ on: pi.kind === k }" @click="k === 'image' && !pi.img ? piFile.click() : (pi.kind = k)">{{ t(l) }}</button></div>
                  </div>
                  <div v-if="pi.kind === 'letters'" class="row" style="gap:8px;flex-wrap:wrap;justify-content:flex-end">
                    <input v-model="pi.text" class="input" maxlength="3" style="width:72px;text-align:center;font-weight:700" :placeholder="initials(printerName)" :aria-label="t('Letters')" />
                    <button v-for="c in ACCENTS" :key="c" class="swc" :class="{ on: pi.color === c }" :style="{ background: c }" :aria-label="c" @click="pi.color = c"></button>
                    <label class="swc cu" :aria-label="t('Custom color')"><input v-model="pi.color" type="color" /></label>
                  </div>
                  <button v-if="pi.kind === 'image'" class="btn" @click="piFile.click()"><Icon name="upload" :size="16" />{{ t('Choose image') }}</button>
                  <input ref="piFile" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" hidden @change="pickIcon" />
                </div>
              </div>
              <div class="rw"><div class="k"><b>{{ t('Interface size') }}</b><span>{{ t('Auto keeps the layout the same on every screen: a laptop shows the same cards side by side as a 1920 px monitor, only smaller.') }} <span class="mono">{{ Math.round(zoomNow * 100) }}%</span></span></div>
                <div class="seg v"><button v-for="k in [80, 90, 100, 110, 125, 'auto']" :key="k" :class="{ on: String(state.settings.uiScale ?? 100) === String(k) }" @click="state.settings.uiScale = k">{{ k === 'auto' ? t('Auto') : k + '%' }}</button></div>
              </div>
              <div class="rw"><div class="k"><b>{{ t('Side menu') }}</b><span>{{ t('Auto-hide: move the mouse to the left edge and the menu opens over the page.') }}</span></div>
                <div class="seg v"><button v-for="[k, l] in [['pinned', 'Always visible'], ['hidden', 'Hidden'], ['auto', 'Auto-hide']]" :key="k" :class="{ on: (state.settings.navMode || 'pinned') === k }" @click="state.settings.navMode = k">{{ t(l) }}</button></div>
              </div>
            </template>

            <!-- Sounds -->
            <template v-else-if="tab === 'sounds'">
              <div class="rw"><div class="k"><b>{{ t('Play sounds') }}</b><span>{{ t('Sounds play in this browser tab, so the page has to be open somewhere.') }}</span></div><div class="row" style="gap:8px"><button class="btn" :disabled="!snd.enabled" @click="playSound('complete')"><Icon name="volume" :size="16" />{{ t('Test') }}</button><Toggle v-model="snd.enabled" :label="t('Play sounds')" /></div></div>
              <template v-if="snd.enabled">
                <div class="rw"><div class="k"><b>{{ t('Volume') }}</b></div><input v-model.number="snd.volume" type="range" min="0.1" max="1" step="0.05" class="rng v" :style="{ '--f': (snd.volume - 0.1) / 0.9 }" :aria-label="t('Volume')" /></div>
                <div v-for="[k, l, tone] in SOUNDS" :key="k" class="rw"><div class="k"><b>{{ t(l) }}</b></div><div class="row" style="gap:6px"><button class="btn clear ibtn sm" :aria-label="t('Play')" @click="playSound(tone)"><Icon name="play" :size="14" /></button><Toggle v-model="snd[k]" :label="t(l)" /></div></div>
              </template>
            </template>

            <!-- Notifications -->
            <template v-else-if="tab === 'notify'"><NotifierSettings /></template>

            <!-- Webcams -->
            <template v-else-if="tab === 'webcams'">
              <span class="hint">{{ t('Webcams are stored by Moonraker, so this list is the same in Mainsail and Fluidd.') }}</span>
              <div v-for="w in state.webcams" :key="w.name" class="rw">
                <div class="k"><b>{{ w.name }}</b><span class="mono">{{ SERVICES.find(([k]) => k === w.service)?.[1] || w.service }} · {{ w.stream_url || w.snapshot_url }}</span></div>
                <div class="row" style="gap:6px"><button class="btn" @click="editCam(w)"><Icon name="pencil" :size="15" />{{ t('Edit') }}</button><button class="btn clear ibtn sm" :aria-label="t('Remove {name}', { name: w.name })" @click="delCam = w"><Icon name="trash" :size="15" /></button></div>
              </div>
              <div v-if="!state.webcams.length" class="hint">{{ t('No webcams yet.') }}</div>
              <div class="row" style="justify-content:space-between;flex-wrap:wrap"><button class="btn clear" @click="close(); go('config', 'config/crowsnest.conf')"><Icon name="code" :size="15" />{{ t('Edit crowsnest.conf') }}</button><button class="btn acc" @click="newCam"><Icon name="plus" :size="16" />{{ t('Add webcam') }}</button></div>
            </template>

            <!-- Sync -->
            <template v-else-if="tab === 'sync'">
              <div class="rw"><div class="k"><b>{{ t('Keep shared settings in sync') }}</b><span>{{ t('Printer name, language, jog speeds and steps, extrusion and temperature presets are written to the Mainsail and Fluidd database when they change here. Nothing else of theirs is touched.') }}</span></div><Toggle v-model="state.settings.sync" :label="t('Keep shared settings in sync')" /></div>
              <div class="rw"><div class="k"><b>{{ t('Found on this host') }}</b><span v-if="!sync.checked">{{ t('Checking…') }}</span><span v-else>{{ [sync.mainsail && 'Mainsail', sync.fluidd && 'Fluidd'].filter(Boolean).join(', ') || t('Neither Mainsail nor Fluidd has settings in the Moonraker database.') }}</span></div>
                <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end"><button v-if="sync.mainsail" class="btn" @click="doImport('mainsail')"><Icon name="download" :size="15" />{{ t('Take over from Mainsail') }}</button><button v-if="sync.fluidd" class="btn" @click="doImport('fluidd')"><Icon name="download" :size="15" />{{ t('Take over from Fluidd') }}</button><button v-if="sync.mainsail || sync.fluidd" class="btn" :disabled="sync.busy || !state.settings.sync" @click="doPush"><Icon name="upload" :size="15" />{{ t('Write now') }}</button></div>
              </div>
              <span v-if="syncMsg" class="hint ok">{{ syncMsg }}</span>
              <span class="hint">{{ t('The other UI shows the new values after its page is reloaded. Dashboard layout, colours and favorites stay separate, they mean different things in each UI.') }}</span>
            </template>

            <!-- Backup -->
            <template v-else-if="tab === 'backup'">
              <div class="rw"><div class="k"><b>{{ t('Backup & restore') }}</b><span>{{ t('Favorites, dashboard layout, cards, presets, theme and all other UI settings in one file.') }}</span></div>
                <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn acc" @click="download"><Icon name="download" :size="16" :stroke="2.4" />{{ t('Download backup') }}</button><button class="btn" @click="restoreFile.click()"><Icon name="upload" :size="16" />{{ t('Restore from file') }}</button><input ref="restoreFile" type="file" accept=".json,application/json" hidden @change="pickFile" /></div>
              </div>
              <div v-if="prev" class="rw"><div class="k"><b>{{ t('Previous settings') }}</b><span>{{ fmtD(prev.date) }}</span></div><button class="btn" @click="undoRestore"><Icon name="rot" :size="16" />{{ t('Go back') }}</button></div>
              <div class="rw"><div class="k"><b>{{ t('Reset all UI settings') }}</b><span>{{ t('Favorites, presets and card settings go back to defaults.') }}</span></div><button class="btn dg" @click="confirmReset = true">{{ t('Reset') }}</button></div>
              <span class="hint">{{ APP_NAME }} v{{ VERSION }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Modal v-if="cam" :title="cam._old ? t('Edit webcam') : t('Add webcam')" width="560px" @close="cam = null">
    <label class="col" style="gap:4px"><span class="lbl">{{ t('Name') }}</span><input v-model="cam.name" class="input" :aria-label="t('Name')" /></label>
    <label class="col" style="gap:4px"><span class="lbl">{{ t('Service') }}</span><select v-model="cam.service" class="input" :aria-label="t('Service')"><option v-for="[k, l] in SERVICES" :key="k" :value="k">{{ l }}</option></select></label>
    <label class="col" style="gap:4px"><span class="lbl">{{ t('Stream URL') }}</span><input v-model="cam.stream_url" class="input mono" spellcheck="false" :aria-label="t('Stream URL')" /></label>
    <label class="col" style="gap:4px"><span class="lbl">{{ t('Snapshot URL') }}</span><input v-model="cam.snapshot_url" class="input mono" spellcheck="false" :aria-label="t('Snapshot URL')" /></label>
    <div class="row" style="gap:14px;flex-wrap:wrap">
      <label class="row" style="gap:8px"><input v-model="cam.flip_horizontal" type="checkbox" />{{ t('Flip horizontally') }}</label>
      <label class="row" style="gap:8px"><input v-model="cam.flip_vertical" type="checkbox" />{{ t('Flip vertically') }}</label>
      <label class="row" style="gap:8px">{{ t('Rotation') }}<select v-model.number="cam.rotation" class="input" style="height:32px"><option v-for="r in [0, 90, 180, 270]" :key="r" :value="r">{{ r }}°</option></select></label>
    </div>
    <template #foot><button class="btn lg" @click="cam = null">{{ t('Cancel') }}</button><button class="btn lg acc" :disabled="!cam.name.trim()" @click="saveCam">{{ t('Save') }}</button></template>
  </Modal>
  <Modal v-if="delCam" :title="t('Remove {name}?', { name: delCam.name })" @close="delCam = null">
    <p class="mu" style="margin:0">{{ t('The webcam is removed from Moonraker, so also from Mainsail and Fluidd.') }}</p>
    <template #foot><button class="btn lg" @click="delCam = null">{{ t('Cancel') }}</button><button class="btn lg dgf" @click="removeCam">{{ t('Remove') }}</button></template>
  </Modal>
  <Modal v-if="pending" :title="t('Restore settings?')" @close="pending = null">
    <p style="margin:0">{{ t('Replace all current UI settings with {name}?', { name: pending.name }) }} <span class="mu">({{ fmtD(pending.date) }}, v{{ pending.version }})</span></p>
    <span class="mu">{{ t('Your current settings are kept so you can go back.') }}</span>
    <template #foot><button class="btn lg" @click="pending = null">{{ t('Cancel') }}</button><button class="btn lg acc" @click="applyPending">{{ t('Restore') }}</button></template>
  </Modal>
  <Modal v-if="confirmReset" :title="t('Reset UI settings?')" @close="confirmReset = false">
    <p class="mu" style="margin:0">{{ t('Favorites, presets and card settings go back to defaults.') }}</p>
    <template #foot><button class="btn lg" @click="confirmReset = false">{{ t('Cancel') }}</button><button class="btn lg dgf" @click="reset">{{ t('Reset') }}</button></template>
  </Modal>
</template>

<style scoped>
.ov { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 95; padding: 16px; }
.dlg { width: 960px; max-width: 100%; height: calc(88vh / var(--zoom, 1)); max-height: 820px; display: flex; flex-direction: column; background: var(--s1); border: 1px solid var(--bd); border-radius: var(--r); box-shadow: 0 20px 60px rgba(0,0,0,.5); overflow: hidden; }
.hd { display: flex; align-items: center; gap: 10px; padding: 14px 16px 14px 20px; border-bottom: 1px solid var(--bd); flex-shrink: 0; }
.hd h2 { margin: 0; flex: 1; font-size: 17px; }
.bd { flex: 1; min-height: 0; display: flex; }
.nv { width: 210px; flex-shrink: 0; overflow: auto; padding: 10px 8px; border-right: 1px solid var(--bd); display: flex; flex-direction: column; gap: 2px; background: var(--s0, var(--bg)); }
.nv button { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; border: none; border-radius: 9px; background: transparent; color: var(--mu); font-size: 13px; font-weight: 600; text-align: left; white-space: nowrap; }
.nv button:hover { color: var(--tx); background: var(--s2); }
.nv button.on { color: var(--tx); background: var(--s2); box-shadow: inset 3px 0 0 var(--ac); }
.pn { flex: 1; min-width: 0; overflow: auto; padding: 8px 22px 22px; display: flex; flex-direction: column; }
.rw { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 0; border-bottom: 1px solid var(--bd); }
.rw.col { flex-direction: column; align-items: stretch; gap: 10px; }
.rw:last-child { border-bottom: none; }
.k { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.k b { font-size: 14px; font-weight: 600; }
.k span { font-size: 12px; color: var(--mu); }
.v { width: 320px; max-width: 55%; flex-shrink: 0; }
.unit { display: flex; align-items: center; gap: 8px; }
.unit input { width: 100%; }
.unit span { color: var(--mu); font-size: 13px; white-space: nowrap; }
.sec { display: flex; align-items: center; gap: 8px; margin: 18px 0 2px; font-size: 13px; font-weight: 700; color: var(--mu); text-transform: uppercase; letter-spacing: .04em; }
.sec :deep(svg) { color: var(--ac); }
.hint { font-size: 12.5px; color: var(--mu); padding: 10px 0; }
.hint.ok { color: var(--ok); }
.mu { color: var(--mu); font-size: 13px; }
.pr { display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; padding: 10px 0; border-bottom: 1px solid var(--bd); }
.swc { width: 34px; height: 34px; border-radius: 17px; border: 3px solid var(--s1); outline: 2px solid var(--bd); cursor: pointer; }
.swc.on { outline-color: var(--tx); }
.cu { background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); position: relative; overflow: hidden; }
.cu input { opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.sch { height: 30px; padding: 0 12px; border-radius: 15px; border: none; background: var(--s2); color: var(--mu2); font-size: 12.5px; font-weight: 500; text-decoration: line-through; }
.sch.on { background: var(--heat-bg); color: var(--heat); text-decoration: none; }
@media (max-width: 760px) {
  .ov { padding: 0; }
  .dlg { height: 100%; max-height: none; border-radius: 0; border: none; }
  .bd { flex-direction: column; }
  .nv { width: auto; flex-direction: row; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--bd); padding: 8px; }
  .nv button { height: 34px; padding: 0 10px; }
  .nv button span { display: none; }
  .nv button.on span { display: inline; }
  .rw { flex-wrap: wrap; }
  .v { width: 100%; max-width: 100%; }
}
</style>
