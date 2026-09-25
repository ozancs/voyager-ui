// Shared settings with Mainsail and Fluidd through the Moonraker database.
// Both UIs keep their settings in their own namespace ('mainsail', 'fluidd'). When sync is on, the settings a
// user would expect to be the same everywhere are mirrored there whenever they change here: printer name,
// language (Mainsail only), jog speeds and step presets, extrusion presets, temperature presets. They can also be
// imported from either UI. Only namespaces that already exist are written, keys are written one by one with dotted
// paths so nothing else in their database is touched. The other UI picks the values up when its page reloads.
import { reactive, watch } from 'vue'
import { api } from './api/moonraker'
import { state, S, shortName } from './store'

export const sync = reactive({ mainsail: false, fluidd: false, checked: false, busy: false, last: null })

const MS_LANGS = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'ru', 'tr', 'uk', 'ja', 'ko', 'zh']
const num = (a) => (Array.isArray(a) ? a.map(Number).filter((x) => x > 0) : null)

export async function detect() {
  try {
    const r = await api.call('server.database.list')
    const ns = r.namespaces || []
    sync.mainsail = ns.includes('mainsail')
    sync.fluidd = ns.includes('fluidd')
  } catch { sync.mainsail = sync.fluidd = false }
  sync.checked = true
}

async function get(namespace, key) { try { return (await api.call('server.database.get_item', { namespace, key })).value } catch { return undefined } }
async function put(namespace, key, value) { await api.call('server.database.post_item', { namespace, key, value }) }

// heater object name as the other UIs key it: Mainsail uses the full object name, Fluidd the name without the type
function heaterType(obj) { return obj === 'extruder' || obj.startsWith('extruder') || obj === 'heater_bed' ? 'heater' : obj.startsWith('temperature_fan') ? 'temperature_fan' : 'heater_generic' }
function findHeater(name) {
  const all = [...(S('heaters').available_heaters || []), ...(S('heaters').available_sensors || []).filter((s) => s.startsWith('temperature_fan'))]
  return all.find((h) => h === name) || all.find((h) => shortName(h) === name) || null
}

// ---- to Mainsail / Fluidd ----
function toMainsailPresets(presets) {
  return presets.map((p) => ({
    name: p.name, gcode: '',
    values: Object.fromEntries(Object.entries(p.temps || {}).map(([h, v]) => [h, { type: heaterType(h), bool: Number(v) > 0, value: Number(v) || 0 }])),
  }))
}
function toFluiddPresets(presets) {
  return presets.map((p, i) => ({
    id: i + 1, name: p.name,
    values: Object.fromEntries(Object.entries(p.temps || {}).map(([h, v]) => [h, { type: heaterType(h) === 'temperature_fan' ? 'fan' : 'heater', active: Number(v) > 0, value: Number(v) || 0 }])),
  }))
}

// which of our settings map where; each entry: [our value getter, mainsail key, fluidd key, transform]
function shared() {
  const s = state.settings, c = s.control || {}
  const desc = (a) => [...(num(a) || [])].sort((x, y) => y - x)
  const asc = (a) => [...(num(a) || [])].sort((x, y) => x - y)
  const out = [
    ['general.printername', 'uiSettings.general.instanceName', s.printerName || state.printerName || ''],
    ['control.feedrateXY', 'uiSettings.general.defaultToolheadXYSpeed', Number(c.feedXY) || 100],
    ['control.feedrateZ', 'uiSettings.general.defaultToolheadZSpeed', Number(c.feedZ) || 25],
    ['control.stepsXY', null, desc(c.stepsXY)],
    ['control.stepsZ', null, desc(c.stepsZ)],
    [null, 'uiSettings.general.toolheadMoveDistances', asc([...new Set([...(num(c.stepsXY) || []), ...(num(c.stepsZ) || []), ...(num(c.dpad) || [])])])],
    [null, 'uiSettings.general.zAdjustDistances', asc(c.zOffset)],
    ['control.extruder.feedamounts', null, desc(c.extAmounts)],
    ['control.extruder.feedrates', null, desc(c.extFeeds)],
    [null, 'uiSettings.general.defaultExtrudeLength', asc(c.extAmounts)[Math.floor((asc(c.extAmounts).length || 1) / 2)] || 25],
    [null, 'uiSettings.general.defaultExtrudeSpeed', asc(c.extFeeds)[Math.floor((asc(c.extFeeds).length || 1) / 2)] || 5],
    ['presets.presets', null, toMainsailPresets(s.presets || [])],
    [null, 'uiSettings.dashboard.tempPresets', toFluiddPresets(s.presets || [])],
  ]
  if (s.lang && MS_LANGS.includes(s.lang)) out.push(['general.language', null, s.lang])
  return out
}

