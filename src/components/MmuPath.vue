<script setup>
// Happy Hare filament path: gate → bowden → extruder entry → toolhead sensor → nozzle, with the filament drawn in
// the gate's colour up to where Happy Hare says it is (filament_pos 0..10). Sensors show as dots: lit when they
// see filament. While a load or unload runs the bowden part fills with the progress.
import { computed } from 'vue';
import { t } from '../i18n';
const props = defineProps({ mmu: Object, color: String });
// filament_pos: 0 unloaded, 1 homed at gate, 2 start of bowden, 3 in bowden, 4 end of bowden, 5 homed at entry,
// 6 homed at extruder, 7 in extruder entry, 8 at toolhead sensor, 9 in extruder, 10 loaded (at nozzle)
const W = 300;
const X = { gate: 24, bowden0: 44, bowden1: 170, entry: 190, extruder: 220, ts: 250, nozzle: 284 };
const fill = computed(() => {
  const p = props.mmu.filament_pos ?? 0;
  if (p <= 0) return 0;
  if (p === 1) return X.gate + 6;
  if (p <= 4) {
    const bp = props.mmu.bowden_progress;
    const f = p === 2 ? 0.05 : p === 3 ? (bp >= 0 ? bp / 100 : 0.5) : 1;
    return X.bowden0 + (X.bowden1 - X.bowden0) * f;
  }
  if (p === 5) return X.entry;
  if (p <= 7) return X.extruder;
  if (p === 8) return X.ts;
  if (p === 9) return X.ts + (X.nozzle - X.ts) * 0.5;
  return X.nozzle;
});
const sensors = computed(() => props.mmu.sensors || {});
// sensor keys Happy Hare uses, with where they sit on the path
const DOTS = [
  ['mmu_gate', X.gate, 'Gate sensor'],
  ['gate', X.gate, 'Gate sensor'],
  ['extruder', X.extruder, 'Extruder sensor'],
  ['toolhead', X.ts, 'Toolhead sensor'],
];
const dots = computed(() =>
  DOTS.filter(([k]) => k in sensors.value && sensors.value[k] !== null).map(([k, x, l]) => ({
    k,
    x,
    on: !!sensors.value[k],
    l,
  })),
);
const dir = computed(() => props.mmu.filament_direction); // 1 load, -1 unload (older versions: 0/1)
const POS_T = {
  0: 'Unloaded',
  1: 'At gate',
  2: 'Start of bowden',
  3: 'In bowden',
  4: 'End of bowden',
  5: 'At extruder entry',
  6: 'At extruder',
  7: 'In extruder entry',
  8: 'At toolhead sensor',
  9: 'In extruder',
  10: 'Loaded',
};
const where = computed(() => t(POS_T[props.mmu.filament_pos] || 'Unknown'));
const pc = (x) => (x / W) * 100 + '%';
</script>
<template>
  <div class="mp" :title="where">
    <div class="trk">
      <i class="tube"></i>
      <i class="box gate" :style="{ left: pc(X.gate) }"></i>
      <i class="box entry" :style="{ left: pc(X.entry) }"></i>
      <i class="box ext" :style="{ left: pc(X.extruder) }"></i>
      <i class="noz" :style="{ left: pc(X.nozzle) }"></i>
      <i
        v-if="fill > X.gate"
        class="fil"
        :class="{ mv: mmu.action && mmu.action !== 'Idle' }"
        :style="{ left: pc(X.gate - 6), width: pc(fill - X.gate + 6), background: color || 'var(--tx)' }"
      ></i>
      <i
        v-for="d in dots"
        :key="d.k"
        class="dot"
        :class="{ on: d.on }"
        :style="{ left: pc(d.x) }"
        :title="t(d.l) + ': ' + (d.on ? t('filament') : t('empty'))"
      ></i>
    </div>
    <div class="lbls mono">
      <span :style="{ left: pc(X.gate) }">{{ t('gate') }}</span>
      <span :style="{ left: pc((X.bowden0 + X.bowden1) / 2) }">{{ t('bowden') }}</span>
      <span :style="{ left: pc(X.extruder) }">{{ t('extruder') }}</span>
      <span :style="{ left: pc(X.nozzle) }">{{ t('nozzle') }}</span>
    </div>
    <span class="where"
      >{{ where }}<template v-if="dir === 1 && mmu.action !== 'Idle'"> →</template
      ><template v-else-if="dir === -1 && mmu.action !== 'Idle'"> ←</template></span
    >
  </div>
</template>
<style scoped>
.mp {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.trk {
  position: relative;
  height: 40px;
}
.trk i {
  position: absolute;
  display: block;
}
.tube {
  left: 8%;
  right: 5%;
  top: 16px;
  height: 8px;
  border-radius: 4px;
  background: var(--s3);
}
.box {
  top: 10px;
  height: 20px;
  border-radius: 4px;
  background: var(--s3);
  border: 1px solid var(--bd);
  transform: translateX(-50%);
}
.box.gate {
  width: 20px;
  top: 8px;
  height: 24px;
}
.box.entry {
  width: 8px;
  top: 11px;
  height: 18px;
  border-radius: 2px;
}
.box.ext {
  width: 24px;
  top: 4px;
  height: 32px;
  border-radius: 5px;
}
.noz {
  top: 12px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 16px solid var(--s3);
  transform: translateX(-50%);
}
.fil {
  top: 18px;
  height: 4px;
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35); /* a dark filament still shows on the dark tube */
}
.fil.mv {
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
.dot {
  top: 34px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mu2);
  transform: translateX(-50%);
}
.dot.on {
  background: var(--ok);
}
.lbls {
  position: relative;
  height: 12px;
  font-size: 10px;
  color: var(--mu);
}
.lbls span {
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
}
.where {
  position: absolute;
  right: 0;
  top: -4px;
  font-size: 11px;
  color: var(--mu);
}
</style>
