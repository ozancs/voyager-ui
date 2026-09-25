<script setup>
// First start: language, printer name, Z direction, alerts, job queue. Can be run again from Settings.
import { ref, computed } from 'vue'
import Icon from './Icon.vue'
import Logo from './Logo.vue'
import Toggle from './Toggle.vue'
import { state, toast, DEFAULT_SETTINGS, APP, OLD_APPS } from '../store'
import { enableQueue, loadQueue, playSound } from '../features'
import { t, LANGS, i18n } from '../i18n'

const show = computed(() => state.connected && state.settingsLoaded && !state.settings.setupDone)
const step = ref(0)
const STEPS = ['Language', 'Printer', 'Alerts', 'Extras']
function pickLang(l) { state.settings.lang = l; step.value = 1 }
if (!state.settings.sound) state.settings.sound = DEFAULT_SETTINGS().sound
const snd = computed(() => state.settings.sound)
const qBusy = ref(false)
async function turnOnQueue() {
  qBusy.value = true
  try { await enableQueue(); setTimeout(loadQueue, 6000) } catch (e) { toast(e.message, 'error') }
  qBusy.value = false
}
function finish() { state.settings.setupDone = true; step.value = 0 }
// restore a settings file instead of answering everything
const fileIn = ref(null)
async function restore(e) {
  const f = e.target.files[0]; e.target.value = ''
  if (!f) return
  try {
    const d = JSON.parse(await f.text())
    if (![APP, ...OLD_APPS].includes(d.app) || !d.settings) throw new Error('?')
    const def = DEFAULT_SETTINGS()
    state.settings = { ...def, ...d.settings, lang: state.settings.lang || d.settings.lang || i18n.lang, setupDone: true, devices: { ...def.devices, ...(d.settings.devices || {}) }, strip: { ...def.strip, ...(d.settings.strip || {}) } }
    toast(t('Settings restored from {name}', { name: f.name }))
  } catch { toast(t('Could not read backup: {msg}', { msg: f.name }), 'error') }
}
</script>

