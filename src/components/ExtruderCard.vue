<script setup>
// Extruder card, everything about the filament in one place like Mainsail's: flow (unless the Print controls
// card is on the dashboard), pressure advance, firmware retraction (unless its own card is there), extrude and
// retract with chosen length and speed, and the temperature check (Klipper refuses to extrude below
// min_extrude_temp). The line at the bottom says what the chosen length and speed come out of the nozzle as.
import { computed, ref, inject } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import NumField from './NumField.vue';
import SpeedFlow from './SpeedFlow.vue';
import { state, S, gcode, isPrinting, extruders, activeExtruder, prettyName } from '../store';
import { t } from '../i18n';
const amounts = computed(() =>
  [...(state.settings.control?.extAmounts || [5, 10, 25, 50, 100])]
    .map(Number)
    .filter((x) => x > 0)
    .sort((a, b) => a - b),
);
const feeds = computed(() =>
  [...(state.settings.control?.extFeeds || [1, 2, 5, 10])]
    .map(Number)
    .filter((x) => x > 0)
    .sort((a, b) => a - b),
);
const len = ref(amounts.value[Math.floor(amounts.value.length / 2)] || 25);
const feed = ref(feeds.value[Math.floor(feeds.value.length / 2)] || 5);
const ext = activeExtruder;
// more than one extruder: pick the one in use. A toolchanger's T0, T1 ... macros when they exist (they park and pick
// up the tool), otherwise Klipper's ACTIVATE_EXTRUDER
function useExtruder(name, i) {
  if (name === ext.value) return;
  const tool = 'gcode_macro T' + i;
  gcode(state.objects.includes(tool) ? 'T' + i : `ACTIVATE_EXTRUDER EXTRUDER=${name}`).catch(() => {});
}
const e = computed(() => S(ext.value));
const shown = inject('dashCards', null);
const has = (c) => !!shown?.value?.includes(c);
const showFlow = computed(() => !has('printctl'));
const ret = computed(() =>
  state.objects.includes('firmware_retraction') && !has('retraction') ? S('firmware_retraction') : null,
);
const RET = [
  ['retract_length', 'RETRACT_LENGTH', 'Retract length', 'mm', 0.01],
  ['retract_speed', 'RETRACT_SPEED', 'Retract speed', 'mm/s', 1],
  ['unretract_extra_length', 'UNRETRACT_EXTRA_LENGTH', 'Unretract extra', 'mm', 0.01],
  ['unretract_speed', 'UNRETRACT_SPEED', 'Unretract speed', 'mm/s', 1],
];
// what the chosen length and speed make at the nozzle: filament area against the nozzle's
const out = computed(() => {
  const c = S('configfile').settings?.[ext.value] || {};
  const fd = +c.filament_diameter || 1.75,
    nd = +c.nozzle_diameter || 0.4;
  const area = Math.PI * (fd / 2) ** 2;
  return {
    len: Math.round(len.value * (fd / nd) ** 2),
    vol: +(feed.value * area).toFixed(1),
    nd,
  };
});
function move(dir) {
  gcode(
    `SAVE_GCODE_STATE NAME=_ui_ext\nM83\nG1 E${dir * len.value} F${feed.value * 60}\nRESTORE_GCODE_STATE NAME=_ui_ext`,
  );
}
</script>
<template>
  <section class="card spread">
    <div class="card-h">
      <CardTitle :text="t('Extruder')" />
      <span class="chip" :style="{ color: e.can_extrude ? 'var(--mu)' : 'var(--wn)' }"
        ><i></i>{{ e.temperature?.toFixed(1) }}° / {{ e.target?.toFixed(0) }}°</span
      >
      <CardCollapse />
    </div>
    <div v-if="extruders.length > 1" class="seg exs" role="group" :aria-label="t('Active extruder')">
      <button
        v-for="(x, i) in extruders"
        :key="x"
        :class="{ on: x === ext }"
        :aria-pressed="x === ext"
        :data-tip="prettyName(x) + (S(x).temperature != null ? ' · ' + S(x).temperature.toFixed(0) + '°' : '')"
        @click="useExtruder(x, i)"
      >
        T{{ i }}
      </button>
    </div>
    <SpeedFlow v-if="showFlow" only="flow" />
    <div class="gf">
      <NumField
        :label="t('Pressure advance')"
        :model-value="e.pressure_advance"
        :step="0.005"
        :min="0"
        :decimals="4"
        @commit="gcode(`SET_PRESSURE_ADVANCE ADVANCE=${$event}`)"
      />
      <NumField
        :label="t('Smooth time')"
        unit="s"
        :model-value="e.smooth_time"
        :step="0.005"
        :min="0"
        :max="0.2"
        :decimals="3"
        @commit="gcode(`SET_PRESSURE_ADVANCE SMOOTH_TIME=${$event}`)"
      />
      <template v-if="ret">
        <NumField
          v-for="[key, cmd, label, unit, step] in RET"
          :key="key"
          :label="t(label)"
          :model-value="ret[key]"
          :step="step"
          :decimals="step < 1 ? 2 : 0"
          :min="0"
          :unit="unit"
          @commit="(v) => gcode(`SET_RETRACTION ${cmd}=${v}`)"
        />
      </template>
    </div>
    <div class="g2">
      <div class="col" style="gap: 6px">
        <span class="lbl">{{ t('Length (mm)') }}</span>
        <div class="seg">
          <button v-for="v in amounts" :key="v" :class="{ on: len === v }" @click="len = v">{{ v }}</button>
        </div>
      </div>
      <div class="col" style="gap: 6px">
        <span class="lbl">{{ t('Feedrate (mm/s)') }}</span>
        <div class="seg">
          <button v-for="v in feeds" :key="v" :class="{ on: feed === v }" @click="feed = v">{{ v }}</button>
        </div>
      </div>
    </div>
    <div v-if="!e.can_extrude" class="mu" style="font-size: 12px">
      {{ t('Heat the nozzle above min_extrude_temp to extrude.') }}
    </div>
    <div class="g2">
      <button
        class="btn lg"
        style="height: 42px; font-size: 15px"
        :disabled="!e.can_extrude || isPrinting"
        @click="move(-1)"
      >
        <Icon name="unload" :stroke="2.4" style="color: var(--ac)" />{{ t('Retract') }}
      </button>
      <button
        class="btn lg acc"
        style="height: 42px; font-size: 15px"
        :disabled="!e.can_extrude || isPrinting"
        @click="move(1)"
      >
        <Icon name="load" :stroke="2.4" />{{ t('Extrude') }}
      </button>
    </div>
    <div class="mu out mono">
      {{ t('Extrusion: about {len} mm at {vol} mm³/s through a {nd} mm nozzle', out) }}
    </div>
  </section>
</template>
<style scoped>
.gf {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px 14px;
}
.g2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.mu {
  color: var(--mu);
}
.out {
  font-size: 11.5px;
  text-align: center;
}
</style>
