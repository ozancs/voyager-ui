<script setup>
// Every input shaper Klipper's SHAPER_CALIBRATE tried, per axis: frequency, the vibrations left (as a bar),
// smoothing and the largest acceleration that keeps the smoothing low. The one Klipper recommends is marked;
// any of them can be applied until Klipper restarts. Read from the console, so no Shake&Tune is needed.
import { computed } from 'vue';
import Icon from './Icon.vue';
import { gcode, toast } from '../store';
import { t } from '../i18n';
const props = defineProps({ fitted: { type: Array, default: () => [] } });
const axes = computed(() => {
  const by = {};
  for (const f of props.fitted) (by[f.axis] ||= []).push(f);
  return Object.entries(by);
});
const maxVib = computed(() => Math.max(1, ...props.fitted.map((f) => f.vib)));
function apply(f) {
  const A = f.axis.toUpperCase();
  gcode(`SET_INPUT_SHAPER SHAPER_TYPE_${A}=${f.type} SHAPER_FREQ_${A}=${f.freq}`);
  toast(t('Input shaper {axis} set until Klipper restarts', { axis: A }));
}
</script>
<template>
  <div v-for="[axis, list] in axes" :key="axis" class="sr">
    <b class="ax mono">{{ axis.toUpperCase() }}</b>
    <table class="tb">
      <thead>
        <tr>
          <th>{{ t('Shaper') }}</th>
          <th>{{ t('Frequency') }}</th>
          <th class="vb">{{ t('Vibrations left') }}</th>
          <th class="wide">{{ t('Smoothing') }}</th>
          <th class="wide">max_accel</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in list" :key="f.type" :class="{ best: f.best }">
          <td class="mono">
            {{ f.type.toUpperCase() }}<Icon v-if="f.best" name="check" :size="14" :stroke="2.6" class="ok" />
          </td>
          <td class="mono">{{ f.freq }} Hz</td>
          <td class="vb">
            <div class="vbi">
              <span class="bar"><i :style="{ width: (f.vib / maxVib) * 100 + '%' }"></i></span
              ><span class="mono">{{ f.vib }}%</span>
            </div>
          </td>
          <td class="mono wide">{{ f.smooth }}</td>
          <td class="mono wide">{{ f.maxAccel ?? '--' }}</td>
          <td>
            <button class="btn sm" :data-tip="t('SET_INPUT_SHAPER, until Klipper restarts')" @click="apply(f)">
              {{ t('Apply') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<style scoped>
.sr {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-x: auto;
}
.ax {
  font-size: 13px;
}
.tb {
  border-collapse: collapse;
  font-size: 12.5px;
  width: 100%;
}
/* a narrow card (the side column) keeps shaper, frequency, vibrations and Apply */
@container (max-width: 460px) {
  .wide {
    display: none;
  }
}
.tb th {
  text-align: left;
  font-weight: 500;
  color: var(--mu);
  padding: 4px 10px 4px 0;
}
.tb td {
  padding: 5px 10px 5px 0;
  white-space: nowrap;
  border-top: 1px solid var(--bd);
}
.tb tr.best td {
  color: var(--tx);
  font-weight: 600;
}
.ok {
  color: var(--ok);
  margin-left: 4px;
  vertical-align: -2px;
}
.vb {
  width: 38%;
}
.vbi {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--s2);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--mu2);
}
tr.best .bar i {
  background: var(--ok);
}
.btn.sm {
  height: 28px;
}
</style>
