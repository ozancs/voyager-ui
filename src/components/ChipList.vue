<script setup>
// A list of numbers shown as chips: click the x to remove, type a value and press Enter to add.
import { ref } from 'vue';
import Icon from './Icon.vue';
import { t } from '../i18n';
const props = defineProps({ modelValue: Array, label: String, max: { type: Number, default: 8 }, desc: Boolean });
const emit = defineEmits(['update:modelValue']);
const draft = ref('');
function set(list) {
  emit(
    'update:modelValue',
    [...new Set(list.filter((x) => x > 0))].sort((a, b) => (props.desc ? b - a : a - b)),
  );
}
function add() {
  const v = parseFloat(String(draft.value).replace(',', '.'));
  draft.value = '';
  if (!isNaN(v) && v > 0 && !(props.modelValue || []).includes(v) && (props.modelValue || []).length < props.max)
    set([...(props.modelValue || []), v]);
}
</script>
<template>
  <div class="cl" role="group" :aria-label="label">
    <span v-for="v in modelValue" :key="v" class="ch mono"
      >{{ v
      }}<button
        type="button"
        :aria-label="t('Remove {name}', { name: String(v) })"
        @click="set(modelValue.filter((x) => x !== v))"
      >
        <Icon name="x" :size="12" :stroke="2.6" /></button
    ></span>
    <input
      v-model="draft"
      class="add mono"
      type="text"
      inputmode="decimal"
      :placeholder="modelValue?.length < max ? '+' : ''"
      :disabled="modelValue?.length >= max"
      :aria-label="t('Add value')"
      @keydown.enter.prevent="add"
      @blur="add"
    />
  </div>
</template>
<style scoped>
.cl {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 40px;
  padding: 5px 8px;
  background: var(--s2);
  border-radius: var(--rb);
  border: 1px solid transparent;
}
.cl:focus-within {
  border-color: var(--ac);
}
.ch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 4px 0 10px;
  border-radius: 14px;
  background: var(--s3);
  font-size: 12.5px;
  font-weight: 600;
}
.ch button {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--mu);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ch button:hover {
  background: var(--s1);
  color: var(--tx);
}
.add {
  width: 48px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--tx);
  outline: none;
  font-size: 13px;
}
.add::placeholder {
  color: var(--mu2);
  font-weight: 700;
}
</style>
