// Lightspeed (Ozan's LED effects plugin for Klipper): when the printer has the `lightspeed` object, the lights it
// drives belong to it. Klipper's own colour of such an LED stays 0 (Lightspeed writes the chain directly), and a
// SET_LED would be painted over on its next frame, so for these lights the tiles read the strip's effect from
// Lightspeed's status and send LIGHTSPEED_PREVIEW instead. Strips on outputs Klipper has no object for (WLED,
// esp_bridge nodes) get tiles of their own.
// Status: lightspeed.strips = { name: { output: 'neopixel hotend_rgb' | 'pin X' | 'wled ip' | 'esp_bridge p',
// kind, count, effect: 'breathe color=1a3cff period=4', manual: seconds a preview still holds, disabled, ... } }
import { computed, ref, watch } from 'vue';
import './vendor/lightspeed_engine.js';
import { state, S, gcode, toast } from './store';

export const E = globalThis.Lightspeed;

export const hasLightspeed = computed(() => state.objects.includes('lightspeed'));

// the strips with only what the UI uses. Lightspeed's status changes several times a second (bytes sent, fps);
// the same strips come back as the same object, so tiles do not redraw for those
let lastKey = '',
  lastVal = {};
export const lsStrips = computed(() => {
  const st = (hasLightspeed.value && S('lightspeed').strips) || {};
  const out = {};
  for (const [name, s] of Object.entries(st))
    out[name] = {
      name,
      output: String(s?.output || ''),
      kind: String(s?.kind || ''),
      count: Math.max(1, Number(s?.count) || 1),
      effect: String(s?.effect || ''),
      manual: (s?.manual || 0) > 0,
      disabled: !!s?.disabled,
      error: String(s?.last_error || ''),
    };
  const key = JSON.stringify(out);
  if (key === lastKey) return lastVal;
  lastKey = key;
  lastVal = out;
  return out;
});

// the Klipper object a strip drives ('neopixel hotend_rgb', 'output_pin Case'), as the printer spells it, or ''
export function stripObject(s) {
  const [kind, target] = s.output.split(/\s+/);
  const want = { neopixel: 'neopixel', dotstar: 'dotstar', pin: 'output_pin' }[kind];
  if (!want || !target) return '';
  const name = (want + ' ' + target).toLowerCase();
  return state.objects.find((o) => o.toLowerCase() === name) || '';
}
// Klipper object -> the strips on it (one chain can carry several strips, `leds: 1-3`, `leds: 4-10`)
const byObject = computed(() => {
  const m = {};
  for (const s of Object.values(lsStrips.value)) {
    const o = stripObject(s);
    if (o) (m[o] ||= []).push(s.name);
  }
  return m;
});
export const stripsOf = (obj) => byObject.value[obj] || [];
// strips with no Klipper object (WLED, esp_bridge): tiles of their own
export const freeStrips = computed(() => Object.values(lsStrips.value).filter((s) => !stripObject(s)));

// an effect spec as [name, params with defaults]; an effect this copy of the engine does not know (a newer
// Lightspeed) stays a name with no parameters, shown as text and drawn grey
export function parseEffect(spec) {
  try {
    return E.parseSpec(spec || 'off');
  } catch {
    return [
      String(spec || 'off')
        .split(/\s+/)[0]
        .toLowerCase(),
      {},
    ];
  }
}
export const known = (name) => !!E && name in E.EFFECTS;
export const EFFECT_LABEL = {
  off: 'Off',
  solid: 'Solid',
  breathe: 'Breathe',
  blink: 'Blink',
  rainbow: 'Rainbow',
  chase: 'Chase',
  comet: 'Comet',
  scan: 'Scan',
  twinkle: 'Twinkle',
  fire: 'Fire',
  progress: 'Progress bar',
  heat: 'Heat colour',
  follow: 'Follow nozzle',
};
// what each output can show: a plain pin only switches, a node runs its own effects (follow becomes solid there)
export function effectsFor(kind) {
  if (kind === 'pin') return ['off', 'solid', 'blink', 'breathe'];
  return Object.keys(EFFECT_LABEL).filter((k) => known(k) && !(kind === 'esp_bridge' && k === 'follow'));
}
// the effect changes over time (the tile animates) or depends on the print (redrawn now and then)
export const moving = (name) => !['off', 'solid'].includes(name) && known(name);

