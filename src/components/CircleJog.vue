<script setup>
// Circle jog pad (Toolhead card, "Circle" style, as Mainsail's): X and Y around a round pad, one ring per step
// (the smallest inside), a Z strip next to it, home buttons in the corners and Home X Y in the middle. The steps
// are the card's own X/Y and Z steps from Settings > Control. It only emits; the card sends the G-code.
import { computed } from 'vue';
import { t } from '../i18n';
const props = defineProps({
  stepsXY: { type: Array, default: () => [] },
  stepsZ: { type: Array, default: () => [] },
  homed: { type: String, default: '' },
  busy: Boolean, // printing: nothing here moves or homes
  zdir: { type: Number, default: 1 },
});
const emit = defineEmits(['jog', 'home']);

const C = 38, // pad centre
  R = 36, // outer radius
  RC = 8.5, // centre button
  GAP = 1.4; // between rings
const up = (a) =>
  [...a]
    .map(Number)
    .filter((x) => x > 0)
    .sort((x, y) => x - y)
    .slice(0, 4);
const xy = computed(() => up(props.stepsXY));
const zs = computed(() => up(props.stepsZ));
const can = (a) => props.homed.includes(a.toLowerCase());
const fmt = (v) => String(+v);

const pt = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return `${(C + r * Math.cos(a)).toFixed(3)} ${(C - r * Math.sin(a)).toFixed(3)}`;
};
// one ring piece: between two radii, 43° each side of the direction
function sector(r0, r1, mid) {
  const a0 = mid - 43,
    a1 = mid + 43;
  return `M${pt(r1, a0)}A${r1} ${r1} 0 0 0 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 0 1 ${pt(r0, a0)}Z`;
}
const DIRS = [
  { axis: 'X', sign: 1, mid: 0 },
  { axis: 'Y', sign: 1, mid: 90 },
  { axis: 'X', sign: -1, mid: 180 },
  { axis: 'Y', sign: -1, mid: 270 },
];
const rings = computed(() => {
  const n = xy.value.length || 1;
  const w = (R - RC - GAP) / n;
  return xy.value.map((step, i) => {
    const r0 = RC + GAP + i * w,
      r1 = r0 + w - GAP;
    return { step, i, r0, r1, rm: (r0 + r1) / 2 };
  });
});
const pieces = computed(() =>
  DIRS.flatMap((d) =>
    rings.value.map((r) => ({
      key: d.axis + d.sign + r.i,
      d: sector(r.r0, r.r1, d.mid),
      axis: d.axis,
      dist: d.sign * r.step,
      i: r.i,
      label: `${d.axis}${d.sign > 0 ? '+' : '−'}${fmt(r.step)}`,
    })),
  ),
);
// Z strip: x 84..100, the upper half moves up (Z+ unless inverted), the lower half down, the smallest step nearest the middle
const ZX = 84,
  ZW = 16,
  ZMID = 8; // half the height of the middle label
