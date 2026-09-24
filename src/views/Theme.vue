<script setup>
import { ref, computed } from 'vue'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import Toggle from '../components/Toggle.vue'
import { state, saveSettings, prettyName, DEFAULT_SETTINGS, S, VERSION, toast, APP, APP_NAME } from '../store'
import { api } from '../api/moonraker'
import { playSound } from '../features'
import { t, LANGS } from '../i18n'

if (!state.settings.sound) state.settings.sound = DEFAULT_SETTINGS().sound
const snd = computed(() => state.settings.sound)
const SOUNDS = [['complete', 'Print finished', 'complete'], ['paused', 'Print paused (e.g. runout)', 'paused'], ['error', 'Error / Klipper shutdown', 'error'], ['heated', 'Heater reached target', 'heated']]
const ACCENTS = ['#ff6b1a', '#38d6ff', '#3dd68c', '#f5c451', '#8b6cff', '#ff3d7f', '#e5484d']
const heaters = computed(() => S('heaters').available_heaters || [])
function addPreset() { state.settings.presets.push({ id: 'p' + Date.now(), name: t('New'), temps: Object.fromEntries(heaters.value.map((h) => [h, 0])) }) }
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
    if (![APP, 'carbon-ui'].includes(d.app) || !d.settings) throw new Error(t('not a {app} settings file', { app: APP_NAME }))
    pending.value = { ...d, name: f.name }
  } catch (err) { toast(t('Could not read backup: {msg}', { msg: err.message }), 'error') }
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
function applyPending() { const p = pending.value; pending.value = null; apply(p.settings, t('Settings restored from {name}', { name: p.name })) }
function undoRestore() { if (prev.value) apply(prev.value.settings, t('Previous settings restored')) }
const fmtD = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
// language and first-run state survive a reset
function reset() { confirmReset.value = false; apply({ ...DEFAULT_SETTINGS(), lang: state.settings.lang, setupDone: true }, t('Settings reset to defaults')) }
</script>

