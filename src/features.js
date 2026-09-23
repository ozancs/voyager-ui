// Things that run in the background for the whole app:
// macro prompts, error toasts, sounds, job queue, config index (for search), health sampling.
import { reactive, watch, computed, markRaw } from 'vue'
import { api } from './api/moonraker'
import { state, S, toast, printState, pushConsole, gcode, backupBeforeWrite } from './store'

// ---------------------------------------------------------------- macro prompts
// Klipper macros can open dialogs with "// action:prompt_*" lines (same protocol Mainsail uses).
let draft = null
function parsePrompt(line) {
  const m = line.match(/^\/\/ action:prompt_(\w+)\s?(.*)$/)
  if (!m) return false
  const [, cmd, arg] = m
  const btn = (a) => {
    const [label, gc, color] = a.split('|')
    return { label: label.trim(), gcode: (gc ?? label).trim(), color: (color || '').trim() }
  }
  switch (cmd) {
    case 'begin': draft = { title: arg || 'Prompt', items: [], footer: [] }; break
    case 'text': draft?.items.push({ type: 'text', text: arg }); break
    case 'button': {
      const b = btn(arg)
      const g = draft?.items[draft.items.length - 1]
      if (g?.type === 'group' && g.open) g.buttons.push(b)
      else draft?.items.push({ type: 'buttons', buttons: [b] })
      break
    }
    case 'button_group_start': draft?.items.push({ type: 'group', open: true, buttons: [] }); break
    case 'button_group_end': { const g = draft?.items.findLast((i) => i.type === 'group' && i.open); if (g) g.open = false; break }
    case 'footer_button': draft?.footer.push(btn(arg)); break
    case 'show': if (draft) state.prompt = JSON.parse(JSON.stringify(draft)); break
    case 'end': state.prompt = null; draft = null; break
  }
  return true
}
export function promptRun(b) { gcode(b.gcode).catch(() => {}) }
export function promptClose() { state.prompt = null; gcode('RESPOND TYPE=command MSG=action:prompt_end', { quiet: true }).catch(() => {}) }

// ---------------------------------------------------------------- error toasts
const HINTS = [
  [/Must home axis first|must home/i, 'Home the printer (G28) before moving.'],
  [/Move out of range/i, 'The move goes past the axis limits (position_min / position_max).'],
  [/Timer too close|Rescheduled timer in the past|Stepper too far in past/i, 'Host or MCU could not keep up. Usually an overloaded Pi, a busy USB/CAN bus or a slow SD card.'],
  [/Lost communication with MCU/i, 'Check the USB/CAN cable, board power and CAN termination. The Health page shows link errors.'],
  [/not heating at expected rate/i, 'verify_heater tripped. Check the thermistor seating, heater wiring and fans blowing on the block.'],
  [/ADC out of range/i, 'Thermistor reads outside min_temp / max_temp. Check the thermistor and its wiring.'],
  [/Extrude below minimum temp/i, 'Heat the hotend first (min_extrude_temp).'],
  [/Extrude only move too long/i, 'Extrude less at once or raise max_extrude_only_distance.'],
  [/Unknown command/i, 'This command or macro does not exist. Check the spelling or your config.'],
  [/Probe triggered prior to movement/i, 'The probe was already triggered. Raise Z and check the probe.'],
  [/No trigger on probe after full movement/i, 'The probe never triggered. Check the probe and the Z position.'],
  [/is not valid in section|Section .* is not a valid config section|Unable to parse option/i, 'Config error. Open the file from the search (Ctrl+K) and fix the option.'],
  [/Option .* must have minimum|must have maximum/i, 'A config value is outside its allowed range.'],
]
export const hintFor = (msg) => HINTS.find(([re]) => re.test(msg))?.[1] || ''
function onErrorLine(line) {
  if (!state.settings.errorToasts) return
  const msg = line.replace(/^!!\s*/, '').trim()
  if (!msg || msg.startsWith('action:')) return
  toast(msg, 'error', { hint: hintFor(msg), console: true })
}

// ---------------------------------------------------------------- sounds
let ctx = null
function audio() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)() } catch { return null } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}
// browsers only allow audio after a click or key press
const unlock = () => { if (state.settings.sound?.enabled) audio() }
window.addEventListener('pointerdown', unlock, { once: false, passive: true })
window.addEventListener('keydown', unlock, { passive: true })

