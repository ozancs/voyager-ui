<script setup>
// Ctrl/Cmd+K: one search box for pages, actions, macros, config files (down to the line), g-code files, commands and settings.
import { ref, computed, watch, nextTick } from 'vue'
import Icon from './Icon.vue'
import { state, S, gcode, macroList, prettyName, toast, isPrinting } from '../store'
import { go } from '../router'
import { api } from '../api/moonraker'
import { cfgIndex, loadConfigIndex, playSound } from '../features'
import { smartResults, rawCommand } from '../smart'
import { flipPower } from '../power'
import { t } from '../i18n'

const q = ref('')
const idx = ref(0)
const inp = ref(null)
const listEl = ref(null)
const gfiles = ref([])
let gfLoaded = 0

watch(() => state.spotlight, async (o) => {
  if (!o) return
  q.value = ''; idx.value = 0
  await nextTick(); inp.value?.focus()
  loadConfigIndex()
  if (Date.now() - gfLoaded > 60000) {
    gfLoaded = Date.now()
    api.call('server.files.list', { root: 'gcodes' }).then((r) => (gfiles.value = r.map((f) => f.path).filter((p) => /\.(gcode|g|gco|ufp)$/i.test(p)))).catch(() => {})
  }
})
const close = () => (state.spotlight = false)

