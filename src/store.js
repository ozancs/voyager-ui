// The app state and the connection to Moonraker.
//  - state: everything the UI shows (printer objects, settings, console, files cache...), reactive
//  - start(): connects the websocket, subscribes to all printer objects and keeps state.status up to date
//  - settings: kept in Moonraker's database (and in localStorage as a fast first paint), see saveSettings
//  - helpers used everywhere: S(obj) for a printer object, gcode(), toast(), formatting functions
//  - temperature history (hist), print time estimates, update checks and throttling notices
import { reactive, computed, markRaw, watch, onBeforeUnmount } from 'vue';
import { api } from './api/moonraker';
import { setLang, t } from './i18n';
import { currentHost, currentPrinter, perPrinterKey } from './printers';
import { loadLong, sampleLong, backfillLong, saveLong } from './temphist';
import { sortSensors } from './sensorStyle';

export const VERSION = '0.26.3';
export const APP = 'voyager-ui';
export const APP_NAME = 'Voyager UI';
export const REPO_URL = 'https://github.com/ozancs/voyager-ui';
export const OLD_APPS = ['oznlab_klipperui', 'carbon-ui']; // earlier names, their data is carried over once
const NS = APP;

export const DEFAULT_SETTINGS = () => ({
  accent: '#ff6b1a',
  printerIcon: { kind: 'voyager', logo: '', theme: '', img: '' }, // tab icon and top bar logo, see printerIcon.js
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
  heightmap: { colorAuto: true, colorLim: 0.1, zAuto: true, zMax: 0.5, palette: 'voyager', wire: false }, // colour range and 3D z axis, auto = from the mesh
  favBar: 'always', // favorites bar under the top bar: always | dashboard | off (a Favorites card can go on the dashboard)
  compactCards: true, // dashboard cards with less padding, a thinner title bar and a tighter grid
  uiScale: 100, // percent, or 'auto' = looks the same as on a 1920 px wide screen
  scale100: true, // 0.24.1: the default went from auto to 100 %, older saved settings are moved once
  navMode: 'pinned', // pinned | hidden | auto
  autoLayout: false,
  layoutPrint: null,
  mobileOrder: null, // card order of the one-column phone dashboard, set in Customize on a phone
  hiddenCardsPrint: [],
  // alerts for print events: sounds, a system notification while the tab is in the background, spoken text
  sound: {
    enabled: false,
    volume: 0.6,
    complete: true,
    error: true,
    paused: true,
    heated: false,
    desktop: false,
    speak: false,
  },
  // jog / extrude presets, shared with Mainsail and Fluidd when sync is on
  control: {
    feedXY: 100,
    feedZ: 25,
    stepsXY: [100, 10, 1],
    stepsZ: [25, 1, 0.1],
    dpad: [100, 50, 10, 1, 0.1],
    zOffset: [0.005, 0.01, 0.025, 0.05],
    extAmounts: [5, 10, 25, 50, 100],
    extFeeds: [1, 2, 5, 10],
  },
  autoUpdateCheck: true, // ask Moonraker to check GitHub for updates every 6 hours (it only does so by itself every 4 weeks)
  sync: false, // (off unless turned on in Settings) mirror shared settings (name, language, jog presets, temperature presets) into the Mainsail / Fluidd database
  errorToasts: true,
  maintenance: null, // filled with defaults on first visit of the Health page
  lang: '', // '' = not chosen yet (first run asks)
  setupDone: false,
  migratedCarbon: false,
  cardOpts: {},
  cardColors: {}, // dashboard card -> tint name ('cool'...), '#rrggbb' or 'none' // per dashboard module options, e.g. macros: { scroll, showHidden, hidden: [] }
  heaterBase: {}, // 'extruder@250' -> { power, fan, t, heat, from } first measurement, compared on the Health page
  preprintCheck: true, // compare the file with the printer before a print starts (preprint.js)
  seenVersion: '', // the version whose changelog was shown; a new one opens What's new once
  sensorColors: {}, // sensor name -> colour picked in the eye menu (sensorStyle.js)
  sensorOrder: [], // sensor names in the order the user put them (sensorStyle.js)
  accentReach: 'subtle', // how far the accent colour reaches: subtle (buttons only) | normal | strong (card and dialog outlines)
});

export const DEFAULT_LAYOUT = () => [
  { i: 'console', x: 0, y: 0, w: 12, h: 7 },
  { i: 'temps', x: 0, y: 7, w: 6, h: 8 },
  { i: 'webcam', x: 6, y: 7, w: 6, h: 8 },
  { i: 'tempchart', x: 0, y: 15, w: 12, h: 6 },
  { i: 'toolhead', x: 0, y: 21, w: 8, h: 6 },
  { i: 'livez', x: 8, y: 21, w: 4, h: 6 },
  { i: 'extruder', x: 0, y: 26, w: 6, h: 7 },
  { i: 'limits', x: 6, y: 26, w: 6, h: 7 },
];
export const LAYOUT_KEYS = [
  'layout',
  'hiddenCards',
  'strip',
  'customCards',
  'layoutPrint',
  'hiddenCardsPrint',
  'autoLayout',
  'cardColors',
  'mobileOrder',
  'collapsed',
];
// Moonraker lists cameras from moonraker.conf first, then the saved ones in database (uid) order, and moves a
// camera to the end when it is renamed, so the same two cameras could come back in a different order and
// "the first camera" (the default of every card) changed between reloads. Sorted by name they always line up.
export function sortCams(list) {
  return [...(list || [])].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' }),
  );
}
// Moonraker's own order is still what moonraker-timelapse and moonraker-telegram-bot / notifier mean by "the first
// camera", so it is kept next to the sorted list.
export function setCams(list) {
  if (!list) return;
  state.webcamOrder = list.map((c) => c.name);
  state.webcams = sortCams(list);
}
export const firstCam = computed(
  () => state.webcams.find((c) => c.name === state.webcamOrder[0]) || state.webcams[0] || null,
);
export function layoutSnapshot() {
  const o = {};
  for (const k of LAYOUT_KEYS) o[k] = JSON.parse(JSON.stringify(state.settings[k] ?? null));
  return o;
}
export function pushLayoutBackup(snap, label) {
  const b = [{ t: Date.now(), label, data: snap }, ...(state.settings.layoutBackups || [])];
  state.settings.layoutBackups = b.slice(0, 5);
}
export function restoreLayout(snap) {
  for (const k of LAYOUT_KEYS) state.settings[k] = JSON.parse(JSON.stringify(snap[k] ?? DEFAULT_SETTINGS()[k]));
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
  webcamOrder: [], // camera names in Moonraker's order (state.webcams is sorted by name)
  components: [], // Moonraker components loaded (server.info), e.g. 'timelapse'
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
  excludePick: null, // object name picked in the viewer, asked at once by ExcludeModal
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
  updStatus: null, // last machine.update.status
  uiZoom: 1, // current page zoom, see applyScale
  power: [], // Moonraker [power] devices: { device, status, locked_while_printing, type }
  login: null, // { needed, sources, source } when Moonraker asks for a login
  settingsOpen: null, // name of the settings dialog tab while it is open
  printersOpen: false, // the printer list dialog (printers.js)
  preprint: null, // { filename, issues, resolve } while the pre-print check asks (PreprintDialog.vue)
  locked: false, // Lock (lock.js): read-only mode for this browser
  tablet: false, // Tablet mode (tablet.js)
  calibOpen: '', // guided calibration to open on the Calibrations page (CalibPath.vue)
  pip: null, // webcam name floating over the pages (FloatingCam.vue)
  guard: null, // { script, cmd, resolve } while a risky command waits for a confirm during a print (GuardDialog.vue)
  whatsNew: false, // the changelog dialog (WhatsNew.vue)
  dashEditReq: 0, // bumped by the top bar to start customizing the dashboard
  etaLearn: { k: null, n: 0 }, // how much real prints differ from the slicer estimate (median of past prints)
});

