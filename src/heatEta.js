// How long until a heater reaches its target, or whether it will at all.
//
// A heater warming up follows Newton's law of heating: the rate falls as it gets closer to the temperature where
// the heat put in equals the heat lost (the asymptote). Over the last few minutes of 1-second samples the rate of
// change is fitted against the temperature, rate = a + b·T. With b < 0 that gives the asymptote (−a/b) and the
// time constant (−1/b); the time to the target follows from the exponential curve. A heater still at full power
// (a hotend far from its target) gives b ≈ 0: then the recent rate is used. When the asymptote sits below the
// target the heater levels off short of it (a chamber heated only by the bed, a weak bed heater in a cold room):
// that is reported instead of a time.
//
// It also learns: halfway through each heat-up the prediction is remembered, and when the heater gets there the
// real time is compared with it. The median of the last runs (per heater, in this browser) corrects the next
// predictions, which covers the PID slowing down near the target and heaters that behave differently from the
// model.
import { hist, state } from './store';
import { perPrinterKey } from './printers';
import { fit, WIN } from './heatFit';

const KEY = 'voyager-ui-heateta';

let learned = null; // { [heater]: [ratio, ...] }
function load() {
  if (learned) return learned;
  try {
    learned = JSON.parse(localStorage.getItem(perPrinterKey(KEY)) || '{}') || {};
  } catch {
    learned = {};
  }
  return learned;
}
function save() {
  try {
    localStorage.setItem(perPrinterKey(KEY), JSON.stringify(learned));
  } catch {}
}
function factor(name) {
  const l = load()[name];
  if (!l || l.length < 2) return 1;
  const s = [...l].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// heat-ups in progress, for learning: name -> { from, target, mid: { at, predicted } }
const runs = {};
function learn(name, t, g, est) {
  const n = t.length,
    target = g[n - 1],
    cur = t[n - 1];
  let r = runs[name];
  if (!(target > 0)) return void delete runs[name];
  if (!r || r.target !== target) r = runs[name] = { from: cur, target, mid: null };
  if (cur < r.from) r.from = cur;
  const span = target - r.from;
  if (span < 15) return; // a small top-up teaches nothing
  const done = (cur - r.from) / span;
  if (!r.mid && done >= 0.5 && est?.secs) r.mid = { at: Date.now() / 1000, predicted: est.secs };
  if (r.mid && cur >= target - 1) {
    const real = Date.now() / 1000 - r.mid.at;
    const ratio = r.mid.predicted > 5 ? real / r.mid.predicted : null;
    if (ratio && ratio > 0.4 && ratio < 3) {
      const l = (load()[name] ||= []);
      l.push(+ratio.toFixed(3));
      if (l.length > 9) l.splice(0, l.length - 9);
      save();
    }
    r.mid = null;
    r.from = target; // finished; a later target change starts a new run
  }
}

// { secs } seconds to the target (already corrected), { levels: °C } when it will not get there, or null
const memo = {}; // name -> { tick, out }: several places show the same heater, the work runs once per sample
export function heatEta(name) {
  const tick = state.histTick; // re-evaluate with each new sample
  if (memo[name]?.tick === tick) return memo[name].out;
  const h = hist[name];
  if (!h?.t?.length || !h.target?.length) return null;
  const t = h.t.slice(-WIN - 10),
    g = h.target.slice(-WIN - 10);
  const est = fit(t, g);
  learn(name, h.t, h.target, est);
  const out = !est || est.wait ? null : est.levels != null ? { levels: est.levels } : { secs: est.secs * factor(name) };
  memo[name] = { tick, out };
  return out;
}
export function fmtEta(secs) {
  if (secs == null || !Number.isFinite(secs)) return '';
  if (secs < 60) return Math.max(5, Math.round(secs / 5) * 5) + 's';
  if (secs < 3600) {
    const m = Math.floor(secs / 60),
      s = Math.round((secs % 60) / 10) * 10;
    return s === 60 ? m + 1 + ':00' : m + ':' + String(s).padStart(2, '0');
  }
  return Math.floor(secs / 3600) + 'h ' + Math.round((secs % 3600) / 60) + 'm';
}
