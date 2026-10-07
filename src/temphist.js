// Long temperature history for the graph: one sample per sensor every STEP seconds, up to a day, kept in this
// browser (localStorage, per printer) so it survives a reload. The store's 1-second buffers (hist) only hold the
// last 20 minutes, Moonraker's own store too; this is what the 1h / 6h / 24h ranges and zooming out draw from.
// Samples carry their time (seconds since the epoch), so a gap (UI closed, printer off) shows as a gap and not as
// a line across it.
import { markRaw } from 'vue';

export const STEP = 15; // seconds between samples
export const MAX_AGE = 24 * 3600;
const MAX_N = Math.ceil(MAX_AGE / STEP) + 1;
const KEY = 'voyager-ui-temphist';

// name -> { ts: [sec], t: [temp], g: [target] }, non-reactive (the graph redraws on store.histTick)
export const longHist = markRaw({});
let key = KEY;
let lastSlot = 0;
let dirty = false;
let lastSave = 0;

const round1 = (v) => Math.round(v * 10) / 10;

function trim(h, now) {
  const cut = now - MAX_AGE;
  let i = 0;
  while (i < h.ts.length && h.ts[i] < cut) i++;
  if (i) {
    h.ts.splice(0, i);
    h.t.splice(0, i);
    h.g.splice(0, i);
  }
  const over = h.ts.length - MAX_N;
  if (over > 0) {
    h.ts.splice(0, over);
    h.t.splice(0, over);
    h.g.splice(0, over);
  }
}

// restore what this browser kept for the printer (storageKey comes from perPrinterKey so printers never mix)
export function loadLong(storageKey) {
  key = storageKey || KEY;
  for (const k of Object.keys(longHist)) delete longHist[k];
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    const now = Math.floor(Date.now() / 1000);
    if (raw && typeof raw === 'object') {
      for (const [name, h] of Object.entries(raw)) {
        if (!h || !Array.isArray(h.ts) || !Array.isArray(h.t)) continue;
        const n = Math.min(h.ts.length, h.t.length);
        const g = Array.isArray(h.g) ? h.g : [];
        const out = { ts: h.ts.slice(0, n), t: h.t.slice(0, n), g: Array.from({ length: n }, (_, i) => +g[i] || 0) };
        trim(out, now);
        if (out.ts.length) longHist[name] = out;
      }
    }
  } catch {}
  dirty = false;
}

export function saveLong(force) {
  if (!dirty && !force) return;
  const now = Date.now();
  if (!force && now - lastSave < 60000) return;
  lastSave = now;
  dirty = false;
  try {
    localStorage.setItem(key, JSON.stringify(longHist));
  } catch {
    // storage full: drop the oldest half and try once more, the graph is a convenience not a record
    try {
      for (const h of Object.values(longHist)) {
        const half = Math.floor(h.ts.length / 2);
        h.ts.splice(0, half);
        h.t.splice(0, half);
        h.g.splice(0, half);
      }
      localStorage.setItem(key, JSON.stringify(longHist));
    } catch {}
  }
}

function push(name, ts, temp, target) {
  const h = (longHist[name] ||= { ts: [], t: [], g: [] });
  const last = h.ts[h.ts.length - 1];
  if (last != null && ts <= last) return;
  h.ts.push(ts);
  h.t.push(round1(temp));
  h.g.push(round1(target || 0));
  trim(h, ts);
  dirty = true;
}

// called every second with the current readings; takes one sample per STEP-second slot
export function sampleLong(readings) {
  const now = Math.floor(Date.now() / 1000);
  const slot = Math.floor(now / STEP);
  if (slot === lastSlot) return false;
  lastSlot = slot;
  for (const [name, r] of Object.entries(readings)) {
    if (r && typeof r.temperature === 'number') push(name, slot * STEP, r.temperature, r.target);
  }
  saveLong();
  return true;
}

// fill the gap since the last saved sample from Moonraker's temperature store (1 sample/s, the last 20 min):
// a reload or a closed tab shorter than that leaves no hole in the long history
export function backfillLong(store) {
  const now = Math.floor(Date.now() / 1000);
  for (const [name, d] of Object.entries(store || {})) {
    const temps = d.temperatures || [];
    const tg = d.targets || [];
    if (!temps.length) continue;
    const h = (longHist[name] ||= { ts: [], t: [], g: [] });
    const last = h.ts[h.ts.length - 1] ?? 0;
    const start = now - temps.length; // time of temps[0]
    for (let ts = Math.ceil(start / STEP) * STEP; ts <= now; ts += STEP) {
      if (ts <= last) continue;
      const i = ts - start;
      if (i < 0 || i >= temps.length || typeof temps[i] !== 'number') continue;
      push(name, ts, temps[i], tg[i]);
    }
  }
  saveLong(true);
}

// oldest sample time across sensors (seconds since the epoch), or null when there is nothing yet
export function oldestLong() {
  let o = null;
  for (const h of Object.values(longHist)) if (h.ts.length && (o === null || h.ts[0] < o)) o = h.ts[0];
  return o;
}
