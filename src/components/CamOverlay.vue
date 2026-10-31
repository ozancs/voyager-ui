<script setup>
// The print over the camera picture: file, progress, layer, time left, ETA and the hotend and bed temperatures,
// in a strip along the bottom. Shown while a print runs or is paused; also in full screen.
import { computed } from 'vue';
import { S, printState, progress, printTimes, layerInfo, fmtTime, activeExtruder } from '../store';
import { t } from '../i18n';
const active = computed(() => ['printing', 'paused'].includes(printState.value));
const file = computed(() => (S('print_stats').filename || '').split('/').pop());
const eta = computed(() =>
  printTimes.value.eta
    ? printTimes.value.eta.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '--:--',
);
const temp = (o) => {
  const s = S(o);
  if (s.temperature == null) return null;
  return Math.round(s.temperature) + '°' + (s.target > 0 ? ' / ' + Math.round(s.target) + '°' : '');
};
const temps = computed(() =>
  [
    [activeExtruder.value, t('Hotend')],
    ['heater_bed', t('Bed')],
  ]
    .map(([o, n]) => [n, temp(o)])
    .filter(([, v]) => v),
);
</script>
<template>
  <div v-if="active" class="co" aria-live="off">
    <div class="pb"><i :style="{ width: progress * 100 + '%' }"></i></div>
    <div class="ln">
      <b class="pct mono">{{ (progress * 100).toFixed(1) }}%</b>
      <span class="fn">{{ file }}</span>
      <span v-if="printState === 'paused'" class="ps">{{ t('Paused') }}</span>
    </div>
    <div class="ln mono sm">
      <span>{{ t('Layer {cur}/{total}', { cur: layerInfo.cur, total: layerInfo.total || '--' }) }}</span>
      <span>{{ t('Left {time}', { time: fmtTime(printTimes.left) }) }}</span>
      <span>{{ t('ETA {time}', { time: eta }) }}</span>
      <span v-for="[n, v] in temps" :key="n">{{ n }} {{ v }}</span>
    </div>
  </div>
</template>
<style scoped>
/* always light text on a dark band: it sits on a camera picture, whatever the theme */
.co {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 18px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #f1f2f4;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.78), rgba(0, 0, 0, 0.45) 70%, transparent);
  pointer-events: none;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  z-index: 2;
}
.pb {
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.22);
  overflow: hidden;
}
.pb i {
  display: block;
  height: 100%;
  background: var(--ac);
}
.ln {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 14px;
  min-width: 0;
}
.pct {
  font-size: 18px;
}
.fn {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
  font-size: 13px;
}
.ps {
  font-size: 12px;
  font-weight: 600;
  color: #f5c451;
}
.sm {
  font-size: 12px;
  color: #d5d8dc;
}
</style>
