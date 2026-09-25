<script setup>
import { computed } from 'vue'
import { ICONS } from '../icons'
import { extra, loadExtra, isExtra } from '../iconsExtra'
const props = defineProps({ name: String, size: { type: [Number, String], default: 20 }, stroke: { type: [Number, String], default: 2.2 } })
// 'l:<name>' comes from the Lucide set (only the markup shipped with this app, never user text)
const ext = computed(() => {
  if (!isExtra(props.name)) return null
  if (!extra.value) { loadExtra(); return '' }
  return extra.value[props.name.slice(2)]?.[0] ?? ''
})
</script>
<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g v-if="ext !== null" v-html="ext" /><path v-else :d="ICONS[name] || ICONS.star" /></svg>
</template>
