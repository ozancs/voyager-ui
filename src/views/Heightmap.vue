<script setup>
// Bed mesh page: 3D (Surface3D) or 2D view of the probed or interpolated mesh, statistics, profiles
// (load, save, remove), calibrate, colour palette and range settings.
import { computed, ref } from 'vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import { defineAsyncComponent } from 'vue';
const Surface3D = defineAsyncComponent(() => import('../components/Surface3D.vue'));
import NumField from '../components/NumField.vue';
import Rng from '../components/Rng.vue';
import Toggle from '../components/Toggle.vue';
import { PALETTES, paletteColor, cssGradient } from '../meshPalette';
import { state, S, gcode, isPrinting } from '../store';
import { t } from '../i18n';
const bm = computed(() => S('bed_mesh'));
const useProbed = ref(true);
// view options, kept in settings: colour range (auto = the mesh's own extremes) and the 3D z axis height
if (!state.settings.heightmap)
  state.settings.heightmap = {
    colorAuto: true,
    colorLim: 0.1,
    zAuto: true,
    zMax: 0.5,
    palette: 'voyager',
    wire: false,
  };
const hv = computed(() => state.settings.heightmap);
const mode3d = ref(true);
const saveName = ref('');
const showSave = ref(false);
const matrix = computed(() => {
  const m = useProbed.value ? bm.value.probed_matrix : bm.value.mesh_matrix;
  return m && m.length && m[0].length ? m : null;
});
const stats = computed(() => {
  if (!matrix.value) return null;
  const all = matrix.value.flat();
  const mn = Math.min(...all),
    mx = Math.max(...all);
  return { mn, mx, range: mx - mn, rows: matrix.value.length, cols: matrix.value[0].length };
});
// colour scale limit (± mm)
const lim = computed(() => {
  if (!stats.value) return 0.1;
  return hv.value.colorAuto
    ? Math.max(Math.abs(stats.value.mn), Math.abs(stats.value.mx), 0.01)
    : Math.max(Number(hv.value.colorLim) || 0.1, 0.005);
});
// 3D z axis half height (± mm), null = auto
const zMax = computed(() => (hv.value.zAuto ? null : Math.max(Number(hv.value.zMax) || 0.5, 0.01)));
function color(z) {
  return paletteColor(hv.value.palette, z / lim.value);
}
const rows = computed(() => (matrix.value ? [...matrix.value].reverse() : []));
const profiles = computed(() => Object.keys(bm.value.profiles || {}));
function doSave() {
  if (!saveName.value) return;
  gcode(`BED_MESH_PROFILE SAVE="${saveName.value}"`);
  showSave.value = false;
  saveName.value = '';
}
</script>
<template>
  <div class="split" style="min-height: calc(100vh / var(--zoom, 1) - 208px)">
    <section class="card grow">
      <div class="card-h">
        <h2>{{ t('Heightmap') }} · {{ bm.profile_name || t('no mesh loaded') }}</h2>
        <div class="acts">
          <div class="seg" style="width: 130px">
            <button :class="{ on: mode3d }" @click="mode3d = true">3D</button
            ><button :class="{ on: !mode3d }" @click="mode3d = false">2D</button>
          </div>
          <div class="seg" style="width: 180px">
            <button :class="{ on: useProbed }" @click="useProbed = true">{{ t('Probed') }}</button
            ><button :class="{ on: !useProbed }" @click="useProbed = false">{{ t('Mesh') }}</button>
          </div>
        </div>
      </div>
      <div v-if="!matrix" class="empty" style="flex: 1; display: flex; align-items: center; justify-content: center">
        {{ t('No bed mesh loaded. Calibrate or load a profile.') }}
      </div>
      <div v-else-if="mode3d" style="flex: 1; min-height: 0">
        <Surface3D
          :z="matrix"
          :min="bm.mesh_min"
          :max="bm.mesh_max"
          :lim="lim"
          :zmax="zMax"
          :palette="hv.palette"
          :wire="!!hv.wire"
          :grid="bm.probed_matrix?.length ? [bm.probed_matrix[0].length, bm.probed_matrix.length] : null"
        />
      </div>
      <div v-else class="hm">
        <div class="grid" :style="{ gridTemplateColumns: `repeat(${stats.cols}, minmax(0, 1fr))` }">
          <template v-for="(r, ri) in rows" :key="ri">
            <div
              v-for="(z, ci) in r"
              :key="ci"
              class="cell mono"
              :style="{ background: color(z) }"
              :title="z.toFixed(4)"
            >
              {{ stats.cols <= 15 ? (z >= 0 ? '+' : '') + z.toFixed(2) : '' }}
            </div>
          </template>
        </div>
        <div class="legend">
          <span class="mono">+{{ lim.toFixed(3) }}</span>
          <div class="lgd" :style="{ background: cssGradient(hv.palette) }"></div>
          <span class="mono">-{{ lim.toFixed(3) }}</span>
        </div>
      </div>
      <div class="mono mu" style="font-size: 12px" v-if="matrix && !mode3d">
        {{ t('front of bed is at the bottom') }}
      </div>
    </section>
    <div class="side-col">
      <section class="card">
        <div class="card-h">
          <h2>{{ t('Mesh') }}</h2>
        </div>
        <div v-if="stats" class="st">
          <div>
            <span class="lbl">{{ t('Max') }}</span
            ><b class="mono" style="color: var(--ac)">{{ stats.mx.toFixed(3) }}</b>
          </div>
          <div>
            <span class="lbl">{{ t('Min') }}</span
            ><b class="mono" style="color: var(--bl)">{{ stats.mn.toFixed(3) }}</b>
          </div>
          <div>
            <span class="lbl">{{ t('Range') }}</span
            ><b class="mono">{{ stats.range.toFixed(3) }}</b>
          </div>
          <div>
            <span class="lbl">{{ t('Points') }}</span
            ><b class="mono">{{ stats.cols }}×{{ stats.rows }}</b>
          </div>
        </div>
        <div class="g2">
          <button class="btn lg acc" :disabled="isPrinting" @click="gcode('BED_MESH_CALIBRATE')">
            <Icon name="mesh" :stroke="2.4" />{{ t('Calibrate') }}
          </button>
          <button class="btn lg" :disabled="!bm.profile_name" @click="gcode('BED_MESH_CLEAR')">
            <Icon name="x" :stroke="2.4" />{{ t('Clear') }}
          </button>
        </div>
      </section>
      <section class="card">
        <div class="card-h">
          <h2>{{ t('Profiles') }}</h2>
          <button class="btn" :disabled="!matrix" @click="showSave = true">
            <Icon name="save" :size="16" />{{ t('Save as') }}
          </button>
        </div>
        <div v-if="!profiles.length" class="empty">{{ t('No saved profiles') }}</div>
        <div v-for="p in profiles" :key="p" class="pr">
          <b class="grow">{{ p }}</b>
          <span v-if="p === bm.profile_name" class="chip" style="color: var(--tx)"><i></i>{{ t('Active') }}</span>
          <button v-else class="btn" @click="gcode(`BED_MESH_PROFILE LOAD=${p}`)">{{ t('Load') }}</button>
          <button class="btn clear ibtn sm" :aria-label="t('Remove')" @click="gcode(`BED_MESH_PROFILE REMOVE=${p}`)">
            <Icon name="trash" :size="16" />
          </button>
        </div>
        <span class="mu" style="font-size: 12px">{{
          t('Removing or saving a profile needs SAVE_CONFIG to persist.')
        }}</span>
      </section>
      <section class="card">
        <div class="card-h">
          <h2>{{ t('View') }}</h2>
        </div>
        <div class="vo">
          <div class="row" style="justify-content: space-between">
            <span>{{ t('Colour range') }}</span>
            <div class="seg" style="width: 150px">
              <button :class="{ on: hv.colorAuto }" @click="hv.colorAuto = true">{{ t('Auto') }}</button
              ><button :class="{ on: !hv.colorAuto }" @click="hv.colorAuto = false">{{ t('Manual') }}</button>
            </div>
          </div>
          <template v-if="!hv.colorAuto">
            <NumField
              v-model="hv.colorLim"
              :label="t('Colour range ±')"
              unit="mm"
              :step="0.01"
              :min="0.005"
              :max="5"
              :decimals="3"
            />
            <Rng
              :value="Math.min(hv.colorLim, 1)"
              :min="0.005"
              :max="1"
              :step="0.005"
              :label="t('Colour range ±')"
              @input="hv.colorLim = $event"
            />
          </template>
          <div class="row" style="justify-content: space-between">
            <span>{{ t('Colours') }}</span
            ><select
              class="input"
              style="width: 170px; height: 36px"
              :value="hv.palette || 'voyager'"
              :aria-label="t('Colours')"
              @change="hv.palette = $event.target.value"
            >
              <option v-for="(p, k) in PALETTES" :key="k" :value="k">{{ t(p.name) }}</option>
            </select>
          </div>
          <div
            class="pv"
            :style="{ background: 'linear-gradient(90deg,' + PALETTES[hv.palette || 'voyager'].stops.join(',') + ')' }"
          ></div>
          <div class="row" style="justify-content: space-between">
            <span>{{ t('Wireframe (3D)') }}</span
            ><Toggle v-model="hv.wire" :label="t('Wireframe (3D)')" />
          </div>
          <div class="row" style="justify-content: space-between">
            <span>{{ t('3D z axis') }}</span>
            <div class="seg" style="width: 150px">
              <button :class="{ on: hv.zAuto }" @click="hv.zAuto = true">{{ t('Auto') }}</button
              ><button :class="{ on: !hv.zAuto }" @click="hv.zAuto = false">{{ t('Manual') }}</button>
            </div>
          </div>
          <template v-if="!hv.zAuto">
            <NumField
              v-model="hv.zMax"
              :label="t('Z axis max ±')"
              unit="mm"
              :step="0.05"
              :min="0.01"
              :max="10"
              :decimals="2"
            />
            <Rng
              :value="Math.min(hv.zMax, 3)"
              :min="0.05"
              :max="3"
              :step="0.05"
              :label="t('Z axis max ±')"
              @input="hv.zMax = $event"
            />
          </template>
        </div>
      </section>
    </div>
  </div>
  <Modal v-if="showSave" :title="t('Save mesh profile')" @close="showSave = false">
    <input
      v-model="saveName"
      class="input"
      :placeholder="t('profile name')"
      :aria-label="t('Profile name')"
      @keydown.enter="doSave"
    />
    <template #foot
      ><button class="btn lg" @click="showSave = false">{{ t('Cancel') }}</button
      ><button class="btn lg acc" @click="doSave">{{ t('Save') }}</button></template
    >
  </Modal>
</template>
<style scoped>
.hm {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  min-height: 0;
}
.grid {
  display: grid;
  gap: 3px;
  width: min(100%, 620px);
}
.cell {
  aspect-ratio: 1;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #f2f2ef;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.legend {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--mu);
}
.lgd {
  width: 14px;
  height: 360px;
  border-radius: 7px;
}
.pv {
  height: 8px;
  border-radius: 4px;
}
.st {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.st > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--s2);
  border-radius: 10px;
}
.st b {
  font-size: 20px;
}
.g2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.pr {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--bd);
}
.mu {
  color: var(--mu);
}
.vo {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
