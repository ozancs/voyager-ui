import { reactive, computed, markRaw, watch, onBeforeUnmount } from 'vue'
import { api } from './api/moonraker'
import { setLang, t } from './i18n'

export const VERSION = '0.16.1'
export const APP = 'voyager-ui'
export const APP_NAME = 'Voyager UI'
export const REPO_URL = 'https://github.com/ozancs/voyager-ui'
export const OLD_APPS = ['oznlab_klipperui', 'carbon-ui'] // earlier names, their data is carried over once
const NS = APP

export const DEFAULT_SETTINGS = () => ({
  accent: '#ff6b1a',
  favorites: [
    { id: 'f1', name: 'Chamber 50°', icon: 'box', gcode: 'CHAMBER TEMP=50', highlight: true },
    { id: 'f2', name: 'Bed Mesh', icon: 'mesh', gcode: 'BED_MESH_CALIBRATE', highlight: false },
    { id: 'f3', name: 'Load', icon: 'load', gcode: 'FILAMENT_LOAD', highlight: false },
    { id: 'f4', name: 'Unload', icon: 'unload', gcode: 'FILAMENT_UNLOAD', highlight: false },
    { id: 'f5', name: 'Cut', icon: 'cut', gcode: 'FILAMENT_CUT', highlight: false },
    { id: 'f6', name: 'Purge', icon: 'drop', gcode: 'POOP_PURGE', highlight: false },
    { id: 'f7', name: 'Brush', icon: 'brush', gcode: 'BRUSH_ONLY', highlight: false },
    { id: 'f8', name: 'Wipe', icon: 'wiper', gcode: 'WIPER_WIPE', highlight: false },
    { id: 'f9', name: 'Vent 40°', icon: 'fan', gcode: 'CHAMBER_VENT MAX=40', highlight: false },
  ],
  presets: [
    { id: 'p1', name: 'PLA', temps: { extruder: 210, heater_bed: 60, 'heater_generic chamber': 0 } },
    { id: 'p2', name: 'PETG', temps: { extruder: 240, heater_bed: 80, 'heater_generic chamber': 0 } },
    { id: 'p3', name: 'ABS', temps: { extruder: 255, heater_bed: 110, 'heater_generic chamber': 50 } },
  ],
  devices: { hidden: [], names: {} },
  hiddenSensors: [],
  quickConfig: [
    { section: 'printer', key: 'max_velocity', unit: 'mm/s' },
    { section: 'printer', key: 'max_accel', unit: 'mm/s²' },
    { section: 'printer', key: 'square_corner_velocity', unit: 'mm/s' },
    { section: 'printer', key: 'max_z_velocity', unit: 'mm/s' },
    { section: 'bed_mesh', key: 'probe_count', unit: '' },
    { section: 'bed_mesh', key: 'mesh_min', unit: 'mm' },
    { section: 'bed_mesh', key: 'mesh_max', unit: 'mm' },
    { section: 'bed_mesh', key: 'algorithm', unit: '' },
    { section: 'z_tilt', key: 'retries', unit: '' },
    { section: 'z_tilt', key: 'retry_tolerance', unit: 'mm' },
    { section: 'quad_gantry_level', key: 'retries', unit: '' },
    { section: 'quad_gantry_level', key: 'retry_tolerance', unit: 'mm' },
    { section: 'input_shaper', key: 'shaper_type_x', unit: '' },
    { section: 'input_shaper', key: 'shaper_freq_x', unit: 'hz' },
    { section: 'input_shaper', key: 'shaper_type_y', unit: '' },
    { section: 'input_shaper', key: 'shaper_freq_y', unit: 'hz' },
    { section: 'extruder', key: 'pressure_advance', unit: '' },
    { section: 'extruder', key: 'pressure_advance_smooth_time', unit: 's' },
    { section: 'heater_generic chamber', key: 'max_temp', unit: '°C' },
    { section: 'firmware_retraction', key: 'retract_length', unit: 'mm' },
    { section: 'firmware_retraction', key: 'retract_speed', unit: 'mm/s' },
  ],
  consoleHideTemps: true,
  tempRange: 600,
  strip: { order: [], hidden: [] },
  layout: null,
  hiddenCards: [],
  invertZ: true,
  hiddenCfgs: [],
  printerName: '',
  customCards: {},
  layoutBackups: [],
  // layout used while printing (null = same as idle until edited)
  theme: 'dark', // dark | light | auto
  searchContent: true, // Ctrl+K also searches inside .py .sh .txt files in the config folder
  heightmap: { colorAuto: true, colorLim: 0.1, zAuto: true, zMax: 0.5 }, // colour range and 3D z axis, auto = from the mesh
  uiScale: 100, // percent; 'auto' = looks the same as on a 1920 px wide screen
  navMode: 'pinned', // pinned | hidden | auto
  autoLayout: false,
  layoutPrint: null,
  hiddenCardsPrint: [],
  sound: { enabled: false, volume: 0.6, complete: true, error: true, paused: true, heated: false },
  // jog / extrude presets, shared with Mainsail and Fluidd when sync is on
  control: { feedXY: 100, feedZ: 25, stepsXY: [100, 10, 1], stepsZ: [25, 1, 0.1], dpad: [100, 50, 10, 1, 0.1], zOffset: [0.005, 0.01, 0.025, 0.05], extAmounts: [5, 10, 25, 50, 100], extFeeds: [1, 2, 5, 10] },
  sync: true, // mirror shared settings (name, language, jog presets, temperature presets) into the Mainsail / Fluidd database
  errorToasts: true,
  maintenance: null, // filled with defaults on first visit of the Health page
  lang: '', // '' = not chosen yet (first run asks)
  setupDone: false,
  migratedCarbon: false,
  cardOpts: {},
  cardColors: {}, // dashboard card -> tint name ('cool'...), '#rrggbb' or 'none' // per dashboard module options, e.g. macros: { scroll, showHidden, hidden: [] }
  heaterBase: {}, // { extruder: { target, power, t } } power needed to hold a temperature, learned
})

