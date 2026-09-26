<script setup>
// Small bed mesh preview for the dashboard: the probed heights as coloured cells, with range and
// the active profile. The full view is the Heightmap page.
import { computed } from 'vue';
import Icon from './Icon.vue';
import { state, S, gcode, isPrinting } from '../store';
import { paletteColor } from '../meshPalette';
import { go } from '../router';
import { t } from '../i18n';
const bm = computed(() => S('bed_mesh'));
const m = computed(() => {
  const x = bm.value.probed_matrix;
  return x?.length && x[0].length ? x : null;
});
const st = computed(() => {
  if (!m.value) return null;
  const a = m.value.flat();
  const mn = Math.min(...a),
    mx = Math.max(...a);
  return { mn, mx, lim: Math.max(Math.abs(mn), Math.abs(mx), 0.01) };
});
const col = (z) => paletteColor(state.settings.heightmap?.palette, z / st.value.lim); // same colours as the Heightmap page
</script>
<template>
  <section class="card">
    <div class="card-h">
      <h2>{{ t('Bed Mesh') }}</h2>
      <div class="acts">
        <button class="btn" :disabled="isPrinting" @click="gcode('BED_MESH_CALIBRATE')">
          <Icon name="mesh" :size="16" />{{ t('Calibrate') }}</button
        ><button class="btn" :aria-label="t('Open heightmap')" @click="go('heightmap')">
          <Icon name="ext" :size="16" />
        </button>
      </div>
    </div>
    <div v-if="!m" class="empty">{{ t('No mesh loaded') }}</div>
    <template v-else>
      <div class="g" :style="{ gridTemplateColumns: `repeat(${m[0].length}, 1fr)` }">
        <template v-for="(r, ri) in [...m].reverse()" :key="ri"
          ><div v-for="(z, ci) in r" :key="ci" :style="{ background: col(z) }" :title="z.toFixed(3)"></div
        ></template>
      </div>
      <div class="row mono" style="justify-content: space-between; font-size: 12px">
        <span>{{ bm.profile_name }}</span
        ><span>{{ t('range {v}', { v: (st.mx - st.mn).toFixed(3) }) }}</span>
      </div>
    </template>
  </section>
</template>
<style scoped>
.g {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 2px;
}
.g > div {
  border-radius: 2px;
  min-height: 4px;
}
</style>
