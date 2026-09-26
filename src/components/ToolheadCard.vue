<script setup>
// Toolhead card: position (type a value to move), jog buttons per axis with the configured steps,
// homing, Z tilt / QGL and motors off. Z offset baby steps are in the Live Z card.
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
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
  gcode(`SAVE_GCODE_STATE NAME=_ui_jog\nG91\nG1 ${axis}${dd} F${feedOf(axis)}\nRESTORE_GCODE_STATE NAME=_ui_jog`);
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
  gcode(`SAVE_GCODE_STATE NAME=_ui_move\nG90\nG1 ${axis}${v} F${feedOf(axis)}\nRESTORE_GCODE_STATE NAME=_ui_move`);
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
</script>
<template>
  <section class="card spread">
    <div class="card-h">
      <h2>{{ t('Toolhead') }}</h2>
      <div class="acts">
        <button class="btn acc" :disabled="isPrinting" @click="gcode('G28')">
          <Icon name="home" :size="16" :stroke="2.4" />{{ t('Home All') }}
        </button>
        <button
          v-if="level"
          class="btn"
          :disabled="isPrinting || !homed.includes('z')"
          :data-tip="homed.includes('z') ? level.cmd : t('Home first')"
          @click="gcode(level.cmd)"
        >
          <Icon name="tilt" :size="16" :stroke="2.4" />{{ t(level.label)
          }}<i v-if="level.applied" class="ap" :aria-label="t('applied')"></i>
        </button>
        <button class="btn" :disabled="isPrinting" @click="gcode('M84')">
          <Icon name="power" :size="16" :stroke="2.4" />{{ t('Motors off') }}
        </button>
      </div>
    </div>
    <div class="body">
      <div class="grp pos3">
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
      <div class="grp jog">
        <div
          v-for="r in AX"
          :key="r.a"
          class="jr"
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
    </div>
  </section>
</template>
<style scoped>
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
}
.body {
  --h: 44px;
  --g: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px 20px;
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
  font-weight: 800;
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
  font-weight: 700;
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
  flex: 1 1 380px;
  max-width: 480px;
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
  font-weight: 700;
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
</style>