<template>
  <div class="tg">
    <section id="set-language" class="card">
      <div class="card-h"><h2>{{ t('Language') }}</h2><Icon name="info" :size="18" style="color:var(--mu)" /></div>
      <div class="seg">
        <button v-for="[k, n] in LANGS" :key="k" :class="{ on: (state.settings.lang || 'en') === k }" @click="state.settings.lang = k">{{ n }}</button>
      </div>
      <button class="btn clear" style="align-self:flex-start" @click="state.settings.setupDone = false">{{ t('Run the first-start setup again') }}</button>
    </section>

    <section id="set-accent" class="card">
      <div class="card-h"><h2>{{ t('Accent') }}</h2></div>
      <div class="row" style="flex-wrap:wrap;gap:10px">
        <button v-for="c in ACCENTS" :key="c" class="swc" :class="{ on: state.settings.accent === c }" :style="{ background: c }" :aria-label="t('Accent') + ' ' + c" @click="state.settings.accent = c"></button>
        <label class="swc cu" :aria-label="t('Custom accent')"><input v-model="state.settings.accent" type="color" /></label>
      </div>
    </section>

    <section id="set-controls" class="card">
      <div class="card-h"><h2>{{ t('Controls') }}</h2></div>
      <label class="col" style="gap:4px"><span class="lbl">{{ t('Printer name (empty = name from Mainsail / hostname)') }}</span><input v-model="state.settings.printerName" class="input" :placeholder="state.printerName || 'Printer'" /></label>
      <div class="row sp"><span>{{ t('Invert Z jog buttons (bed moves in Z)') }}</span><Toggle v-model="state.settings.invertZ" :label="t('Invert Z')" /></div>
      <div class="col" style="gap:6px"><span>{{ t('Side menu') }}</span>
        <div class="seg"><button v-for="[k, l] in [['pinned', 'Always visible'], ['hidden', 'Hidden'], ['auto', 'Auto-hide']]" :key="k" :class="{ on: (state.settings.navMode || 'pinned') === k }" @click="state.settings.navMode = k">{{ t(l) }}</button></div>
        <span class="mu">{{ t('Auto-hide: move the mouse to the left edge and the menu opens over the page.') }}</span>
      </div>
      <div class="row sp"><span>{{ t('Separate dashboard while printing') }}</span><Toggle v-model="state.settings.autoLayout" :label="t('Separate dashboard while printing')" /></div>
      <div class="row sp"><span>{{ t('Favorites bar') }}</span><button class="btn" @click="state.favEdit = true"><Icon name="pencil" :size="15" />{{ t('Edit') }}</button></div>
    </section>

    <section id="set-sounds" class="card">
      <div class="card-h"><h2>{{ t('Sounds & alerts') }}</h2><button class="btn" :disabled="!snd.enabled" @click="playSound('complete')"><Icon name="volume" :size="16" />{{ t('Test') }}</button></div>
      <div class="row sp"><span>{{ t('Play sounds') }}</span><Toggle v-model="snd.enabled" :label="t('Play sounds')" /></div>
      <template v-if="snd.enabled">
        <label class="row" style="gap:10px"><Icon name="volume" :size="16" style="color:var(--mu)" /><input v-model.number="snd.volume" type="range" min="0.1" max="1" step="0.05" class="rng" :style="{ '--f': (snd.volume - 0.1) / 0.9 }" :aria-label="t('Volume')" /></label>
        <div v-for="[k, l, tone] in SOUNDS" :key="k" class="row sp">
          <span>{{ t(l) }}</span>
          <div class="row" style="gap:6px"><button class="btn clear ibtn sm" :aria-label="t('Play')" @click="playSound(tone)"><Icon name="play" :size="14" /></button><Toggle v-model="snd[k]" :label="t(l)" /></div>
        </div>
        <span class="mu">{{ t('Sounds play in this browser tab, so the page has to be open somewhere.') }}</span>
      </template>
      <div class="row sp" style="border-top:1px solid var(--bd);padding-top:12px"><span>{{ t('Show Klipper errors as pop-ups') }}</span><Toggle v-model="state.settings.errorToasts" :label="t('Error pop-ups')" /></div>
    </section>

    <section id="set-presets" class="card">
      <div class="card-h"><h2>{{ t('Temperature presets') }}</h2><button class="btn" @click="addPreset"><Icon name="plus" :size="16" />{{ t('Add preset') }}</button></div>
      <div v-for="(p, i) in state.settings.presets" :key="p.id" class="pr">
        <input v-model="p.name" class="input" style="width:110px;font-weight:700" :aria-label="t('Preset name')" />
        <label v-for="h in heaters" :key="h" class="col" style="gap:4px"><span class="lbl">{{ prettyName(h) }}</span><input v-model.number="p.temps[h]" type="number" class="input mono" style="width:80px" /></label>
        <button class="btn clear ibtn sm" :aria-label="t('Remove preset')" style="margin-top:18px" @click="state.settings.presets.splice(i, 1)"><Icon name="trash" :size="16" /></button>
      </div>
      <span class="mu">{{ t('Tip: type a preset name in the search (Ctrl+K) to preheat.') }}</span>
    </section>

    <section id="set-sensors" class="card">
      <div class="card-h"><h2>{{ t('Temperatures card & graph') }}</h2></div>
      <span class="mu">{{ t('Sensors shown in the temperatures card and graph.') }}</span>
      <div class="row" style="flex-wrap:wrap;gap:6px">
        <button v-for="s in S('heaters').available_sensors || []" :key="s" class="sch" :class="{ on: !state.settings.hiddenSensors.includes(s) }" :aria-pressed="!state.settings.hiddenSensors.includes(s)" @click="toggleHidden(state.settings.hiddenSensors, s)">{{ prettyName(s) }}</button>
      </div>
    </section>

    <section id="set-backup" class="card">
      <div class="card-h"><h2>{{ t('Backup & restore') }}</h2></div>
      <span class="mu">{{ t('Favorites, dashboard layout, cards, presets, theme and all other UI settings in one file.') }}</span>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn acc" @click="download"><Icon name="download" :size="16" :stroke="2.4" />{{ t('Download backup') }}</button>
        <button class="btn" @click="restoreFile.click()"><Icon name="upload" :size="16" />{{ t('Restore from file') }}</button>
        <input ref="restoreFile" type="file" accept=".json,application/json" hidden @change="pickFile" />
      </div>
      <button v-if="prev" class="btn clear" style="align-self:flex-start" @click="undoRestore"><Icon name="rot" :size="16" />{{ t('Go back to settings before {date}', { date: fmtD(prev.date) }) }}</button>
      <button class="btn dg" style="align-self:flex-start" @click="confirmReset = true">{{ t('Reset all UI settings') }}</button>
    </section>
  </div>

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
/* masonry: cards flow into columns top to bottom */
.tg { columns: 3 380px; column-gap: 16px; }
.tg > .card { break-inside: avoid; margin-bottom: 16px; display: flex; }
.sp { justify-content: space-between; }
.mu { color: var(--mu); font-size: 13px; }
.pr { display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; padding: 8px 0; border-bottom: 1px solid var(--bd); }
.pr > .input:first-child { margin-top: 18px; }
.swc { width: 40px; height: 40px; border-radius: 20px; border: 3px solid var(--s1); outline: 2px solid var(--bd); cursor: pointer; }
.swc.on { outline-color: var(--tx); }
.cu { background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); position: relative; overflow: hidden; }
.cu input { opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.sch { height: 30px; padding: 0 12px; border-radius: 15px; border: none; background: var(--s2); color: var(--mu2); font-size: 12.5px; font-weight: 500; text-decoration: line-through; }
.sch.on { background: var(--heat-bg); color: var(--heat); text-decoration: none; }
</style>