const PAGES = [
  ['dashboard', 'dash', 'Dashboard'], ['webcam', 'cam', 'Webcam'], ['console', 'term', 'Console'], ['heightmap', 'hmap', 'Heightmap'],
  ['files', 'file', 'G-code Files'], ['viewer', 'cube', 'G-code Viewer'], ['history', 'clock', 'History'], ['machine', 'cpu', 'Machine'],
  ['health', 'heart', 'Health & Maintenance'], ['quick', 'sliders', 'Printer settings'], ['config', 'code', 'Config files'],
]
const SETTINGS = [
  ['general', 'Interface settings', 'settings ayarlar arayüz interface'], ['general', 'Language', 'dil türkçe english turkish'], ['general', 'Printer name', 'name isim'],
  ['dashboard', 'Dashboard settings', 'customize layout cards sensors chart favorites'], ['control', 'Control: jog speeds and steps', 'toolhead move increments extrude z offset invert'],
  ['presets', 'Temperature presets', 'pla petg abs preheat'], ['console', 'Console settings', 'hide temperatures'], ['appearance', 'Appearance', 'theme colour accent dark light scale size menu'],
  ['sounds', 'Sounds & alerts', 'sound audio beep volume error popup toast notification dashboard printing'], ['notify', 'Phone notifications', 'telegram discord ntfy pushover apprise notifier bildirim push'],
  ['webcams', 'Webcams', 'camera kamera crowsnest stream'], ['sync', 'Mainsail / Fluidd sync', 'shared settings import'], ['backup', 'Backup & restore settings', 'export import reset'],
]
const ACTIONS = computed(() => [
  { t: 'Home all axes', s: 'G28', icon: 'home', run: () => gcode('G28'), dest: 'Runs G28' },
  { t: 'Motors off', s: 'M84', icon: 'motor', run: () => gcode('M84'), dest: 'Runs M84' },
  { t: 'Cooldown', s: 'turn off all heaters', icon: 'fan', run: () => gcode('TURN_OFF_HEATERS'), dest: 'Runs TURN_OFF_HEATERS' },
  { t: 'Save config', s: 'SAVE_CONFIG, restarts Klipper', icon: 'save', run: () => gcode('SAVE_CONFIG'), dest: 'Runs SAVE_CONFIG', off: isPrinting.value },
  { t: 'Firmware restart', s: 'FIRMWARE_RESTART', icon: 'bolt', run: () => gcode('FIRMWARE_RESTART'), dest: 'Restarts Klipper + MCUs', off: isPrinting.value },
  { t: 'Customize dashboard', s: 'layout cards edit move', icon: 'layout', run: () => { go('dashboard'); state.dashEditReq = Date.now() }, dest: 'Dashboard' },
  { t: state.settings.sound?.enabled ? 'Turn sounds off' : 'Turn sounds on', s: 'audio alerts mute', icon: state.settings.sound?.enabled ? 'mute' : 'volume', run: () => { state.settings.sound.enabled = !state.settings.sound.enabled; if (state.settings.sound.enabled) playSound('heated') }, dest: 'Setting' },
  { t: 'Job queue', s: 'queue next print jobs', icon: 'queue', run: () => go('files'), dest: 'G-code Files' },
  { t: 'Show / hide the side menu', s: 'sidebar navigation menu yan menü', icon: 'sidebar', run: () => { state.settings.navMode = state.settings.navMode === 'hidden' ? 'pinned' : 'hidden' }, dest: 'Setting' },
  { t: 'Switch light / dark theme', s: 'theme tema light dark açık koyu mode', icon: 'contrast', run: () => { state.settings.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' }, dest: 'Setting' },
  { t: 'Edit favorites bar', s: 'favorite macros buttons toolbar', icon: 'star', run: () => { state.favEdit = true }, dest: 'Favorites bar' },
])

// ---- scoring ----
function score(hay, tokens, strict) {
  let total = 0
  for (const t of tokens) {
    const i = hay.indexOf(t)
    if (i < 0) {
      if (strict) return -1 // file contents: the typed text has to be there, letter soup would match any long line
      // loose subsequence match ("bmc" -> bed_mesh_calibrate)
      // only when the letters sit close together, otherwise everything matches
      if (t.length < 3) return -1
      let j = 0, first = -1, last = -1
      for (let k = 0; k < hay.length && j < t.length; k++) if (hay[k] === t[j]) { if (first < 0) first = k; last = k; j++ }
      if (j < t.length || last - first > t.length * 2.5) return -1
      total += 5
    } else total += i === 0 ? 40 : /[\s_\-\[.:/]/.test(hay[i - 1]) ? 28 : 14
  }
  return total
}

// smart commands ("chamber 40", "bed off", "speed 120", "home xy"...) live in smart.js
const smart = computed(() => { const r = smartResults(q.value); const raw = rawCommand(q.value); return raw ? [...r, raw] : r })

const macroDef = (m) => cfgIndex.items.find((c) => c.kind === 'section' && c.section.toLowerCase() === 'gcode_macro ' + m.toLowerCase())
function openCfg(file, line) { state.jump = { file, line, t: Date.now() }; go('config', file) }

// plain text lines of scripts only show up once the query is specific enough
const longQ = computed(() => q.value.trim().length >= 3)
const results = computed(() => {
  const raw = q.value.trim().toLowerCase()
  const tokens = raw.split(/\s+/).filter(Boolean)
  const out = [...smart.value]
  const add = (item, hay, bonus = 0, strict = false) => {
    if (!tokens.length) { if (item.cat === t('Page') || item.cat === t('Action')) out.push({ ...item, sc: bonus }); return }
    const sc = score(hay.toLowerCase(), tokens, strict)
    if (sc >= 0) out.push({ ...item, sc: sc + bonus })
  }
  for (const [k, i, l] of PAGES) add({ t: t(l), icon: i, cat: t('Page'), dest: t('Page'), run: () => go(k) }, l + ' ' + t(l) + ' ' + k, 12)
  for (const a of ACTIONS.value) if (!a.off) add({ ...a, t: t(a.t), s: t(a.s), dest: t(a.dest), cat: t('Action') }, a.t + ' ' + t(a.t) + ' ' + a.s + ' ' + t(a.s), 10)
  for (const [id, l, kw] of SETTINGS) add({ t: t(l), icon: 'gear', cat: t('Setting'), dest: t('Settings'), run: () => { state.settingsOpen = id } }, l + ' ' + t(l) + ' ' + kw, 4)
  for (const m of macroList.value) {
    const def = macroDef(m)
    add({ t: m, s: S('gcode_macro ' + m).description || state.commands[m] || '', icon: 'play', cat: t('Macro'), dest: t('Runs macro'), run: () => gcode(m), confirm: true, alt: def && { label: `${def.file}:${def.line}`, run: () => openCfg(def.file, def.line) } }, m + ' ' + (state.commands[m] || ''), 8)
  }
  for (const d of state.power || []) {
    const off = d.status === 'on'
    add({ t: off ? t('Turn off {name}', { name: prettyName(d.device) }) : t('Turn on {name}', { name: prettyName(d.device) }), s: t('Power device, now {state}', { state: d.status }), icon: 'power', cat: t('Power devices'), dest: t('Switches power'), run: () => flipPower(d, !off), confirm: true }, d.device + ' power plug ' + (off ? 'off' : 'on'), 7)
  }
  if (tokens.length) {
    for (const [k, d] of Object.entries(state.commands)) {
      if (macroList.value.includes(k)) continue
      add({ t: k, s: d, icon: 'term', cat: t('Command'), dest: t('Opens console'), run: () => { state.consoleDraft = k + ' '; go('console') } }, k + ' ' + d, 0)
    }
    for (const c of cfgIndex.items) {
      if (c.kind === 'section') add({ t: c.text, s: c.file, icon: 'file', cat: t('Config'), dest: t('{file} · line {line}', { file: c.file, line: c.line }), run: () => openCfg(c.file, c.line) }, c.section + ' ' + c.file, 6)
      else if (c.kind === 'option') add({ t: `${c.key}: ${c.value}`, s: `[${c.section}]`, icon: 'sliders', cat: t('Config'), dest: t('{file} · line {line}', { file: c.file, line: c.line }), run: () => openCfg(c.file, c.line) }, c.key + ' ' + c.section, 0)
      else if (c.kind === 'symbol') add({ t: c.text, s: c.file, icon: 'code', cat: t('Script'), dest: t('{file} · line {line}', { file: c.file, line: c.line }), run: () => openCfg(c.file, c.line) }, c.key + ' ' + c.file, 3)
      else if (longQ.value) add({ t: c.text, s: `${c.file}:${c.line}`, icon: 'file', cat: t('In files'), dest: t('{file} · line {line}', { file: c.file, line: c.line }), run: () => openCfg(c.file, c.line) }, c.text, -2, true)
    }
    for (const f of gfiles.value) add({ t: f.split('/').pop(), s: f.includes('/') ? f.split('/').slice(0, -1).join('/') : '', icon: 'cube', cat: t('G-code file'), dest: t('G-code Files'), run: () => { state.anchor = 'file:' + f; go('files') } }, f, 2)
  }
  out.sort((a, b) => b.sc - a.sc)
  // keep it readable: at most 8 per category
  const per = {}
  return out.filter((r) => ((per[r.cat] = (per[r.cat] || 0) + 1) <= 8)).slice(0, 40)
})
watch(q, () => (idx.value = 0))

// things that heat, move or run a macro need a second Enter (or click) so a stray keypress does nothing
const armed = ref('')
const keyOf = (r) => r.cat + '|' + r.t + '|' + (r.s || '')
watch([q, idx], () => (armed.value = ''))
function run(r, alt = false) {
  if (!r || (r.disabled && !alt)) return
  if (!alt && r.confirm && armed.value !== keyOf(r)) { armed.value = keyOf(r); return }
  armed.value = ''
  close()
  const fn = alt && r.alt ? r.alt.run : r.run
  Promise.resolve(fn()).catch((e) => toast(e.message, 'error'))
}
function key(e) {
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowDown') { e.preventDefault(); idx.value = Math.min(results.value.length - 1, idx.value + 1); scroll() }
  else if (e.key === 'ArrowUp') { e.preventDefault(); idx.value = Math.max(0, idx.value - 1); scroll() }
  else if (e.key === 'Enter') { e.preventDefault(); run(results.value[idx.value], e.shiftKey) }
}
function scroll() { nextTick(() => listEl.value?.querySelector('.on')?.scrollIntoView({ block: 'nearest' })) }
const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
</script>

<template>
  <Transition name="sp">
    <div v-if="state.spotlight" class="ov" @mousedown.self="close">
      <div class="box" role="dialog" :aria-label="t('Search')">
        <div class="inp"><Icon name="search" :size="22" /><input ref="inp" v-model="q" :placeholder="t('Search pages, macros, config, files… or “extruder 250”')" :aria-label="t('Search')" @keydown="key" /><kbd>esc</kbd></div>
        <div ref="listEl" class="res">
          <template v-for="(r, i) in results" :key="r.cat + r.t + i">
            <div v-if="i === 0 || results[i - 1].cat !== r.cat" class="cat">{{ r.cat }}</div>
            <div class="it" :class="{ on: i === idx, dis: r.disabled, arm: armed === keyOf(r) }" @mousemove="idx !== i && (idx = i)" @click="run(r)">
              <span class="ic"><Icon :name="r.icon" :size="17" /></span>
              <div class="tx"><b><i v-if="r.swatch" class="sw" :style="{ background: r.swatch }"></i>{{ r.t }}</b><span v-if="r.warn" class="wn">{{ r.warn }}</span><span v-else-if="r.s" class="mu">{{ r.s }}</span></div>
              <button v-if="r.alt" class="alt code" :title="t('Open definition')" @click.stop="run(r, true)">{{ r.alt.label }}</button>
              <span v-if="armed === keyOf(r)" class="dest cf"><Icon name="enter" :size="14" />{{ t('Press again to run') }}</span>
              <span v-else class="dest">{{ r.dest }}<Icon v-if="i === idx" name="enter" :size="14" /></span>
            </div>
          </template>
          <div v-if="!results.length" class="empty">{{ cfgIndex.loading ? t('Indexing config files…') : t('Nothing found') }}</div>
        </div>
        <div class="foot mu"><span><kbd>↑</kbd><kbd>↓</kbd> {{ t('select') }}</span><span><kbd>↵</kbd> {{ t('Open') }}</span><span><kbd>⇧</kbd><kbd>↵</kbd> {{ t('macro definition') }}</span><span class="grow"></span><span><kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd><kbd>K</kbd></span></div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ov { position: fixed; inset: 0; background: rgba(8,9,11,.55); backdrop-filter: blur(3px); z-index: 150; display: flex; justify-content: center; align-items: flex-start; padding: calc(12vh / var(--zoom, 1)) 16px 16px; }
.box { width: 680px; max-width: 100%; background: var(--s1); border-radius: 18px; box-shadow: 0 30px 80px rgba(0,0,0,.6), 0 0 0 1px var(--bd); display: flex; flex-direction: column; overflow: hidden; max-height: calc(70vh / var(--zoom, 1)); }
.inp { display: flex; align-items: center; gap: 12px; padding: 0 18px; height: 62px; border-bottom: 1px solid var(--bd); color: var(--mu); }
.inp input { flex: 1; background: transparent; border: none; outline: none; font-size: 18px; color: var(--tx); }
kbd { font-family: var(--fm); font-size: 11px; padding: 2px 6px; border-radius: 5px; background: var(--s2); color: var(--mu); margin-right: 3px; }
.res { overflow-y: auto; padding: 6px 8px 8px; }
.cat { font-size: 11.5px; font-weight: 600; color: var(--mu2); padding: 10px 10px 4px; }
.it { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 10px; cursor: pointer; }
.it.on { background: var(--s2); }
.ic { width: 32px; height: 32px; border-radius: 8px; background: var(--s2); display: flex; align-items: center; justify-content: center; color: var(--mu); flex-shrink: 0; }
.it.on .ic { background: color-mix(in srgb, var(--ac) 15%, transparent); color: var(--ac); }
.tx { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.tx b { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tx .mu { font-size: 12px; color: var(--mu); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dest { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--mu2); white-space: nowrap; flex-shrink: 0; }
.it.on .dest { color: var(--mu); }
.it.arm { background: color-mix(in srgb, var(--wn) 14%, var(--s2)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--wn) 45%, transparent); }
.dest.cf { color: var(--wn) !important; font-weight: 600; }
.it.dis { opacity: .55; cursor: not-allowed; }
.wn { font-size: 12px; color: var(--wn); }
.sw { display: inline-block; width: 11px; height: 11px; border-radius: 6px; margin-right: 8px; vertical-align: -1px; box-shadow: 0 0 0 1px rgba(255,255,255,.25); }
.alt { border: none; background: var(--s3); color: var(--mu); font-size: 11px; padding: 3px 7px; border-radius: 6px; white-space: nowrap; }
.alt:hover { color: var(--ac); }
.foot { display: flex; gap: 14px; align-items: center; padding: 9px 16px; border-top: 1px solid var(--bd); font-size: 12px; color: var(--mu2); }
.sp-enter-active, .sp-leave-active { transition: opacity .12s; }
.sp-enter-active .box { transition: transform .14s ease-out; }
.sp-enter-from, .sp-leave-to { opacity: 0; }
.sp-enter-from .box { transform: translateY(-8px) scale(.98); }
@media (max-width: 700px) { .dest { display: none; } .foot { display: none; } }
</style>
