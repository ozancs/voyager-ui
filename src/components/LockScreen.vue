<script setup>
// The screen shown while the controls are locked (lock.js): the printer at a glance for a tablet next to it. The
// camera picked in Customize fills the background (grey or in colour; or two or four cameras, or several taking turns), the cards float over it on both sides (the heaters and
// the graph on the left, the other sensors on the right, evened out), the print sits in a bar along the bottom.
// Everything is drawn large to be read from across the room, and Customize has a size of its own. Only Unlock
// (with the PIN pad when a PIN is set), E-STOP and Customize. Read only: nothing here sends G-code.
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import Icon from './Icon.vue';
import WebcamView from './WebcamView.vue';
import SensorIcon from './SensorIcon.vue';
import {
  state,
  S,
  hist,
  tempSensors,
  prettyName,
  printerName,
  printState,
  progress,
  printTimes,
  layerInfo,
  fmtTime,
  toast,
  devices,
} from '../store';
import { sortSensors, sensorColor } from '../sensorStyle';
import { unlockUi, lockHasPin } from '../lock';
import { api } from '../api/moonraker';
import { t } from '../i18n';

// ---------------------------------------------------------------- what shows (Customize, kept in settings)
const conf = computed(() => state.settings.lockScreen || { cam: true, show: {} });
const SCALES = [0.8, 1, 1.25, 1.5, 1.75];
const scale = computed(() => conf.value.scale || 1);
const hiddenTemps = computed(() => state.settings.hiddenSensors || []);
// a card shows when Customize says so; until then the sensors follow the Temperatures card, graph on, rest off
const shown = (key, def) => conf.value.show?.[key] ?? def;
function toggle(key, def) {
  conf.value.show = { ...(conf.value.show || {}), [key]: !shown(key, def) };
}
const sensorList = computed(() => sortSensors(tempSensors.value, state.settings.sensorOrder));
const fanList = computed(() => devices.value.filter((d) => d.kind === 'fan'));
const items = computed(() => [
  ...sensorList.value.map((n, i) => ({
    key: 's:' + n,
    kind: 'sensor',
    name: n,
    i,
    label: prettyName(n),
    def: !hiddenTemps.value.includes(n),
  })),
  { key: 'graph', kind: 'graph', label: t('Temperature graph'), def: true },
  { key: 'fans', kind: 'fans', label: t('Fans'), def: false },
  { key: 'speed', kind: 'speed', label: t('Speed and flow'), def: false },
]);
const cards = computed(() => items.value.filter((x) => shown(x.key, x.def)));
// two sides around the camera: the heaters and their graph on the left, everything else on the right; then the
// longer side hands its last cards over until both are about as tall (the graph and the fan list count double)
// the cards shrink together when a side is too long for the height (many sensors, a large size): one column per
// side always, so the camera in the middle stays free
const mid = ref(null);
const fitK = ref(1);
function fit() {
  const el = mid.value;
  if (!el || matchMedia('(max-width: 640px)').matches) return (fitK.value = 1);
  let r = Infinity;
  for (const sd of el.children) if (sd.scrollHeight) r = Math.min(r, sd.clientHeight / sd.scrollHeight);
  if (!isFinite(r)) return;
  const k = Math.max(0.4, Math.min(1, fitK.value * r * (r < 1 ? 0.99 : 1)));
  if (Math.abs(k - fitK.value) > 0.005) {
    fitK.value = k;
    nextTick(() => requestAnimationFrame(fit)); // the cards rearrange after a change: measure once more
  }
}
let ro;
onMounted(() => {
  ro = new ResizeObserver(() => requestAnimationFrame(fit));
  if (mid.value) ro.observe(mid.value);
});
onBeforeUnmount(() => ro?.disconnect());
const sides = computed(() => {
  const heaters = new Set(S('heaters').available_heaters || []);
  const L = [],
    R = [];
  for (const c of cards.value) (c.kind === 'graph' || (c.kind === 'sensor' && heaters.has(c.name)) ? L : R).push(c);
  const h = (a) => a.reduce((n, x) => n + (x.kind === 'graph' || x.kind === 'fans' ? 2 : 1), 0);
  while (h(R) - h(L) > 1 && R.length > 1) L.push(R.pop());
  while (h(L) - h(R) > 1 && L.length > 1) R.unshift(L.pop());
  return { L, R };
});
watch([sides, scale], () => nextTick(() => requestAnimationFrame(fit)), { deep: true });
const cust = ref(false);

