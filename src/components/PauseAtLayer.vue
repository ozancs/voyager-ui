<script setup>
// Pause at a layer (colour change, insert a magnet): uses the SET_PAUSE_AT_LAYER / SET_PAUSE_NEXT_LAYER macros
// of the Mainsail / Fluidd client macros, which run PAUSE from the slicer's layer change G-code. Shown only when
// the printer has them. The pending layer is read back from the macro's variables.
import { ref, computed } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import { state, S, gcode, toast, layerInfo } from '../store';
import { t } from '../i18n';
defineProps({ compact: Boolean });
const has = (c) => Object.keys(state.commands || {}).some((k) => k.toUpperCase() === c);
const avail = computed(() => has('SET_PAUSE_AT_LAYER') || has('SET_PAUSE_NEXT_LAYER'));
// mainsail.cfg / fluidd.cfg keep both variables on SET_PRINT_STATS_INFO (the layer-change hook); older or
// home-made copies keep them on the SET_PAUSE_* macros themselves
const atLayer = computed(
  () =>
    S('gcode_macro SET_PRINT_STATS_INFO').pause_at_layer || S('gcode_macro SET_PAUSE_AT_LAYER').pause_at_layer || {},
);
const nextLayer = computed(
  () =>
    S('gcode_macro SET_PRINT_STATS_INFO').pause_next_layer ||
    S('gcode_macro SET_PAUSE_NEXT_LAYER').pause_next_layer ||
    {},
);
const pending = computed(() =>
  nextLayer.value.enable ? t('next layer') : atLayer.value.enable ? t('layer {n}', { n: atLayer.value.layer }) : '',
);
const open = ref(false);
const layer = ref(0);
function show() {
  layer.value = Math.max(1, (layerInfo.value.cur || 0) + 1);
  open.value = true;
}
async function set(n) {
  open.value = false;
  try {
    if (n === 'next') await gcode('SET_PAUSE_NEXT_LAYER ENABLE=1');
    else {
      const total = layerInfo.value.total;
      if (!(n >= 1) || (total && n > total))
        return toast(t('Layer must be between 1 and {n}', { n: total || '?' }), 'warn');
      if (n <= (layerInfo.value.cur || 0)) return toast(t('That layer is already printed'), 'warn');
      await gcode(`SET_PAUSE_AT_LAYER ENABLE=1 LAYER=${Math.round(n)}`);
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}
async function clear() {
  try {
    if (nextLayer.value.enable) await gcode('SET_PAUSE_NEXT_LAYER ENABLE=0');
    if (atLayer.value.enable) await gcode('SET_PAUSE_AT_LAYER ENABLE=0');
  } catch (e) {
    toast(e.message, 'error');
  }
}
</script>
<template>
  <template v-if="avail">
    <button
      v-if="pending"
      class="btn"
      :class="{ lg: !compact, out: !compact }"
      :data-tip="t('Click to cancel the pause')"
      @click="clear"
    >
      <Icon name="pause" :size="compact ? 16 : 18" :stroke="2.4" />{{ t('Pauses at {where}', { where: pending }) }}
    </button>
    <button v-else class="btn" :class="{ lg: !compact, out: !compact }" @click="show">
      <Icon name="layers" :size="compact ? 16 : 18" :stroke="2.4" />{{ t('Pause at layer…') }}
    </button>
    <Modal v-if="open" :title="t('Pause at layer')" width="380px" @close="open = false">
      <p class="mu" style="margin: 0; font-size: 13px">
        {{
          t('The print pauses when that layer starts, for a colour change or to put something in. Resume continues it.')
        }}
      </p>
      <label class="col" style="gap: 4px">
        <span class="lbl"
          >{{ t('Layer') }} ({{
            t('now {cur} of {total}', { cur: layerInfo.cur || 0, total: layerInfo.total || '?' })
          }})</span
        >
        <input
          v-model.number="layer"
          type="number"
          class="input mono"
          :min="1"
          :max="layerInfo.total || undefined"
          @keydown.enter="set(layer)"
        />
      </label>
      <template #foot>
        <button v-if="has('SET_PAUSE_NEXT_LAYER')" class="btn lg" @click="set('next')">{{ t('Next layer') }}</button>
        <button class="btn lg acc" :disabled="!has('SET_PAUSE_AT_LAYER')" @click="set(layer)">
          {{ t('Pause at layer {n}', { n: layer }) }}
        </button>
      </template>
    </Modal>
  </template>
</template>