// local copies so the dashboard can be drawn before moonraker answers
// (per printer when several are set up, see printers.js)
function lsGet(k) {
  try {
    return JSON.parse(localStorage.getItem(perPrinterKey(k)) || 'null');
  } catch {
    return null;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(perPrinterKey(k), JSON.stringify(v));
  } catch {}
}
export function mergeSettings(v) {
  const def = DEFAULT_SETTINGS();
  v = v || {};
  // auto made the UI larger than expected on big monitors, so 100 % became the default. Settings saved before
  // that still say auto (the whole object is saved, not only what was changed): move them to 100 % once.
  if (!v.scale100) v = { ...v, scale100: true, uiScale: v.uiScale === 'auto' || v.uiScale == null ? 100 : v.uiScale };
  return {
    ...def,
    ...v,
    devices: { ...def.devices, ...(v.devices || {}) },
    strip: { ...def.strip, ...(v.strip || {}) },
    control: { ...def.control, ...(v.control || {}) },
    heightmap: { ...def.heightmap, ...(v.heightmap || {}) },
    printerIcon: { ...def.printerIcon, ...(v.printerIcon || {}) },
  };
}
function cachedSettings() {
  return mergeSettings(lsGet(APP + '-settings'));
}
state.objects = lsGet(APP + '-objects') || [];
{
  const h = lsGet(APP + '-heaters');
  if (h) state.status.heaters = h;
}

// temperature history, non-reactive for speed. histTick triggers redraws.
export const hist = markRaw({});
const HIST_MAX = 1200;

