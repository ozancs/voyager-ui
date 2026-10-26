<script setup>
// Colour picker for a Klipper LED (neopixel, dotstar, led, pca95xx): a wheel for hue and saturation, a brightness
// slider and the red / green / blue (and white, when the LED has a white channel) values as numbers 0-255, the way
// Mainsail shows them. While dragging the colour goes out at most a few times a second, the last one always.
// The picker keeps its own values while it is being used and takes the printer's back a moment after.
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue';
import { S } from '../store';
import { t } from '../i18n';
const props = defineProps({ id: String });
const emit = defineEmits(['set']);

const hasWhite = computed(() => {
  const c = S('configfile').settings?.[props.id.toLowerCase()];
  return /w/i.test(String(c?.color_order || '')) || !!c?.white_pin;
});

// what the printer has, 0-255
const fromPrinter = () => {
  const [r = 0, g = 0, b = 0, w = 0] = S(props.id).color_data?.[0] || [];
  return [r, g, b, w].map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255));
};
const rgbw = reactive({ r: 0, g: 0, b: 0, w: 0 });
const hsv = reactive({ h: 0, s: 0, v: 1 });

function toHsv(r, g, b) {
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = hsv.h; // grey and black have no hue: keep the one the wheel had
  if (d) {
    if (mx === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  hsv.h = h;
  if (mx) hsv.s = d / mx; // black keeps the saturation it had
  hsv.v = mx / 255;
}
function fromHsv() {
  const { h, s, v } = hsv;
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  rgbw.r = f(5);
  rgbw.g = f(3);
  rgbw.b = f(1);
}

let edited = 0;
function sync() {
  const [r, g, b, w] = fromPrinter();
  Object.assign(rgbw, { r, g, b, w });
  toHsv(r, g, b);
}
sync();
watch(
  () => S(props.id).color_data?.[0],
  () => {
    if (Date.now() - edited > 1500) sync();
  },
  { deep: true },
);

// at most one command every 250 ms while dragging, and always the last value
let tm = null,
  dirty = false;
function send() {
  dirty = false;
  const c = [rgbw.r, rgbw.g, rgbw.b].map((x) => x / 255);
  emit('set', c, hasWhite.value ? rgbw.w / 255 : null);
}
function push() {
  edited = Date.now();
  if (tm) return void (dirty = true);
  send();
  tm = setTimeout(function next() {
    if (dirty) {
      send();
      tm = setTimeout(next, 250);
    } else tm = null;
  }, 250);
}
onBeforeUnmount(() => {
  if (tm) clearTimeout(tm);
  if (dirty) send();
});

// the wheel: hue goes round clockwise from the top (red), saturation grows from the white middle to the rim
const wheel = ref(null);
const dragging = ref(false);
function pick(e) {
  const r = wheel.value.getBoundingClientRect();
  const R = r.width / 2;
  const dx = e.clientX - (r.left + R),
    dy = e.clientY - (r.top + R);
  hsv.h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  hsv.s = Math.min(1, Math.hypot(dx, dy) / R);
  if (hsv.v < 0.05) hsv.v = 1; // picking a colour on a dark LED should light it
  fromHsv();
  push();
}
function down(e) {
  dragging.value = true;
  e.currentTarget.setPointerCapture?.(e.pointerId);
  pick(e);
}
const move = (e) => dragging.value && pick(e);
const up = () => (dragging.value = false);
const dot = computed(() => {
  const a = (hsv.h * Math.PI) / 180;
  return { left: 50 + Math.sin(a) * hsv.s * 50 + '%', top: 50 - Math.cos(a) * hsv.s * 50 + '%' };
});
const hex = computed(() => '#' + [rgbw.r, rgbw.g, rgbw.b].map((x) => x.toString(16).padStart(2, '0')).join(''));
const pure = computed(() => {
  const s = { ...hsv };
  const f = (n) => {
    const k = (n + s.h / 60) % 6;
    return Math.round((1 - s.s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return `rgb(${f(5)},${f(3)},${f(1)})`;
});

function bright(e) {
  hsv.v = Number(e.target.value) / 100;
  fromHsv();
  push();
}
function field(k, e) {
  const n = Math.round(Number(e.target.value));
  rgbw[k] = Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : 0;
  e.target.value = rgbw[k];
  if (k !== 'w') toHsv(rgbw.r, rgbw.g, rgbw.b);
  push();
}
const FIELDS = computed(() => [
  ['r', t('Red')],
  ['g', t('Green')],
  ['b', t('Blue')],
  ...(hasWhite.value ? [['w', t('White')]] : []),
]);
</script>
<template>
  <div class="lp">
    <div
      ref="wheel"
      class="wheel"
      :style="{ '--v': 0.25 + hsv.v * 0.75 }"
      role="slider"
      :aria-label="t('Color')"
      :aria-valuenow="Math.round(hsv.h)"
      @pointerdown.prevent="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    >
      <span class="dot" :style="{ ...dot, background: pure }"></span>
    </div>
    <label class="br">
      <span class="lbl">{{ t('Brightness') }}</span>
      <span class="mono bv">{{ Math.round(hsv.v * 100) }}%</span>
      <input
        class="rng"
        type="range"
        min="0"
        max="100"
        :value="Math.round(hsv.v * 100)"
        :style="{ '--f': hsv.v }"
        :aria-label="t('Brightness')"
        @input="bright"
      />
    </label>
    <div class="fl" :class="{ four: hasWhite }">
      <label v-for="[k, name] in FIELDS" :key="k" class="f">
        <span class="lbl">{{ name }}</span>
        <input
          class="input mono"
          type="number"
          min="0"
          max="255"
          step="1"
          inputmode="numeric"
          :value="rgbw[k]"
          @change="field(k, $event)"
          @keydown.enter="field(k, $event)"
        />
      </label>
    </div>
    <span class="hx mono">{{ hex.toUpperCase() }}</span>
  </div>
</template>
<style scoped>
.lp {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wheel {
  position: relative;
  width: min(190px, 100%);
  aspect-ratio: 1;
  align-self: center;
  touch-action: none;
  cursor: crosshair;
}
/* the wheel dims with the brightness, the marker on it does not */
.wheel::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle closest-side, #fff, rgba(255, 255, 255, 0)),
    conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
  filter: brightness(var(--v));
}
.dot {
  position: absolute;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.5),
    0 2px 6px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}
.br {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px;
  align-items: center;
}
.br .rng {
  grid-column: 1 / -1;
  width: 100%;
}
.bv {
  font-size: 12px;
  color: var(--mu);
}
.fl {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.fl.four {
  grid-template-columns: repeat(4, 1fr);
}
.f {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.f .input {
  width: 100%;
  min-width: 0;
  text-align: center;
  padding-left: 4px;
  padding-right: 4px;
}
.hx {
  font-size: 12px;
  color: var(--mu);
  text-align: center;
}
</style>
