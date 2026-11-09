<script setup>
// Toolhead card: position (type a value to move), jog buttons per axis with the configured steps,
// homing, Z tilt / QGL and motors off. Z offset baby steps are in the Live Z card.
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import CircleJog from './CircleJog.vue';
import ToolheadStyle from './ToolheadStyle.vue';
import { state, S, gcode, isPrinting, toast } from '../store';
import { t } from '../i18n';
const th = computed(() => S('toolhead'));
const gm = computed(() => S('gcode_move'));
const homed = computed(() => th.value.homed_axes || '');
const pos = computed(() => gm.value.gcode_position || th.value.position || [0, 0, 0, 0]);
const can = (a) => homed.value.includes(a.toLowerCase());
// gantry levelling depends on the printer: QGL on a Voron 2.4, Z tilt on a Trident, nothing on a single Z
const level = computed(() => {
  const o = state.objects;
  if (o.includes('quad_gantry_level'))
    return { cmd: 'QUAD_GANTRY_LEVEL', label: 'QGL', applied: S('quad_gantry_level').applied };
  if (o.includes('z_tilt_ng')) return { cmd: 'Z_TILT_ADJUST', label: 'Z Tilt', applied: S('z_tilt_ng').applied };
  if (o.includes('z_tilt')) return { cmd: 'Z_TILT_ADJUST', label: 'Z Tilt', applied: S('z_tilt').applied };
  return null;
});
// step and speed presets come from Settings > Control (shared with Mainsail / Fluidd)
const ctl = computed(() => state.settings.control || {});
const desc = (a) =>
  [...(a || [])]
    .map(Number)
    .filter((x) => x > 0)
    .sort((x, y) => y - x);
