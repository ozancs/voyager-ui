<script setup>
import { computed, ref, watch } from 'vue'
const props = defineProps({ modelValue: Number, min: { type: Number, default: 0 }, max: { type: Number, default: 100 }, step: { type: Number, default: 1 }, label: String, display: String })
const emit = defineEmits(['update:modelValue', 'commit'])
const local = ref(props.modelValue)
const drag = ref(false)
watch(() => props.modelValue, (v) => { if (!drag.value) local.value = v })
const pct = computed(() => Math.max(0, Math.min(1, ((local.value ?? 0) - props.min) / (props.max - props.min))))
function onInput(e) { drag.value = true; local.value = Number(e.target.value); emit('update:modelValue', local.value) }
function onChange(e) { drag.value = false; emit('commit', Number(e.target.value)) }
</script>
<template>
  <div class="col" style="gap:6px">
    <div v-if="label" class="row" style="justify-content:space-between"><span class="lbl">{{ label }}</span><span class="mono" style="font-size:14px;font-weight:700">{{ display ?? local }}</span></div>
    <input class="rng" type="range" :min="min" :max="max" :step="step" :value="local" :style="{ '--f': pct }" :aria-label="label" @input="onInput" @change="onChange" />
  </div>
</template>
