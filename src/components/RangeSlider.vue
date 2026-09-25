<script setup>
// Labelled slider. While dragging, the label shows the value under the thumb (with `unit`), otherwise `display`.
import { ref } from 'vue'
import Rng from './Rng.vue'
defineProps({ modelValue: Number, min: { type: Number, default: 0 }, max: { type: Number, default: 100 }, step: { type: Number, default: 1 }, label: String, display: String, unit: String })
const emit = defineEmits(['update:modelValue', 'commit'])
const live = ref(null)
</script>
<template>
  <div class="col" style="gap:6px">
    <div v-if="label" class="row" style="justify-content:space-between"><span class="lbl">{{ label }}</span><span class="mono" style="font-size:14px;font-weight:700">{{ live != null && unit ? live + unit : display ?? live ?? modelValue }}</span></div>
    <Rng :value="modelValue" :min="min" :max="max" :step="step" :label="label" @live="live = $event" @input="emit('update:modelValue', $event)" @commit="emit('commit', $event)" />
  </div>
</template>