// ---------- helpers ----------
export function shortName(obj) {
  const i = obj.indexOf(' ');
  return i > 0 ? obj.slice(i + 1) : obj;
}
export function prettyName(obj) {
  const custom = state.settings.devices?.names?.[obj];
  if (custom) return custom;
  if (obj === 'fan') return t('Part Fan');
  if (obj === 'extruder') return t('Extruder');
  if (obj === 'heater_bed') return t('Heater Bed');
  if (/^tmc\d+ /.test(obj))
    return t('{name} driver', {
      name: shortName(obj)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  return shortName(obj)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
export function fmtTime(sec) {
  if (sec == null || !isFinite(sec) || sec < 0) return '--';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  const s = sec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}
export function fmtBytes(b) {
  if (b == null) return '--';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(i ? 1 : 0)} ${u[i]}`;
}
export function fmtDate(ts) {
  if (!ts) return '--';
  const d = new Date(ts * 1000);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}
export function toast(msg, kind = 'info', opts = {}) {
  // same message twice within a few seconds (e.g. rpc error + "!!" echo) shows once
  const now = Date.now();
  const dup = !opts.undo && state.toasts.find((t) => t.msg === msg);
  if (dup) {
    dup.n = (dup.n || 1) + 1;
    return;
  }
  const id = Math.random().toString(36).slice(2);
  state.toasts.push({ id, msg, kind, t: now, ...opts });
  // at most 4 plain toasts; undo toasts are never pushed out (their Undo button would go with them)
  const plain = state.toasts.filter((x) => !x.undo && !x.sticky);
  if (plain.length > 4) {
    const drop = new Set(plain.slice(0, plain.length - 4));
    state.toasts = state.toasts.filter((x) => !drop.has(x));
  }
  const ms = opts.ms ?? (kind === 'error' ? 9000 : 3500);
  if (ms) setTimeout(() => closeToast(id), ms);
  return id;
}
// change a toast that is on screen (a running calibration updates its time and progress)
export function updateToast(id, patch) {
  const x = state.toasts.find((t) => t.id === id);
  if (x) Object.assign(x, patch);
}
export function closeToast(id) {
  state.toasts = state.toasts.filter((t) => t.id !== id);
}

// ---------- computed ----------
export const S = (name) => state.status[name] || {};

// the nickname from this browser's printer list comes first: it is what tells printers apart in one UI
const nickname = currentPrinter()?.name || '';
export const printerName = computed(
  () => nickname || state.settings.printerName || state.printerName || state.versions.host || t('Printer'),
);
export const printState = computed(() => S('print_stats').state || 'standby');
// only while Klipper runs: after a shutdown print_stats can still say "printing", but that print is over
export const isPrinting = computed(() => state.klippy === 'ready' && ['printing', 'paused'].includes(printState.value));
export const progress = computed(() => {
  const p = S('virtual_sdcard').progress ?? S('display_status').progress ?? 0;
  return Math.max(0, Math.min(1, p));
});
// the tab title shows the print: "42% bracket_v3 · Voron" while printing, "Paused ..." or "Done ..." after
const tabTitle = computed(() => {
  const base = printerName.value + ' · ' + APP_NAME;
  const file = (S('print_stats').filename || '')
    .split('/')
    .pop()
    .replace(/\.gcode$/i, '');
  const st = printState.value;
  if (st === 'printing') return Math.floor(progress.value * 100) + '% ' + file + ' · ' + printerName.value;
  if (st === 'paused') return '⏸ ' + t('Paused') + ' ' + file + ' · ' + printerName.value;
  if (st === 'complete' && file) return '✓ ' + file + ' · ' + printerName.value;
  if (st === 'error') return '⚠ ' + printerName.value + ' · ' + APP_NAME;
  return base;
});
watch(tabTitle, (v) => (document.title = v), { immediate: true });
export const printTimes = computed(() => {
  const ps = S('print_stats');
  const dur = ps.print_duration || 0;
  const p = progress.value;
  // Smart estimate: the slicer time (corrected by what past prints showed and the speed override)
  // counts most at the start, the measured pace from file progress takes over as the print goes on.
  const est = state.currentMeta?.estimated_time;
  const k = state.etaLearn.k || 1;
  const sf = S('gcode_move').speed_factor || 1;
  const fileLeft = p > 0.01 && dur > 0 ? dur / p - dur : null;
  const slicerLeft = est ? (Math.max(0, est * (1 - p)) * k) / sf : null;
  let left = fileLeft ?? slicerLeft,
    w = fileLeft != null ? 1 : 0;
  if (fileLeft != null && slicerLeft != null) {
    w = Math.min(1, Math.max(0, (p - 0.03) / 0.5));
    left = slicerLeft * (1 - w) + fileLeft * w;
  }
  return {
    elapsed: ps.total_duration || 0,
    print: dur,
    left,
    eta: left != null ? new Date(Date.now() + left * 1000) : null,
    why: { slicerLeft, fileLeft, k: state.etaLearn.k, n: state.etaLearn.n, w, sf },
  };
});
export const layerInfo = computed(() => {
  const info = S('print_stats').info || {};
  let cur = info.current_layer,
    total = info.total_layer;
  const m = state.currentMeta;
  if ((cur == null || total == null) && m?.layer_height) {
    const z = S('gcode_move').gcode_position?.[2] || 0;
    const first = m.first_layer_height || m.layer_height;
    if (total == null && m.object_height) total = Math.ceil((m.object_height - first) / m.layer_height + 1);
    if (cur == null) cur = z > 0 ? Math.max(1, Math.ceil((z - first) / m.layer_height + 1)) : 0;
  }
  return { cur: cur ?? 0, total: total ?? 0 };
});

// every temperature the UI can show: Klipper's sensors plus stepper drivers that report their own temperature
// (TMC2240). Those are not temperature sensors in Klipper, so they are not in heaters.available_sensors.
export const tempSensors = computed(() => [
  ...(S('heaters').available_sensors || []),
  // TMC2240 drivers report a temperature only while the stepper is enabled; they are listed anyway (shown as --)
  // so the temperatures card does not grow a row the moment the motors switch on
  ...state.objects.filter((o) => /^tmc2240 /.test(o)),
]);
export const sensors = computed(() => {
  const h = S('heaters');
  const list = tempSensors.value;
  const heaters = new Set(h.available_heaters || []);
  return sortSensors(list, state.settings.sensorOrder)
    .filter((n) => !state.settings.hiddenSensors.includes(n))
    .map((n) => ({
      name: n,
      label: prettyName(n),
      isHeater: heaters.has(n),
      isTempFan: n.startsWith('temperature_fan '),
      ...S(n),
    }));
});

const FAN_TYPES = ['fan', 'fan_generic', 'heater_fan', 'controller_fan', 'temperature_fan'];
export const devices = computed(() => {
  const out = [];
  for (const o of state.objects) {
    const type = o.split(' ')[0];
    if (FAN_TYPES.includes(type)) {
      if (type === 'temperature_fan') out.push({ id: o, kind: 'fan', controllable: false, auto: true });
      else
        out.push({
          id: o,
          kind: 'fan',
          controllable: type === 'fan' || type === 'fan_generic',
          auto: type === 'heater_fan' || type === 'controller_fan',
        });
    } else if (type === 'output_pin' && !o.startsWith('output_pin _')) {
      out.push({ id: o, kind: 'pin' });
    } else if (['neopixel', 'led', 'dotstar', 'pca9533', 'pca9632'].includes(type)) {
      out.push({ id: o, kind: 'led' });
    } else if (type === 'filament_switch_sensor' || type === 'filament_motion_sensor') {
      out.push({ id: o, kind: 'filament' });
    } else if (type === 'smart_filament_sensor') {
      out.push({ id: o, kind: 'filament', custom: true });
    }
  }
  if (state.spoolman.server) out.push({ id: 'spoolman', kind: 'spoolman' });
  return out;
});

// items for the top card strip: temperatures first, then devices. Order + hidden persisted.
export const stripAll = computed(() => {
  const temps = tempSensors.value.map((n) => ({ id: 'temp:' + n, kind: 'temp', obj: n }));
  const items = [...temps, ...devices.value.map((d) => ({ ...d, obj: d.id, id: 'dev:' + d.id }))];
  const order = state.settings.strip?.order || [];
  const idx = (id) => {
    const i = order.indexOf(id);
    return i < 0 ? 1000 + items.findIndex((x) => x.id === id) : i;
  };
  return items.sort((a, b) => idx(a.id) - idx(b.id));
});
export const stripVisible = computed(() =>
  stripAll.value.filter(
    (x) => !(state.settings.strip?.hidden || []).includes(x.id) && !state.settings.devices.hidden.includes(x.obj),
  ),
);

export const macroList = computed(() =>
  state.objects
    .filter((o) => o.startsWith('gcode_macro ') && !o.startsWith('gcode_macro _'))
    .map((o) => o.slice(12))
    .sort(),
);

// all commands known to klipper (help + macros), for autocomplete
export const allCommands = computed(() => {
  const m = new Map();
  for (const [k, v] of Object.entries(state.commands)) m.set(k.toUpperCase(), v);
  for (const o of state.objects)
    if (o.startsWith('gcode_macro ')) {
      const n = o.slice(12);
      if (!m.has(n.toUpperCase())) m.set(n.toUpperCase(), state.status[o]?.description || 'macro');
    }
  return [...m.entries()]
    .map(([name, desc]) => ({ name, desc, hidden: name.startsWith('_') }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

// subscribe to a moonraker notification for the lifetime of a component
export function useApiEvent(method, fn) {
  api.on(method, fn);
  onBeforeUnmount(() => api.off(method, fn));
}

export const excludeObjects = computed(() => S('exclude_object'));

// ---------- actions ----------
// Commands that home, probe, level or shake the printer. Sent from the UI while a print runs or is paused,
// Klipper would run them between the lines of the print: the toolhead dives to probe or home and hits the part.
// gcode() asks first (GuardDialog.vue); macros count when their gcode calls one of these (checked 3 levels deep).
const DANGER =
  /^(G28|BED_MESH_CALIBRATE|QUAD_GANTRY_LEVEL|Z_TILT_ADJUST|SCREWS_TILT_CALCULATE|BED_TILT_CALIBRATE|DELTA_CALIBRATE|PROBE|PROBE_CALIBRATE|PROBE_ACCURACY|Z_ENDSTOP_CALIBRATE|MANUAL_PROBE|PROBE_EDDY_CURRENT_CALIBRATE|LDC_CALIBRATE_DRIVE_CURRENT|TEMPERATURE_PROBE_CALIBRATE|SHAPER_CALIBRATE|TEST_RESONANCES|AXES_SHAPER_CALIBRATION|COMPARE_BELTS_RESPONSES|CREATE_VIBRATIONS_PROFILE|AXES_MAP_CALIBRATION|EXCITATE_AXIS_AT_FREQ|PID_CALIBRATE|MPC_CALIBRATE|CALIBRATE_Z|BEACON_\w*CALIBRATE|CARTOGRAPHER_\w*CALIBRATE|FORCE_MOVE|STEPPER_BUZZ|MANUAL_STEPPER|BED_SCREWS_ADJUST|OZNLAB_(TAP|MESH|MESH_SETUP|THERMAL_CAL|HOME_TEST|MAX_FLOW|RETRACT_TEST|TEMP_SCAN|TEST|SETUP))$/;
// Commands that end the print (restart), drop the motors or swap the Z compensation under the running print.
const KILL = /^(SAVE_CONFIG|RESTART|FIRMWARE_RESTART)$/;
const MOTORS = /^(M84|M18|SET_STEPPER_ENABLE|SET_KINEMATIC_POSITION)$/;
const MESH = /^(BED_MESH_CLEAR|BED_MESH_PROFILE|BED_MESH_OFFSET)$/;
export const dangerKind = (cmd) => {
  const w = String(cmd || '').split(' ')[0];
  return KILL.test(w) ? 'kill' : MOTORS.test(w) ? 'motors' : MESH.test(w) ? 'mesh' : 'move';
};
const risky = (w) => DANGER.test(w) || KILL.test(w) || MOTORS.test(w) || MESH.test(w);
function cfgBody(section) {
  const cfg = S('configfile').config || {};
  const key = Object.keys(cfg).find((k) => k.toLowerCase() === section.toLowerCase());
  return key ? String(cfg[key].gcode || '') : '';
}
function macroCalls(name, depth) {
  if (depth > 3) return null;
  const body = cfgBody('gcode_macro ' + name);
  return body ? dangerIn(body, depth + 1) : null;
}
// the command name the way Klipper reads it: an optional line number is skipped, G28X10 is G28, and
// extended commands are letters, digits and underscores
export function cmdWord(line) {
  const w = line
    .replace(/[;#].*$/, '')
    .trim()
    .replace(/^N\d+\s*/i, '')
    .split(/\s+/)[0]
    ?.toUpperCase();
  if (!w) return '';
  const trad = w.match(/^[GMT]\d+(\.\d+)?/);
  if (trad && !/^[GMT]\d+[A-Z0-9]*_/.test(w)) return trad[0];
  return /^[A-Z_][A-Z0-9_]*$/.test(w) ? w : '';
}
// the first risky command in a script (or in a macro it calls), or null. Template tags are taken out first so a
// command inside {% if %} ... {% endif %} on one line is still seen; delayed gcode started from it is followed too.
export function dangerIn(script, depth = 0) {
  const text = String(script || '')
    .replace(/\{%[\s\S]*?%\}/g, '\n')
    .replace(/\{#[\s\S]*?#\}/g, '\n');
  for (const line of text.split('\n')) {
    const word = cmdWord(line);
    if (!word) continue;
    if (risky(word) && !(word === 'BED_MESH_PROFILE' && !/\bLOAD\s*=/i.test(line))) return word;
    let inner = null;
    if (word === 'UPDATE_DELAYED_GCODE' && depth <= 3) {
      const id = line.match(/ID\s*=\s*([\w-]+)/i)?.[1];
      const dur = line.match(/DURATION\s*=\s*([\d.]+)/i)?.[1];
      if (id && dur !== '0') {
        const body = cfgBody('delayed_gcode ' + id);
        inner = body ? dangerIn(body, depth + 1) : null;
      }
    } else inner = macroCalls(word, depth);
    if (inner) return depth ? inner : word + ' (' + inner + ')';
  }
  return null;
}

// one question at a time: a new one answers the one still open with "no" instead of leaving it hanging
export function askGuard(script, cmd) {
  state.guard?.resolve(false);
  return new Promise((resolve) => {
    const g = {
      id: Math.random(),
      script,
      cmd,
      kind: dangerKind(cmd),
      resolve: (v) => {
        if (state.guard?.id === g.id) state.guard = null; // state.guard is a reactive copy, compare by id
        resolve(v);
      },
    };
    state.guard = g;
  });
}

// a double click sends a command twice: the same script again within 400 ms is dropped. Moves and Z steps are
// left alone, clicking +1 twice quickly means 2 mm.
let lastSent = { s: '', at: 0 };
const REPEATABLE = /\b(G0|G1|TESTZ|SET_GCODE_OFFSET)\b/i;
// a plain yes/no question in the same dialog (GuardDialog.vue): { title, text, ok } -> true / false
// alt: an optional third button; the promise then resolves to 'alt'
export function askConfirm({ title, text, ok, alt }) {
  state.guard?.resolve(false);
  return new Promise((resolve) => {
    const g = {
      id: Math.random(),
      custom: { title, text, ok, alt },
      resolve: (v) => {
        if (state.guard?.id === g.id) state.guard = null;
        resolve(v);
      },
    };
    state.guard = g;
  });
}

// print control: the user already chose to cancel, pause or resume, and these macros are expected to park
const PRINT_CONTROL = /^(CANCEL_PRINT|PAUSE|RESUME|M600)$/;
export const gcode = async (script, { quiet = false, force = false } = {}) => {
  if (state.locked) {
    if (!quiet) toast(api.lockedMsg?.() || 'Locked', 'warn');
    return;
  }
  const now = Date.now();
  if (script === lastSent.s && now - lastSent.at < 400 && !REPEATABLE.test(script)) return;
  const mine = (lastSent = { s: script, at: now });
  const lines = String(script)
    .split('\n')
    .filter((l) => l.trim());
  const control = lines.length === 1 && PRINT_CONTROL.test(cmdWord(lines[0]));
  if (!force && !control && isPrinting.value) {
    const cmd = dangerIn(script);
    if (cmd && !(await askGuard(script, cmd))) return;
  }
  pushConsole(script, 'command');
  try {
    await api.gcode(script);
  } catch (e) {
    if (lastSent === mine) lastSent = { s: '', at: 0 }; // a failed send can be retried at once
    if (!quiet) toast(e.message, 'error');
    throw e;
  }
};

// RESTART and FIRMWARE_RESTART go through Moonraker's restart endpoints, not the G-code queue: sent as G-code
// they wait behind a long command (a heater wait, a calibration) and seem to do nothing.
export async function restartKlipper(firmware = false, { force = false } = {}) {
  const cmd = firmware ? 'FIRMWARE_RESTART' : 'RESTART';
  if (!force && isPrinting.value && !(await askGuard(cmd, cmd))) return false;
  pushConsole(firmware ? 'FIRMWARE_RESTART' : 'RESTART', 'command');
  try {
    await api.call(firmware ? 'printer.firmware_restart' : 'printer.restart');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// PAUSE / RESUME: one at a time, so a double click cannot pause and then resume on the same spot once the
// button has flipped. They skip the print guard (a PAUSE macro that parks is expected to move).
let prBusy = false;
export function pauseResume(cmd) {
  if (prBusy) return Promise.resolve();
  prBusy = true;
  return gcode(cmd, { force: true })
    .catch(() => {})
    .finally(() => setTimeout(() => (prBusy = false), 1500));
}

// CANCEL_PRINT waits in Klipper's G-code queue like any command: while the printer waits for a heater (M190,
// M109, TEMPERATURE_WAIT in PRINT_START) it only runs after that wait. When it has not gone through after a
// few seconds, say so, and that E-STOP stops at once (followed by a FIRMWARE_RESTART).
export function cancelPrint() {
  const tm = setTimeout(
    () =>
      toast(t('Cancel is waiting in Klipper'), 'warn', {
        hint: t(
          'Klipper is busy, usually waiting for a heater to reach its temperature. The cancel runs as soon as that wait ends. E-STOP stops right away, then a Firmware Restart is needed.',
        ),
        ms: 15000,
      }),
    4000,
  );
  return gcode('CANCEL_PRINT', { force: true })
    .catch(() => {})
    .finally(() => clearTimeout(tm));
}

let consoleSeq = 0; // ids stay unique after the 600 line cap, several lines can share a timestamp
export function pushConsole(message, type = 'response', time = Date.now() / 1000) {
  state.console.push({ message, type, time, id: ++consoleSeq });
  if (state.console.length > 600) state.console.splice(0, state.console.length - 600);
}

// ---------- notifications (only important things, like Mainsail) ----------
let dismissed = new Set();
try {
  dismissed = new Set(JSON.parse(localStorage.getItem(perPrinterKey(APP + '-dismissed')) || '[]'));
} catch {}
export function notify(key, msg, kind = 'warn') {
  if (dismissed.has(key) || state.notifications.some((n) => n.id === key)) return;
  state.notifications.unshift({ id: key, msg, kind, time: Date.now() / 1000 });
}
export function unnotify(prefix) {
  state.notifications = state.notifications.filter((n) => !String(n.id).startsWith(prefix));
}
export function dismiss(n) {
  state.notifications = state.notifications.filter((x) => x !== n);
  if (!String(n.id).startsWith('klippy:')) {
    dismissed.add(n.id);
    try {
      localStorage.setItem(perPrinterKey(APP + '-dismissed'), JSON.stringify([...dismissed].slice(-200)));
    } catch {}
  }
}
export function dismissAll() {
  for (const n of [...state.notifications]) dismiss(n);
}
export const THROTTLE = {
  0: 'Under-voltage detected',
  1: 'Frequency capped',
  2: 'Currently throttled',
  3: 'Soft temperature limit active',
  16: 'Under-voltage has occurred',
  17: 'Frequency capping has occurred',
  18: 'Throttling has occurred',
  19: 'Soft temperature limit has occurred',
};
// update manager status: notification, the side menu hint, and state.updStatus for the Machine page. Called on
// the periodic check and whenever Moonraker pushes a fresh status (after a check or an update), so a finished
// update clears its labels without pressing Check
export function applyUpd(u) {
  if (!u?.version_info) return;
  state.updStatus = u;
  const n = Object.entries(u.version_info)
    .filter(
      ([k, v]) =>
        k !== 'system' &&
        (v.commits_behind?.length ||
          (v.remote_version && v.version && v.remote_version !== '?' && v.version !== v.remote_version)),
    )
    .map(([k]) => k);
  unnotify('upd:');
  if (n.length) notify('upd:' + n.join(','), t('Updates available: {list}', { list: n.join(', ') }), 'info');
  // our own entry gets a hint in the side menu, one click away from the update button
  const me = Object.entries(u.version_info).find(([k]) => k === APP || k.startsWith(APP + '-'));
  state.uiUpdate =
    me && n.includes(me[0]) ? { name: me[0], version: me[1].version, remote: me[1].remote_version } : null;
}
async function checkHealth() {
  try {
    const info = await api.call('server.info');
    unnotify('mr:');
    for (const w of (info.warnings || []).filter((w) => !w.includes('::TMPNAME')))
      notify('mr:' + w.slice(0, 120), 'Moonraker: ' + w, 'warn');
    for (const c of info.failed_components || [])
      notify('mrc:' + c, t('Moonraker component "{name}" failed to load', { name: c }), 'error');
  } catch {}
  try {
    const p = await api.call('machine.proc_stats');
    const bits = p.throttled_state?.bits || 0;
    // bits 0-3 are happening now, 16-19 only mean it happened at some point since boot (a short dip at power on is
    // common). Only the current ones are worth a notification, the Health page lists both
    unnotify('thr:');
    for (const [b, txt] of Object.entries(THROTTLE))
      if (+b < 4 && bits & (1 << b)) notify('thr:' + b, t('Raspberry Pi: {msg}', { msg: t(txt) }), 'error');
  } catch {}
  try {
    // Moonraker refreshes its update info from GitHub on its own only every few weeks (refresh_interval), so a new
    // release would not show until someone presses Check. Do that check here every 6 hours, not while printing
    // (Moonraker refuses then), and only from one open tab: the time of the last check is shared in localStorage.
    let u = null;
    const KEY = APP + '-updcheck',
      last = +lsGet(KEY) || 0;
    if (state.settings.autoUpdateCheck !== false && !isPrinting.value && Date.now() - last > 6 * 3600e3) {
      try {
        u = await api.call('machine.update.refresh', {});
        try {
          localStorage.setItem(perPrinterKey(KEY), String(Date.now()));
        } catch {}
      } catch {}
    }
    applyUpd(u?.version_info ? u : await api.call('machine.update.status', {}));
  } catch {}
}

// ---------- SAVE_CONFIG backups -> config/backups ----------
const BK_RE = /^printer-\d{8}_\d{6}\.cfg$/;
let tidying = false;
export async function tidyBackups() {
  if (tidying) return;
  tidying = true;
  try {
    const r = await api.call('server.files.get_directory', { path: 'config', extended: false });
    const list = r.files.filter((f) => BK_RE.test(f.filename));
    if (list.length && !r.dirs.some((d) => d.dirname === 'backups'))
      await api.call('server.files.post_directory', { path: 'config/backups' });
    for (const f of list)
      await api.call('server.files.move', { source: 'config/' + f.filename, dest: 'config/backups/' + f.filename });
  } catch (e) {
    console.warn('backup tidy', e);
  }
  tidying = false;
}
// copy a config file into config/backups before we overwrite it
export async function backupBeforeWrite(root, path) {
  if (root !== 'config') return;
  const d = new Date(),
    p2 = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`; // local time, like Klipper's own backups
  const base = path
    .replace(/\.(cfg|conf)$/, '')
    .split('/')
    .join('__'); // folder kept in the name so hardware/x.cfg and other/x.cfg do not collide
  const ext = (path.match(/\.(cfg|conf)$/) || ['', 'cfg'])[1];
  try {
    try {
      await api.call('server.files.post_directory', { path: 'config/backups' });
    } catch {}
    await api.call('server.files.copy', {
      source: `config/${path}`,
      dest: `config/backups/${base}-klipperui-${ts}.${ext}`,
    });
  } catch (e) {
    // no backup, no write: the copy is what lets a bad save be undone
    throw new Error(t('Backup of {file} failed ({err}), nothing was written', { file: path, err: e.message }));
  }
}

export function setHeater(name, target) {
  target = Math.max(0, Number(target) || 0);
  // Klipper refuses targets above max_temp with an error; say it in plain words instead
  const max = Number(S('configfile').settings?.[name.toLowerCase()]?.max_temp);
  if (max && target > max) {
    toast(t('{name}: {n}° is above its max_temp ({max}°)', { name: prettyName(name), n: target, max }), 'warn');
    return Promise.resolve();
  }
  if (name.startsWith('temperature_fan '))
    return gcode(`SET_TEMPERATURE_FAN_TARGET TEMPERATURE_FAN=${shortName(name)} TARGET=${target}`);
  return gcode(`SET_HEATER_TEMPERATURE HEATER=${shortName(name)} TARGET=${target}`);
}

// the active Spoolman spool's own temperatures, offered first in Presets (never applied on its own: choosing a
// spool must not heat the printer)
export const spoolPreset = computed(() => {
  const f = state.spoolman.spool?.filament;
  const e = Number(f?.settings_extruder_temp) || 0,
    b = Number(f?.settings_bed_temp) || 0;
  if (!e && !b) return null;
  const name = [f.material, f.name].filter(Boolean).join(' ') || t('Spool');
  return { id: 'spool', name, spool: true, temps: { extruder: e || null, heater_bed: b || null } };
});
export const allPresets = computed(() => [
  ...(spoolPreset.value ? [spoolPreset.value] : []),
  ...(state.settings.presets || []),
]);
export async function applyPreset(p) {
  for (const [name, t] of Object.entries(p.temps || {})) {
    if (t == null || t === '') continue;
    if (!state.objects.includes(name)) continue;
    await setHeater(name, t);
  }
  // extra G-code after the temperatures (a macro, a fan, a light), one command per line like Mainsail's presets
  const g = String(p.gcode || '').trim();
  if (g) await gcode(g);
}

export function setFan(id, pct) {
  const v = Math.round(pct) / 100;
  if (id === 'fan') return gcode(`M106 S${Math.round(v * 255)}`);
  return gcode(`SET_FAN_SPEED FAN=${shortName(id)} SPEED=${v}`);
}

// ---------- settings persistence ----------
let saveTimer = null;
let settingsDirty = false; // changed here but not yet confirmed by Moonraker: a reload from the DB must not undo it
export function saveSettings() {
  clearTimeout(saveTimer);
  settingsDirty = true;
  const value = JSON.parse(JSON.stringify(state.settings));
  value.migratedCarbon = true;
  lsSet(APP + '-settings', value); // the local copy is written at once, the DB write is debounced
  saveTimer = setTimeout(async () => {
    try {
      const v = JSON.parse(JSON.stringify(state.settings));
      v.migratedCarbon = true;
      await api.call('server.database.post_item', { namespace: NS, key: 'settings', value: v });
      settingsDirty = false;
    } catch (e) {
      if (!/not connected|disconnected/.test(e.message || ''))
        toast(t('Settings could not be saved: {err}', { err: e.message }), 'error');
    }
  }, 400);
}
async function loadSettings() {
  let cur = null,
    missing = false;
  try {
    const r = await api.call('server.database.get_item', { namespace: NS, key: 'settings' });
    cur = r.value || {};
  } catch (e) {
    // "not found" comes back with different codes depending on the Moonraker version
    missing = e.code === 404 || /not found|does not exist|no such/i.test(e.message || '');
    if (!missing && /^(not connected|disconnected)$/.test(e.message || '')) {
      state.settingsLoaded = false;
      return;
    }
  }
  // one-time carry-over from the old names: their values fill in whatever the new record does not have yet,
  // anything already set under the new name wins
  if (!cur?.migratedCarbon && (cur || missing)) {
    for (const oldNs of OLD_APPS) {
      try {
        const old = (await api.call('server.database.get_item', { namespace: oldNs, key: 'settings' })).value;
        if (old && typeof old === 'object') {
          cur = { ...old, ...(cur || {}) };
          break;
        }
      } catch {}
    }
    if (cur || missing) {
      cur = { ...(cur || {}), migratedCarbon: true };
      try {
        await api.call('server.database.post_item', { namespace: NS, key: 'settings', value: cur });
      } catch {}
    }
  }
  if (settingsDirty) {
    // changed while offline or within the save debounce: this browser's copy is newer than the DB, push it instead
    state.settingsLoaded = true;
    saveSettings();
    return;
  }
  if (cur) {
    state.settings = mergeSettings(cur);
    lsSet(APP + '-settings', cur);
  } else if (missing) state.settings = mergeSettings(lsGet(APP + '-settings')); // fresh Moonraker DB: seed it from the browser copy
  state.settingsLoaded = true;
}
watch(
  () => state.settings,
  () => {
    if (state.settingsLoaded) saveSettings();
  },
  { deep: true },
);
watch(
  () => state.settings.lang,
  (l) => {
    if (l) setLang(l);
  },
  { immediate: true },
);
// light / dark: 'auto' follows the operating system
const mqDark = window.matchMedia?.('(prefers-color-scheme: dark)');
function applyTheme() {
  const pref = state.settings.theme || 'dark';
  const mode = pref === 'auto' ? (mqDark?.matches === false ? 'light' : 'dark') : pref;
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(APP + '-theme', mode);
  } catch {}
}
watch(() => state.settings.theme, applyTheme, { immediate: true });
// how far the accent colour reaches beyond buttons (style.css reads the attribute)
watch(
  () => state.settings.accentReach,
  (a) => (document.documentElement.dataset.accent = a || 'subtle'),
  { immediate: true },
);
// Interface size. The dashboard is laid out on a 1920 px wide screen; on a laptop (1440, 1512 ...) or a
// 1440p monitor the whole UI is zoomed so cards keep the same proportions and the same number fits side by side.
// Phones and small tablets (< 1100 px) keep 100 % and use the stacked layout.
export const REF_WIDTH = 1920;
export function uiZoomFor(pref, w = window.innerWidth) {
  if (w <= 1100) return 1;
  if (pref && pref !== 'auto') return Math.min(2, Math.max(0.5, +pref / 100 || 1));
  return Math.min(1.6, Math.max(0.6, w / REF_WIDTH));
}
function applyScale() {
  const pref = state.settings.uiScale ?? 100;
  const z = +uiZoomFor(pref).toFixed(3);
  const el = document.documentElement;
  if (z === 1) el.style.removeProperty('zoom');
  else el.style.zoom = z;
  el.style.setProperty('--zoom', z);
  window.__uiZoom = z;
  state.uiZoom = z;
  // width breakpoints above the phone layout follow the zoomed width, not the raw window width
  const ew = window.innerWidth / z;
  for (const bp of [1200, 1300, 1750, 1900]) el.classList.toggle('ew-lt-' + bp, ew <= bp);
  try {
    localStorage.setItem(APP + '-uiscale', String(pref));
  } catch {}
}
watch(() => state.settings.uiScale, applyScale, { immediate: true });
let rsz;
window.addEventListener('resize', () => {
  clearTimeout(rsz);
  rsz = setTimeout(applyScale, 120);
});
document.documentElement.dataset.look = 'panel';
watch(
  () => state.settings.compactCards !== false,
  (c) => document.documentElement.classList.toggle('compact', c),
  { immediate: true },
);
mqDark?.addEventListener?.('change', applyTheme);
watch(
  () => state.settings.accent,
  (a) => document.documentElement.style.setProperty('--ac-raw', a || '#ff6b1a'),
  { immediate: true },
);

// ---------- init ----------
function mergeStatus(diff) {
  for (const [k, v] of Object.entries(diff || {})) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (!Object.hasOwn(state.status, k)) state.status[k] = {};
    Object.assign(state.status[k], v);
  }
}

