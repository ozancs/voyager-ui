<script setup>
import { computed } from 'vue';
import { recoveryNozzle } from '../phoenixNozzle';
import { t } from '../i18n';
const props = defineProps({
  target: { type: Number, default: null },
  heater: { type: Object, required: true },
  maxTemp: { type: Number, default: undefined },
  enabled: Boolean,
  prime: Boolean,
});
defineEmits(['heat', 'extrude']);
const nozzle = computed(() => recoveryNozzle(props.target, props.heater, props.maxTemp));
</script>

<template>
  <div class="nozzle col g">
    <div class="row" style="gap: 10px; flex-wrap: wrap">
      <span
        >{{ t('Hotend') }}
        <b class="mono">{{ Math.round(heater.temperature ?? 0) }}° / {{ Math.round(heater.target ?? 0) }}°</b></span
      >
      <span v-if="nozzle.target !== null" class="mu sm">{{
        t('Saved print temperature: {n}°C', { n: nozzle.target })
      }}</span>
    </div>
    <p v-if="nozzle.target === null" class="mu sm">
      {{ t('No usable saved temperature. Update Phoenix or use the normal hotend controls.') }}
    </p>
    <template v-else>
      <div class="row" style="gap: 10px; flex-wrap: wrap">
        <button class="btn" :disabled="!enabled || nozzle.holding" @click="$emit('heat')">
          {{ t('Heat nozzle') }}
        </button>
        <span v-if="nozzle.ready" class="sm">{{ prime ? t('Ready to prime') : t('Nozzle is hot') }}</span>
        <span v-else-if="nozzle.heating" class="mu sm">{{ t('Heating to {n}°C…', { n: nozzle.target }) }}</span>
      </div>
      <p v-if="!prime" class="mu sm">
        {{ t('Heating is optional here. Use it if the nozzle needs to come free before lifting.') }}
      </p>
    </template>
    <template v-if="prime">
      <div class="row" style="gap: 8px; flex-wrap: wrap">
        <button class="btn" :disabled="!enabled || !nozzle.ready" @click="$emit('extrude', 10)">
          {{ t('Prime {n} mm', { n: 10 }) }}
        </button>
        <button class="btn" :disabled="!enabled || !nozzle.ready" @click="$emit('extrude', -2)">
          {{ t('Retract {n} mm', { n: 2 }) }}
        </button>
      </div>
      <p v-if="!nozzle.ready" class="mu sm">
        {{ t('Heat the nozzle to the saved print temperature before priming.') }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.nozzle {
  padding: 12px;
  border-radius: 10px;
  background: var(--s2);
}
</style>
