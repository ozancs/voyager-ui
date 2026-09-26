<script setup>
import { computed } from 'vue';
import NumField from './NumField.vue';
import { S, gcode } from '../store';
import { t } from '../i18n';
const r = computed(() => S('firmware_retraction'));
const F = [
  ['retract_length', 'RETRACT_LENGTH', 'Retract length', 'mm', 0.01],
  ['retract_speed', 'RETRACT_SPEED', 'Retract speed', 'mm/s', 1],
  ['unretract_extra_length', 'UNRETRACT_EXTRA_LENGTH', 'Unretract extra', 'mm', 0.01],
  ['unretract_speed', 'UNRETRACT_SPEED', 'Unretract speed', 'mm/s', 1],
];
const set = (k, v) => gcode(`SET_RETRACTION ${k}=${v}`);
</script>

<template>
  <section class="card spread">
    <div class="card-h">
      <h2>{{ t('Firmware retraction') }}</h2>
    </div>
    <div class="gr">
      <NumField
        v-for="[key, cmd, label, unit, step] in F"
        :key="key"
        :label="t(label)"
        :model-value="r[key]"
        :step="step"
        :decimals="step < 1 ? 2 : 0"
        :min="0"
        :unit="unit"
        @commit="(v) => set(cmd, v)"
      />
    </div>
  </section>
</template>

<style scoped>
.gr {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
</style>