const zbands = computed(() => {
  const n = zs.value.length || 1;
  const half = C - ZMID - 1;
  const h = half / n;
  return zs.value.flatMap((step, i) => {
    const top = C - ZMID - (i + 1) * h;
    return [
      { key: 'u' + i, y: top + 0.7, h: h - 1.4, dist: props.zdir * step, i, step, sign: '+' },
      { key: 'd' + i, y: C + ZMID + i * h + 0.7, h: h - 1.4, dist: -props.zdir * step, i, step, sign: '−' },
    ];
  });
});
const fill = (i, n) => `color-mix(in srgb, var(--tx) ${16 - (12 * i) / Math.max(1, n - 1 || 1)}%, var(--s2))`;
const CORNERS = computed(() => [
  { key: 'x', x: 0, y: 0, cmd: 'G28 X', label: 'X', homed: can('X'), tip: t('Home {axis}', { axis: 'X' }) },
  { key: 'y', x: 64, y: 0, cmd: 'G28 Y', label: 'Y', homed: can('Y'), tip: t('Home {axis}', { axis: 'Y' }) },
  { key: 'a', x: 0, y: 64, cmd: 'G28', label: '', homed: can('X') && can('Y') && can('Z'), tip: t('Home All') },
  { key: 'z', x: 64, y: 64, cmd: 'G28 Z', label: 'Z', homed: can('Z'), tip: t('Home {axis}', { axis: 'Z' }) },
]);
const key = (fn) => (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};
// the house from the icon set, scaled into a button
const HOUSE = 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z';
</script>
<template>
  <svg class="cj" viewBox="0 0 100 76" role="group" :aria-label="t('Toolhead jog pad')">
    <!-- X / Y rings -->
    <g
      v-for="p in pieces"
      :key="p.key"
      class="st"
      :class="{ off: busy || !can(p.axis) }"
      role="button"
      :tabindex="busy || !can(p.axis) ? -1 : 0"
      :aria-label="p.label"
      :aria-disabled="busy || !can(p.axis)"
      @click="!busy && can(p.axis) && emit('jog', p.axis, p.dist)"
      @keydown="key(() => !busy && can(p.axis) && emit('jog', p.axis, p.dist))($event)"
    >
      <title>{{ can(p.axis) ? p.label : t('{axis} must be homed first', { axis: p.axis }) }}</title>
      <path :d="p.d" :style="{ fill: fill(p.i, xy.length) }" />
    </g>
    <!-- step sizes along the Y+ side, as on the rings -->
    <text v-for="r in rings" :key="'t' + r.i" class="lb" :x="C" :y="C - r.rm" :class="{ dim: !can('Y') }">
      {{ fmt(r.step) }}
    </text>
    <!-- Home X Y in the middle -->
    <g
      class="hm"
      :class="{ homed: can('X') && can('Y'), off: busy }"
      role="button"
      :tabindex="busy ? -1 : 0"
      :aria-label="t('Home X Y')"
      @click="!busy && emit('home', 'G28 X Y')"
      @keydown="key(() => !busy && emit('home', 'G28 X Y'))($event)"
    >
      <title>{{ t('Home X Y') }}</title>
      <circle :cx="C" :cy="C" :r="RC" />
      <path :d="HOUSE" :transform="`translate(${C - 4.2} ${C - 4.2}) scale(0.35)`" class="ic" />
    </g>
    <!-- corner home buttons -->
    <g
      v-for="c in CORNERS"
      :key="c.key"
      class="hm"
      :class="{ homed: c.homed, off: busy }"
      role="button"
      :tabindex="busy ? -1 : 0"
      :aria-label="c.tip"
      @click="!busy && emit('home', c.cmd)"
      @keydown="key(() => !busy && emit('home', c.cmd))($event)"
    >
      <title>{{ c.tip }}</title>
      <rect :x="c.x" :y="c.y" width="12" height="12" rx="3" />
      <text v-if="c.label" class="cl" :x="c.x + 6" :y="c.y + 6.3">{{ c.label }}</text>
      <path v-else :d="HOUSE" :transform="`translate(${c.x + 2.4} ${c.y + 2.4}) scale(0.3)`" class="ic" />
    </g>
    <!-- Z strip -->
    <g
      v-for="b in zbands"
      :key="b.key"
      class="st"
      :class="{ off: busy || !can('Z') }"
      role="button"
      :tabindex="busy || !can('Z') ? -1 : 0"
      :aria-label="'Z' + (b.dist > 0 ? '+' : '−') + fmt(b.step)"
      @click="!busy && can('Z') && emit('jog', 'Z', b.dist)"
      @keydown="key(() => !busy && can('Z') && emit('jog', 'Z', b.dist))($event)"
    >
      <title>
        {{ can('Z') ? 'Z' + (b.dist > 0 ? '+' : '−') + fmt(b.step) : t('{axis} must be homed first', { axis: 'Z' }) }}
      </title>
      <rect :x="ZX" :y="b.y" :width="ZW" :height="b.h" rx="2.5" :style="{ fill: fill(b.i, zs.length) }" />
      <text class="lb" :class="{ dim: !can('Z') }" :x="ZX + ZW / 2" :y="b.y + b.h / 2">
        {{ b.sign }}{{ fmt(b.step) }}
      </text>
    </g>
    <text class="dir z" :x="ZX + ZW / 2" :y="C">Z</text>
  </svg>
</template>
<style scoped>
.cj {
  display: block;
  height: 100%;
  max-width: 100%;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.st,
.hm {
  cursor: pointer;
  outline: none;
}
.st path,
.st rect {
  transition: fill 0.1s;
}
.st:hover path,
.st:hover rect,
.st:focus-visible path,
.st:focus-visible rect {
  fill: color-mix(in srgb, var(--tx) 26%, var(--s2)) !important;
}
.st:active path,
.st:active rect {
  fill: color-mix(in srgb, var(--ac) 45%, var(--s2)) !important;
}
.st.off {
  cursor: default;
  pointer-events: none;
  opacity: 0.45;
}
.lb {
  font: 600 3.4px var(--fd);
  fill: var(--tx);
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}
.lb.dim {
  opacity: 0.5;
}
.dir {
  font: 600 3.4px var(--fd);
  fill: var(--mu);
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
}
.hm rect,
.hm circle {
  fill: color-mix(in srgb, var(--wn) 22%, var(--s2));
  transition: fill 0.1s;
}
.hm .cl {
  font: 600 5px var(--fd);
  fill: var(--wn);
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
}
.hm .ic {
  fill: none;
  stroke: var(--wn);
  stroke-width: 2.6;
  stroke-linejoin: round;
  pointer-events: none;
}
.hm.homed rect,
.hm.homed circle {
  fill: var(--s3);
}
.hm.homed .cl {
  fill: var(--tx);
}
.hm.homed .ic {
  stroke: var(--tx);
}
.hm:hover rect,
.hm:hover circle,
.hm:focus-visible rect,
.hm:focus-visible circle {
  fill: color-mix(in srgb, var(--tx) 22%, var(--s2));
}
.hm.off {
  pointer-events: none;
  opacity: 0.45;
}
</style>
