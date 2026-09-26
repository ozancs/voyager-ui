<script setup>
// A bare range input that follows the pointer while dragging: the fill and the live value move with the thumb,
// the printer's value is only taken over again once it has caught up (or after a short wait), so the thumb never
// jumps back while a command is on its way.
import { computed, ref, watch, onBeforeUnmount } from 'vue';
const props = defineProps({
  value: Number,
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  label: String,
});
const emit = defineEmits(['live', 'input', 'commit']);
const local = ref(props.value);
let held = false,
  tm;
watch(
  () => props.value,
  (v) => {
    if (!held) local.value = v;
    else if (v === local.value) release();
  },
);
function release() {
  held = false;
  clearTimeout(tm);
  local.value = props.value;
  emit('live', null);
}
function onInput(e) {
  held = true;
  clearTimeout(tm);
  local.value = Number(e.target.value);
  emit('live', local.value);
  emit('input', local.value);
}
function onChange(e) {
  emit('commit', Number(e.target.value));
  clearTimeout(tm);
  tm = setTimeout(release, 2000); // the printer did not report this value back: show what it has
}
onBeforeUnmount(() => clearTimeout(tm));
const f = computed(() => Math.max(0, Math.min(1, ((local.value ?? 0) - props.min) / (props.max - props.min || 1))));
</script>
<template>
  <input
    class="rng"
    type="range"
    :min="min"
    :max="max"
    :step="step"
    :value="local"
    :style="{ '--f': f }"
    :aria-label="label"
    @input="onInput"
    @change="onChange"
  />
</template>
