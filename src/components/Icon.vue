<script setup>
import { ICONS } from '../icons'
defineProps({ name: String, size: { type: [Number, String], default: 20 }, stroke: { type: [Number, String], default: 2.2 } })
</script>
<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="ICONS[name] || ICONS.star" /></svg>
</template>