let klippyTimer = null;
async function checkKlippy() {
  clearTimeout(klippyTimer);
  try {
    const info = await api.call('server.info');
    state.versions.moonraker = info.moonraker_version || '';
    state.components = info.components || [];
    state.klippy = info.klippy_state;
    if (info.klippy_state === 'ready') return initKlippy();
    state.booted = true;
    try {
      const p = await api.call('printer.info');
      state.klippyMessage = p.state_message;
    } catch {
      state.klippyMessage = info.klippy_state;
    }
    if (info.klippy_state === 'shutdown' || info.klippy_state === 'error') {
      // still try subscribing so webhooks/state gets through
    }
  } catch {}
  klippyTimer = setTimeout(checkKlippy, 2000);
}

let initP = null;
function initKlippy() {
  return (
    initP ||
    (initP = initKlippyOnce().finally(() => {
      initP = null;
    }))
  );
}
async function initKlippyOnce() {
  try {
    const { objects } = await api.call('printer.objects.list');
    state.objects = objects;
    lsSet(APP + '-objects', objects);
    const sub = {};
    for (const o of objects) sub[o] = null;
    // the full printer.cfg (config + settings) is the heaviest part and only changes on restart:
    // subscribe to the small live fields, fetch the big ones once right after
    if (sub.configfile !== undefined) sub.configfile = ['save_config_pending', 'save_config_pending_items', 'warnings'];
    const r = await api.call('printer.objects.subscribe', { objects: sub });
    state.status = {};
    mergeStatus(r.status);
    if (r.status.heaters) lsSet(APP + '-heaters', r.status.heaters);
    state.klippy = r.status.webhooks?.state || 'ready';
    state.klippyMessage = r.status.webhooks?.state_message || '';
    api
      .call('printer.info')
      .then((p) => {
        state.versions.klipper = p.software_version;
        state.versions.host = p.hostname;
        if (!state.printerName) state.printerName = p.hostname;
      })
      .catch(() => {});
    state.booted = true;
    if (objects.includes('configfile')) {
      api
        .call('printer.objects.query', { objects: { configfile: ['config', 'settings'] } })
        .then((q) => mergeStatus(q.status))
        .catch(() => {});
    }
    loadTempHistory();
    setTimeout(tidyBackups, 3000);
    loadGcodeStore();
    loadCommands();
    loadCurrentMeta();
  } catch (e) {
    toast(t('Klipper init failed: {err}', { err: e.message }), 'error');
    // a timeout on a slow host at boot: try again instead of staying empty until the next Klipper event
    setTimeout(() => {
      if (!state.booted && state.connected && state.klippy === 'ready') initKlippy();
    }, 3000);
  }
}

