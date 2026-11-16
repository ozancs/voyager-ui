<script setup>
// A heater's target: a field with Set, then Off and the material presets. Used in the pop-up of a temperature tile
// and of the hotend and bed temperatures in the top bar. Emits done once a target is sent.
import { ref, computed } from 'vue';
import { S, prettyName, setHeater, allPresets } from '../store';
import { t } from '../i18n';

const props = defineProps({ obj: String });
const emit = defineEmits(['done']);
const tgt = ref('');
// the field takes the typing as soon as the pop-up opens (with a mouse; on a touch screen the keyboard would pop up
// on every tap)
const vFocus = {
  mounted: (el) => window.matchMedia?.('(pointer: fine)').matches && el.focus({ preventScroll: true }),
};
function set(v) {
  if (v === '' || v == null || isNaN(+v)) return;
  setHeater(props.obj, +v)?.catch?.(() => {});
  emit('done');
}
const presets = computed(() => allPresets.value.filter((p) => p.temps[props.obj]));
// Off and the presets in even rows (2 + 2 rather than 3 + 1), at most three to a row
const cols = computed(() => {
  const n = presets.value.length + 1;
  return n <= 3 ? n : Math.ceil(n / Math.ceil(n / 3));
});
</script>
<template>
  <span class="lbl">{{ t('{name} target', { name: prettyName(obj) }) }}</span>
  <div class="row">
    <input
      v-focus
      class="input mono grow"
      type="number"
      v-model="tgt"
      :placeholder="String(S(obj).target ?? 0)"
      @keydown.enter="set(tgt)"
      :aria-label="t('Target temperature')"
    /><button class="btn acc" style="height: 40px" @click="set(tgt)">{{ t('Set') }}</button>
  </div>
  <div class="seg pre" :style="{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }">
    <button @click="set(0)">{{ t('Off') }}</button
    ><button v-for="p in presets" :key="p.id" :title="p.name + ' ' + p.temps[obj]" @click="set(p.temps[obj])">
      {{ p.name }} {{ p.temps[obj] }}
    </button>
  </div>
</template>
<style scoped>
.pre {
  display: grid;
}
.pre button {
  min-width: 0;
  padding: 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
