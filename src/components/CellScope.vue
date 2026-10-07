<script setup>
// Wraps one dashboard card and tells the card's header (CardCollapse) whether the card can fold, whether it is
// folded and how to toggle it. Renders no element of its own, so `.cell > .card` selectors keep working.
import { provide, computed } from 'vue';
const props = defineProps({ collapsed: Boolean, can: Boolean });
const emit = defineEmits(['toggle']);
provide('cellCollapse', {
  collapsed: computed(() => props.collapsed),
  can: computed(() => props.can),
  toggle: () => emit('toggle'),
});
</script>
<template><slot /></template>
