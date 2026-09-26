<script setup>
defineProps({ modelValue: Boolean, label: String });
const emit = defineEmits(['update:modelValue']);
</script>
<template>
  <button
    type="button"
    class="toggle"
    :class="{ on: modelValue }"
    :aria-pressed="modelValue"
    :aria-label="label"
    @click.stop="emit('update:modelValue', !modelValue)"
  >
    <span></span>
  </button>
</template>
