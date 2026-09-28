<script setup>
// Guided calibrations, at the top of the Calibrations page: one tile per calibration the printer has (heaters,
// leveling, probe, Z offset, mesh, input shaper; calibPath.js decides which). Each is separate: a tile opens
// its own dialog that runs the command and draws what is going on: the hotend glowing while PID tunes it, the gantry
// settling pass after pass, the probe points landing on the bed, the toolhead shaking and the shapers it found.
// Nothing is written to the config until "Save to config". The last run of each is remembered per printer.
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import { state, S, gcode, toast, isPrinting, spoolPreset } from '../store';
import { api } from '../api/moonraker';
import {
  pathSteps,
  parsePid,
  parseProbes,
  parseAccuracy,
  accuracyGrade,
  parseLevel,
  parseScrews,
  parseShaper,
  parseZOffset,
} from '../calibPath';
import { heatColor } from '../sensorStyle';
import { t } from '../i18n';

// one line under each calibration's name
const SHORT = {
  pid: 'Holds the temperature steady',
  level: 'Gantry parallel to the bed',
  screws: 'How far to turn each bed screw',
  accuracy: 'How repeatable the probe is',
  zoffset: 'Paper test for the first layer',
  mesh: 'Maps the shape of the bed',
  shaper: 'Less ringing at high speed',
};
const ICON = {
  pid: 'flame',
  level: 'tilt',
  screws: 'screwdriver',
  accuracy: 'target',
  zoffset: 'ruler',
  mesh: 'mesh',
  shaper: 'wave',
};
const steps = computed(() =>
  pathSteps({
    commands: state.commands,
    // section names from the parsed settings, the raw config and the object list, whichever the printer reports
    settings: Object.fromEntries(
      [
        ...Object.keys(S('configfile').settings || {}),
        ...Object.keys(S('configfile').config || {}),
        ...(state.objects || []),
      ].map((k) => [k.toLowerCase(), {}]),
    ),
    heaters: S('heaters').available_heaters || [],
  }),
);
const done = computed(() => state.settings.calibPath || {});
const fmtDay = (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
function markDone(step, sum) {
  state.settings.calibPath = { ...(state.settings.calibPath || {}), [step.key]: { at: Date.now(), sum } };
}

// ---------------------------------------------------------------- the open step
const cur = ref(null); // the step shown in the dialog
const run = ref(null); // { since, running, ended, cmd }
const target = ref(0);
const samples = ref(10);
const axis = ref('');
function open(s) {
  if (run.value?.running) return;
  cur.value = s;
  run.value = null;
  hist.value = [];
  if (s.kind === 'pid') {
    const sp = spoolPreset.value?.temps?.[s.heater];
    target.value = sp || s.target;
  }
}
// the paper test is drawn here: the app-wide manual probe dialog stays away while this is open
watch(cur, (c) => (state.calibWizard = !!c));
onBeforeUnmount(() => (state.calibWizard = false));

const homed = computed(() => ['x', 'y', 'z'].every((a) => (S('toolhead').homed_axes || '').includes(a)));
const needsHome = computed(() => cur.value && cur.value.kind !== 'pid' && !homed.value);

const strip = (m) => String(m || '').replace(/^\/\/\s?/gm, '');
const out = computed(() =>
  run.value
    ? state.console.filter((l) => l.id > run.value.since && l.type !== 'command').map((l) => strip(l.message))
    : [],
);
const errLine = computed(() => out.value.find((l) => /^!!/.test(l)));

async function send(cmd) {
  const since = state.console.length ? state.console[state.console.length - 1].id : 0;
  run.value = { since, running: true, ended: false, cmd };
  try {
    await gcode(cmd);
  } catch {
    // shown as a toast and in the output
  }
  if (run.value) {
    run.value.running = false;
    run.value.ended = true;
  }
}
const home = () => gcode('G28').catch(() => {});
function commandFor(s) {
  if (s.kind === 'pid') return `PID_CALIBRATE HEATER=${s.heater} TARGET=${Math.round(target.value)}`;
  if (s.kind === 'accuracy') return `PROBE_ACCURACY SAMPLES=${Math.max(3, Math.min(50, Math.round(samples.value)))}`;
  if (s.kind === 'shaper') return axis.value ? `SHAPER_CALIBRATE AXIS=${axis.value}` : 'SHAPER_CALIBRATE';
  return s.cmd;
}
const pidMax = computed(() => Number(S('configfile').settings?.[cur.value?.heater]?.max_temp) || 300);
const canStart = computed(
  () =>
    cur.value &&
    !isPrinting.value &&
    !state.locked &&
    state.klippy === 'ready' &&
    !run.value?.running &&
    !needsHome.value &&
    !(cur.value.kind === 'pid' && !(target.value > 30 && target.value <= pidMax.value - 5)),
);
function start() {
  if (!canStart.value) return;
  send(commandFor(cur.value));
}

// results per kind, read from the console as they come
const pid = computed(() => (cur.value?.kind === 'pid' ? parsePid(out.value) : null));
const probes = computed(() => (['accuracy', 'mesh'].includes(cur.value?.kind) ? parseProbes(out.value) : []));
const acc = computed(() => (cur.value?.kind === 'accuracy' ? parseAccuracy(out.value) : null));
const passes = computed(() => (cur.value?.kind === 'level' ? parseLevel(out.value) : []));
const levelOk = computed(() => {
  const p = passes.value[passes.value.length - 1];
  return p && p.range <= p.tol;
});
const screws = computed(() => {
  if (cur.value?.kind !== 'screws') return [];
  const fromLines = parseScrews(out.value);
  if (fromLines.length) return fromLines;
  // newer Klipper also reports the result as status, use it when the lines were not caught
  const r = run.value?.ended ? S('screws_tilt_adjust').results : null;
  return r
    ? Object.values(r).map((x) => ({
        name: x.name,
        base: x.is_base,
        z: x.z,
        dir: x.is_base ? '' : x.sign,
        turns: x.is_base ? 0 : +x.adjust.split(':')[0] + +x.adjust.split(':')[1] / 60,
        text: x.is_base ? '' : x.adjust,
      }))
    : [];
});
const shaper = computed(() => (cur.value?.kind === 'shaper' ? parseShaper(out.value) : {}));
const zres = computed(() => (cur.value?.kind === 'zoffset' ? parseZOffset(out.value) : null));
const mp = computed(() => S('manual_probe'));

// a finished step is remembered with a short summary
const result = computed(() => {
  const s = cur.value;
  if (!s || !run.value) return null;
  if (s.kind === 'pid' && pid.value) return `Kp ${pid.value.kp} · Ki ${pid.value.ki} · Kd ${pid.value.kd}`;
  if (s.kind === 'accuracy' && acc.value) return t('range {r} mm', { r: acc.value.range });
  if (s.kind === 'level' && levelOk.value) return t('range {r} mm', { r: passes.value[passes.value.length - 1].range });
  if (s.kind === 'screws' && screws.value.length && run.value.ended)
    return screws.value.every((x) => x.base || x.turns < 0.1) ? t('level') : t('adjust the screws');
  if (s.kind === 'zoffset' && zres.value) return `${zres.value.key} ${zres.value.value}`;
  if (s.kind === 'mesh' && run.value.ended && !errLine.value)
    return meshRange.value != null ? t('range {r} mm', { r: meshRange.value }) : 'ok';
  if (s.kind === 'shaper' && Object.keys(shaper.value).length)
    return Object.entries(shaper.value)
      .map(([a, v]) => `${a.toUpperCase()} ${v.type} ${v.freq} Hz`)
      .join(' · ');
  return null;
});
watch(result, (r) => r && cur.value && markDone(cur.value, r));
const savePending = computed(() => S('configfile').save_config_pending);
function saveConfig() {
  gcode('SAVE_CONFIG').catch(() => {});
}
function applyShaper() {
  const parts = Object.entries(shaper.value).map(
    ([a, v]) => `SHAPER_TYPE_${a.toUpperCase()}=${v.type} SHAPER_FREQ_${a.toUpperCase()}=${v.freq}`,
  );
  if (parts.length) gcode('SET_INPUT_SHAPER ' + parts.join(' ')).then(() => toast(t('Used until Klipper restarts')));
}
function estop() {
  api.call('printer.emergency_stop').catch((e) => toast(e.message, 'error'));
}
function close() {
  if (cur.value?.kind === 'zoffset' && mp.value.is_active) gcode('ABORT').catch(() => {});
  cur.value = null;
}

// ---------------------------------------------------------------- live temperature for the PID picture
const hist = ref([]);
let tm = null;
watch(
  () => cur.value?.kind === 'pid',
  (on) => {
    clearInterval(tm);
    if (!on) return;
    tm = setInterval(() => {
      const h = S(cur.value?.heater);
      if (h.temperature == null) return;
      hist.value = [...hist.value.slice(-179), { v: h.temperature, tg: h.target || 0 }];
    }, 1000);
  },
);
onBeforeUnmount(() => clearInterval(tm));
const heater = computed(() => (cur.value?.kind === 'pid' ? S(cur.value.heater) : {}));
const glow = computed(() => Math.max(0, Math.min(1, ((heater.value.temperature || 20) - 30) / 220)));
const spark = computed(() => {
  const h = hist.value;
  if (h.length < 2) return { line: '', tg: null };
  const hi = Math.max(target.value + 15, ...h.map((p) => p.v)),
    lo = Math.min(15, ...h.map((p) => p.v));
  const X = (i) => (i / 179) * 340,
    Y = (v) => 90 - ((v - lo) / (hi - lo)) * 86;
  return {
    line: h.map((p, i) => (i ? 'L' : 'M') + X(i + 180 - h.length).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' '),
    tg: Y(target.value),
  };
});

// ---------------------------------------------------------------- bed pictures (screws, probe points, mesh)
const lim = computed(() => {
  const th = S('toolhead');
  const mn = th.axis_minimum || [0, 0],
    mx = th.axis_maximum || [300, 300];
  return { x0: mn[0], y0: mn[1], w: mx[0] - mn[0] || 300, h: mx[1] - mn[1] || 300 };
});
const BW = 300,
  BH = 220;
const bx = (x) => 10 + ((x - lim.value.x0) / lim.value.w) * BW;
const by = (y) => 10 + BH - ((y - lim.value.y0) / lim.value.h) * BH;
const zColor = (z, lo, hi) => {
  const f = hi > lo ? (z - lo) / (hi - lo) : 0.5;
  return `color-mix(in srgb, #ff5a4d ${Math.round(f * 100)}%, #4d9bff)`;
};
const meshPts = computed(() => {
  const p = probes.value;
  if (!p.length) return [];
  const zs = p.map((q) => q.z),
    lo = Math.min(...zs),
    hi = Math.max(...zs);
  return p.map((q, i) => ({ ...q, i, c: zColor(q.z, lo, hi), last: i === p.length - 1 }));
});
const meshRange = computed(() => {
  const m = S('bed_mesh').probed_matrix;
  const zs = (m || []).flat().filter((v) => typeof v === 'number');
  if (run.value?.ended && zs.length) return +(Math.max(...zs) - Math.min(...zs)).toFixed(3);
  if (probes.value.length > 1) {
    const z = probes.value.map((q) => q.z);
    return +(Math.max(...z) - Math.min(...z)).toFixed(3);
  }
  return null;
});
// screws without positions in the output (status only) are spread over the corners
const screwPts = computed(() =>
  screws.value.map((s, i) => {
    const has = s.x != null && s.y != null;
    const corner = [
      [0.1, 0.1],
      [0.9, 0.1],
      [0.9, 0.9],
      [0.1, 0.9],
    ][i % 4];
    return {
      ...s,
      px: has ? bx(s.x) : 10 + corner[0] * BW,
      py: has ? by(s.y) : 10 + BH - corner[1] * BH,
    };
  }),
);
const arc = (turns, dir) => {
  // an arc around the screw, as long as the turn (a full turn is a full circle)
  const f = Math.min(0.999, turns),
    r = 17,
    a = f * 2 * Math.PI,
    sgn = dir === 'CCW' ? -1 : 1;
  const x = Math.sin(a * sgn) * r,
    y = -Math.cos(a * sgn) * r;
  return `M 0 ${-r} A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} ${sgn > 0 ? 1 : 0} ${x.toFixed(2)} ${y.toFixed(2)}`;
};

// ---------------------------------------------------------------- probe accuracy dots
const accPts = computed(() => {
  const z = probes.value.map((p) => p.z);
  if (!z.length) return [];
  const mean = z.reduce((a, b) => a + b, 0) / z.length;
  return z.map((v, i) => ({ i, d: (v - mean) * 1000 })); // microns from the mean
});
const accScale = computed(() => Math.max(5, ...accPts.value.map((p) => Math.abs(p.d))) * 1.2);

// ---------------------------------------------------------------- leveling picture
const lvlTop = computed(() => Math.max(...passes.value.map((p) => p.range), passes.value[0]?.tol || 0.01));
const lvlH = (p) => Math.max(3, (p.range / lvlTop.value) * 62);
const lvlTolH = computed(() => ((passes.value[0]?.tol || 0) / lvlTop.value) * 62);
const tilt = computed(() => {
  const p = passes.value[passes.value.length - 1];
  if (!p) return run.value?.running ? 6 : 0;
  return Math.max(-10, Math.min(10, p.range * 60 * (p.retry % 2 ? -1 : 1)));
});

// ---------------------------------------------------------------- z offset: paper test
const STEPS_Z = [1, 0.1, 0.05, 0.01];
const testz = (d) => gcode(`TESTZ Z=${d}`).catch(() => {});
const gapPx = computed(() => {
  const z = mp.value.z_position;
  if (z == null) return 40;
  return Math.max(2, Math.min(70, 4 + Math.log10(1 + Math.max(0, z) * 10) * 40));
});
const shaking = computed(() => cur.value?.kind === 'shaper' && run.value?.running);
const best = (a) => shaper.value[a]?.type;
const shaperMax = computed(() => Math.max(1, ...Object.values(shaper.value).flatMap((v) => v.fits.map((f) => f.vib))));

const why = {
  pid: 'PID tunes how the heater reacts, so the temperature holds steady instead of swinging. The heater warms up and cools a few times around the target; that takes a few minutes.',
  level:
    'The gantry is probed at each corner and its Z motors are moved until it sits parallel to the bed. Every pass gets closer; it is done when the difference is under the tolerance.',
  screws:
    'Probes next to each bed screw and says how far to turn it. Turn the screws as shown, then run it again until nothing needs turning.',
  accuracy:
    'Probes the same spot several times. The closer the readings are to each other, the more you can trust the mesh and the Z offset.',
  zoffset:
    'The paper test: lower the nozzle until a sheet of paper drags a little when you slide it under the nozzle. Small steps near the bed.',
  mesh: 'Probes a grid over the bed to map its shape. Klipper then follows that shape during the first layers.',
  shaper:
    'The accelerometer measures how the printer rings when it shakes the toolhead, and picks the filter that cancels it. It is loud; that is normal.',
};
</script>

<template>
  <section v-if="steps.length" class="card cp">
    <div class="card-h">
      <h2><Icon name="sparkle" :size="18" />{{ t('Guided calibrations') }}</h2>
      <span v-if="isPrinting" class="mu sm">{{ t('Available when the print is done.') }}</span>
    </div>
    <div class="grid">
      <button v-for="s in steps" :key="s.key" class="tile" :disabled="isPrinting" @click="open(s)">
        <span class="dot"><Icon :name="ICON[s.kind]" :size="18" :stroke="2.4" /></span>
        <span class="col grow" style="gap: 2px; min-width: 0">
          <b>{{ t(s.name) }}</b>
          <span class="mu sm">{{ t(SHORT[s.kind]) }}</span>
          <span v-if="done[s.key]" class="last sm"
            ><Icon name="check" :size="12" :stroke="2.6" />{{ fmtDay(done[s.key].at) }} · {{ done[s.key].sum }}</span
          >
        </span>
      </button>
    </div>
  </section>

  <Modal v-if="cur" :title="t(cur.name)" width="920px" @close="close">
    <div class="st">
      <!-- the picture -->
      <div class="pic">
        <!-- PID: the heater glows with its temperature, the line shows it swinging around the target -->
        <svg v-if="cur.kind === 'pid'" viewBox="0 0 360 260" class="svg">
          <defs>
            <filter id="cpGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>
          <template v-if="cur.heater === 'extruder'">
            <rect x="140" y="20" width="80" height="54" rx="4" class="metal" />
            <rect
              x="130"
              y="74"
              width="100"
              height="62"
              rx="6"
              :style="{ fill: heatColor(heater.temperature) || '#555' }"
            />
            <rect
              x="120"
              y="64"
              width="120"
              height="82"
              rx="20"
              fill="#ff5a2e"
              filter="url(#cpGlow)"
              :opacity="glow * 0.9"
            />
            <rect x="130" y="74" width="100" height="62" rx="6" class="block" :style="{ '--g': glow }" />
            <path d="M165 136 h30 l-8 22 h-14 z" class="metal" />
            <circle cx="180" cy="158" r="3" :fill="heatColor(heater.temperature) || '#888'" />
          </template>
          <template v-else>
            <rect x="40" y="70" width="280" height="70" rx="10" fill="#ff5a2e" filter="url(#cpGlow)" :opacity="glow" />
            <rect x="40" y="90" width="280" height="30" rx="4" class="block" :style="{ '--g': glow }" />
            <rect
              x="40"
              y="90"
              width="280"
              height="30"
              rx="4"
              :style="{ fill: heatColor(heater.temperature) || '#555', opacity: 0.55 }"
            />
          </template>
          <text x="345" y="36" text-anchor="end" class="big">{{ (heater.temperature ?? 0).toFixed(1) }}°</text>
          <text x="345" y="56" text-anchor="end" class="mu2">{{ t('target {n}°', { n: Math.round(target) }) }}</text>
          <g transform="translate(10 166)">
            <line v-if="spark.tg != null" x1="0" x2="340" :y1="spark.tg" :y2="spark.tg" class="tgl" />
            <path :d="spark.line" class="spk" />
          </g>
        </svg>

        <!-- leveling: the gantry settles a little more with every pass -->
        <svg v-else-if="cur.kind === 'level'" viewBox="0 0 360 260" class="svg">
          <g :style="{ transform: `rotate(${tilt}deg)`, transformOrigin: '180px 60px' }" class="gantry">
            <rect x="20" y="54" width="320" height="12" rx="3" class="metal" />
            <rect x="160" y="66" width="40" height="30" rx="4" class="head" />
          </g>
          <rect x="30" y="126" width="300" height="10" rx="3" class="bed" />
          <g v-if="passes.length" transform="translate(30 150)">
            <template v-for="(p, i) in passes" :key="i">
              <rect
                :x="i * 56"
                :y="80 - lvlH(p)"
                width="40"
                :height="lvlH(p)"
                :class="p.range <= p.tol ? 'cok' : 'cbar'"
                rx="4"
              />
              <text :x="i * 56 + 20" :y="74 - lvlH(p)" text-anchor="middle" class="sm2">{{ p.range }}</text>
            </template>
            <line x1="-4" :x2="passes.length * 56" :y1="80 - lvlTolH" :y2="80 - lvlTolH" class="tgl" />
          </g>
        </svg>

        <!-- bed: screws with how far to turn, or the probe points landing -->
        <svg v-else-if="['screws', 'mesh'].includes(cur.kind)" viewBox="0 0 320 240" class="svg">
          <rect x="10" y="10" :width="BW" :height="BH" rx="8" class="bed" />
          <template v-if="cur.kind === 'screws'">
            <g v-for="s in screwPts" :key="s.name" :transform="`translate(${s.px} ${s.py})`">
              <circle r="11" class="screw" :class="{ base: s.base }" />
              <path v-if="s.turns" :d="arc(s.turns, s.dir)" class="turn" :class="s.dir" />
              <text y="4" text-anchor="middle" class="sm2">{{ s.base ? '●' : s.dir === 'CW' ? '↻' : '↺' }}</text>
              <text :y="s.py > 120 ? -24 : 32" text-anchor="middle" class="lbl2">
                {{ s.base ? t('base') : s.text }}
              </text>
            </g>
            <text v-if="!screwPts.length" x="160" y="125" text-anchor="middle" class="mu2">
              {{ run?.running ? t('Probing…') : '' }}
            </text>
          </template>
          <template v-else>
            <circle
              v-for="p in meshPts"
              :key="p.i"
              :cx="bx(p.x)"
              :cy="by(p.y)"
              :r="p.last && run?.running ? 7 : 5"
              :style="{ fill: p.c }"
              class="pt"
            />
            <text v-if="!meshPts.length" x="160" y="125" text-anchor="middle" class="mu2">
              {{ run?.running ? t('Probing…') : '' }}
            </text>
          </template>
        </svg>

        <!-- probe accuracy: each reading as a dot, microns away from the average -->
        <svg v-else-if="cur.kind === 'accuracy'" viewBox="0 0 360 260" class="svg">
          <line x1="20" x2="340" y1="130" y2="130" class="axis" />
          <text x="22" y="24" class="mu2">+{{ accScale.toFixed(0) }} µm</text>
          <text x="22" y="250" class="mu2">−{{ accScale.toFixed(0) }} µm</text>
          <circle
            v-for="p in accPts"
            :key="p.i"
            :cx="30 + p.i * (300 / Math.max(9, accPts.length - 1))"
            :cy="130 - (p.d / accScale) * 110"
            r="6"
            class="pt acc"
          />
          <text v-if="acc" x="180" y="60" text-anchor="middle" class="big">{{ (acc.range * 1000).toFixed(1) }} µm</text>
        </svg>

        <!-- Z offset: nozzle, paper and the gap between them -->
        <svg v-else-if="cur.kind === 'zoffset'" viewBox="0 0 360 260" class="svg">
          <rect x="30" y="200" width="300" height="14" rx="3" class="bed" />
          <rect x="70" :y="200 - 3" width="220" height="3" class="paper" />
          <g :style="{ transform: `translateY(${-gapPx}px)`, transition: 'transform .3s' }">
            <rect x="150" y="120" width="60" height="50" rx="4" class="metal" />
            <path d="M165 170 h30 l-8 24 h-14 z" class="metal" />
          </g>
          <text x="330" y="40" text-anchor="end" class="big">
            {{ mp.z_position != null ? mp.z_position.toFixed(3) : '--' }}
          </text>
          <text x="330" y="62" text-anchor="end" class="mu2">Z mm</text>
        </svg>

        <!-- input shaper: the toolhead shakes while measuring, then the shapers it tried -->
        <svg v-else-if="cur.kind === 'shaper'" viewBox="0 0 360 260" class="svg">
          <g :class="{ shake: shaking }">
            <rect x="20" y="40" width="320" height="10" rx="3" class="metal" />
            <rect x="150" y="50" width="60" height="44" rx="6" class="head" />
            <rect x="170" y="94" width="20" height="10" rx="2" class="metal" />
          </g>
          <template v-for="(a, ai) in ['x', 'y']" :key="a">
            <g v-if="shaper[a]" :transform="`translate(${20 + ai * 170} 130)`">
              <text x="0" y="0" class="lbl2">{{ a.toUpperCase() }}</text>
              <g v-for="(f, i) in shaper[a].fits" :key="f.type" :transform="`translate(${i * 30} 10)`">
                <rect
                  x="0"
                  :y="100 - (f.vib / shaperMax) * 90"
                  width="22"
                  :height="Math.max(2, (f.vib / shaperMax) * 90)"
                  rx="3"
                  :class="f.type === best(a) ? 'cok' : 'cbar'"
                />
                <text x="11" y="114" text-anchor="middle" class="sm2">{{ f.type }}</text>
              </g>
            </g>
          </template>
          <text v-if="shaking" x="180" y="200" text-anchor="middle" class="mu2">{{ t('Measuring…') }}</text>
        </svg>
      </div>

      <!-- words and controls -->
      <div class="side">
        <p class="mu" style="margin: 0">{{ t(why[cur.kind]) }}</p>

        <div v-if="isPrinting" class="warn">{{ t('Available when the print is done.') }}</div>
        <div v-else-if="state.locked" class="warn">{{ t('Controls are locked.') }}</div>
        <div v-else-if="needsHome" class="warn row">
          <span class="grow">{{ t('The printer needs to be homed first.') }}</span>
          <button class="btn" @click="home"><Icon name="home" :size="15" />{{ t('Home all') }}</button>
        </div>

        <label v-if="cur.kind === 'pid'" class="fld">
          <span>{{ t('Target') }}</span>
          <input v-model.number="target" type="number" class="input mono" min="40" :max="pidMax - 5" />
          <span class="mu sm">{{ t('The temperature you print at most.') }}</span>
        </label>
        <label v-if="cur.kind === 'accuracy'" class="fld">
          <span>{{ t('Samples') }}</span>
          <input v-model.number="samples" type="number" class="input mono" min="3" max="50" />
        </label>
        <div v-if="cur.kind === 'shaper'" class="seg">
          <button :class="{ on: !axis }" @click="axis = ''">{{ t('Both axes') }}</button>
          <button :class="{ on: axis === 'X' }" @click="axis = 'X'">X</button>
          <button :class="{ on: axis === 'Y' }" @click="axis = 'Y'">Y</button>
        </div>

        <!-- Z offset: the paper test buttons while Klipper waits -->
        <template v-if="cur.kind === 'zoffset' && mp.is_active">
          <div class="zg">
            <span class="mu sm">{{ t('Lower') }}</span>
            <button v-for="d in STEPS_Z" :key="'d' + d" class="btn" @click="testz(-d)">−{{ d }}</button>
            <span class="mu sm">{{ t('Raise') }}</span>
            <button v-for="d in STEPS_Z" :key="'u' + d" class="btn" @click="testz(d)">+{{ d }}</button>
          </div>
          <p v-if="mp.z_position != null && mp.z_position < 0.3" class="mu sm" style="margin: 0">
            {{ t('Close to the bed: use the small steps.') }}
          </p>
          <div class="row">
            <button class="btn acc grow" @click="gcode('ACCEPT')">
              <Icon name="check" :size="15" />{{ t('The paper drags a little: accept') }}
            </button>
            <button class="btn" @click="gcode('ABORT')">{{ t('Abort') }}</button>
          </div>
        </template>

        <!-- results -->
        <div v-if="pid" class="res">
          <b>{{ t('New PID values') }}</b>
          <div class="kv">
            <span>Kp</span><b class="mono">{{ pid.kp }}</b> <span>Ki</span><b class="mono">{{ pid.ki }}</b>
            <span>Kd</span><b class="mono">{{ pid.kd }}</b>
          </div>
        </div>
        <div v-if="acc" class="res">
          <b>{{
            t('Range {r} µm, standard deviation {s} µm', {
              r: (acc.range * 1000).toFixed(1),
              s: ((acc.standard_deviation || 0) * 1000).toFixed(1),
            })
          }}</b>
          <span class="mu sm">{{
            accuracyGrade(acc.range) === 'great'
              ? t('Very repeatable.')
              : accuracyGrade(acc.range) === 'good'
                ? t('Good enough for a mesh.')
                : t('Readings spread a lot: clean the nozzle and the probe, check that the probe mount is tight.')
          }}</span>
        </div>
        <div v-if="passes.length" class="res">
          <b>{{
            levelOk
              ? t('Level: {r} mm, under the tolerance of {tol} mm', {
                  r: passes[passes.length - 1].range,
                  tol: passes[passes.length - 1].tol,
                })
              : t('Pass {n}: {r} mm apart', { n: passes.length, r: passes[passes.length - 1].range })
          }}</b>
          <span v-if="levelOk" class="mu sm">{{ t('Home Z again before printing (G28 Z).') }}</span>
        </div>
        <div v-if="screws.length && run?.ended" class="res">
          <b>{{
            screws.every((s) => s.base || s.turns < 0.1)
              ? t('The bed is level.')
              : t('Turn the screws as shown, then run it again.')
          }}</b>
          <span class="mu sm">{{
            t('01:15 means one full turn and a quarter. ↻ clockwise, ↺ counter-clockwise.')
          }}</span>
        </div>
        <div v-if="cur.kind === 'mesh' && meshRange != null" class="res">
          <b>{{ t('Bed range {r} mm', { r: meshRange }) }}</b>
          <span class="mu sm">{{ t('{n} points probed', { n: probes.length }) }}</span>
        </div>
        <div v-if="zres" class="res">
          <b>{{ zres.key }}: {{ zres.value }}</b>
        </div>
        <div v-if="Object.keys(shaper).length" class="res">
          <div v-for="(v, a) in shaper" :key="a" class="kv">
            <span>{{ a.toUpperCase() }}</span
            ><b class="mono">{{ v.type }} {{ v.freq }} Hz</b>
            <span v-if="v.maxAccel" class="mu sm">{{ t('max accel {n}', { n: v.maxAccel }) }}</span>
          </div>
          <button class="btn" @click="applyShaper">{{ t('Try it now without saving') }}</button>
        </div>
        <div v-if="errLine" class="warn">{{ errLine.replace(/^!!\s*/, '') }}</div>
        <div v-if="run?.running && cur.kind !== 'zoffset'" class="row mu sm">
          <Icon name="refresh" :size="14" class="spin" /><span class="grow">{{
            t('Running. Only E-STOP stops it before it ends.')
          }}</span>
          <button class="btn dg" @click="estop">{{ t('E-STOP') }}</button>
        </div>
      </div>
    </div>
    <template #foot>
      <span class="grow"></span>
      <button
        v-if="savePending && result && ['pid', 'zoffset', 'mesh', 'shaper'].includes(cur.kind)"
        class="btn lg"
        :disabled="isPrinting"
        :data-tip="t('Writes the new values to printer.cfg and restarts Klipper')"
        @click="saveConfig"
      >
        <Icon name="save" :size="16" />{{ t('Save to config') }}
      </button>
      <button v-if="!(cur.kind === 'zoffset' && mp.is_active)" class="btn lg acc" :disabled="!canStart" @click="start">
        <Icon name="play" :size="16" />{{ run?.ended ? t('Run again') : t('Start') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.cp .card-h h2 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cp .card-h .sm {
  margin-left: auto;
}
.sm {
  font-size: 12px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.tile {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--bd);
  background: var(--s2);
  color: var(--tx);
  text-align: left;
  cursor: pointer;
  font-size: 13.5px;
}
.tile:hover:not(:disabled) {
  border-color: var(--ac);
}
.tile:disabled {
  opacity: 0.5;
  cursor: default;
}
.tile .col,
.res {
  align-items: flex-start;
  text-align: left;
}
.last {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--ok);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dot {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--s3);
  color: var(--ac);
}
.st {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 18px;
}
@media (max-width: 800px) {
  .st {
    grid-template-columns: 1fr;
  }
}
.pic {
  background: var(--s2);
  border-radius: 12px;
  padding: 8px;
}
.svg {
  width: 100%;
  display: block;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.fld {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.fld .input {
  width: 120px;
}
.warn {
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--wn) 14%, transparent);
  color: var(--tx);
  font-size: 13px;
  align-items: center;
  gap: 8px;
}
.res {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--ok) 10%, var(--s2));
}
.kv {
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
}
.kv span {
  color: var(--mu);
}
.zg {
  display: grid;
  grid-template-columns: auto repeat(4, 1fr);
  gap: 6px;
  align-items: center;
}
.zg .btn {
  font-family: var(--fm);
}
/* drawing */
.metal {
  fill: #7d848e;
}
.head {
  fill: var(--ac);
}
.block {
  fill: #9aa1ab;
  opacity: calc(1 - var(--g) * 0.85);
}
.bed {
  fill: var(--s3);
  stroke: var(--bd);
}
.paper {
  fill: #f2f0e8;
}
.big {
  font: 700 26px var(--fd);
  fill: var(--tx);
}
.mu2 {
  font: 12px var(--fd);
  fill: var(--mu);
}
.sm2 {
  font: 700 11px var(--fd);
  fill: var(--tx);
}
.lbl2 {
  font: 700 12px var(--fm);
  fill: var(--tx);
}
.spk {
  fill: none;
  stroke: #ff7a45;
  stroke-width: 2;
}
.tgl {
  stroke: var(--mu2);
  stroke-dasharray: 4 4;
}
.axis {
  stroke: var(--bd);
  stroke-width: 2;
}
.gantry {
  transition: transform 0.9s cubic-bezier(0.3, 1.4, 0.5, 1);
}
.cbar {
  fill: var(--mu2);
}
.cok {
  fill: var(--ok);
}
.pt {
  transition: r 0.3s;
  stroke: rgba(0, 0, 0, 0.35);
}
.pt.acc {
  fill: var(--ac);
}
.screw {
  fill: var(--s2);
  stroke: var(--mu2);
  stroke-width: 2;
}
.screw.base {
  stroke: var(--ok);
}
.turn {
  fill: none;
  stroke: var(--wn);
  stroke-width: 3;
  stroke-linecap: round;
}
.shake {
  animation: shake 0.09s linear infinite;
}
@keyframes shake {
  0% {
    transform: translate(0, 0);
  }
  25% {
    transform: translate(3px, -1px);
  }
  50% {
    transform: translate(-2px, 1px);
  }
  75% {
    transform: translate(2px, 1px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .shake,
  .gantry {
    animation: none;
    transition: none;
  }
}
</style>
