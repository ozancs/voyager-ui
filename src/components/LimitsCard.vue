<script setup>
// The printer's velocity and acceleration limits (SET_VELOCITY_LIMIT), and speed factor / flow below them when
// the Print controls card is not on the dashboard (the dashboard says which cards it shows).
import { computed, inject } from 'vue';
import Icon from './Icon.vue';
import NumField from './NumField.vue';
import SpeedFlow from './SpeedFlow.vue';
import { S, gcode } from '../store';
import { t } from '../i18n';
const shownCards = inject('dashCards', null);
const hideFactors = computed(() => !!shownCards?.value?.includes('printctl'));
const th = computed(() => S('toolhead'));
const cfg = computed(() => S('configfile').settings?.printer || {});
const hasMcr = computed(() => th.value.minimum_cruise_ratio !== undefined);
function reset() {
  const c = cfg.value;
  if (c.max_velocity == null || c.max_accel == null) return; // config not read yet
  let s = `SET_VELOCITY_LIMIT VELOCITY=${c.max_velocity} ACCEL=${c.max_accel} SQUARE_CORNER_VELOCITY=${c.square_corner_velocity ?? 5}`;
  if (hasMcr.value && c.minimum_cruise_ratio != null) s += ` MINIMUM_CRUISE_RATIO=${c.minimum_cruise_ratio}`;
  gcode(s);
}
</script>
<template>
  <section class="card spread">
    <div class="card-h">
      <h2>{{ t('Machine Limits') }}</h2>
      <button class="btn" :disabled="cfg.max_velocity == null" @click="reset">
        <Icon name="refresh" :size="16" :stroke="2.4" />{{ t('Reset') }}
      </button>
    </div>
    <div class="g2">
      <NumField
        :label="t('Velocity')"
        unit="mm/s"
        :model-value="th.max_velocity"
        :step="10"
        :min="1"
        @commit="gcode(`SET_VELOCITY_LIMIT VELOCITY=${$event}`)"
      />
      <NumField
        :label="t('Acceleration')"
        unit="mm/s²"
        :model-value="th.max_accel"
        :step="500"
        :min="1"
        @commit="gcode(`SET_VELOCITY_LIMIT ACCEL=${$event}`)"
      />
      <NumField
        :label="t('Square corner vel.')"
        unit="mm/s"
        :model-value="th.square_corner_velocity"
        :step="1"
        :min="0"
        :decimals="1"
        @commit="gcode(`SET_VELOCITY_LIMIT SQUARE_CORNER_VELOCITY=${$event}`)"
      />
      <NumField
        v-if="hasMcr"
        :label="t('Min cruise ratio')"
        :model-value="th.minimum_cruise_ratio"
        :step="0.05"
        :min="0"
        :max="0.99"
        :decimals="2"
        @commit="gcode(`SET_VELOCITY_LIMIT MINIMUM_CRUISE_RATIO=${$event}`)"
      />
      <NumField
        v-else
        :label="t('Accel to decel')"
        unit="mm/s²"
        :model-value="th.max_accel_to_decel"
        :step="500"
        :min="1"
        @commit="gcode(`SET_VELOCITY_LIMIT ACCEL_TO_DECEL=${$event}`)"
      />
    </div>
    <SpeedFlow v-if="!hideFactors" />
    <span class="mu" style="font-size: 12px">{{
      t('Live values. Klipper resets them to printer.cfg on restart.')
    }}</span>
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
.card {
  overflow: auto;
}
</style>