export const DEFAULT_LAYOUT = () => [
  { i: 'console', x: 0, y: 0, w: 12, h: 7 },
  { i: 'temps', x: 0, y: 7, w: 6, h: 8 },
  { i: 'webcam', x: 6, y: 7, w: 6, h: 8 },
  { i: 'tempchart', x: 0, y: 15, w: 12, h: 6 },
  { i: 'toolhead', x: 0, y: 21, w: 12, h: 5 },
  { i: 'extruder', x: 0, y: 26, w: 6, h: 7 },
  { i: 'limits', x: 6, y: 26, w: 6, h: 7 },
]
export const LAYOUT_KEYS = ['layout', 'hiddenCards', 'strip', 'customCards', 'layoutPrint', 'hiddenCardsPrint', 'autoLayout', 'cardColors']
export function layoutSnapshot() {
  const o = {}
  for (const k of LAYOUT_KEYS) o[k] = JSON.parse(JSON.stringify(state.settings[k] ?? null))
  return o
}
export function pushLayoutBackup(snap, label) {
  const b = [{ t: Date.now(), label, data: snap }, ...(state.settings.layoutBackups || [])]
  state.settings.layoutBackups = b.slice(0, 5)
}
export function restoreLayout(snap) {
  for (const k of LAYOUT_KEYS) state.settings[k] = JSON.parse(JSON.stringify(snap[k] ?? DEFAULT_SETTINGS()[k]))
}

export const state = reactive({
  connected: false,
  klippy: 'disconnected', // ready | startup | shutdown | error | disconnected
  klippyMessage: '',
  objects: [],
  status: {},
  macros: [],
  commands: {},
  console: [],
  files: { path: 'gcodes', dirs: [], files: [], disk: null, loading: false },
  currentMeta: null,
  webcams: [],
  spoolman: { server: '', spool: null },
  settings: cachedSettings(),
  settingsLoaded: false,
  notifications: [],
  histTick: 0,
  toasts: [],
  versions: { klipper: '', moonraker: '', host: '' },
  update: null, // { app, lines: [], complete }
  uiUpdate: null, // { name, version, remote } when Moonraker's update manager has a newer Voyager UI
  cache: {},
  editDash: false,
  printerName: '',
  showExclude: false,
  conn: { attempts: 0, since: 0, probe: '' },
  tasks: [],
  booted: false,
  prompt: null, // action:prompt dialog from macros
  queue: { state: '', jobs: [], enabled: null },
  spotlight: false,
  favEdit: false,
  consoleDraft: '',
  jump: null, // { file, line } for the config editor
  anchor: '', // element id to scroll to after navigation
  uiZoom: 1, // current page zoom, see applyScale
  power: [], // Moonraker [power] devices: { device, status, locked_while_printing, type }
  login: null, // { needed, sources, source } when Moonraker asks for a login
  settingsOpen: null, // name of the settings dialog tab while it is open
  dashEditReq: 0, // bumped by the top bar to start customizing the dashboard
  etaLearn: { k: null, n: 0 }, // how much real prints differ from the slicer estimate (median of past prints)
})

// local copies so the dashboard can be drawn before moonraker answers
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
export function mergeSettings(v) {
  const def = DEFAULT_SETTINGS()
  v = v || {}
  return { ...def, ...v, devices: { ...def.devices, ...(v.devices || {}) }, strip: { ...def.strip, ...(v.strip || {}) }, control: { ...def.control, ...(v.control || {}) }, heightmap: { ...def.heightmap, ...(v.heightmap || {}) } }
}
function cachedSettings() { return mergeSettings(lsGet(APP + '-settings')) }
state.objects = lsGet(APP + '-objects') || []
{ const h = lsGet(APP + '-heaters'); if (h) state.status.heaters = h }

// temperature history, non-reactive for speed. histTick triggers redraws.
export const hist = markRaw({})
const HIST_MAX = 1200

