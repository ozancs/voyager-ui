<script setup>
// Small card for the first layer: live X / Y / Z, the Z offset and baby-step buttons. Meant for the print layout,
// where the full Toolhead card takes too much room.
import { computed, ref } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import { state, S, gcode } from '../store';
import { t } from '../i18n';
const gm = computed(() => S('gcode_move'));
const th = computed(() => S('toolhead'));
const pos = computed(() => gm.value.gcode_position || th.value.position || [0, 0, 0, 0]);
const zoff = computed(() => gm.value.homing_origin?.[2] ?? 0);
const hasProbe = computed(() =>
  state.objects.some(
    (o) =>
      o === 'probe' ||
      o.startsWith('probe_eddy') ||
      o === 'bltouch' ||
      o.startsWith('beacon') ||
      o.startsWith('cartographer') ||
      o === 'scanner' ||
      o.startsWith('probe_eddy_ng'),
  ),
);
const steps = computed(() =>
  [...(state.settings.control?.zOffset || [0.005, 0.01, 0.025, 0.05])]
    .map(Number)
    .filter((x) => x > 0)
    .sort((a, b) => a - b),
);
const step = ref(null);
const cur = computed(() =>
  steps.value.includes(step.value) ? step.value : steps.value[Math.min(1, steps.value.length - 1)] || 0.01,
);
// d > 0: nozzle farther from the bed (Z offset up). By default the arrows change the value: up raises the Z offset,
// down lowers it, on any printer. With "Live Z arrows follow the Z offset value" off they follow the Invert Z
// setting like the Toolhead card: with a moving bed the up arrow lifts the bed, closer to the nozzle.
const adj = (d) => gcode(`SET_GCODE_OFFSET Z_ADJUST=${d > 0 ? '' : '-'}${cur.value} MOVE=1`);
const byValue = computed(() => state.settings.liveZValue !== false);
const bedMoves = computed(() => !byValue.value && !!state.settings.invertZ);
const downTip = computed(() =>
  byValue.value
    ? t('Lower the Z offset (nozzle closer to the bed)')
    : bedMoves.value
      ? t('Bed down, farther from the nozzle')
      : t('Nozzle down, closer to the bed'),
);
const upTip = computed(() =>
  byValue.value
    ? t('Raise the Z offset (nozzle farther from the bed)')
    : bedMoves.value
      ? t('Bed up, closer to the nozzle')
      : t('Nozzle up, farther from the bed'),
);
const reset = () => gcode('SET_GCODE_OFFSET Z=0 MOVE=1');
const save = () => gcode(hasProbe.value ? 'Z_OFFSET_APPLY_PROBE' : 'Z_OFFSET_APPLY_ENDSTOP');
</script>
<template>
  <section class="card lz">
    <div class="card-h">
      <CardTitle :text="t('Live Z')" />
      <div class="acts">
        <button
          class="btn"
          :disabled="!zoff"
          :data-tip="t('Write the offset to the config (needs SAVE_CONFIG)')"
          @click="save"
        >
          {{ t('Save') }}
        </button>
      </div>
      <CardCollapse />
    </div>
    <div class="pos mono">
      <span v-for="(a, i) in ['X', 'Y', 'Z']" :key="a"
        ><i>{{ a }}</i
        >{{ (pos[i] ?? 0).toFixed(a === 'Z' ? 3 : 1) }}</span
      >
    </div>
    <div class="zo">
      <button class="btn big" :aria-label="downTip" :data-tip="downTip" @click="adj(bedMoves ? 1 : -1)">
        <Icon name="down" :size="18" :stroke="2.6" />
      </button>
      <div class="zv">
        <span class="lbl">{{ t('Z offset') }}</span
        ><b class="mono" :style="{ color: zoff ? 'var(--ac)' : null }">{{ (zoff >= 0 ? '+' : '') + zoff.toFixed(3) }}</b
        ><button class="btn sm rst" :disabled="!zoff" :data-tip="t('Reset the Z offset to 0')" @click="reset">
          <Icon name="refresh" :size="13" />{{ t('Reset') }}
        </button>
      </div>
      <button class="btn big" :aria-label="upTip" :data-tip="upTip" @click="adj(bedMoves ? -1 : 1)">
        <Icon name="up" :size="18" :stroke="2.6" />
      </button>
    </div>
    <div class="seg st">
      <button v-for="z in steps" :key="z" :class="{ on: z === cur }" @click="step = z">{{ z }}</button>
    </div>
  </section>
</template>
<style scoped>
.lz {
  gap: 10px;
}
.pos {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}
.pos span {
  display: flex;
  gap: 6px;
  align-items: baseline;
}
.pos i {
  font-style: normal;
  font-size: 11px;
  color: var(--mu);
  font-weight: 600;
}
.zo {
  display: flex;
  align-items: center;
  gap: 8px;
}
.zo .big {
  height: 44px;
  width: 52px;
  padding: 0;
  flex-shrink: 0;
}
.zv {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.zv b {
  font-size: 22px;
}
.zv .rst {
  height: 24px;
  padding: 0 8px;
  gap: 4px;
  font-size: 11.5px;
}
.st {
  width: 100%;
}
.st button {
  flex: 1;
  font-size: 12px;
}
</style>
