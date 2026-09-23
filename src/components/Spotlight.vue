<script setup>
// Ctrl/Cmd+K: one search box for pages, actions, macros, config files (down to the line), g-code files, commands and settings.
import { ref, computed, watch, nextTick } from 'vue'
import Icon from './Icon.vue'
import { state, S, gcode, macroList, prettyName, toast, isPrinting } from '../store'
import { go } from '../router'
import { api } from '../api/moonraker'
import { cfgIndex, loadConfigIndex, playSound } from '../features'

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
  ['health', 'heart', 'Health & Maintenance'], ['quick', 'sliders', 'Quick Config'], ['theme', 'palette', 'Settings / Theme'],
]
const SETTINGS = [
  ['set-favorites', 'Favorite macros bar', 'favorites buttons toolbar'], ['set-presets', 'Temperature presets', 'pla petg abs preheat'],
  ['set-accent', 'Accent color', 'theme colour'], ['set-controls', 'Printer name, invert Z', 'jog name'],
  ['set-sounds', 'Sounds & alerts', 'sound audio beep volume error popup toast notification dashboard printing'], ['set-sensors', 'Sensors in temperature graph', 'hide sensor chart'],
  ['set-backup', 'Backup & restore settings', 'export import reset'],
]
const ACTIONS = computed(() => [
  { t: 'Home all axes', s: 'G28', icon: 'home', run: () => gcode('G28'), dest: 'Runs G28' },
  { t: 'Motors off', s: 'M84', icon: 'motor', run: () => gcode('M84'), dest: 'Runs M84' },
  { t: 'Cooldown', s: 'turn off all heaters', icon: 'fan', run: () => gcode('TURN_OFF_HEATERS'), dest: 'Runs TURN_OFF_HEATERS' },
  { t: 'Save config', s: 'SAVE_CONFIG, restarts Klipper', icon: 'save', run: () => gcode('SAVE_CONFIG'), dest: 'Runs SAVE_CONFIG', off: isPrinting.value },
  { t: 'Firmware restart', s: 'FIRMWARE_RESTART', icon: 'bolt', run: () => gcode('FIRMWARE_RESTART'), dest: 'Restarts Klipper + MCUs', off: isPrinting.value },
  { t: 'Customize dashboard', s: 'layout cards edit move', icon: 'layout', run: () => { go('dashboard'); state.editDash = true }, dest: 'Dashboard' },
  { t: state.settings.sound?.enabled ? 'Turn sounds off' : 'Turn sounds on', s: 'audio alerts mute', icon: state.settings.sound?.enabled ? 'mute' : 'volume', run: () => { state.settings.sound.enabled = !state.settings.sound.enabled; if (state.settings.sound.enabled) playSound('heated') }, dest: 'Setting' },
  { t: 'Job queue', s: 'queue next print jobs', icon: 'queue', run: () => go('files'), dest: 'G-code Files' },
])