async function loadTempHistory() {
  try {
    const r = await api.call('server.temperature_store', { include_monitors: false });
    for (const [name, d] of Object.entries(r)) {
      const t = (d.temperatures || []).slice(-HIST_MAX);
      // n counts every sample ever added, so the graph can thin out points at fixed positions
      hist[name] = { t, target: (d.targets || []).slice(-HIST_MAX), n: t.length };
    }
    backfillLong(r);
    state.histTick++;
  } catch {}
}
async function loadGcodeStore() {
  try {
    const r = await api.call('server.gcode_store', { count: 200 });
    state.console = [];
    for (const g of r.gcode_store) pushConsole(g.message, g.type, g.time);
  } catch {}
}
async function loadCommands() {
  try {
    const r = await api.call('printer.gcode.help');
    state.commands = r || {};
  } catch {}
}
export async function loadCurrentMeta() {
  const fn = S('print_stats').filename;
  if (!fn) {
    state.currentMeta = null;
    return;
  }
  try {
    state.currentMeta = await api.call('server.files.metadata', { filename: fn });
  } catch {
    state.currentMeta = null;
  }
}

export async function loadSpool() {
  if (!state.spoolman.server) return;
  try {
    const r = await api.call('server.spoolman.get_spool_id');
    const id = r.spool_id;
    if (!id) {
      state.spoolman.spool = null;
      return;
    }
    const p = await api.call('server.spoolman.proxy', {
      request_method: 'GET',
      path: `/v1/spool/${id}`,
      use_v2_response: true,
    });
    state.spoolman.spool = p.response || null;
  } catch {
    state.spoolman.spool = null;
  }
}

