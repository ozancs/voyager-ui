// What a Shake&Tune test recommended, kept past the page it was run on:
// - the last run (its command, the console lines it printed and the shapers read from them) lives here instead
//   of in the page, so leaving the Shake&Tune tab and coming back still shows its Apply and Save buttons; it is
//   forgotten when Klipper restarts, as a shaper applied with SET_INPUT_SHAPER is
// - the graphs that run saved get its result too, kept in Moonraker's database, so picking an older graph later
//   (on any device) brings back the shapers it recommended. Graphs made before this have none: their numbers are
//   only drawn into the picture.
import { reactive, computed, watch } from 'vue';
import { api } from './api/moonraker';
import { state } from './store';

export const NS = 'voyager-ui-shaketune';
const KEY = 'graphs';

// run: { cmd, folder, axis, since, before: Set of graph paths there at the start, running, lines, recs, axesMap,
// graphs: paths of the graphs it saved }
// graphs: { [path]: { cmd, recs, axesMap } }
export const st = reactive({ run: null, graphs: {}, loaded: false });

const strip = (m) => String(m || '').replace(/^\/\/\s?/gm, '');

// The recommendation is read from the console lines the test prints ("Recommended filters: ... MZV @ 48.2 Hz");
// "X axis frequency profile generation..." tells which axis the next "Recommended filters" block is for.
// axis: the AXIS the test was started with (x, y or all), null for other tests.
export function parseRun(lines, axis = null) {
  const recs = [],
    zeta = {};
  let axesMap = null;
  for (const text of lines)
    for (const line of text.split('\n')) {
      const a = /^\s*([XY]) axis frequency profile/i.exec(line) || /^\s*Measuring ([XY])\b/i.exec(line);
      if (a) axis = a[1].toLowerCase();
      const m =
        /->\s*(For performance|For low vibrations|Best shaper):\s*([A-Z0-9]+)\s*@\s*([\d.]+)\s*Hz(?:.*?damping ratio of (\d+(?:\.\d+)?))?/i.exec(
          line,
        );
      // the damping ratio Shake&Tune estimated for the axis (each recommendation repeats it; older versions only
      // say it once, in "Detected a square corner velocity of ... and a damping ratio of ...")
      const z = /damping ratio of (\d+(?:\.\d+)?)/i.exec(line);
      if (z && !m && (axis === 'x' || axis === 'y')) zeta[axis] = +z[1];
      if (m && (axis === 'x' || axis === 'y'))
        recs.push({ axis, kind: m[1], type: m[2].toLowerCase(), freq: +m[3], zeta: m[4] ? +m[4] : zeta[axis] });
      const am = /Detected axes_map:\s*([-xyz, ]+)/i.exec(line);
      if (am && !axesMap) axesMap = am[1].trim();
    }
  return { recs, axesMap };
}

export function startRun({ cmd, folder, axis, before }) {
  st.run = {
    cmd,
    folder,
    axis: cmd === 'AXES_SHAPER_CALIBRATION' ? String(axis || 'all').toLowerCase() : null,
    since: state.console.length ? state.console[state.console.length - 1].id : 0,
    before: new Set(before),
    running: true,
    lines: [],
    recs: [],
    axesMap: null,
    graphs: [],
  };
  return st.run;
}

// The console keeps only its last lines (and starts empty after a reload of the page's data), so what the run
// printed is copied here as it arrives; a result once read is not lost when its lines scroll away.
const liveLines = computed(() => {
  const r = st.run;
  return r ? state.console.filter((l) => l.id > r.since && l.type !== 'command').map((l) => strip(l.message)) : [];
});
watch(liveLines, (l) => {
  const r = st.run;
  if (!r || !l.length) return;
  r.lines = l.slice(-12);
  const p = parseRun(l, r.axis);
  if (p.recs.length >= r.recs.length) r.recs = p.recs;
  if (p.axesMap) r.axesMap = p.axesMap;
  tieGraphs();
});

let apiHooked = false;
function hookApi() {
  if (apiHooked) return;
  apiHooked = true;
  // a Klipper restart drops what SET_INPUT_SHAPER set, and the last run's buttons with it (the graphs keep theirs)
  api.on('notify_klippy_ready', () => {
    if (st.run && !st.run.running) st.run = null;
  });
}

export async function loadGraphResults() {
  hookApi();
  if (st.loaded) return;
  try {
    const r = await api.call('server.database.get_item', { namespace: NS, key: KEY });
    if (r?.value && typeof r.value === 'object') st.graphs = { ...r.value, ...st.graphs };
  } catch {} // no namespace yet
  st.loaded = true;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.call('server.database.post_item', { namespace: NS, key: KEY, value: { ...st.graphs } }).catch(() => {});
  }, 800);
}

let known = []; // the graphs the page last listed
// The graphs that appeared in the run's folder after it started are its own: they get its result, and again when
// more of it is printed (with AXIS=all the X graph is saved before the Y axis is measured).
export function tieGraphs(images = known) {
  known = images;
  const r = st.run;
  if (!r || (!r.recs.length && !r.axesMap)) return;
  for (const i of images)
    if (i.folder === r.folder && !r.before.has(i.path) && !r.graphs.includes(i.path)) r.graphs.push(i.path);
  let changed = false;
  for (const p of r.graphs) {
    const v = { cmd: r.cmd, recs: r.recs.map((x) => ({ ...x })), axesMap: r.axesMap };
    if (JSON.stringify(st.graphs[p]) !== JSON.stringify(v)) {
      st.graphs[p] = v;
      changed = true;
    }
  }
  if (changed) save();
}

// results of graphs that were deleted go too (called with the full list, only when it could be read)
export function dropGone(images) {
  if (!st.loaded) return;
  const have = new Set(images.map((i) => i.path));
  const gone = Object.keys(st.graphs).filter((p) => !have.has(p));
  if (!gone.length) return;
  for (const p of gone) delete st.graphs[p];
  save();
}