// ---- scoring ----
function score(hay, tokens) {
  let total = 0
  for (const t of tokens) {
    const i = hay.indexOf(t)
    if (i < 0) {
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

// smart: "extruder 250", "bed 60", "fan 50%"
const smart = computed(() => {
  const m = q.value.trim().match(/^(.+?)\s+(\d{1,3})\s*(%|°|c)?$/i)
  if (!m) return []
  const name = m[1].toLowerCase(), val = +m[2], out = []
  for (const h of S('heaters').available_heaters || []) {
    if (score((h + ' ' + prettyName(h)).toLowerCase(), [name]) < 0 || val > 400) continue
    out.push({ t: `Set ${prettyName(h)} to ${val}°`, s: `SET_HEATER_TEMPERATURE HEATER=${h.split(' ').pop()} TARGET=${val}`, icon: 'flame', dest: 'Runs command', run: () => gcode(`SET_HEATER_TEMPERATURE HEATER=${h.split(' ').pop()} TARGET=${val}`), cat: 'Quick action', sc: 999 })
  }
  for (const f of state.objects.filter((o) => o === 'fan' || o.startsWith('fan_generic '))) {
    if (score((f + ' ' + prettyName(f)).toLowerCase(), [name]) < 0 || val > 100) continue
    const cmd = f === 'fan' ? `M106 S${Math.round(val * 2.55)}` : `SET_FAN_SPEED FAN=${f.slice(12)} SPEED=${val / 100}`
    out.push({ t: `Set ${prettyName(f)} to ${val}%`, s: cmd, icon: 'fan', dest: 'Runs command', run: () => gcode(cmd), cat: 'Quick action', sc: 998 })
  }
  return out
})

const macroDef = (m) => cfgIndex.items.find((c) => c.kind === 'section' && c.section.toLowerCase() === 'gcode_macro ' + m.toLowerCase())
function openCfg(file, line) { state.jump = { file, line, t: Date.now() }; go('config', file) }

const results = computed(() => {
  const raw = q.value.trim().toLowerCase()
  const tokens = raw.split(/\s+/).filter(Boolean)
  const out = [...smart.value]
  const add = (item, hay, bonus = 0) => {
    if (!tokens.length) { if (item.cat === 'Page' || item.cat === 'Action') out.push({ ...item, sc: bonus }); return }
    const sc = score(hay.toLowerCase(), tokens)
    if (sc >= 0) out.push({ ...item, sc: sc + bonus })
  }
  for (const [k, i, l] of PAGES) add({ t: l, icon: i, cat: 'Page', dest: 'Page', run: () => go(k) }, l + ' ' + k, 12)
  for (const a of ACTIONS.value) if (!a.off) add({ ...a, cat: 'Action' }, a.t + ' ' + a.s, 10)
  for (const [id, l, kw] of SETTINGS) add({ t: l, icon: 'gear', cat: 'Setting', dest: 'Settings', run: () => { state.anchor = id; go('theme') } }, l + ' ' + kw, 4)
  for (const m of macroList.value) {
    const def = macroDef(m)
    add({ t: m, s: S('gcode_macro ' + m).description || state.commands[m] || '', icon: 'play', cat: 'Macro', dest: 'Runs macro', run: () => gcode(m), alt: def && { label: `${def.file}:${def.line}`, run: () => openCfg(def.file, def.line) } }, m + ' ' + (state.commands[m] || ''), 8)
  }
  if (tokens.length) {
    for (const [k, d] of Object.entries(state.commands)) {
      if (macroList.value.includes(k)) continue
      add({ t: k, s: d, icon: 'term', cat: 'Command', dest: 'Opens console', run: () => { state.consoleDraft = k + ' '; go('console') } }, k + ' ' + d, 0)
    }
    for (const c of cfgIndex.items) {
      if (c.kind === 'section') add({ t: c.text, s: c.file, icon: 'file', cat: 'Config', dest: `${c.file} · line ${c.line}`, run: () => openCfg(c.file, c.line) }, c.section + ' ' + c.file, 6)
      else add({ t: `${c.key}: ${c.value}`, s: `[${c.section}]`, icon: 'sliders', cat: 'Config', dest: `${c.file} · line ${c.line}`, run: () => openCfg(c.file, c.line) }, c.key + ' ' + c.section, 0)
    }
    for (const f of gfiles.value) add({ t: f.split('/').pop(), s: f.includes('/') ? f.split('/').slice(0, -1).join('/') : '', icon: 'cube', cat: 'G-code file', dest: 'G-code Files', run: () => { state.anchor = 'file:' + f; go('files') } }, f, 2)
  }
  out.sort((a, b) => b.sc - a.sc)
  // keep it readable: at most 8 per category
  const per = {}
  return out.filter((r) => ((per[r.cat] = (per[r.cat] || 0) + 1) <= 8)).slice(0, 40)
})
watch(q, () => (idx.value = 0))

function run(r, alt = false) {
  if (!r) return
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
      <div class="box" role="dialog" aria-label="Search">
        <div class="inp"><Icon name="search" :size="22" /><input ref="inp" v-model="q" placeholder="Search pages, macros, config, files… or “extruder 250”" aria-label="Search" @keydown="key" /><kbd>esc</kbd></div>
        <div ref="listEl" class="res">
          <template v-for="(r, i) in results" :key="r.cat + r.t + i">
            <div v-if="i === 0 || results[i - 1].cat !== r.cat" class="cat">{{ r.cat }}</div>
            <div class="it" :class="{ on: i === idx }" @mousemove="idx = i" @click="run(r)">
              <span class="ic"><Icon :name="r.icon" :size="17" /></span>
              <div class="tx"><b>{{ r.t }}</b><span v-if="r.s" class="mu">{{ r.s }}</span></div>
              <button v-if="r.alt" class="alt code" :title="'Open definition'" @click.stop="run(r, true)">{{ r.alt.label }}</button>
              <span class="dest">{{ r.dest }}<Icon v-if="i === idx" name="enter" :size="14" /></span>
            </div>
          </template>
          <div v-if="!results.length" class="empty">{{ cfgIndex.loading ? 'Indexing config files…' : 'Nothing found' }}</div>
        </div>
        <div class="foot mu"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>⇧</kbd><kbd>↵</kbd> macro definition</span><span class="grow"></span><span><kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd><kbd>K</kbd></span></div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ov { position: fixed; inset: 0; background: rgba(8,9,11,.55); backdrop-filter: blur(3px); z-index: 150; display: flex; justify-content: center; align-items: flex-start; padding: 12vh 16px 16px; }
.box { width: 680px; max-width: 100%; background: var(--s1); border-radius: 18px; box-shadow: 0 30px 80px rgba(0,0,0,.6), 0 0 0 1px var(--bd); display: flex; flex-direction: column; overflow: hidden; max-height: 70vh; }
.inp { display: flex; align-items: center; gap: 12px; padding: 0 18px; height: 62px; border-bottom: 1px solid var(--bd); color: var(--mu); }
.inp input { flex: 1; background: transparent; border: none; outline: none; font-size: 18px; color: var(--tx); }
kbd { font-family: var(--fm); font-size: 11px; padding: 2px 6px; border-radius: 5px; background: var(--s2); color: var(--mu); margin-right: 3px; }
.res { overflow-y: auto; padding: 6px 8px 8px; }
.cat { font-size: 11.5px; font-weight: 600; color: var(--mu2); padding: 10px 10px 4px; }
.it { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 10px; cursor: pointer; }
.it.on { background: var(--s2); }
.ic { width: 32px; height: 32px; border-radius: 8px; background: var(--s2); display: flex; align-items: center; justify-content: center; color: var(--mu); flex-shrink: 0; }
.it.on .ic { background: rgba(255,107,26,.15); color: var(--heat); }
.tx { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.tx b { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tx .mu { font-size: 12px; color: var(--mu); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dest { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--mu2); white-space: nowrap; flex-shrink: 0; }
.it.on .dest { color: var(--mu); }
.alt { border: none; background: var(--s3); color: var(--mu); font-size: 11px; padding: 3px 7px; border-radius: 6px; white-space: nowrap; }
.alt:hover { color: var(--ac); }
.foot { display: flex; gap: 14px; align-items: center; padding: 9px 16px; border-top: 1px solid var(--bd); font-size: 12px; color: var(--mu2); }
.sp-enter-active, .sp-leave-active { transition: opacity .12s; }
.sp-enter-active .box { transition: transform .14s ease-out; }
.sp-enter-from, .sp-leave-to { opacity: 0; }
.sp-enter-from .box { transform: translateY(-8px) scale(.98); }
@media (max-width: 700px) { .dest { display: none; } .foot { display: none; } }
</style>