// what the effects read from the printer, as Lightspeed works them out: print progress, how far the heaters are
// from their targets (1 = there), the nozzle in the build volume (0..1 per axis)
export function effectCtx(t) {
  const ds = S('display_status').progress,
    vs = S('virtual_sdcard').progress;
  let heat = 0,
    n = 0;
  for (const h of S('heaters').available_heaters || []) {
    const o = S(h);
    if (!(o.target > 0)) continue;
    heat += Math.max(0, Math.min(1, (o.temperature || 0) / o.target));
    n++;
  }
  const th = S('toolhead'),
    p = th.position || [0, 0, 0],
    a = th.axis_minimum || [0, 0, 0],
    b = th.axis_maximum || [1, 1, 1];
  const pos = [0, 1, 2].map((i) => Math.max(0, Math.min(1, (p[i] - a[i]) / Math.max(1e-6, b[i] - a[i]))));
  return { t, progress: Math.max(0, Math.min(1, Number(ds ?? vs) || 0)), heat: n ? heat / n : 0, pos };
}
// the strip's pixels at time t, [[r, g, b] 0..1, ...]; nothing for an effect this engine does not know
export function frame(spec, count, t) {
  const [name, params] = parseEffect(spec);
  if (!known(name)) return [];
  try {
    return E.render(name, params, Math.min(count, 60), effectCtx(t));
  } catch {
    return [];
  }
}
export const hex = (c) => '#' + E.colorHex(c);
// a strip shown as CSS: one colour, or a gradient through its pixels (a rainbow, a chase) when they differ
export function frameCss(px) {
  if (!px.length) return null;
  const step = Math.max(1, Math.floor(px.length / 12));
  const pick = px.filter((_, i) => i % step === 0).map(hex);
  return new Set(pick).size > 1 ? `linear-gradient(90deg, ${pick.join(', ')})` : pick[0];
}
// the brightest pixel, for the tile's glow
export function frameGlow(px) {
  let best = null,
    v = 0;
  for (const c of px) {
    const m = Math.max(...c);
    if (m > v) ((v = m), (best = c));
  }
  return v > 0.02 ? hex(best) : null;
}

// ---- commands. A strip picked here holds until Auto (the plugin's own page does the same: a day).
const HOLD = 86400;
const run = (cmd) => gcode(cmd).catch((e) => toast(e.message, 'error'));
// colours go as rrggbb: '#' starts a comment in G-code
export function specOf(name, params = {}) {
  const p = { ...(E.EFFECTS[name] || {}), ...params };
  for (const k of ['color', 'color2']) if (typeof p[k] === 'string') p[k] = p[k].replace(/^#/, '').toLowerCase();
  return E.formatSpec(name, p);
}
export const setEffect = (strip, spec) =>
  run(`LIGHTSPEED_PREVIEW STRIP=${strip} EFFECT="${spec.replace(/["#]/g, '')}" HOLD=${HOLD}`);
export const backToAuto = (strip) => run(`LIGHTSPEED_PREVIEW STRIP=${strip} HOLD=0`);
// the tile's switch: off holds 'off'; on gives the strip back to its scene
export const switchStrip = (strip, on) => (on ? backToAuto(strip) : setEffect(strip, 'off'));
export const setBrightness = (v) => run(`LIGHTSPEED_BRIGHTNESS VALUE=${Math.max(0, Math.min(1, v)).toFixed(2)}`);
export const setEnabled = (on) => run(`LIGHTSPEED_ENABLE VALUE=${on ? 1 : 0}`);
export const showState = (st) => run(`LIGHTSPEED_STATE STATE=${st}${st === 'auto' ? '' : ' HOLD=60'}`);

// the plugin's designer page. install.sh links it into Mainsail's / Fluidd's folder, which can be on any port
// (80, 81 for a second UI, 4408/4409 on Creality K1, ...). Voyager finds it by itself: it loads the page's logo
// from each likely address (an image load works across ports and fails on a 404 or an HTML fallback page) and
// keeps the first that answers, in this order. Settings can still point elsewhere.
const designerPath = '/lightspeed/lightspeed.html';
const lsFound = ref('');
const configuredUrl = computed(() => {
  const own = String(state.settings.lightspeedUrl || '').trim();
  return /^https?:\/\//i.test(own) ? own : '';
});
export const pageUrl = computed(() => configuredUrl.value || lsFound.value);

function hasDesignerLogo(base) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), 2500);
    img.onload = img.onerror = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 0);
    };
    img.src = base + '/lightspeed/logo.svg';
  });
}

// Use the endpoint passed to Moonraker at startup. The page hosting Voyager may belong to a different printer.
export function startLightspeedDiscovery(host) {
  const selected = new URL(host ? location.protocol + '//' + host : location.origin);
  const bases = [selected.origin];
  for (const port of ['', '80', '81', '8080', '8081', '4408', '4409', '7136', '7125']) {
    const candidate = new URL(selected.origin);
    candidate.port = port;
    if (!bases.includes(candidate.origin)) bases.push(candidate.origin);
  }
  return watch(
    [hasLightspeed, configuredUrl],
    async ([installed, custom], _, onCleanup) => {
      lsFound.value = selected.origin + designerPath;
      if (!installed || custom) return;
      let active = true;
      onCleanup(() => (active = false));
      const hits = await Promise.all(bases.map(hasDesignerLogo));
      const first = hits.indexOf(true);
      if (active && first >= 0) lsFound.value = bases[first] + designerPath;
    },
    { immediate: true },
  );
}