// ---------- Moonraker power devices (smart plugs, relays) ----------
export async function loadPower() {
  try {
    state.power = (await api.call('machine.device_power.devices')).devices || [];
  } catch {
    state.power = [];
  }
}
export async function setPower(device, action) {
  const r = await api.call('machine.device_power.post_device', { device, action });
  const d = state.power.find((x) => x.device === device);
  if (d && r?.[device]) d.status = r[device];
  return r;
}

async function onOpen() {
  state.connected = true;
  state.login = null;
  state.conn = { attempts: 0, since: 0, probe: '' };
  // everything independent goes out at once
  api
    .call('server.connection.identify', { client_name: APP_NAME, version: VERSION, type: 'web', url: REPO_URL })
    .catch(() => {});
  const pSettings = loadSettings();
  api
    .call('server.database.get_item', { namespace: 'mainsail', key: 'general' })
    .then((m) => {
      state.printerName = m.value?.printername || state.printerName;
    })
    .catch(() => {});
  api
    .call('server.webcams.list')
    .then((r) => {
      setCams(r.webcams || []);
    })
    .catch(() => {});
  loadPower();
  api
    .call('server.config')
    .then((c) => {
      state.spoolman.server = c.config?.spoolman?.server || '';
      if (state.spoolman.server) loadSpool();
    })
    .catch(() => {});
  checkKlippy();
  await pSettings;
  setTimeout(checkHealth, 4000);
}