// ---------------------------------------------------------------- camera
// camName: a camera picked in Customize, '' for the first one; cam false: no camera
const cams = computed(() => state.webcams.filter((w) => w.enabled !== false));
const cam = computed(() =>
  conf.value.cam === false ? null : cams.value.find((w) => w.name === conf.value.camName) || cams.value[0] || null,
);
// several cameras: side by side, 2 x 2, or one at a time switching every few seconds (one stream at a time, so a
// slow tablet copes with any number). camList: the cameras picked for these, in camera order; empty means all.
const LAYOUTS = [
  ['one', 'Single'],
  ['two', 'Side by side'],
  ['four', '2 × 2'],
  ['cycle', 'One at a time'],
];
const CYCLE = [5, 10, 20, 30];
const layout = computed(() => (cams.value.length > 1 ? conf.value.camLayout || 'one' : 'one'));
const picked = computed(() => {
  const l = conf.value.camList || [];
  const list = cams.value.filter((w) => l.includes(w.name));
  return list.length ? list : cams.value;
});
function pickCam(name) {
  const l = new Set(picked.value.map((w) => w.name));
  l.has(name) ? l.delete(name) : l.add(name);
  if (l.size) conf.value.camList = cams.value.filter((w) => l.has(w.name)).map((w) => w.name);
}
const cycleI = ref(0);
let cycleTm;
watch(
  [layout, () => conf.value.cycleSec],
  () => {
    clearInterval(cycleTm);
    if (layout.value === 'cycle') cycleTm = setInterval(() => cycleI.value++, (conf.value.cycleSec || 10) * 1000);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearInterval(cycleTm));
const shownCams = computed(() => {
  if (conf.value.cam === false || !cams.value.length) return [];
  if (layout.value === 'two') return picked.value.slice(0, 2);
  if (layout.value === 'four') return picked.value.slice(0, 4);
  if (layout.value === 'cycle') return [picked.value[cycleI.value % picked.value.length]];
  return cam.value ? [cam.value] : [];
});
const camOn = computed(() => shownCams.value.length > 0);
const camPick = computed({
  get: () => (conf.value.cam === false ? '\u0000' : conf.value.camName || ''),
  set: (v) => {
    conf.value.cam = v !== '\u0000';
    conf.value.camName = v === '\u0000' ? '' : v;
  },
});

// ---------------------------------------------------------------- values
const temp = (n) => S(n).temperature;
const target = (n) => S(n).target;
const col = (n, i) => sensorColor(state.settings.sensorColors, n, i);
const active = computed(() => ['printing', 'paused'].includes(printState.value));
const file = computed(() => (S('print_stats').filename || '').split('/').pop());
const eta = computed(() =>
  printTimes.value.eta
    ? printTimes.value.eta.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '--:--',
);
const pos = computed(() => S('gcode_move').gcode_position || S('toolhead').position || []);
const homed = computed(() => S('toolhead').homed_axes || '');
const stateText = computed(() => {
  if (!state.connected) return t('Not connected');
  if (state.klippy !== 'ready') return t('Klipper {state}', { state: state.klippy });
  return t(printState.value);
});
const clock = ref('');
const tick = () => (clock.value = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
let clk;
onMounted(() => {
  tick();
  clk = setInterval(tick, 15000);
});
onBeforeUnmount(() => clearInterval(clk));

// ---------------------------------------------------------------- the small graph: last 10 minutes
// heaters only (hotend, bed, chamber): with 40° boards on the same scale their curves would be flat lines
const W = 196,
  H = 70;
const graph = computed(() => {
  void state.histTick;
  const heaters = new Set(S('heaters').available_heaters || []);
  const list = sensorList.value
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => heaters.has(n) && shown('s:' + n, !hiddenTemps.value.includes(n)) && hist[n]?.t?.length);
  const span = 600;
  const lines = list.map(({ n, i }) => ({ n, c: col(n, i), v: hist[n].t.slice(-span) }));
  const all = lines.flatMap((l) => l.v).filter((x) => x != null);
  if (!all.length) return [];
  const lo = Math.min(...all) - 2,
    hi = Math.max(...all) + 2;
  return lines.map((l) => ({
    ...l,
    d: l.v
      .map(
        (y, k) =>
          `${k ? 'L' : 'M'}${((k + span - l.v.length) / (span - 1)) * W},${H - ((y - lo) / (hi - lo || 1)) * H}`,
      )
      .join(''),
  }));
});

// ---------------------------------------------------------------- unlock and E-STOP
const pinOpen = ref(false);
const pin = ref('');
const wrong = ref(false);
async function startUnlock() {
  if (!lockHasPin()) return unlockUi('');
  pin.value = '';
  wrong.value = false;
  pinOpen.value = true;
  await nextTick();
  document.querySelector('.ls .pinin')?.focus();
}
function key(d) {
  wrong.value = false;
  if (d === 'del') pin.value = pin.value.slice(0, -1);
  else if (pin.value.length < 12) pin.value += d;
}
async function tryPin() {
  if (await unlockUi(pin.value)) return;
  wrong.value = true;
  pin.value = '';
}
async function estop() {
  try {
    await api.call('printer.emergency_stop');
  } catch (e) {
    toast(e.message, 'error');
  }
}
</script>

<template>
  <div class="ls" role="dialog" :aria-label="t('Locked')">
    <div class="bg" :class="['g' + shownCams.length, { cam: camOn, color: conf.camColor }]">
      <TransitionGroup name="cf">
        <div v-for="w in shownCams" :key="w.name" class="tile">
          <WebcamView :cam="w" :overlay="false" class="wv" />
        </div>
      </TransitionGroup>
    </div>
    <div class="shade"></div>

    <div class="ui" :style="{ zoom: scale }">
      <div class="top">
        <!-- E-STOP on the far left, Unlock on the far right: a tap meant for one never lands on the other -->
        <button class="estop" @click="estop">{{ t('E-STOP') }}</button>
        <span v-if="camOn" class="live">LIVE</span>
        <Icon name="lock" :size="16" class="mu" />
        <b class="pn">{{ printerName }}</b>
        <span class="mu">{{ clock }}</span>
        <span class="mu st">· {{ stateText }}</span>
        <span class="grow"></span>
        <button
          class="gbtn ib"
          :class="{ on: cust }"
          :aria-label="t('Customize')"
          :data-tip="t('Customize')"
          @click="cust = !cust"
        >
          <Icon name="customize" :size="18" />
        </button>
        <button class="gbtn" @click="startUnlock"><Icon name="unlock" :size="16" />{{ t('Unlock') }}</button>
      </div>

      <!-- cards on both sides, one column each; they shrink together when a side is too long -->
      <div ref="mid" class="mid" :style="{ zoom: fitK }">
        <div v-for="sd in ['L', 'R']" :key="sd" class="side" :class="sd">
          <template v-for="c in sides[sd]" :key="c.key">
            <div v-if="c.kind === 'sensor'" class="glass card">
              <span class="lbl"
                ><SensorIcon :name="c.name" :color="col(c.name, c.i)" :size="14" class="si" />{{ c.label }}</span
              >
              <b class="mono v"
                >{{ temp(c.name) != null ? temp(c.name).toFixed(1) + '°' : '--'
                }}<small v-if="target(c.name) > 0"> / {{ Math.round(target(c.name)) }}</small></b
              >
            </div>
            <div v-else-if="c.kind === 'graph'" class="glass card gr">
              <span class="lbl">{{ t('Last 10 minutes') }}</span>
              <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="gsvg">
                <path v-for="l in graph" :key="l.n" :d="l.d" :stroke="l.c" fill="none" stroke-width="1.6" />
              </svg>
            </div>
            <div v-else-if="c.kind === 'fans'" class="glass card">
              <span class="lbl">{{ t('Fans') }}</span>
              <div v-for="f in fanList" :key="f.id" class="fr">
                <span>{{ prettyName(f.id) }}</span
                ><b class="mono">{{ Math.round((S(f.id).speed || 0) * 100) }}%</b>
              </div>
            </div>
            <div v-else-if="c.kind === 'speed'" class="glass card">
              <span class="lbl">{{ t('Speed and flow') }}</span>
              <div class="fr">
                <span>{{ t('Speed') }}</span
                ><b class="mono">{{ Math.round((S('gcode_move').speed_factor ?? 1) * 100) }}%</b>
              </div>
              <div class="fr">
                <span>{{ t('Flow') }}</span
                ><b class="mono">{{ Math.round((S('gcode_move').extrude_factor ?? 1) * 100) }}%</b>
              </div>
            </div>
          </template>
        </div>
      </div>

      <div class="glass bottom" :class="{ idle: !active }">
        <template v-if="active">
          <b class="pct">{{ Math.floor(progress * 100) }}%</b>
          <div class="job">
            <span class="fn"
              >{{ file }}<em v-if="printState === 'paused'" class="ps">{{ t('Paused') }}</em></span
            >
            <div class="bar"><i :style="{ width: progress * 100 + '%' }"></i></div>
            <div class="meta mono">
              <span>{{ t('Layer {cur}/{total}', { cur: layerInfo.cur, total: layerInfo.total || '--' }) }}</span
              ><span>{{ t('Left {time}', { time: fmtTime(printTimes.left) }) }}</span
              ><span>{{ t('ETA {time}', { time: eta }) }}</span>
            </div>
          </div>
        </template>
        <div v-else class="job">
          <b class="idt">{{ stateText }}</b>
          <span class="mu sm">{{ homed ? t('Homed: {axes}', { axes: homed.toUpperCase() }) : t('Not homed') }}</span>
        </div>
        <div class="xyz mono">
          <span>X</span>{{ pos[0] != null ? pos[0].toFixed(1) : '--' }} <span>Y</span
          >{{ pos[1] != null ? pos[1].toFixed(1) : '--' }} <span>Z</span>{{ pos[2] != null ? pos[2].toFixed(2) : '--' }}
        </div>
      </div>
    </div>

    <!-- Customize: which cards show here -->
    <div v-if="cust" class="glass cust">
      <div class="ch">
        <b>{{ t('Lock screen') }}</b
        ><button class="gbtn ib sm" :aria-label="t('Close')" @click="cust = false"><Icon name="x" :size="15" /></button>
      </div>
      <span class="sec">{{ t('Camera in the background') }}</span>
      <select v-model="camPick" class="sel" :aria-label="t('Camera in the background')">
        <option v-for="w in cams" :key="w.name" :value="w.name === cams[0]?.name ? '' : w.name">{{ w.name }}</option>
        <option value="\u0000">{{ t('None') }}</option>
      </select>
      <template v-if="cams.length > 1 && conf.cam !== false">
        <span class="sec">{{ t('Cameras') }}</span>
        <div class="seg two">
          <button v-for="[k, n] in LAYOUTS" :key="k" :class="{ on: layout === k }" @click="conf.camLayout = k">
            {{ t(n) }}
          </button>
        </div>
        <template v-if="layout !== 'one'">
          <label v-for="w in cams" :key="w.name" class="opt"
            ><input
              type="checkbox"
              class="cb"
              :checked="picked.some((x) => x.name === w.name)"
              @change="pickCam(w.name)"
            /><span>{{ w.name }}</span></label
          >
        </template>
        <template v-if="layout === 'cycle'">
          <span class="sec">{{ t('Switch every') }}</span>
          <div class="seg">
            <button v-for="k in CYCLE" :key="k" :class="{ on: (conf.cycleSec || 10) === k }" @click="conf.cycleSec = k">
              {{ k }} s
            </button>
          </div>
        </template>
      </template>
      <template v-if="conf.cam !== false && cams.length">
        <span class="sec">{{ t('Picture') }}</span>
        <div class="seg">
          <button :class="{ on: !conf.camColor }" @click="conf.camColor = false">{{ t('Grey') }}</button>
          <button :class="{ on: !!conf.camColor }" @click="conf.camColor = true">{{ t('Colour') }}</button>
        </div>
      </template>
      <span class="sec">{{ t('Size') }}</span>
      <div class="seg">
        <button v-for="k in SCALES" :key="k" :class="{ on: scale === k }" @click="conf.scale = k">
          {{ Math.round(k * 100) }}%
        </button>
      </div>
      <span class="sec">{{ t('Cards') }}</span>
      <label v-for="x in items" :key="x.key" class="opt"
        ><input type="checkbox" class="cb" :checked="shown(x.key, x.def)" @change="toggle(x.key, x.def)" /><span>{{
          x.label
        }}</span></label
      >
    </div>

    <!-- PIN pad -->
    <div v-if="pinOpen" class="pinov" @click.self="pinOpen = false">
      <div class="glass pad" :class="{ shake: wrong }">
        <b>{{ t('Enter the PIN to unlock.') }}</b>
        <input
          v-model="pin"
          class="pinin mono"
          type="password"
          inputmode="numeric"
          autocomplete="off"
          maxlength="12"
          :aria-label="t('PIN')"
          @keydown.enter="tryPin"
          @keydown.esc="pinOpen = false"
        />
        <span class="wr">{{ wrong ? t('Wrong PIN') : '' }}</span>
        <div class="keys">
          <button v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']" :key="d" class="k" @click="key(d)">
            {{ d }}
          </button>
          <button class="k" :aria-label="t('Delete')" @click="key('del')"><Icon name="left" :size="18" /></button
          ><button class="k" @click="key('0')">0</button
          ><button class="k ok" :aria-label="t('Unlock')" @click="tryPin"><Icon name="check" :size="20" /></button>
        </div>
        <button class="gbtn" style="align-self: center" @click="pinOpen = false">{{ t('Cancel') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* its own calm grey look whatever the theme: it sits on a camera picture */
.ls {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: #18191b;
  color: #e6e6e4;
  font-family: var(--fd);
  overflow: hidden;
}
.mu {
  color: #9a9ca1;
}
.sm {
  font-size: 13px;
}
.grow {
  flex: 1;
}
.bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, #2b2c30 0%, #1d1e21 60%, #141517 100%);
}
.bg.cam {
  display: grid;
  gap: 2px;
  background: #0d0e10;
}
.bg.g2 {
  grid-template-columns: 1fr 1fr;
}
.bg.g3,
.bg.g4 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}
@media (orientation: portrait) {
  .bg.g2 {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }
}
.tile {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.bg.g1 .tile {
  position: absolute;
  inset: 0;
}
.bg.cam .wv {
  position: absolute;
  inset: 0;
  border-radius: 0;
  filter: grayscale(1) brightness(0.85);
}
.bg.cam.color .wv {
  filter: brightness(0.9);
}
/* one at a time: the next camera fades in over the last */
.cf-enter-active,
.cf-leave-active {
  transition: opacity 0.8s ease;
}
.cf-enter-from,
.cf-leave-to {
  opacity: 0;
}
.bg.cam :deep(img),
.bg.cam :deep(video) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(15, 16, 18, 0.6), rgba(15, 16, 18, 0.15) 35%, rgba(15, 16, 18, 0.82));
}
.ui {
  position: absolute;
  inset: 0;
  padding: max(16px, env(safe-area-inset-top)) 18px max(16px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.top {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pn {
  font-size: 21px;
}
.live {
  font: 600 12px var(--fd);
  letter-spacing: 0.08em;
  padding: 5px 9px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: #cfd0d2;
}
.glass {
  background: rgba(30, 31, 34, 0.62);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
}
.gbtn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 18px;
  border-radius: 24px;
  background: rgba(30, 31, 34, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e6e6e4;
  font: 600 16px var(--fd);
  cursor: pointer;
}
.gbtn.ib {
  width: 48px;
  padding: 0;
  justify-content: center;
}
.gbtn.sm {
  width: 30px;
  height: 30px;
}
.gbtn.on {
  border-color: rgba(255, 255, 255, 0.35);
}
.estop {
  height: 48px;
  padding: 0 20px;
  border-radius: 24px;
  border: 0;
  background: #5a2a2a;
  color: #f2c2c2;
  font: 600 15px var(--fd);
  letter-spacing: 0.04em;
  cursor: pointer;
}
/* column-wise from the right: direction rtl puts the first column on the right, wrapping adds columns leftwards */
.mid {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  min-height: 0;
}
.side.R {
  margin-left: auto;
}
.card {
  direction: ltr;
  width: 260px;
  padding: 13px 18px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lbl {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #9a9ca1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.si {
  filter: saturate(0.45);
}
.v {
  font-size: 32px;
  font-weight: 600;
}
.v small {
  font-size: 16px;
  color: #6f7177;
  font-weight: 500;
}
.gsvg {
  width: 100%;
  height: 90px;
  margin-top: 6px;
  opacity: 0.85;
  filter: saturate(0.5);
}
.fr {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 15px;
  padding: 3px 0;
}
.fr span {
  color: #b9bbc0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bottom {
  padding: 16px 24px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 20px;
  align-items: center;
}
.bottom.idle {
  grid-template-columns: 1fr auto;
}
.pct {
  font: 600 64px/1 var(--fd);
}
.job {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.fn {
  font-size: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ps {
  font-style: normal;
  font-weight: 600;
  font-size: 12px;
  color: #e3c27a;
  margin-left: 10px;
}
.idt {
  font-size: 26px;
  text-transform: capitalize;
}
.bar {
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: color-mix(in srgb, var(--ac) 70%, #9a9ca1);
  border-radius: 3px;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  font-size: 15px;
  color: #9a9ca1;
}
.xyz {
  font-size: 19px;
  font-weight: 600;
  white-space: nowrap;
}
.xyz span {
  color: #9a9ca1;
  margin-left: 12px;
  margin-right: 5px;
}
.cust {
  position: absolute;
  top: 70px;
  right: 18px;
  width: 300px;
  max-height: calc(100% - 90px);
  overflow: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 2;
  background: rgba(28, 29, 32, 0.92);
}
.ch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.sec {
  margin-top: 10px;
  font-size: 12px;
  color: #6f7177;
}
.sel {
  height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.3);
  color: #e6e6e4;
  padding: 0 10px;
  font: 500 14px var(--fd);
}
.seg {
  display: flex;
  gap: 4px;
}
.seg.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.seg button {
  flex: 1;
  min-width: 0;
  padding: 0;
  height: 34px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: #c9cbcf;
  font: 600 12px var(--fd);
  cursor: pointer;
}
.seg button.on {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}
.opt {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  font-size: 14px;
  cursor: pointer;
}
.pinov {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 12, 0.55);
}
.pad {
  width: 300px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: center;
  background: rgba(28, 29, 32, 0.92);
}
.pinin {
  height: 46px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.3);
  color: #e6e6e4;
  font-size: 22px;
  text-align: center;
  letter-spacing: 0.3em;
}
.wr {
  min-height: 18px;
  font-size: 13px;
  color: #f0a3a3;
}
.keys {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.k {
  height: 54px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.06);
  color: #e6e6e4;
  font: 600 22px var(--fd);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.k:active {
  background: rgba(255, 255, 255, 0.14);
}
.k.ok {
  background: color-mix(in srgb, var(--ac) 45%, #2a2b2f);
}
.shake {
  animation: shake 0.35s;
}
@keyframes shake {
  25% {
    transform: translateX(-8px);
  }
  50% {
    transform: translateX(8px);
  }
  75% {
    transform: translateX(-4px);
  }
}
@media (max-width: 640px) {
  .bottom {
    grid-template-columns: auto 1fr;
  }
  .xyz {
    grid-column: 1 / -1;
  }
  .mid {
    flex-direction: column;
    overflow: auto;
    gap: 10px;
  }
  .side,
  .side.R {
    flex: none;
    direction: ltr;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: flex-start;
    margin-left: 0;
    gap: 10px;
    overflow: visible;
  }
  .card {
    width: calc(50% - 5px);
  }
  .v {
    font-size: 24px;
  }
  .pct {
    font-size: 48px;
  }
}
</style>
