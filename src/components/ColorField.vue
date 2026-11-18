<script setup>
import { ref } from 'vue';
import Modal from './Modal.vue';
import ColorEditor from './ColorEditor.vue';
import { t } from '../i18n';
defineOptions({ inheritAttrs: false });
const props = defineProps({ modelValue: String, label: String });
const emit = defineEmits(['update:modelValue']);
const open = ref(false);
function confirm(color) {
  emit('update:modelValue', color);
  open.value = false;
}
</script>
<template>
  <button
    v-bind="$attrs"
    type="button"
    class="color-field"
    :style="{ background: modelValue || '#ff6b1a' }"
    :aria-label="label || t('Custom colour')"
    @click="open = true"
  ></button>
  <Modal v-if="open" :title="label || t('Colour')" width="420px" @close="open = false"
    ><ColorEditor :color="modelValue" @confirm="confirm" @cancel="open = false"
  /></Modal>
</template>
<style scoped>
.color-field {
  width: 32px;
  height: 32px;
  min-width: 24px;
  flex: none;
  border: 1px solid var(--bd);
  border-radius: 7px;
  cursor: pointer;
  box-shadow: inset 0 0 0 2px var(--s2);
}
</style>
