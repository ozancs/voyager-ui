<script setup>
// Voyager UI mark: graphite tile, amber probe with its trail of dots
// A printer icon picked in Settings > Appearance replaces it (only where `own` is set, i.e. the top bar).
import { computed } from 'vue'
import { iconUrl } from '../printerIcon'
const props = defineProps({ size: { type: Number, default: 40 }, own: Boolean })
const url = computed(() => (props.own ? iconUrl() : null))
</script>
<template>
  <img v-if="url" class="lg im" :src="url" :width="size" :height="size" alt="" />
  <svg v-else class="lg" :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#23262b" />
    <path d="M12 48 L52 16 L40 50 L33 36 Z" fill="#f5b23a" />
    <path d="M33 36 L52 16" stroke="#23262b" stroke-width="2.5" />
    <g fill="#f5b23a"><circle cx="15" cy="20" r="2" /><circle cx="24" cy="15" r="1.5" /><circle cx="20" cy="30" r="1.5" /></g>
  </svg>
</template>
<style scoped>
.lg { display: block; flex-shrink: 0; border-radius: 22%; }
.im { object-fit: contain; }
:root[data-theme="light"] .lg { box-shadow: 0 0 0 1px var(--bd); }
</style>