const AX = computed(() => [
  { a: 'X', steps: desc(ctl.value.stepsXY) },
  { a: 'Y', steps: desc(ctl.value.stepsXY) },
  { a: 'Z', steps: desc(ctl.value.stepsZ) },
]);
const dpadSteps = computed(() => desc(ctl.value.dpad));
const feedOf = (axis) => Math.max(1, Math.round((axis === 'Z' ? ctl.value.feedZ || 25 : ctl.value.feedXY || 100) * 60));
function jog(axis, d) {
  const i = 'XYZ'.indexOf(axis);
  const cur = th.value.position?.[i] ?? 0;
  const lo = th.value.axis_minimum?.[i] ?? -Infinity,
    hi = th.value.axis_maximum?.[i] ?? Infinity;
  const target = Math.min(hi, Math.max(lo, cur + d));
  const dd = Math.round((target - cur) * 1000) / 1000;
  if (!dd) {
    toast(t('{axis} is at its limit', { axis }));
    return;
  }
  gcode(`SAVE_GCODE_STATE NAME=_ui_jog\nG91\nG1 ${axis}${dd} F${feedOf(axis)}\nRESTORE_GCODE_STATE NAME=_ui_jog`).catch(
    () => {},
  );
}
// editable position fields: keep showing the current value while editing
const edit = ref({});
function onFocus(a, i, e) {
  edit.value[a] = (pos.value[i] ?? 0).toFixed(a === 'Z' ? 3 : 2);
  requestAnimationFrame(() => e.target.select());
}
function moveTo(axis, e) {
  const v = parseFloat(String(e.target.value).replace(',', '.'));
  edit.value[axis] = undefined;
  e.target.blur();
  if (isNaN(v)) return;
  const i = 'XYZ'.indexOf(axis);
  const lo = th.value.axis_minimum?.[i],
    hi = th.value.axis_maximum?.[i];
  if ((lo != null && v < lo) || (hi != null && v > hi)) {
    toast(t('{axis}{v} is outside {lo}..{hi}', { axis, v, lo: String(lo), hi: String(hi) }), 'error');
    return;
  }
  gcode(
    `SAVE_GCODE_STATE NAME=_ui_move\nG90\nG1 ${axis}${v} F${feedOf(axis)}\nRESTORE_GCODE_STATE NAME=_ui_move`,
  ).catch(() => {});
}
const speed = computed(() => Math.round((gm.value.speed_factor ?? 1) * 100));
const flow = computed(() => Math.round((gm.value.extrude_factor ?? 1) * 100));
function setSpeed(v) {
  v = Math.max(1, Math.min(500, Math.round(v)));
  gcode(`M220 S${v}`);
}
function setFlow(v) {
  v = Math.max(1, Math.min(300, Math.round(v)));
  gcode(`M221 S${v}`);
}
const dstep = ref(dpadSteps.value.includes(10) ? 10 : dpadSteps.value[Math.floor(dpadSteps.value.length / 2)] || 10);
const zdir = computed(() => (state.settings.invertZ ? -1 : 1));
// jog style: the round pad (default, as Mainsail's circle) or rows of buttons; Settings > Control has the same choice
const circle = computed(() => state.settings.toolheadStyle !== 'buttons');
// Measure both button arrangements in unscaled logical pixels. Pick the one that
// keeps controls largest, then fit width AND height using a single stable scale.
const root = ref(null);
const viewport = ref(null);
const body = ref(null);
let ro, frame;
function scheduleFit() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(fitMotion);
}
function fitMotion() {
  const el = body.value,
    host = viewport.value;
  if (!el || !host) return;
  if (!root.value.closest('.vgl-item')) {
    el.style.cssText = '';
    el.classList.toggle('stack', !circle.value && host.clientWidth < 900);
    return;
  }
  const w = host.clientWidth,
    h = host.clientHeight;
  if (!w || !h) return;
  const steps = Math.max(1, ...AX.value.map((r) => r.steps.length));
  const jogWidth = steps * 2 * 36 + 52 + steps * 2 * 4;
  const candidates = circle.value ? ['circle'] : ['row', 'stack'];
  let best;
  for (const kind of candidates) {
    el.classList.toggle('stack', kind === 'stack');
    const minW = kind === 'row' ? jogWidth + 190 + 148 + 44 + 52 + 56 : Math.max(320, jogWidth);
    const width = Math.max(w, circle.value ? 300 : minW);
    el.style.cssText = `zoom:1;width:${width}px;`;
    if (circle.value) el.style.height = Math.max(260, h) + 'px';
    const needW = Math.max(width, el.scrollWidth);
    const needH = Math.max(el.offsetHeight, el.scrollHeight);
    const scale = Math.min(1, w / needW, h / needH);
    if (!best || scale > best.scale) best = { kind, width: needW, height: needH, scale };
  }
  el.classList.toggle('stack', best.kind === 'stack');
  el.style.cssText = `width:${best.width}px;zoom:${Math.floor(best.scale * 1000) / 1000};`;
  if (circle.value) el.style.height = best.height + 'px';
}
onMounted(() => {
  ro = new ResizeObserver(scheduleFit);
  ro.observe(viewport.value);
  scheduleFit();
});
watch(
  () => [circle.value, state.editDash, ctl.value],
  () => nextTick(scheduleFit),
  { deep: true },
);
onBeforeUnmount(() => {
  ro?.disconnect();
  cancelAnimationFrame(frame);
});
</script>
<template>
  <section ref="root" class="card toolhead" data-self-fit :inert="state.editDash || undefined">
    <div class="card-h toolhead-h">
      <CardTitle :text="t('Toolhead')" />
      <!-- the G-code state the printer is in: where a typed G1 goes and how E counts (the jog buttons always move
           by the step, whatever this says) -->
      <span
        class="gm mono"
        data-opt
        :data-tip="
          t('Current printer G-code mode') +
          ' · ' +
          (gm.absolute_coordinates === false
            ? t('G91: relative positioning, a move goes this far from where the toolhead is')
            : t('G90: absolute positioning, a move goes to the coordinate given')) +
          ' · ' +
          (gm.absolute_extrude === false ? t('M83: relative extrusion') : t('M82: absolute extrusion'))
        "
        >{{ t('G-code mode') }} · {{ gm.absolute_coordinates === false ? 'G91 REL' : 'G90 ABS' }} ·
        {{ gm.absolute_extrude === false ? 'M83' : 'M82' }}</span
      >
      <div class="acts">
        <button
          class="btn acc"
          :aria-label="t('Home All')"
          :title="t('Home All')"
          :disabled="isPrinting"
          @click="gcode('G28')"
        >
          <Icon name="home" :size="16" :stroke="2.4" />{{ t('Home All') }}
        </button>
        <button
          v-if="level"
          class="btn"
          :disabled="isPrinting || !homed.includes('z')"
          :aria-label="t(level.label)"
          :title="t(level.label)"
          :data-tip="homed.includes('z') ? level.cmd : t('Home first')"
          @click="gcode(level.cmd)"
        >
          <Icon name="tilt" :size="16" :stroke="2.4" />{{ t(level.label)
          }}<i v-if="level.applied" class="ap" :aria-label="t('applied')"></i>
        </button>
        <button
          class="btn"
          :aria-label="t('Motors off')"
          :title="t('Motors off')"
          :disabled="isPrinting"
          @click="gcode('M84')"
        >
          <Icon name="power" :size="16" :stroke="2.4" />{{ t('Motors off') }}
        </button>
        <ToolheadStyle />
      </div>
      <CardCollapse />
    </div>
    <div ref="viewport" class="motion-viewport">
      <div ref="body" class="body" :class="{ circ: circle }">
        <div class="grp pos3" :aria-label="t('Target position')" :data-tip="t('Target position')">
          <div
            v-for="(a, i) in ['X', 'Y', 'Z']"
            :key="a"
            class="pos"
            :data-tip="
              !can(a)
                ? t('{axis} must be homed first', { axis: a })
                : isPrinting
                  ? t('Not while printing')
                  : t('Type a position and press Enter')
            "
          >
            <span class="ax">{{ a }}<i v-if="!can(a)" style="background: var(--dg)"></i></span>
            <input
              class="mono pin"
              :value="edit[a] ?? (pos[i] ?? 0).toFixed(a === 'Z' ? 3 : 2)"
              :disabled="!can(a) || isPrinting"
              :aria-label="t('Move {axis} to position', { axis: a })"
              @focus="onFocus(a, i, $event)"
              @input="edit[a] = $event.target.value"
              @keydown.enter="moveTo(a, $event)"
              @keydown.esc="
                edit[a] = undefined;
                $event.target.blur();
              "
              @blur="edit[a] = undefined"
            />
          </div>
        </div>
        <div v-if="circle" class="pad" :aria-label="t('Relative jog')">
          <CircleJog
            :steps-x-y="ctl.circleXY || []"
            :steps-z="ctl.circleZ || []"
            :homed="homed"
            :busy="isPrinting"
            :zdir="zdir"
            @jog="jog"
            @home="gcode"
          />
        </div>
        <template v-else>
          <div class="grp jog">
            <div
              v-for="r in AX"
              :key="r.a"
              class="jr"
              :style="{
                gridTemplateColumns: `repeat(${r.steps.length}, minmax(32px, 1fr)) 52px repeat(${r.steps.length}, minmax(32px, 1fr))`,
              }"
              :data-tip="!can(r.a) ? t('{axis} must be homed first', { axis: r.a }) : ''"
            >
              <!-- prettier-ignore -->
              <!-- prettier-ignore -->
              <button v-for="st in r.steps" :key="'-' + st" class="jb" :disabled="!can(r.a) || isPrinting" @click="jog(r.a, -st)">−{{ st }}</button>
              <button
                class="axb"
                :class="{ homed: can(r.a) }"
                :aria-label="t('Home {axis}', { axis: r.a })"
                :disabled="isPrinting"
                @click="gcode('G28 ' + r.a)"
              >
                {{ r.a }}
              </button>
              <!-- prettier-ignore -->
              <!-- prettier-ignore -->
              <button v-for="st in [...r.steps].reverse()" :key="'+' + st" class="jb" :disabled="!can(r.a) || isPrinting" @click="jog(r.a, st)">+{{ st }}</button>
            </div>
          </div>
          <div class="grp dpad" :data-tip="!can('X') || !can('Y') ? t('Home X and Y first') : ''">
            <span></span
            ><button class="jb" aria-label="Y+" :disabled="!can('Y') || isPrinting" @click="jog('Y', dstep)">
              <Icon name="up" :stroke="2.6" /></button
            ><span></span>
            <button class="jb" aria-label="X-" :disabled="!can('X') || isPrinting" @click="jog('X', -dstep)">
              <Icon name="left" :stroke="2.6" />
            </button>
            <button class="axb homed" :aria-label="t('Home X Y')" :disabled="isPrinting" @click="gcode('G28 X Y')">
              <Icon name="home" :size="18" :stroke="2.6" />
            </button>
            <button class="jb" aria-label="X+" :disabled="!can('X') || isPrinting" @click="jog('X', dstep)">
              <Icon name="right" :stroke="2.6" />
            </button>
            <span></span
            ><button class="jb" aria-label="Y-" :disabled="!can('Y') || isPrinting" @click="jog('Y', -dstep)">
              <Icon name="down" :stroke="2.6" /></button
            ><span></span>
          </div>
          <div class="grp zcol" :data-tip="!can('Z') ? t('{axis} must be homed first', { axis: 'Z' }) : ''">
            <button
              class="jb"
              :aria-label="state.settings.invertZ ? t('Bed up (Z-{n})', { n: dstep }) : 'Z+' + dstep"
              :disabled="!can('Z') || isPrinting"
              @click="jog('Z', zdir * Math.min(dstep, 25))"
            >
              <Icon name="up" :stroke="2.6" />
            </button>
            <!-- prettier-ignore -->
            <button class="axb" :class="{ homed: can('Z') }" :aria-label="t('Home {axis}', { axis: 'Z' })" :disabled="isPrinting" @click="gcode('G28 Z')">Z</button>
            <button
              class="jb"
              :aria-label="state.settings.invertZ ? t('Bed down (Z+{n})', { n: dstep }) : 'Z-' + dstep"
              :disabled="!can('Z') || isPrinting"
              @click="jog('Z', -zdir * Math.min(dstep, 25))"
            >
              <Icon name="down" :stroke="2.6" />
            </button>
          </div>
          <div class="steps" role="group" :aria-label="t('D-pad step (mm)')">
            <button
              v-for="v in dpadSteps"
              :key="v"
              :class="{ on: dstep === v }"
              :aria-label="t('Step {n} mm', { n: v })"
              @click="dstep = v"
            >
              {{ v }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
<style scoped>
.gm {
  font-size: 11px;
  font-weight: 600;
  color: var(--mu);
  padding: 2px 7px;
  border: 1px solid var(--bd);
  border-radius: 6px;
  white-space: nowrap;
}
.ap {
  width: 7px;
  height: 7px;
  border-radius: 4px;
  background: var(--mu);
  display: inline-block;
  margin-left: 2px;
}
.card {
  overflow: auto;
  container-type: inline-size;
}
.body {
  --h: 44px;
  --g: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 14px;
  align-items: flex-start;
}
.grp {
  height: calc(var(--h) * 3 + var(--g) * 2);
  display: grid;
  gap: var(--g);
  grid-template-rows: repeat(3, var(--h));
}
.pos3 {
  width: 190px;
}
.pos {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 14px;
  background: var(--s2);
  border-radius: 10px;
}
.ax {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--mu);
}
.ax i {
  width: 7px;
  height: 7px;
  border-radius: 4px;
}
.pin {
  width: 118px;
  text-align: right;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 21px;
  font-weight: 600;
  padding: 2px 6px;
  outline: none;
}
.pin:hover:not(:disabled) {
  border-color: var(--bd);
}
.pin:focus {
  border-color: var(--ac);
  background: var(--bg);
}
.pin:disabled {
  color: var(--tx);
  opacity: 1;
  pointer-events: none;
}
.jog {
  flex: 1 1 280px; /* jog buttons can get narrow, so the whole card still fits at its minimum width; */
  /* they also grow to take what the card has left, instead of an empty strip on the right */
}
.jr {
  display: grid;
  grid-template-columns: repeat(3, 1fr) 52px repeat(3, 1fr);
  gap: 4px;
}
.jb {
  height: 100%;
  min-width: 0;
  background: var(--s2);
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.jb:hover:not(:disabled) {
  background: var(--s3);
}
.jb:disabled,
.axb:disabled {
  pointer-events: none;
}
.axb {
  height: 100%;
  border-radius: 8px;
  border: none;
  background: var(--s3);
  color: var(--mu);
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.axb.homed {
  color: var(--tx);
}
.dpad {
  grid-template-columns: repeat(3, var(--h));
}
.zcol {
  grid-template-columns: var(--h);
}
.steps {
  height: calc(var(--h) * 3 + var(--g) * 2);
  width: 52px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: -8px;
}
.steps button {
  flex: 1;
  min-height: 0;
  background: var(--s2);
  border: none;
  border-radius: 6px;
  color: var(--mu);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.steps button:hover {
  color: var(--tx);
}
.steps button.on {
  background: var(--s3);
  color: var(--tx);
  box-shadow: inset 3px 0 0 var(--ac);
}
/* circle style, as Mainsail's: the three positions in a row above the pad. On the dashboard grid the pad takes
   the height the card has left, so a square card holds it; elsewhere (phone) it is as wide as the card */
.body.circ {
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: center;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;
}
.body.circ .pos3 {
  width: 100%;
  max-width: 620px;
  height: auto;
  grid-template-rows: none;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.body.circ .pos {
  height: clamp(30px, 8cqw, 44px); /* thinner as the card narrows, so the dial keeps the room */
  padding: 0 4px 0 10px;
  min-width: 0;
}
.body.circ .pin {
  width: 100%;
  min-width: 0;
  padding: 2px 2px;
  font-size: clamp(10px, 4.2cqw, 18px);
}
.body.circ .ax {
  gap: 4px;
}
.pad {
  width: 100%;
  aspect-ratio: 100 / 76;
  display: flex;
  justify-content: center;
}
.vgl-item .pad {
  aspect-ratio: auto;
  flex: 1 1 0;
  min-height: 190px;
}
.pad :deep(.cj) {
  height: 100%;
  width: auto;
  max-width: 100%;
}
/* narrow card: the per-axis rows already do everything the D-pad does, so drop the D-pad instead of wrapping
   it to a second line (which made the card scroll inside the page). 580px: above it the D-pad still fits once
   v-fit shrinks the card to 75%. Last in the file so it wins over .grp */
@container (max-width: 580px) {
  .dpad,
  .zcol,
  .steps {
    display: none;
  }
}
/* on the dashboard grid the card scales as a whole instead (fit.js, data-scale): everything stays, on one line */
.cell[data-scale] .body {
  flex-wrap: nowrap;
}
.cell[data-scale] .jog {
  min-width: 280px;
}
@container (max-width: 580px) {
  .cell[data-scale] .dpad,
  .cell[data-scale] .zcol {
    display: grid;
  }
  .cell[data-scale] .steps {
    display: flex;
  }
}
/* stacked buttons style (a square or narrow card): the positions side by side, the axis rows under them, then
   the D-pad with Z beside it and the step column. Last in the file so it wins over the rules above. */
.body.stack {
  display: grid;
  grid-template-columns: auto 1fr auto auto; /* D-pad to the left edge, Z and the steps to the right */
  grid-template-areas:
    'pos pos pos pos'
    'jog jog jog jog'
    'dpad . zcol steps';
  gap: 10px 12px;
  align-items: start;
  flex: 1 1 auto;
}
.body.stack .pos3 {
  grid-area: pos;
  width: 100%;
  height: auto;
  grid-template-rows: none;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.body.stack .pos {
  height: 40px;
  padding: 0 4px 0 10px;
  min-width: 0;
}
.body.stack .pin {
  width: 100%;
  min-width: 0;
  padding: 2px 2px;
  font-size: clamp(13px, 4.2cqw, 19px);
}
.body.stack .ax {
  gap: 4px;
}
.body.stack .jog {
  grid-area: jog;
  min-width: 0;
  flex: none;
}
.body.stack .dpad,
.body.stack .zcol {
  display: grid;
}
.body.stack .dpad {
  grid-area: dpad;
}
.body.stack .zcol {
  grid-area: zcol;
}
.body.stack .steps {
  grid-area: steps;
  display: flex;
  margin-left: 0;
}

.motion-viewport {
  min-width: 0;
}
.vgl-item .motion-viewport {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}
.motion-viewport > .body {
  flex: 0 0 auto;
}
.motion-viewport .body:not(.circ):not(.stack) {
  flex-wrap: nowrap;
}
.motion-viewport .body:not(.stack) > .pos3,
.motion-viewport .dpad,
.motion-viewport .zcol,
.motion-viewport .steps {
  flex-shrink: 0;
}
@container cell (max-width: 760px) {
  .toolhead > .toolhead-h {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 4px 8px;
  }
  .toolhead-h > :deep(h2) {
    grid-column: 1;
    grid-row: 1;
  }
  .toolhead-h > :deep(.clp) {
    grid-column: 3;
    grid-row: 1;
  }
  .toolhead-h > .gm {
    display: none;
  }
  .toolhead > .toolhead-h > .acts {
    grid-column: 2;
    grid-row: 1;
    flex-wrap: nowrap;
    justify-content: flex-start;
  }
  .toolhead-h .acts > .btn {
    font-size: 0 !important;
    gap: 0 !important;
    width: 28px;
    padding: 0 !important;
  }
  .toolhead-h .acts > :deep(.toolhead-style) {
    margin-left: auto;
  }
}

/* Only use a second row when the title and controls no longer fit together. */
@container cell (max-width: 360px) {
  .toolhead > .toolhead-h {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .toolhead-h > :deep(.clp) {
    grid-column: 2;
  }
  .toolhead > .toolhead-h > .acts {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}

.editing .toolhead > .toolhead-h > .acts,
.editing .toolhead > .toolhead-h > .gm {
  display: none;
}
</style>
