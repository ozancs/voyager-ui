<script setup>
// Number input with a label and unit, used in settings forms. Emits the value as a number.
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
  // fields that only change a view setting keep what was typed when focus leaves; fields that send a command to
  // the printer apply on Enter only, and Esc, Tab or a click elsewhere drop the typed value
  applyOnBlur: Boolean,
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
// sent only when the user typed something: tabbing through a field must not send back an old value the printer
// has changed since (a macro setting pressure advance while the field had focus). "0,04" is read as 0.04.
let typed = false;
function commit() {
  editing.value = false;
  if (!typed) {
    local.value = props.modelValue;
    return;
  }
  typed = false;
  const v = Number(String(local.value).trim().replace(',', '.'));
  if (String(local.value).trim() === '' || !Number.isFinite(v)) {
    local.value = props.modelValue;
    return;
  } // an emptied field is not 0, and Infinity is not a number to send
  emit('update:modelValue', clamp(v));
  emit('commit', clamp(v));
}
function revert() {
  editing.value = false;
  typed = false;
  local.value = props.modelValue;
}
function onBlur() {
  if (!editing.value) return;
  if (props.applyOnBlur) commit();
  else revert();
}
function onKey(e) {
  if (e.key === 'Enter') {
    commit();
    e.target.blur();
  } else if (e.key === 'Escape') {
    e.stopPropagation(); // the Esc closes the field edit, not the dialog around it
    revert();
    e.target.blur();
  }
}
</script>
<template>
  <label class="nf">
    <span v-if="label" class="nf-l">{{ label }}</span>
    <span class="nf-b">
      <button type="button" :aria-label="t('Decrease')" @click="bump(-1)">−</button>
      <input
        :value="editing ? local : fmt(local)"
        @focus="
          editing = true;
          typed = false;
        "
        @input="
          local = $event.target.value;
          typed = true;
        "
        @keydown="onKey"
        @blur="onBlur"
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
