<script setup>
// Extruder card: extrude and retract with chosen length and speed, pressure advance, and the
// temperature check (Klipper refuses to extrude below min_extrude_temp).
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import NumField from './NumField.vue';
import { state, S, gcode, isPrinting } from '../store';
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
const ext = computed(() => S('toolhead').extruder || 'extruder');
const e = computed(() => S(ext.value));
function move(dir) {
  gcode(
    `SAVE_GCODE_STATE NAME=_ui_ext\nM83\nG1 E${dir * len.value} F${feed.value * 60}\nRESTORE_GCODE_STATE NAME=_ui_ext`,
  );
}
</script>
<template>
  <section class="card spread">
    <div class="card-h">
      <h2>{{ t('Extruder') }}</h2>
      <span class="chip" :style="{ color: e.can_extrude ? 'var(--mu)' : 'var(--wn)' }"
        ><i></i>{{ e.temperature?.toFixed(1) }}° / {{ e.target?.toFixed(0) }}°</span
      >
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
    </div>
    <div v-if="!e.can_extrude" class="mu" style="font-size: 12px">
      {{ t('Heat the nozzle above min_extrude_temp to extrude.') }}
    </div>
    <div class="g2">
      <button
        class="btn lg"
        style="height: 48px; font-size: 15px"
        :disabled="!e.can_extrude || isPrinting"
        @click="move(-1)"
      >
        <Icon name="unload" :stroke="2.4" style="color: var(--ac)" />{{ t('Retract') }}
      </button>
      <button
        class="btn lg acc"
        style="height: 48px; font-size: 15px"
        :disabled="!e.can_extrude || isPrinting"
        @click="move(1)"
      >
        <Icon name="load" :stroke="2.4" />{{ t('Extrude') }}
      </button>
    </div>
  </section>
</template>
<style scoped>
.g2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.mu {
  color: var(--mu);
}
</style>