// ---------- live activity (what is being loaded right now) ----------
const TASK_LABELS = {
  'server.info': 'Checking Moonraker',
  'printer.info': 'Reading Klipper info',
  'printer.objects.list': 'Reading printer objects',
  'printer.objects.subscribe': 'Subscribing to printer status',
  'printer.objects.query': 'Reading printer config',
  'server.temperature_store': 'Loading temperature history',
  'server.gcode_store': 'Loading console history',
  'printer.gcode.help': 'Loading command list',
  'server.database.get_item': 'Loading settings',
  'server.webcams.list': 'Loading webcams',
  'server.config': 'Reading Moonraker config',
  'server.files.get_directory': 'Reading files',
  'server.files.list': 'Listing files',
  'server.files.metadata': 'Reading file info',
  'server.history.list': 'Loading print history',
  'server.history.totals': 'Loading print statistics',
  'machine.system_info': 'Reading system info',
  'machine.proc_stats': 'Reading system load',
  'machine.update.status': 'Checking updates',
  'machine.update.refresh': 'Refreshing update info',
  'server.files.roots': 'Listing file roots',
  'server.spoolman.proxy': 'Loading Spoolman spool',
  'server.spoolman.get_spool_id': 'Loading active spool',
  'printer.gcode.script': null,
  'server.database.post_item': null,
  'server.connection.identify': 'Connecting',
  'printer.query_endstops.status': 'Querying endstops',
};
let taskId = 0;
api.onTask = (method) => {
  const label =
    method in TASK_LABELS
      ? TASK_LABELS[method] && t(TASK_LABELS[method])
      : method.startsWith('GET ')
        ? t('Downloading {name}', { name: method.slice(4) })
        : method;
  if (!label) return null;
  const task = { id: ++taskId, label, t: Date.now() };
  state.tasks.push(task);
  return () => {
    state.tasks = state.tasks.filter((x) => x.id !== task.id);
  };
};
export const activeTasks = computed(() => {
  const seen = new Set();
  return state.tasks.filter((t) => !seen.has(t.label) && seen.add(t.label));
});

