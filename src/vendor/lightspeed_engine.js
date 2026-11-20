// Copied from Lightspeed (led-sensei/web/lightspeed_engine.js) so tiles can draw the effect a strip runs. Keep
// it in step with the plugin; the only changes are at the end: it always sets globalThis.Lightspeed (also where a
// `module` exists, as in the tests).
// Lightspeed - effect engine (browser copy)
//
// Line-for-line port of lightspeed_engine.py. Keep the two identical:
// test/parity.py renders the same frames with both and compares bytes.
// Works in the page (window.Lightspeed) and in node (module.exports).
(function (root) {
  'use strict';

  const VERSION = '0.1.2';

  const STATES = ['shutdown', 'error', 'homing', 'probing', 'paused', 'heating',
    'printing', 'complete', 'idle'];

  const STATE_FALLBACK = {
    shutdown: 'error', error: 'idle', homing: 'idle', probing: 'homing',
    paused: 'printing', heating: 'idle', printing: 'idle', complete: 'idle',
  };

  const EFFECTS = {
    off: {},
    solid: { color: 'ffffff' },
    breathe: { color: 'ffffff', color2: '000000', period: 3.0 },
    blink: { color: 'ffffff', color2: '000000', period: 1.0 },
    rainbow: { period: 5.0 },
    chase: { color: 'ffffff', color2: '000000', period: 2.0, size: 2 },
    comet: { color: 'ffffff', color2: '000000', period: 1.5, size: 0 },
    scan: { color: 'ff0000', color2: '000000', period: 2.0, size: 2 },
    twinkle: { color: 'ffffff', color2: '000000', period: 1.2, density: 0.3 },
    fire: {},
    progress: { color: 'ffffff', color2: 'ff0000', source: 'progress', gradient: 0 },
    heat: { color: 'ff3000', color2: '0030ff' },
    follow: { color: 'ffffff', color2: '000000', axis: 'x', size: 1.5 },
  };
  const COMMON_PARAMS = { reverse: 0 };

  const DEFAULT_SCENES = {
    idle: 'breathe color=1a3cff color2=000814 period=4',
    heating: 'progress source=heat gradient=1 color=0030ff color2=ff2000',
    homing: 'scan color=00ff40 color2=001404 period=1.6',
    probing: 'scan color=a000dc color2=0c0012 period=1.6',
    printing: 'solid color=ffffff',
    paused: 'breathe color=ff6e00 color2=140800 period=2',
    complete: 'breathe color=00ff40 color2=001a08 period=1.5',
    error: 'blink color=ff0000 color2=000000 period=0.6',
    shutdown: 'solid color=ff0000',
  };

  const PARAM_TYPES = {
    color: 'color', color2: 'color', gradient: 'bool', period: 'float', size: 'float',
    density: 'float', source: ['progress', 'heat'], axis: ['x', 'y', 'z'],
    reverse: 'bool',
  };

  class SpecError extends Error {}

  // ------------------------------------------------------------ parsing

  const colorCache = new Map();
  function parseColor(text) {
    const key = String(text);
    const hit = colorCache.get(key);
    if (hit) return hit;
    let s = key.trim();
    if (s.startsWith('#')) s = s.slice(1);
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    if (s.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(s)) {
      throw new SpecError(`colour must be rrggbb, got '${text}'`);
    }
    const v = parseInt(s, 16);
    const c = [((v >> 16) & 255) / 255.0, ((v >> 8) & 255) / 255.0, (v & 255) / 255.0];
    colorCache.set(key, c);
    return c;
  }

  function colorHex(c) {
    return c.map(x => toByte(x).toString(16).padStart(2, '0')).join('');
  }

  function parseSpec(text) {
    const parts = String(text).split(/\s+/).filter(Boolean);
    if (!parts.length) throw new SpecError('empty effect');
    const name = parts[0].toLowerCase();
    if (!(name in EFFECTS)) {
      throw new SpecError(`unknown effect '${name}' (one of ${Object.keys(EFFECTS).sort().join(', ')})`);
    }
    const params = Object.assign({}, EFFECTS[name], COMMON_PARAMS);
    for (const p of parts.slice(1)) {
      const eq = p.indexOf('=');
      if (eq < 0) throw new SpecError(`'${p}' should be key=value`);
      const k = p.slice(0, eq).toLowerCase();
      const v = p.slice(eq + 1);
      if (!(k in params)) throw new SpecError(`effect '${name}' has no parameter '${k}'`);
      const t = PARAM_TYPES[k];
      if (t === 'color') {
        params[k] = colorHex(parseColor(v));
      } else if (t === 'float') {
        const f = Number(v);
        if (v === '' || !isFinite(f)) throw new SpecError(`${k} must be a number, got '${v}'`);
        if (f < 0) throw new SpecError(`${k} must not be negative`);
        params[k] = f;
      } else if (t === 'bool') {
        params[k] = ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()) ? 1 : 0;
      } else {
        if (!t.includes(v.toLowerCase())) throw new SpecError(`${k} must be one of ${t.join(', ')}`);
        params[k] = v.toLowerCase();
      }
    }
    return [name, params];
  }

  function formatSpec(name, params) {
    const out = [name];
    const defaults = Object.assign({}, EFFECTS[name], COMMON_PARAMS);
    for (const k of Object.keys(params).sort()) {
      if (k in defaults && params[k] !== defaults[k]) {
        let v = params[k];
        if (typeof v === 'number') v = String(Math.round(v * 1000) / 1000);
        out.push(`${k}=${v}`);
      }
    }
    return out.join(' ');
  }

  // ------------------------------------------------------------ helpers

  function toByte(x) {
    if (x <= 0.0) return 0;
    if (x >= 1.0) return 255;
    return Math.floor(x * 255.0 + 0.5);
  }

  function frac(x) { return x - Math.floor(x); }

  // Python's float % (result has the sign of the divisor)
  function pmod(a, b) { return a - b * Math.floor(a / b); }

  function mix(a, b, v) {
    if (v <= 0.0) return a;
    if (v >= 1.0) return b;
    return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v, a[2] + (b[2] - a[2]) * v];
  }

  function hash01(i, k) {
    let x = (Math.imul(i, 0x9E3779B1) + Math.imul(k, 0x85EBCA77) + 0x27D4EB2F) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0;
    x = Math.imul(x, 0x846ca68b) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x / 4294967296.0;
  }

  function hsv(h, s, v) {
    h = frac(h) * 6.0;
    const i = Math.floor(h);
    const f = h - i;
    const p = v * (1.0 - s);
    const q = v * (1.0 - s * f);
    const t = v * (1.0 - s * (1.0 - f));
    return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
  }

  function period(p, def) {
    const v = ('period' in p) ? p.period : def;
    return v > 0.05 ? v : 0.05;
  }

  const fill = (n, c) => { const o = new Array(n); for (let i = 0; i < n; i++) o[i] = c; return o; };

  // ------------------------------------------------------------ effects

  const FX = {
    off: (n) => fill(n, [0.0, 0.0, 0.0]),
    solid: (n, ctx, p) => fill(n, parseColor(p.color)),
    breathe: (n, ctx, p) => {
      const v = (1.0 - Math.cos(2.0 * Math.PI * ctx.t / period(p, 3.0))) * 0.5;
      return fill(n, mix(parseColor(p.color2), parseColor(p.color), v));
    },
    blink: (n, ctx, p) => {
      const on = frac(ctx.t / period(p, 1.0)) < 0.5;
      return fill(n, parseColor(on ? p.color : p.color2));
    },
    rainbow: (n, ctx, p) => {
      const ph = ctx.t / period(p, 5.0);
      const o = [];
      for (let i = 0; i < n; i++) o.push(hsv(i / n + ph, 1.0, 1.0));
      return o;
    },
    chase: (n, ctx, p) => {
      const a = parseColor(p.color2), b = parseColor(p.color);
      const size = Math.max(1.0, p.size);
      const pos = ctx.t / period(p, 2.0) * n;
      const o = [];
      for (let i = 0; i < n; i++) o.push(pmod(i - pos, 2.0 * size) < size ? b : a);
      return o;
    },
    comet: (n, ctx, p) => {
      const a = parseColor(p.color2), b = parseColor(p.color);
      const size = p.size >= 1.0 ? p.size : Math.max(2.0, n / 3.0);
      const head = frac(ctx.t / period(p, 1.5)) * (n + size);
      const o = [];
      for (let i = 0; i < n; i++) {
        const d = head - i;
        if (d >= 0.0 && d < size) { const v = 1.0 - d / size; o.push(mix(a, b, v * v)); } else o.push(a);
      }
      return o;
    },
    scan: (n, ctx, p) => {
      const a = parseColor(p.color2), b = parseColor(p.color);
      const size = Math.max(0.5, p.size);
      const ph = frac(ctx.t / period(p, 2.0));
      const tri = ph < 0.5 ? ph * 2.0 : 2.0 - ph * 2.0;
      const x = tri * (n - 1);
      const o = [];
      for (let i = 0; i < n; i++) o.push(mix(a, b, 1.0 - Math.abs(i - x) / size));
      return o;
    },
    twinkle: (n, ctx, p) => {
      const a = parseColor(p.color2), b = parseColor(p.color);
      const per = period(p, 1.2);
      const o = [];
      for (let i = 0; i < n; i++) {
        const s = ctx.t / per + hash01(i, -1);
        const k = Math.floor(s);
        if (hash01(i, k) < p.density) o.push(mix(a, b, Math.sin(Math.PI * (s - k)))); else o.push(a);
      }
      return o;
    },
    fire: (n, ctx) => {
      const s = ctx.t * 12.0;
      const k = Math.floor(s);
      let f = s - k;
      f = f * f * (3.0 - 2.0 * f);
      const o = [];
      for (let i = 0; i < n; i++) {
        const h0 = hash01(i, k), h1 = hash01(i, k + 1);
        o.push(fireColor(0.35 + 0.65 * (h0 + (h1 - h0) * f)));
      }
      return o;
    },
    progress: (n, ctx, p) => {
      const off = [0.0, 0.0, 0.0], a = parseColor(p.color);
      let v = p.source === 'heat' ? ctx.heat : ctx.progress;
      v = Math.max(0.0, Math.min(1.0, v));
      const lit = v * n;
      const o = [];
      if (!p.gradient) {
        for (let i = 0; i < n; i++) o.push(mix(off, a, lit - i));
        return o;
      }
      const b = parseColor(p.color2);
      for (let i = 0; i < n; i++) {
        const pos = n === 1 ? v : i / (n - 1);
        o.push(mix(off, mix(a, b, pos), lit - i));
      }
      return o;
    },
    heat: (n, ctx, p) => fill(n, mix(parseColor(p.color2), parseColor(p.color),
      Math.max(0.0, Math.min(1.0, ctx.heat)))),
    follow: (n, ctx, p) => {
      const a = parseColor(p.color2), b = parseColor(p.color);
      const axis = { x: 0, y: 1, z: 2 }[p.axis];
      const x = Math.max(0.0, Math.min(1.0, ctx.pos[axis])) * (n - 1);
      const size = Math.max(0.5, p.size);
      const o = [];
      for (let i = 0; i < n; i++) o.push(mix(a, b, 1.0 - Math.abs(i - x) / size));
      return o;
    },
  };

  function fireColor(h) {
    if (h < 0.4) return [h / 0.4, 0.0, 0.0];
    if (h < 0.8) return [1.0, (h - 0.4) / 0.4 * 0.55, 0.0];
    return [1.0, 0.55 + (h - 0.8) / 0.2 * 0.35, (h - 0.8) / 0.2 * 0.15];
  }

  function render(name, params, n, ctx) {
    if (n <= 0) return [];
    let out = FX[name](n, ctx, params);
    if (params.reverse) out = out.slice().reverse();
    return out;
  }

  function toBytes(frame, brightness = 1.0) {
    const buf = new Uint8Array(frame.length * 3);
    let j = 0;
    for (const [r, g, b] of frame) {
      buf[j] = toByte(r * brightness);
      buf[j + 1] = toByte(g * brightness);
      buf[j + 2] = toByte(b * brightness);
      j += 3;
    }
    return buf;
  }

  function crossfade(old, nw, v) {
    if (!old || old.length !== nw.length || v >= 1.0) return nw;
    return nw.map((b, i) => mix(old[i], b, v));
  }

  function resolveScene(state, scenes) {
    const seen = new Set();
    while (!(state in scenes) && (state in STATE_FALLBACK) && !seen.has(state)) {
      seen.add(state);
      state = STATE_FALLBACK[state];
    }
    return (state in scenes) ? state : null;
  }

  const US_PER_BYTE = 10.0;
  const MCU_BUDGET = 0.03;
  const MCU_FPS_CAP = 25.0;
  const NET_FPS = 40.0;

  function mcuFps(nbytes) {
    if (nbytes <= 0) return MCU_FPS_CAP;
    return Math.max(1.0, Math.min(MCU_FPS_CAP, MCU_BUDGET / (nbytes * US_PER_BYTE * 1e-6)));
  }

  const api = {
    VERSION, STATES, STATE_FALLBACK, EFFECTS, COMMON_PARAMS, DEFAULT_SCENES, PARAM_TYPES,
    SpecError, parseColor, colorHex, parseSpec, formatSpec, toByte, mix, hash01, hsv,
    render, toBytes, crossfade, resolveScene, mcuFps,
    US_PER_BYTE, MCU_BUDGET, MCU_FPS_CAP, NET_FPS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Lightspeed = api;
})(globalThis); // Voyager copy: globalThis so it also loads as an ES module (tests, Vite)