const TONES = {
  complete: [[523, 0, .18], [659, .16, .18], [784, .32, .34]],
  error: [[220, 0, .22, 'square'], [185, .28, .32, 'square']],
  paused: [[660, 0, .14], [660, .22, .14]],
  heated: [[880, 0, .25]],
}
export function playSound(kind) {
  const cfg = state.settings.sound || {}
  const a = audio()
  if (!a) return
  const vol = (cfg.volume ?? .6) * .25
  const t0 = a.currentTime + .02
  for (const [f, at, len, type] of TONES[kind] || []) {
    const o = a.createOscillator(), g = a.createGain()
    o.type = type || 'sine'
    o.frequency.value = f
    g.gain.setValueAtTime(0, t0 + at)
    g.gain.linearRampToValueAtTime(vol, t0 + at + .015)
    g.gain.exponentialRampToValueAtTime(.0001, t0 + at + len)
    o.connect(g).connect(a.destination)
    o.start(t0 + at); o.stop(t0 + at + len + .05)
  }
}
const want = (k) => state.settings.sound?.enabled && state.settings.sound?.[k]
watch(printState, (now, before) => {
  if (!state.booted) return
  if (now === 'complete' && before === 'printing') want('complete') && playSound('complete')
  else if (now === 'error') want('error') && playSound('error')
  else if (now === 'paused' && before === 'printing') want('paused') && playSound('paused')
})
watch(() => state.klippy, (k, b) => { if (b === 'ready' && (k === 'shutdown' || k === 'error') && want('error')) playSound('error') })
const reached = {}
function checkHeated() {
  for (const n of S('heaters').available_heaters || []) {
    const s = S(n)
    if (!s.target) { reached[n] = 0; continue }
    if (reached[n] === s.target) continue
    if (Math.abs(s.temperature - s.target) < 1) { reached[n] = s.target; if (want('heated')) playSound('heated') }
  }
}

// ---------------------------------------------------------------- job queue
export async function loadQueue() {
  try {
    const r = await api.call('server.job_queue.status')
    state.queue = { enabled: true, state: r.queue_state, jobs: r.queued_jobs || [] }
  } catch (e) {
    // method not found = [job_queue] missing in moonraker.conf
    state.queue = { enabled: false, state: '', jobs: [] }
  }
}
export const queueApi = {
  add: (filenames) => api.call('server.job_queue.post_job', { filenames, reset: false }).then(() => toast(filenames.length > 1 ? `${filenames.length} files queued` : 'Added to queue')),
  remove: (ids) => api.call('server.job_queue.delete_job', { job_ids: ids }),
  clear: () => api.call('server.job_queue.delete_job', { all: true }),
  start: () => api.call('server.job_queue.start'),
  pause: () => api.call('server.job_queue.pause'),
  jump: (id) => api.call('server.job_queue.jump', { job_id: id }),
}
// adds [job_queue] to moonraker.conf (backup first) and restarts moonraker
export async function enableQueue() {
  const txt = await api.getText('/server/files/config/moonraker.conf')
  if (/^\[job_queue\]/m.test(txt)) { toast('[job_queue] is already in moonraker.conf, restarting Moonraker'); await api.call('server.restart'); return }
  await backupBeforeWrite('config', 'moonraker.conf')
  const out = txt.replace(/\s*$/, '\n') + '\n[job_queue]\nload_on_startup: False\n'
  await api.upload(new Blob([out], { type: 'text/plain' }), { root: 'config', name: 'moonraker.conf' })
  toast('Job queue enabled, restarting Moonraker')
  await api.call('server.restart')
}

