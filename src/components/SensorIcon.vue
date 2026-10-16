<script setup>
// A temperature sensor's icon in its colour (sensorStyle.js), the same in the Temperatures card, the graph legend
// and the Edit menu. A fan icon turns while its fan runs, faster the faster it runs.
import { computed } from 'vue';
import Icon from './Icon.vue';
import { state, S } from '../store';
import { sensorIcon } from '../sensorStyle';
const props = defineProps({
  name: String,
  color: String,
  size: { type: Number, default: 16 },
});
const icon = computed(() =>
  sensorIcon(state.settings.sensorIcons, props.name, S('configfile').settings?.[props.name]?.sensor_type),
);
// a temperature_fan reports its speed; a heater_generic or extruder with a fan icon picked by hand does not spin
const speed = computed(() => (icon.value === 'fan' ? S(props.name).speed || 0 : 0));
</script>
<template>
  <span class="si" :style="{ color }"
    ><Icon
      :name="icon"
      :size="size"
      :stroke="2.4"
      :class="{ spin: speed > 0.02 }"
      :style="speed > 0.02 ? { animationDuration: (0.5 + (1 - speed) * 1.5).toFixed(2) + 's' } : null"
  /></span>
</template>
<style scoped>
.si {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  vertical-align: -3px;
}
</style>