// ---------- helpers ----------
export function shortName(obj) {
  const i = obj.indexOf(' ')
  return i > 0 ? obj.slice(i + 1) : obj
}
export function prettyName(obj) {
  const custom = state.settings.devices?.names?.[obj]
  if (custom) return custom
  if (obj === 'fan') return t('Part Fan')
  if (obj === 'extruder') return t('Extruder')
  if (obj === 'heater_bed') return t('Heater Bed')
  return shortName(obj).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
export function fmtTime(sec) {
  if (sec == null || !isFinite(sec) || sec < 0) return '--'
  sec = Math.round(sec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  const s = sec % 60
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}
export function fmtBytes(b) {
  if (b == null) return '--'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++ }
  return `${b.toFixed(i ? 1 : 0)} ${u[i]}`
}
export function fmtDate(ts) {
  if (!ts) return '--'
  const d = new Date(ts * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
export function toast(msg, kind = 'info', opts = {}) {
  // same message twice within a few seconds (e.g. rpc error + "!!" echo) shows once
  const now = Date.now()
  const dup = state.toasts.find((t) => t.msg === msg)
  if (dup) { dup.n = (dup.n || 1) + 1; return }
  const id = Math.random().toString(36).slice(2)
  state.toasts.push({ id, msg, kind, t: now, ...opts })
  if (state.toasts.length > 4) state.toasts.splice(0, state.toasts.length - 4)
  const ms = opts.ms ?? (kind === 'error' ? 9000 : 3500)
  if (ms) setTimeout(() => closeToast(id), ms)
}
export function closeToast(id) { state.toasts = state.toasts.filter((t) => t.id !== id) }

// ---------- computed ----------
export const S = (name) => state.status[name] || {}

export const printerName = computed(() => state.settings.printerName || state.printerName || state.versions.host || t('Printer'))
watch(printerName, (n) => { document.title = n + ' · ' + APP_NAME }, { immediate: true })
export const printState = computed(() => S('print_stats').state || 'standby')
export const isPrinting = computed(() => ['printing', 'paused'].includes(printState.value))
export const progress = computed(() => {
  const p = S('virtual_sdcard').progress ?? S('display_status').progress ?? 0
  return Math.max(0, Math.min(1, p))
})
export const printTimes = computed(() => {
  const ps = S('print_stats')
  const dur = ps.print_duration || 0
  const p = progress.value
  // Smart estimate: the slicer time (corrected by what past prints showed and the speed override)
  // counts most at the start, the measured pace from file progress takes over as the print goes on.
  const est = state.currentMeta?.estimated_time
  const k = state.etaLearn.k || 1
  const sf = S('gcode_move').speed_factor || 1
  const fileLeft = p > 0.01 && dur > 0 ? dur / p - dur : null
  const slicerLeft = est ? (Math.max(0, est * (1 - p)) * k) / sf : null
  let left = fileLeft ?? slicerLeft, w = fileLeft != null ? 1 : 0
  if (fileLeft != null && slicerLeft != null) { w = Math.min(1, Math.max(0, (p - 0.03) / 0.5)); left = slicerLeft * (1 - w) + fileLeft * w }
  return { elapsed: ps.total_duration || 0, print: dur, left, eta: left != null ? new Date(Date.now() + left * 1000) : null,
    why: { slicerLeft, fileLeft, k: state.etaLearn.k, n: state.etaLearn.n, w, sf } }
})
export const layerInfo = computed(() => {
  const info = S('print_stats').info || {}
  let cur = info.current_layer, total = info.total_layer
  const m = state.currentMeta
  if ((cur == null || total == null) && m?.layer_height) {
    const z = S('gcode_move').gcode_position?.[2] || 0
    const first = m.first_layer_height || m.layer_height
    if (total == null && m.object_height) total = Math.ceil((m.object_height - first) / m.layer_height + 1)
    if (cur == null) cur = z > 0 ? Math.max(1, Math.ceil((z - first) / m.layer_height + 1)) : 0
  }
  return { cur: cur ?? 0, total: total ?? 0 }
})

export const sensors = computed(() => {
  const h = S('heaters')
  const list = h.available_sensors || []
  const heaters = new Set(h.available_heaters || [])
  return list
    .filter((n) => !state.settings.hiddenSensors.includes(n))
    .map((n) => ({
      name: n,
      label: prettyName(n),
      isHeater: heaters.has(n),
      isTempFan: n.startsWith('temperature_fan '),
      ...S(n),
    }))
})

const FAN_TYPES = ['fan', 'fan_generic', 'heater_fan', 'controller_fan', 'temperature_fan']
export const devices = computed(() => {
  const out = []
  for (const o of state.objects) {
    const type = o.split(' ')[0]
    if (FAN_TYPES.includes(type)) {
      if (type === 'temperature_fan') out.push({ id: o, kind: 'fan', controllable: false, auto: true })
      else out.push({ id: o, kind: 'fan', controllable: type === 'fan' || type === 'fan_generic', auto: type === 'heater_fan' || type === 'controller_fan' })
    } else if (type === 'output_pin' && !o.startsWith('output_pin _')) {
      out.push({ id: o, kind: 'pin' })
    } else if (['neopixel', 'led', 'dotstar', 'pca9533', 'pca9632'].includes(type)) {
      out.push({ id: o, kind: 'led' })
    } else if (type === 'filament_switch_sensor' || type === 'filament_motion_sensor') {
      out.push({ id: o, kind: 'filament' })
    } else if (type === 'smart_filament_sensor') {
      out.push({ id: o, kind: 'filament', custom: true })
    }
  }
  if (state.spoolman.server) out.push({ id: 'spoolman', kind: 'spoolman' })
  return out
})

// items for the top card strip: temperatures first, then devices. Order + hidden persisted.
export const stripAll = computed(() => {
  const temps = (S('heaters').available_sensors || []).map((n) => ({ id: 'temp:' + n, kind: 'temp', obj: n }))
  const items = [...temps, ...devices.value.map((d) => ({ ...d, obj: d.id, id: 'dev:' + d.id }))]
  const order = state.settings.strip?.order || []
  const idx = (id) => { const i = order.indexOf(id); return i < 0 ? 1000 + items.findIndex((x) => x.id === id) : i }
  return items.sort((a, b) => idx(a.id) - idx(b.id))
})
export const stripVisible = computed(() => stripAll.value.filter((x) => !(state.settings.strip?.hidden || []).includes(x.id) && !state.settings.devices.hidden.includes(x.obj)))

export const macroList = computed(() =>
  state.objects
    .filter((o) => o.startsWith('gcode_macro ') && !o.startsWith('gcode_macro _'))
    .map((o) => o.slice(12))
    .sort()
)

// all commands known to klipper (help + macros), for autocomplete
export const allCommands = computed(() => {
  const m = new Map()
  for (const [k, v] of Object.entries(state.commands)) m.set(k.toUpperCase(), v)
  for (const o of state.objects) if (o.startsWith('gcode_macro ')) { const n = o.slice(12); if (!m.has(n.toUpperCase())) m.set(n.toUpperCase(), state.status[o]?.description || 'macro') }
  return [...m.entries()].map(([name, desc]) => ({ name, desc, hidden: name.startsWith('_') })).sort((a, b) => a.name.localeCompare(b.name))
})

// subscribe to a moonraker notification for the lifetime of a component
export function useApiEvent(method, fn) {
  api.on(method, fn)
  onBeforeUnmount(() => api.off(method, fn))
}

export const excludeObjects = computed(() => S('exclude_object'))

// ---------- actions ----------
export const gcode = async (script, { quiet = false } = {}) => {
  pushConsole(script, 'command')
  try {
    await api.gcode(script)
  } catch (e) {
    if (!quiet) toast(e.message, 'error')
    throw e
  }
}

let consoleSeq = 0 // ids stay unique after the 600 line cap, several lines can share a timestamp
export function pushConsole(message, type = 'response', time = Date.now() / 1000) {
  state.console.push({ message, type, time, id: ++consoleSeq })
  if (state.console.length > 600) state.console.splice(0, state.console.length - 600)
}

// ---------- notifications (only important things, like Mainsail) ----------
let dismissed = new Set()
try { dismissed = new Set(JSON.parse(localStorage.getItem(APP + '-dismissed') || '[]')) } catch {}
export function notify(key, msg, kind = 'warn') {
  if (dismissed.has(key) || state.notifications.some((n) => n.id === key)) return
  state.notifications.unshift({ id: key, msg, kind, time: Date.now() / 1000 })
}
export function unnotify(prefix) { state.notifications = state.notifications.filter((n) => !String(n.id).startsWith(prefix)) }
export function dismiss(n) {
  state.notifications = state.notifications.filter((x) => x !== n)
  if (!String(n.id).startsWith('klippy:')) { dismissed.add(n.id); try { localStorage.setItem(APP + '-dismissed', JSON.stringify([...dismissed].slice(-200))) } catch {} }
}
export function dismissAll() { for (const n of [...state.notifications]) dismiss(n) }
const THROTTLE = { 0: 'Under-voltage detected', 1: 'Frequency capped', 2: 'Currently throttled', 3: 'Soft temperature limit active', 16: 'Under-voltage has occurred', 17: 'Frequency capping has occurred', 18: 'Throttling has occurred', 19: 'Soft temperature limit has occurred' }
async function checkHealth() {
  try {
    const info = await api.call('server.info')
    unnotify('mr:')
    for (const w of (info.warnings || []).filter((w) => !w.includes('::TMPNAME'))) notify('mr:' + w.slice(0, 120), 'Moonraker: ' + w, 'warn')
    for (const c of info.failed_components || []) notify('mrc:' + c, t('Moonraker component "{name}" failed to load', { name: c }), 'error')
  } catch {}
  try {
    const p = await api.call('machine.proc_stats')
    const bits = p.throttled_state?.bits || 0
    for (const [b, txt] of Object.entries(THROTTLE)) if (bits & (1 << b)) notify('thr:' + b, t('Raspberry Pi: {msg}', { msg: t(txt) }), +b < 4 ? 'error' : 'warn')
  } catch {}
  try {
    const u = await api.call('machine.update.status', {})
    const n = Object.entries(u.version_info || {}).filter(([k, v]) => k !== 'system' && (v.commits_behind?.length || (v.remote_version && v.version && v.remote_version !== '?' && v.version !== v.remote_version))).map(([k]) => k)
    unnotify('upd:')
    if (n.length) notify('upd:' + n.join(','), t('Updates available: {list}', { list: n.join(', ') }), 'info')
    // our own entry gets a hint in the side menu, one click away from the update button
    const me = Object.entries(u.version_info || {}).find(([k]) => k === APP || k.startsWith(APP + '-'))
    state.uiUpdate = me && n.includes(me[0]) ? { name: me[0], version: me[1].version, remote: me[1].remote_version } : null
  } catch {}
}

// ---------- SAVE_CONFIG backups -> config/backups ----------
const BK_RE = /^printer-\d{8}_\d{6}\.cfg$/
let tidying = false
export async function tidyBackups() {
  if (tidying) return
  tidying = true
  try {
    const r = await api.call('server.files.get_directory', { path: 'config', extended: false })
    const list = r.files.filter((f) => BK_RE.test(f.filename))
    if (list.length && !r.dirs.some((d) => d.dirname === 'backups')) await api.call('server.files.post_directory', { path: 'config/backups' })
    for (const f of list) await api.call('server.files.move', { source: 'config/' + f.filename, dest: 'config/backups/' + f.filename })
  } catch (e) { console.warn('backup tidy', e) }
  tidying = false
}
// copy a config file into config/backups before we overwrite it
export async function backupBeforeWrite(root, path) {
  if (root !== 'config') return
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}` // local time, like Klipper's own backups
  const base = path.replace(/\.(cfg|conf)$/, '').split('/').join('__') // folder kept in the name so hardware/x.cfg and other/x.cfg do not collide
  const ext = (path.match(/\.(cfg|conf)$/) || ['', 'cfg'])[1]
  try {
    try { await api.call('server.files.post_directory', { path: 'config/backups' }) } catch {}
    await api.call('server.files.copy', { source: `config/${path}`, dest: `config/backups/${base}-klipperui-${ts}.${ext}` })
  } catch (e) { console.warn('backup copy', e) }
}

export function setHeater(name, target) {
  target = Math.max(0, Number(target) || 0)
  if (name.startsWith('temperature_fan ')) return gcode(`SET_TEMPERATURE_FAN_TARGET TEMPERATURE_FAN=${shortName(name)} TARGET=${target}`)
  return gcode(`SET_HEATER_TEMPERATURE HEATER=${shortName(name)} TARGET=${target}`)
}

export async function applyPreset(p) {
  for (const [name, t] of Object.entries(p.temps || {})) {
    if (t == null || t === '') continue
    if (!state.objects.includes(name)) continue
    await setHeater(name, t)
  }
}

export function setFan(id, pct) {
  const v = Math.round(pct) / 100
  if (id === 'fan') return gcode(`M106 S${Math.round(v * 255)}`)
  return gcode(`SET_FAN_SPEED FAN=${shortName(id)} SPEED=${v}`)
}

// ---------- settings persistence ----------
let saveTimer = null
let settingsDirty = false // changed here but not yet confirmed by Moonraker: a reload from the DB must not undo it
export function saveSettings() {
  clearTimeout(saveTimer)
  settingsDirty = true
  const value = JSON.parse(JSON.stringify(state.settings))
  value.migratedCarbon = true
  lsSet(APP + '-settings', value) // the local copy is written at once, the DB write is debounced
  saveTimer = setTimeout(async () => {
    try {
      const v = JSON.parse(JSON.stringify(state.settings)); v.migratedCarbon = true
      await api.call('server.database.post_item', { namespace: NS, key: 'settings', value: v })
      settingsDirty = false
    } catch (e) {
      if (!/not connected|disconnected/.test(e.message || '')) toast(t('Settings could not be saved: {err}', { err: e.message }), 'error')
    }
  }, 400)
}
async function loadSettings() {
  let cur = null, missing = false
  try {
    const r = await api.call('server.database.get_item', { namespace: NS, key: 'settings' })
    cur = r.value || {}
  } catch (e) {
    // "not found" comes back with different codes depending on the Moonraker version
    missing = e.code === 404 || /not found|does not exist|no such/i.test(e.message || '')
    if (!missing && /^(not connected|disconnected)$/.test(e.message || '')) { state.settingsLoaded = false; return }
  }
  // one-time carry-over from the old names: their values fill in whatever the new record does not have yet,
  // anything already set under the new name wins
  if (!cur?.migratedCarbon && (cur || missing)) {
    for (const oldNs of OLD_APPS) {
      try {
        const old = (await api.call('server.database.get_item', { namespace: oldNs, key: 'settings' })).value
        if (old && typeof old === 'object') { cur = { ...old, ...(cur || {}) }; break }
      } catch {}
    }
    if (cur || missing) {
      cur = { ...(cur || {}), migratedCarbon: true }
      try { await api.call('server.database.post_item', { namespace: NS, key: 'settings', value: cur }) } catch {}
    }
  }
  if (settingsDirty) {
    // changed while offline or within the save debounce: this browser's copy is newer than the DB, push it instead
    state.settingsLoaded = true
    saveSettings()
    return
  }
  if (cur) { state.settings = mergeSettings(cur); lsSet(APP + '-settings', cur) }
  else if (missing) state.settings = mergeSettings(lsGet(APP + '-settings')) // fresh Moonraker DB: seed it from the browser copy
  state.settingsLoaded = true
}
watch(() => state.settings, () => { if (state.settingsLoaded) saveSettings() }, { deep: true })
watch(() => state.settings.lang, (l) => { if (l) setLang(l) }, { immediate: true })
// light / dark: 'auto' follows the operating system
const mqDark = window.matchMedia?.('(prefers-color-scheme: dark)')
function applyTheme() {
  const pref = state.settings.theme || 'dark'
  const mode = pref === 'auto' ? (mqDark?.matches === false ? 'light' : 'dark') : pref
  document.documentElement.dataset.theme = mode
  try { localStorage.setItem(APP + '-theme', mode) } catch {}
}
watch(() => state.settings.theme, applyTheme, { immediate: true })
// Interface size. The dashboard is laid out on a 1920 px wide screen; on a laptop (1440, 1512 ...) or a
// 1440p monitor the whole UI is zoomed so cards keep the same proportions and the same number fits side by side.
// Phones and small tablets (< 1100 px) keep 100 % and use the stacked layout.
export const REF_WIDTH = 1920
export function uiZoomFor(pref, w = window.innerWidth) {
  if (w <= 1100) return 1
  if (pref && pref !== 'auto') return Math.min(2, Math.max(0.5, +pref / 100 || 1))
  return Math.min(1.6, Math.max(0.6, w / REF_WIDTH))
}
function applyScale() {
  const pref = state.settings.uiScale ?? 100
  const z = +uiZoomFor(pref).toFixed(3)
  const el = document.documentElement
  if (z === 1) el.style.removeProperty('zoom'); else el.style.zoom = z
  el.style.setProperty('--zoom', z)
  window.__uiZoom = z
  state.uiZoom = z
  // width breakpoints above the phone layout follow the zoomed width, not the raw window width
  const ew = window.innerWidth / z
  for (const bp of [1200, 1300, 1750, 1900]) el.classList.toggle('ew-lt-' + bp, ew <= bp)
  try { localStorage.setItem(APP + '-scale', String(pref)) } catch {}
}
watch(() => state.settings.uiScale, applyScale, { immediate: true })
let rsz
window.addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(applyScale, 120) })
document.documentElement.dataset.look = 'panel'
mqDark?.addEventListener?.('change', applyTheme)
watch(() => state.settings.accent, (a) => document.documentElement.style.setProperty('--ac-raw', a || '#ff6b1a'), { immediate: true })

// ---------- init ----------
function mergeStatus(diff) {
  for (const [k, v] of Object.entries(diff || {})) {
    if (!state.status[k]) state.status[k] = {}
    Object.assign(state.status[k], v)
  }
}

let klippyTimer = null
async function checkKlippy() {
  clearTimeout(klippyTimer)
  try {
    const info = await api.call('server.info')
    state.versions.moonraker = info.moonraker_version || ''
    state.klippy = info.klippy_state
    if (info.klippy_state === 'ready') return initKlippy()
    state.booted = true
    try {
      const p = await api.call('printer.info')
      state.klippyMessage = p.state_message
    } catch { state.klippyMessage = info.klippy_state }
    if (info.klippy_state === 'shutdown' || info.klippy_state === 'error') {
      // still try subscribing so webhooks/state gets through
    }
  } catch {}
  klippyTimer = setTimeout(checkKlippy, 2000)
}

let initP = null
function initKlippy() { return initP || (initP = initKlippyOnce().finally(() => { initP = null })) }
async function initKlippyOnce() {
  try {
    const { objects } = await api.call('printer.objects.list')
    state.objects = objects
    lsSet(APP + '-objects', objects)
    const sub = {}
    for (const o of objects) sub[o] = null
    // the full printer.cfg (config + settings) is the heaviest part and only changes on restart:
    // subscribe to the small live fields, fetch the big ones once right after
    if (sub.configfile !== undefined) sub.configfile = ['save_config_pending', 'save_config_pending_items', 'warnings']
    const r = await api.call('printer.objects.subscribe', { objects: sub })
    state.status = {}
    mergeStatus(r.status)
    if (r.status.heaters) lsSet(APP + '-heaters', r.status.heaters)
    state.klippy = r.status.webhooks?.state || 'ready'
    state.klippyMessage = r.status.webhooks?.state_message || ''
    api.call('printer.info').then((p) => { state.versions.klipper = p.software_version; state.versions.host = p.hostname; if (!state.printerName) state.printerName = p.hostname }).catch(() => {})
    state.booted = true
    if (objects.includes('configfile')) {
      api.call('printer.objects.query', { objects: { configfile: ['config', 'settings'] } })
        .then((q) => mergeStatus(q.status)).catch(() => {})
    }
    loadTempHistory()
    setTimeout(tidyBackups, 3000)
    loadGcodeStore()
    loadCommands()
    loadCurrentMeta()
  } catch (e) {
    toast(t('Klipper init failed: {err}', { err: e.message }), 'error')
  }
}

async function loadTempHistory() {
  try {
    const r = await api.call('server.temperature_store', { include_monitors: false })
    for (const [name, d] of Object.entries(r)) {
      hist[name] = { t: (d.temperatures || []).slice(-HIST_MAX), target: (d.targets || []).slice(-HIST_MAX) }
    }
    state.histTick++
  } catch {}
}
async function loadGcodeStore() {
  try {
    const r = await api.call('server.gcode_store', { count: 200 })
    state.console = []
    for (const g of r.gcode_store) pushConsole(g.message, g.type, g.time)
  } catch {}
}
async function loadCommands() {
  try {
    const r = await api.call('printer.gcode.help')
    state.commands = r || {}
  } catch {}
}
export async function loadCurrentMeta() {
  const fn = S('print_stats').filename
  if (!fn) { state.currentMeta = null; return }
  try {
    state.currentMeta = await api.call('server.files.metadata', { filename: fn })
  } catch { state.currentMeta = null }
}

export async function loadSpool() {
  if (!state.spoolman.server) return
  try {
    const r = await api.call('server.spoolman.get_spool_id')
    const id = r.spool_id
    if (!id) { state.spoolman.spool = null; return }
    const p = await api.call('server.spoolman.proxy', { request_method: 'GET', path: `/v1/spool/${id}`, use_v2_response: true })
    state.spoolman.spool = p.response || null
  } catch { state.spoolman.spool = null }
}

// ---------- Moonraker power devices (smart plugs, relays) ----------
export async function loadPower() {
  try { state.power = (await api.call('machine.device_power.devices')).devices || [] } catch { state.power = [] }
}
export async function setPower(device, action) {
  const r = await api.call('machine.device_power.post_device', { device, action })
  const d = state.power.find((x) => x.device === device)
  if (d && r?.[device]) d.status = r[device]
  return r
}

async function onOpen() {
  state.connected = true
  state.login = null
  state.conn = { attempts: 0, since: 0, probe: '' }
  // everything independent goes out at once
  api.call('server.connection.identify', { client_name: APP_NAME, version: VERSION, type: 'web', url: REPO_URL }).catch(() => {})
  const pSettings = loadSettings()
  api.call('server.database.get_item', { namespace: 'mainsail', key: 'general' }).then((m) => { state.printerName = m.value?.printername || state.printerName }).catch(() => {})
  api.call('server.webcams.list').then((r) => { state.webcams = r.webcams || [] }).catch(() => {})
  loadPower()
  api.call('server.config').then((c) => {
    state.spoolman.server = c.config?.spoolman?.server || ''
    if (state.spoolman.server) loadSpool()
  }).catch(() => {})
  checkKlippy()
  await pSettings
  setTimeout(checkHealth, 4000)
}

// ---------- live activity (what is being loaded right now) ----------
const TASK_LABELS = {
  'server.info': 'Checking Moonraker', 'printer.info': 'Reading Klipper info', 'printer.objects.list': 'Reading printer objects',
  'printer.objects.subscribe': 'Subscribing to printer status', 'printer.objects.query': 'Reading printer config', 'server.temperature_store': 'Loading temperature history',
  'server.gcode_store': 'Loading console history', 'printer.gcode.help': 'Loading command list', 'server.database.get_item': 'Loading settings',
  'server.webcams.list': 'Loading webcams', 'server.config': 'Reading Moonraker config', 'server.files.get_directory': 'Reading files',
  'server.files.list': 'Listing files', 'server.files.metadata': 'Reading file info', 'server.history.list': 'Loading print history',
  'server.history.totals': 'Loading print statistics', 'machine.system_info': 'Reading system info', 'machine.proc_stats': 'Reading system load',
  'machine.update.status': 'Checking updates', 'machine.update.refresh': 'Refreshing update info', 'server.files.roots': 'Listing file roots',
  'server.spoolman.proxy': 'Loading Spoolman spool', 'server.spoolman.get_spool_id': 'Loading active spool', 'printer.gcode.script': null,
  'server.database.post_item': null, 'server.connection.identify': 'Connecting', 'printer.query_endstops.status': 'Querying endstops',
}
let taskId = 0
api.onTask = (method) => {
  const label = method in TASK_LABELS ? TASK_LABELS[method] && t(TASK_LABELS[method]) : method.startsWith('GET ') ? t('Downloading {name}', { name: method.slice(4) }) : method
  if (!label) return null
  const task = { id: ++taskId, label, t: Date.now() }
  state.tasks.push(task)
  return () => { state.tasks = state.tasks.filter((x) => x.id !== task.id) }
}
export const activeTasks = computed(() => {
  const seen = new Set()
  return state.tasks.filter((t) => !seen.has(t.label) && seen.add(t.label))
})

export function start() {
  // `?host=` points the dev server (npm run dev) at a printer. It is a dev-only feature: in a production build
  // every request, the login form and the tokens must stay on the origin the page was served from, otherwise
  // a link like /?host=evil could make the UI hand the Moonraker token or password to another server.
  let host = ''
  if (import.meta.env.DEV) {
    const qp = new URLSearchParams(location.search).get('host')
    if (qp !== null) {
      try { qp && /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(qp) ? localStorage.setItem(APP + '-host', qp) : localStorage.removeItem(APP + '-host') } catch {}
    }
    try { host = localStorage.getItem(APP + '-host') || '' } catch {}
  } else {
    try { localStorage.removeItem(APP + '-host') } catch {}
  }

  api.on('open', onOpen)
  api.on('auth-required', (info) => { state.login = { needed: true, sources: info.available_sources || ['moonraker'], source: info.default_source || 'moonraker' } })
  api.on('close', async () => {
    if (state.connected || !state.conn.since) state.conn.since = Date.now()
    state.connected = false
    state.klippy = 'disconnected'
    state.conn.attempts++
    // find out why: is moonraker reachable over http?
    try {
      const r = await api.fetch('/server/info')
      if (r.status === 502 || r.status === 504) state.conn.probe = t('Moonraker is not responding (nginx {status}). It may be restarting or crashed; check moonraker.log.', { status: r.status })
      else if (r.status === 401 || r.status === 403) state.conn.probe = t('Moonraker asks for a login.')
      else if (r.ok) state.conn.probe = t('Moonraker answers over HTTP but the websocket closes. Usually a restart in progress; if it stays like this, reload the page.')
      else state.conn.probe = t('Moonraker returned HTTP {status}', { status: r.status })
    } catch { state.conn.probe = t('The printer host is not reachable from this browser (network / Pi down).') }
  })
  api.on('notify_status_update', ([diff]) => {
    const fnBefore = state.status.print_stats?.filename
    mergeStatus(diff)
    if (diff.print_stats?.filename !== undefined && diff.print_stats.filename !== fnBefore) loadCurrentMeta()
    if (diff.webhooks) {
      state.klippy = diff.webhooks.state || state.klippy
      if (diff.webhooks.state_message) state.klippyMessage = diff.webhooks.state_message
    }
  })
  api.on('notify_gcode_response', ([line]) => pushConsole(line, 'response'))
  api.on('notify_klippy_ready', () => { unnotify('klippy:'); checkKlippy() })
  api.on('notify_filelist_changed', ([p]) => { if (p?.item?.root === 'config' && BK_RE.test(p.item.path || '') && p.action === 'create_file') setTimeout(tidyBackups, 1500) })
  setInterval(() => { if (state.connected) checkHealth() }, 120000)
  api.on('notify_klippy_shutdown', () => { state.klippy = 'shutdown'; checkKlippy(); setTimeout(() => notify('klippy:shutdown', t('Klipper shutdown: {msg}', { msg: (state.klippyMessage || '').split('\n')[0] }), 'error'), 1500) })
  api.on('notify_klippy_disconnected', () => { state.klippy = 'disconnected'; state.objects = []; checkKlippy() })
  api.on('notify_active_spool_set', () => loadSpool())
  api.on('notify_power_changed', ([d]) => { const x = state.power.find((p) => p.device === d?.device); if (x) Object.assign(x, d); else if (d?.device) state.power.push(d) })
  api.on('notify_webcams_changed', ([p]) => { state.webcams = p?.webcams || state.webcams })
  api.on('notify_update_response', ([r]) => {
    if (!state.update) state.update = { app: r.application, lines: [], complete: false }
    if (r.application) state.update.app = r.application
    state.update.lines.push(r.message)
    if (r.complete) state.update.complete = true
  })
  api.connect(host)

  // sample temperatures every second (same as moonraker's store)
  setInterval(() => {
    if (state.klippy !== 'ready') return
    const names = S('heaters').available_sensors || []
    for (const n of names) {
      const s = state.status[n]
      if (!s || s.temperature == null) continue
      const h = (hist[n] ||= { t: [], target: [] })
      h.t.push(s.temperature)
      h.target.push(s.target ?? 0)
      if (h.t.length > HIST_MAX) { h.t.shift(); h.target.shift() }
    }
    state.histTick++
  }, 1000)
}