// ---------------------------------------------------------------- config index (for Ctrl+K)
export const cfgIndex = reactive({ items: [], loaded: false, loading: false })
let cfgStale = true
export async function loadConfigIndex() {
  if (cfgIndex.loading || (cfgIndex.loaded && !cfgStale)) return
  cfgIndex.loading = true
  try {
    const list = await api.call('server.files.list', { root: 'config' })
    const files = list.map((f) => f.path).filter((p) => /\.(cfg|conf)$/i.test(p) && !p.startsWith('backups/') && !p.startsWith('.') && !/^printer-\d{8}_\d{6}\.cfg$/.test(p) && !p.includes('::TMPNAME')).slice(0, 60)
    const items = []
    await Promise.all(files.map(async (file) => {
      let txt = ''
      try { txt = await api.getText('/server/files/config/' + file.split('/').map(encodeURIComponent).join('/')) } catch { return }
      let sec = ''
      txt.split('\n').forEach((l, i) => {
        let m
        if ((m = l.match(/^\[([^\]]+)\]/))) { sec = m[1]; items.push({ kind: 'section', file, line: i + 1, section: sec, text: `[${sec}]` }) }
        else if (sec && (m = l.match(/^([A-Za-z0-9_]+)\s*[:=]\s*(.*?)\s*(?:[#;].*)?$/)) && !l.startsWith('#')) items.push({ kind: 'option', file, line: i + 1, section: sec, key: m[1], value: m[2].slice(0, 60), text: m[1] })
      })
    }))
    cfgIndex.items = markRaw(items)
    cfgIndex.loaded = true
    cfgStale = false
  } catch {}
  cfgIndex.loading = false
}

// ---------------------------------------------------------------- health sampling
// kept outside Vue reactivity, the page reads it through `healthTick`
export const health = reactive({ tick: 0 })
export const mcuHist = markRaw({})  // name -> [{t, re, inv}]
export const heaterWin = markRaw({}) // name -> [{t, temp, target, power}]
export const heaterLive = reactive({}) // name -> { target, power, std, holding }
function sampleHealth() {
  const now = Date.now() / 1000
  for (const o of state.objects) {
    if (o !== 'mcu' && !o.startsWith('mcu ')) continue
    const st = S(o).last_stats
    if (!st) continue
    const h = (mcuHist[o] ||= [])
    h.push({ t: now, re: st.bytes_retransmit || 0, inv: st.bytes_invalid || 0, load: (st.mcu_task_avg + 3 * st.mcu_task_stddev) / 0.0025, srtt: st.srtt || 0 })
    while (h.length && now - h[0].t > 900) h.shift()
  }
  for (const n of S('heaters').available_heaters || []) {
    const s = S(n)
    if (s.temperature == null) continue
    const w = (heaterWin[n] ||= [])
    w.push({ t: now, temp: s.temperature, target: s.target || 0, power: s.power || 0 })
    while (w.length && now - w[0].t > 120) w.shift()
    const tg = s.target || 0
    const hold = tg > 0 && w.length > 20 && w.every((x) => x.target === tg && Math.abs(x.temp - tg) < 1.5) && now - w[0].t > 60
    if (hold) {
      const avg = w.reduce((a, x) => a + x.power, 0) / w.length
      const mean = w.reduce((a, x) => a + x.temp, 0) / w.length
      const std = Math.sqrt(w.reduce((a, x) => a + (x.temp - mean) ** 2, 0) / w.length)
      heaterLive[n] = { target: tg, power: avg, std, holding: true }
      // learn the power needed to hold this target the first time we see it
      const key = n + '@' + Math.round(tg / 5) * 5
      const base = state.settings.heaterBase || (state.settings.heaterBase = {})
      if (!base[key]) base[key] = { power: +avg.toFixed(3), t: Date.now() }
    } else heaterLive[n] = { target: tg, power: s.power || 0, std: null, holding: false }
  }
  health.tick++
}

export const healthIssues = computed(() => {
  health.tick // re-evaluate on samples
  const out = []
  for (const [n, h] of Object.entries(mcuHist)) {
    if (h.length < 2) continue
    const d = h[h.length - 1].re - h[0].re
    if (d > 0) out.push({ area: 'mcu', key: n, level: d > 500 ? 'error' : 'warn', msg: `${n}: ${d} bytes retransmitted in the last ${Math.round((h[h.length - 1].t - h[0].t) / 60) || 1} min` })
    const last = h[h.length - 1]
    if (last.load > 80) out.push({ area: 'mcu', key: n, level: 'warn', msg: `${n}: MCU load ${Math.round(last.load)}%` })
  }
  for (const [n, l] of Object.entries(heaterLive)) {
    if (!l.holding) continue
    if (l.std > 0.6) out.push({ area: 'heater', key: n, level: 'warn', msg: `${n}: temperature swings ±${l.std.toFixed(1)}°, a PID tune may help` })
    const b = state.settings.heaterBase?.[n + '@' + Math.round(l.target / 5) * 5]
    if (b && l.power - b.power > 0.12 && l.power / b.power > 1.3) out.push({ area: 'heater', key: n, level: 'warn', msg: `${n}: needs ${Math.round(l.power * 100)}% power to hold ${l.target}°, it used to need ${Math.round(b.power * 100)}%` })
  }
  for (const o of state.objects) {
    if (!o.startsWith('tmc')) continue
    const ds = S(o).drv_status || {}
    const bad = ['ot', 'otpw', 's2ga', 's2gb', 's2vsa', 's2vsb', 'uv_cp'].filter((k) => ds[k])
    if (bad.length) out.push({ area: 'tmc', key: o, level: bad.some((k) => k !== 'otpw') ? 'error' : 'warn', msg: `${o.split(' ').pop()}: driver flags ${bad.join(', ')}` })
  }
  for (const t of dueMaintenance.value) out.push({ area: 'maint', key: t.id, level: 'info', msg: `Maintenance due: ${t.name}` })
  return out
})

// ---------------------------------------------------------------- maintenance
export const printStats = reactive({ totalHours: null, hoursPerDay: null })
export const MAINT_DEFAULTS = () => [
  { id: 'm1', name: 'Clean the bed / build plate', hours: 50 },
  { id: 'm2', name: 'Clean extruder gears and filament path', hours: 150 },
  { id: 'm3', name: 'Check belt tension', hours: 200 },
  { id: 'm4', name: 'Check frame and gantry screws', hours: 250 },
  { id: 'm5', name: 'Lubricate linear rails / rods', hours: 300 },
  { id: 'm6', name: 'Replace nozzle', hours: 500 },
]
export async function loadPrintStats() {
  try {
    const t = await api.call('server.history.totals')
    printStats.totalHours = (t.job_totals?.total_print_time || 0) / 3600
  } catch {}
  try {
    const since = Date.now() / 1000 - 30 * 86400
    const r = await api.call('server.history.list', { since, limit: 500, order: 'desc' })
    const sec = (r.jobs || []).reduce((a, j) => a + (j.print_duration || 0), 0)
    printStats.hoursPerDay = sec / 3600 / 30
  } catch {}
  if (!state.settings.maintenance && printStats.totalHours != null) {
    state.settings.maintenance = MAINT_DEFAULTS().map((t) => ({ ...t, doneAt: printStats.totalHours, doneDate: Date.now() }))
  }
}
export function maintUsed(t) { return printStats.totalHours == null ? 0 : Math.max(0, printStats.totalHours - (t.doneAt ?? printStats.totalHours)) }
export function maintDueDays(t) {
  const left = t.hours - maintUsed(t)
  if (left <= 0) return 0
  if (!printStats.hoursPerDay) return null
  return left / printStats.hoursPerDay
}
export const dueMaintenance = computed(() => (state.settings.maintenance || []).filter((t) => maintUsed(t) >= t.hours))

// ---------------------------------------------------------------- wiring
let started = false
export function initFeatures() {
  if (started) return
  started = true
  api.on('notify_gcode_response', ([line]) => {
    if (typeof line !== 'string') return
    if (line.startsWith('// action:prompt_')) { parsePrompt(line); return }
    if (line.startsWith('!! ')) onErrorLine(line)
  })
  api.on('notify_job_queue_changed', ([p]) => {
    if (p?.updated_queue) state.queue.jobs = p.updated_queue
    if (p?.queue_state) state.queue.state = p.queue_state
    if (p?.action === 'job_loaded') toast('Queue: starting next print')
  })
  api.on('notify_filelist_changed', ([p]) => { if (p?.item?.root === 'config') cfgStale = true })
  api.on('notify_history_changed', ([p]) => { if (p?.action === 'finished') loadPrintStats() })
  watch(() => state.booted, (b) => { if (b) { loadQueue(); loadPrintStats() } }, { immediate: true })
  setInterval(() => { if (state.klippy === 'ready') { sampleHealth(); checkHeated() } }, 2000)
  // global Ctrl/Cmd+K
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); state.spotlight = !state.spotlight }
  })
}
export { pushConsole }
