<script setup>
import { ref, watch } from 'vue';
import { t } from '../i18n';
const props = defineProps({
  label: String,
  modelValue: [Number, String],
  unit: String,
  step: { type: Number, default: 1 },
  min: Number,
  max: Number,
  decimals: { type: Number, default: 0 },
});
const emit = defineEmits(['update:modelValue', 'commit']);
const local = ref(props.modelValue);
const editing = ref(false);
watch(
  () => props.modelValue,
  (v) => {
    if (!editing.value) local.value = v;
  },
);
const fmt = (v) => (v === '' || v == null || isNaN(v) ? v : Number(v).toFixed(props.decimals));
function clamp(v) {
  if (props.min != null) v = Math.max(props.min, v);
  if (props.max != null) v = Math.min(props.max, v);
  return v;
}
function bump(d) {
  const v = clamp(Math.round(((Number(local.value) || 0) + d * props.step) * 1e6) / 1e6);
  local.value = v;
  emit('update:modelValue', v);
  emit('commit', v);
}
function commit() {
  editing.value = false;
  const v = Number(local.value);
  if (String(local.value).trim() === '' || isNaN(v)) {
    local.value = props.modelValue;
    return;
  } // an emptied field is not 0
  emit('update:modelValue', clamp(v));
  emit('commit', clamp(v));
}
</script>
<template>
  <label class="nf">
    <span v-if="label" class="nf-l">{{ label }}</span>
    <span class="nf-b">
      <button type="button" :aria-label="t('Decrease')" @click="bump(-1)">−</button>
      <input
        :value="editing ? local : fmt(local)"
        @focus="editing = true"
        @input="local = $event.target.value"
        @keydown.enter="$event.target.blur()"
        @blur="commit"
        :aria-label="label"
      />
      <span v-if="unit" class="u">{{ unit }}</span>
      <button type="button" :aria-label="t('Increase')" @click="bump(1)">+</button>
    </span>
  </label>
</template>
<style scoped>
.nf {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.nf-l {
  font-size: 13px;
  font-weight: 500;
  color: var(--mu);
}
.nf-b {
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--s2);
  border: 1px solid transparent;
  border-radius: var(--rb);
  overflow: hidden;
}
.nf-b:focus-within {
  border-color: var(--ac);
}
.nf-b button {
  width: 36px;
  height: 38px;
  background: transparent;
  border: none;
  color: var(--mu);
  font-size: 18px;
  font-weight: 700;
  flex-shrink: 0;
}
.nf-b button:hover {
  color: var(--ac);
}
.nf-b input {
  flex: 1;
  min-width: 0;
  height: 38px;
  background: transparent;
  border: none;
  outline: none;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.u {
  font-size: 12px;
  color: var(--mu);
}
</style>