export function start() {
  // `?host=` points the dev server (npm run dev) at a printer. It is a dev-only feature: in a production build
  // every request, the login form and the tokens must stay on the origin the page was served from, otherwise
  // a link like /?host=evil could make the UI hand the Moonraker token or password to another server.
  let host = '';
  if (import.meta.env.DEV) {
    const qp = new URLSearchParams(location.search).get('host');
    if (qp !== null) {
      try {
        qp && /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(qp)
          ? localStorage.setItem(APP + '-host', qp)
          : localStorage.removeItem(APP + '-host');
      } catch {}
    }
    try {
      host = localStorage.getItem(APP + '-host') || '';
    } catch {}
  } else {
    try {
      localStorage.removeItem(APP + '-host');
    } catch {}
  }
  // a printer picked from the printer list (printers.js). Only set from the UI, never from the URL.
  if (!host) host = currentHost();

  api.on('open', onOpen);
  api.on('auth-required', (info) => {
    state.login = {
      needed: true,
      sources: info.available_sources || ['moonraker'],
      source: info.default_source || 'moonraker',
    };
  });
  api.on('close', async () => {
    if (state.connected || !state.conn.since) state.conn.since = Date.now();
    state.connected = false;
    state.klippy = 'disconnected';
    state.conn.attempts++;
    // find out why: is moonraker reachable over http?
    try {
      const r = await api.fetch('/server/info');
      if (r.status === 502 || r.status === 504)
        state.conn.probe = t(
          'Moonraker is not responding (nginx {status}). It may be restarting or crashed; check moonraker.log.',
          { status: r.status },
        );
      else if (r.status === 401 || r.status === 403) state.conn.probe = t('Moonraker asks for a login.');
      else if (r.ok)
        state.conn.probe = t(
          'Moonraker answers over HTTP but the websocket closes. Usually a restart in progress; if it stays like this, reload the page.',
        );
      else state.conn.probe = t('Moonraker returned HTTP {status}', { status: r.status });
    } catch {
      state.conn.probe = t('The printer host is not reachable from this browser (network / Pi down).');
    }
  });
  api.on('notify_status_update', ([diff]) => {
    const fnBefore = state.status.print_stats?.filename;
    mergeStatus(diff);
    if (diff.print_stats?.filename !== undefined && diff.print_stats.filename !== fnBefore) loadCurrentMeta();
    if (diff.webhooks) {
      state.klippy = diff.webhooks.state || state.klippy;
      if (diff.webhooks.state_message) state.klippyMessage = diff.webhooks.state_message;
    }
  });
  api.on('notify_gcode_response', ([line]) => pushConsole(line, 'response'));
  api.on('notify_klippy_ready', () => {
    unnotify('klippy:');
    checkKlippy();
  });
  api.on('notify_filelist_changed', ([p]) => {
    if (p?.item?.root === 'config' && BK_RE.test(p.item.path || '') && p.action === 'create_file')
      setTimeout(tidyBackups, 1500);
  });
  setInterval(() => {
    if (state.connected) checkHealth();
  }, 120000);
  api.on('notify_klippy_shutdown', () => {
    state.klippy = 'shutdown';
    checkKlippy();
    setTimeout(
      () =>
        notify(
          'klippy:shutdown',
          t('Klipper shutdown: {msg}', { msg: (state.klippyMessage || '').split('\n')[0] }),
          'error',
        ),
      1500,
    );
  });
  api.on('notify_klippy_disconnected', () => {
    state.klippy = 'disconnected';
    state.objects = [];
    checkKlippy();
  });
  api.on('notify_active_spool_set', () => loadSpool());
  api.on('notify_power_changed', ([d]) => {
    const x = state.power.find((p) => p.device === d?.device);
    if (x) Object.assign(x, d);
    else if (d?.device) state.power.push(d);
  });
  api.on('notify_webcams_changed', ([p]) => {
    if (p?.webcams) setCams(p.webcams);
  });
  api.on('notify_update_response', ([r]) => {
    if (!state.update) state.update = { app: r.application, lines: [], complete: false };
    if (r.application) state.update.app = r.application;
    state.update.lines.push(r.message);
    if (r.complete) {
      state.update.complete = true;
      setTimeout(() => api.call('machine.update.status', {}).then(applyUpd, () => {}), 1500);
    }
  });
  api.on('notify_update_refreshed', ([u]) => applyUpd(u));
  api.connect(host);

  // sample temperatures every second (same as moonraker's store); the long history (a day, 15 s steps, kept in
  // this browser) takes one of them every 15 s
  loadLong(perPrinterKey('voyager-ui-temphist'));
  window.addEventListener('pagehide', () => saveLong(true));
  setInterval(() => {
    if (state.klippy !== 'ready') return;
    const names = tempSensors.value;
    const readings = {};
    for (const n of names) if (state.status[n]) readings[n] = state.status[n];
    sampleLong(readings);
    for (const n of names) {
      const s = state.status[n];
      if (!s || s.temperature == null) continue;
      const h = (hist[n] ||= { t: [], target: [], n: 0 });
      h.t.push(s.temperature);
      h.n = (h.n || 0) + 1;
      h.target.push(s.target ?? 0);
      if (h.t.length > HIST_MAX) {
        h.t.shift();
        h.target.shift();
      }
    }
    state.histTick++;
  }, 1000);
}