<template>
  <div v-if="show" class="ov">
    <div class="wz card" role="dialog" :aria-label="t('Setup')">
      <div class="top">
        <Logo :size="44" />
        <div class="col" style="gap:0"><b style="font-size:18px">{{ t('Welcome') }}</b><span class="mu">{{ t('A few questions, you can change everything later in Settings.') }}</span></div>
      </div>
      <div class="dots"><span v-for="(s, i) in STEPS" :key="s" :class="{ on: i === step, done: i < step }">{{ t(s) }}</span></div>

      <!-- language -->
      <div v-if="step === 0" class="body">
        <h3>{{ t('Choose your language') }}</h3>
        <div class="langs">
          <button v-for="[k, n] in LANGS" :key="k" class="lang" :class="{ on: (state.settings.lang || i18n.lang) === k }" @click="pickLang(k)"><b>{{ n }}</b><span class="mu code">{{ k }}</span></button>
        </div>
        <button class="btn clear" style="align-self:flex-start" @click="fileIn.click()"><Icon name="upload" :size="15" />{{ t('I have a settings backup file') }}</button>
        <input ref="fileIn" type="file" accept=".json" hidden @change="restore" />
      </div>

      <!-- printer -->
      <div v-else-if="step === 1" class="body">
        <h3>{{ t('Your printer') }}</h3>
        <label class="col" style="gap:4px"><span class="lbl">{{ t('Printer name') }}</span><input v-model="state.settings.printerName" class="input" :placeholder="state.printerName || state.versions.host || 'Printer'" /></label>
        <span class="lbl">{{ t('What moves when Z changes?') }}</span>
        <div class="two">
          <button class="opt" :class="{ on: state.settings.invertZ }" @click="state.settings.invertZ = true"><Icon name="down" :size="22" /><b>{{ t('The bed') }}</b><span class="mu">{{ t('CoreXY with moving bed, Voron Trident, most enclosed printers') }}</span></button>
          <button class="opt" :class="{ on: !state.settings.invertZ }" @click="state.settings.invertZ = false"><Icon name="up" :size="22" /><b>{{ t('The toolhead / gantry') }}</b><span class="mu">{{ t('Bed slingers, Voron 2.4, most open frame printers') }}</span></button>
        </div>
        <span class="mu">{{ t('This makes the Z jog arrows point the way the nozzle moves relative to the bed.') }}</span>
      </div>

      <!-- alerts -->
      <div v-else-if="step === 2" class="body">
        <h3>{{ t('Alerts') }}</h3>
        <div class="row sp"><div class="col" style="gap:2px"><b>{{ t('Play sounds') }}</b><span class="mu">{{ t('Print finished, paused or error. Only while this page is open.') }}</span></div><div class="row" style="gap:6px"><button class="btn clear ibtn sm" :aria-label="t('Test')" @click="playSound('complete')"><Icon name="play" :size="14" /></button><Toggle v-model="snd.enabled" :label="t('Play sounds')" /></div></div>
        <div class="row sp"><div class="col" style="gap:2px"><b>{{ t('Show Klipper errors as pop-ups') }}</b><span class="mu">{{ t('With a short hint about what the error means.') }}</span></div><Toggle v-model="state.settings.errorToasts" :label="t('Error pop-ups')" /></div>
        <div class="row sp"><div class="col" style="gap:2px"><b>{{ t('Separate dashboard while printing') }}</b><span class="mu">{{ t('Switches layout automatically when a print starts. Edit both in Customize.') }}</span></div><Toggle v-model="state.settings.autoLayout" :label="t('Separate dashboard while printing')" /></div>
      </div>

      <!-- extras -->
      <div v-else class="body">
        <h3>{{ t('Optional features') }}</h3>
        <div class="row sp">
          <div class="col" style="gap:2px"><b>{{ t('Job queue') }}</b><span class="mu">{{ t('Print several files one after another.') }}</span></div>
          <span v-if="state.queue.enabled" class="chip" style="color:var(--ok)"><i></i>{{ t('on') }}</span>
          <button v-else class="btn" :disabled="qBusy || state.queue.enabled === null" @click="turnOnQueue">{{ t('Turn on') }}</button>
        </div>
        <div class="row sp">
          <div class="col" style="gap:2px"><b>Spoolman</b><span class="mu">{{ t('Filament spool tracking.') }}</span></div>
          <span class="chip" :style="{ color: state.spoolman.server ? 'var(--ok)' : 'var(--mu)' }"><i></i>{{ state.spoolman.server ? t('found') : t('not set up') }}</span>
        </div>
        <div class="tip"><Icon name="search" :size="18" /><span>{{ t('Press Ctrl+K anywhere to search everything. Try “bed 60” or “chamber 40”.') }}</span></div>
      </div>

      <div class="ft">
        <button v-if="step > 0" class="btn lg" @click="step--">{{ t('Back') }}</button>
        <button class="btn lg clear" style="margin-right:auto" @click="finish">{{ t('Skip') }}</button>
        <button v-if="step < 3" class="btn lg acc" @click="step === 0 && !state.settings.lang ? pickLang(i18n.lang) : step++">{{ t('Next') }}</button>
        <button v-else class="btn lg acc" @click="finish"><Icon name="check" :size="18" :stroke="2.6" />{{ t('Done') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ov { position: fixed; inset: 0; background: rgba(8,9,11,.7); backdrop-filter: blur(4px); z-index: 160; display: flex; align-items: center; justify-content: center; padding: 16px; }
.wz { width: 620px; max-width: 100%; max-height: calc(92vh / var(--zoom, 1)); overflow: auto; gap: 18px; padding: 24px; box-shadow: 0 30px 80px rgba(0,0,0,.6); }
.top { display: flex; align-items: center; gap: 14px; }
.logo { width: 44px; height: 44px; border-radius: 12px; background: var(--ac); color: var(--oa); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.mu { color: var(--mu); font-size: 12.5px; font-weight: 400; }
.dots { display: flex; gap: 6px; }
.dots span { flex: 1; font-size: 11.5px; font-weight: 600; color: var(--mu2); padding-top: 8px; border-top: 3px solid var(--s3); }
.dots span.on { color: var(--tx); border-color: var(--ac); }
.dots span.done { border-color: color-mix(in srgb, var(--ac) 45%, transparent); }
.body { display: flex; flex-direction: column; gap: 14px; min-height: 230px; }
h3 { margin: 0; font-size: 17px; }
.langs { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.lang { height: 64px; border-radius: 12px; border: 2px solid transparent; background: var(--s2); color: var(--tx); display: flex; flex-direction: column; align-items: flex-start; justify-content: center; padding: 0 16px; gap: 2px; font-size: 15px; }
.lang.on { border-color: var(--ac); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.opt { border-radius: 12px; border: 2px solid transparent; background: var(--s2); color: var(--tx); display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 14px; text-align: left; }
.opt :deep(svg) { color: var(--mu); }
.opt.on { border-color: var(--ac); }
.opt.on :deep(svg) { color: var(--heat); }
.sp { justify-content: space-between; gap: 16px; }
.tip { display: flex; gap: 10px; align-items: center; padding: 12px 14px; border-radius: 12px; background: var(--cool-bg); color: var(--cool); font-size: 13px; }
.ft { display: flex; gap: 8px; }
@media (max-width: 560px) { .two { grid-template-columns: 1fr; } }
</style>