let pushTimer, lastPushed = ''
export function pushSoon() {
  if (!state.settings.sync || !sync.checked || (!sync.mainsail && !sync.fluidd)) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(push, 1500)
}
export async function push() {
  if (!state.settings.sync || (!sync.mainsail && !sync.fluidd)) return
  const rows = shared()
  const sig = JSON.stringify(rows)
  if (sig === lastPushed) return
  lastPushed = sig
  sync.busy = true
  try {
    for (const [mk, fk, v] of rows) {
      if (sync.mainsail && mk) await put('mainsail', mk, v).catch(() => {})
      if (sync.fluidd && fk) await put('fluidd', fk, v).catch(() => {})
    }
    sync.last = Date.now()
  } finally { sync.busy = false }
}

// ---- from Mainsail / Fluidd ----
function presetsFromMainsail(list) {
  return (list || []).filter((p) => p && p.name).map((p, i) => ({
    id: 'ms' + i + '_' + Date.now(), name: p.name,
    temps: Object.fromEntries(Object.entries(p.values || {}).map(([h, v]) => [findHeater(h) || h, v?.bool === false ? 0 : Number(v?.value) || 0])),
  }))
}
function presetsFromFluidd(list) {
  return (list || []).filter((p) => p && p.name).map((p, i) => ({
    id: 'fl' + i + '_' + Date.now(), name: p.name,
    temps: Object.fromEntries(Object.entries(p.values || {}).map(([h, v]) => [findHeater(h) || h, v?.active === false ? 0 : Number(v?.value) || 0])),
  }))
}
// returns what was taken over, so the UI can say it
export async function importFrom(which) {
  const s = state.settings, c = { ...(s.control || {}) }
  const took = []
  if (which === 'mainsail') {
    const g = (await get('mainsail', 'general')) || {}, ct = (await get('mainsail', 'control')) || {}, pr = (await get('mainsail', 'presets')) || {}
    if (g.printername) { s.printerName = g.printername; took.push('name') }
    if (ct.feedrateXY) c.feedXY = Number(ct.feedrateXY)
    if (ct.feedrateZ) c.feedZ = Number(ct.feedrateZ)
    if (num(ct.stepsXY)?.length) c.stepsXY = num(ct.stepsXY)
    if (num(ct.stepsZ)?.length) c.stepsZ = num(ct.stepsZ)
    if (num(ct.extruder?.feedamounts)?.length) c.extAmounts = num(ct.extruder.feedamounts)
    if (num(ct.extruder?.feedrates)?.length) c.extFeeds = num(ct.extruder.feedrates)
    if (ct.feedrateXY || ct.stepsXY || ct.extruder) took.push('control')
    const p = presetsFromMainsail(pr.presets)
    if (p.length) { s.presets = p; took.push('presets') }
  } else {
    const ui = (await get('fluidd', 'uiSettings')) || {}, g = ui.general || {}
    if (g.instanceName) { s.printerName = g.instanceName; took.push('name') }
    if (g.defaultToolheadXYSpeed) c.feedXY = Number(g.defaultToolheadXYSpeed)
    if (g.defaultToolheadZSpeed) c.feedZ = Number(g.defaultToolheadZSpeed)
    if (num(g.toolheadMoveDistances)?.length) { const d = num(g.toolheadMoveDistances); c.stepsXY = d.filter((x) => x >= 1).slice(-3); c.stepsZ = d.filter((x) => x <= 25).slice(0, 3); c.dpad = d }
    if (num(g.zAdjustDistances)?.length) c.zOffset = num(g.zAdjustDistances)
    if (g.defaultToolheadXYSpeed || g.toolheadMoveDistances) took.push('control')
    const p = presetsFromFluidd(ui.dashboard?.tempPresets)
    if (p.length) { s.presets = p; took.push('presets') }
  }
  s.control = c
  lastPushed = JSON.stringify(shared()) // what we just read is already there, no need to write it back
  return took
}

// first run next to an existing Mainsail / Fluidd: take their values once so the user does not start from scratch
let started = false
export async function initSync() {
  if (started) return
  started = true
  await detect()
  if (!state.settings.syncImported && state.settings.sync !== false && (sync.mainsail || sync.fluidd)) {
    try { await importFrom(sync.mainsail ? 'mainsail' : 'fluidd') } catch {}
    state.settings.syncImported = true
  }
  watch(() => [state.settings.sync, state.settings.printerName, state.settings.lang, state.settings.control, state.settings.presets], pushSoon, { deep: true })
}
