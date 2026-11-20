<script setup>
// Draws an icon by name. Built-in names come from icons.js (stroke paths). Names starting with
// 'l:' come from the Lucide subset in icons-extra.js, loaded on first use. 'brand:' names are OznLab's own plugin
// logos in their colours (PA Sensei, Lightspeed), drawn as images so they keep those colours.
import { computed } from 'vue';
import { ICONS } from '../icons';
import { extra, loadExtra, isExtra } from '../iconsExtra';
import senseiLogo from '../assets/brand/pa-sensei.svg';
import lightspeedLogo from '../assets/brand/lightspeed.svg';
const BRAND = { sensei: senseiLogo, lightspeed: lightspeedLogo };
const props = defineProps({
  name: String,
  size: { type: [Number, String], default: 20 },
  stroke: { type: [Number, String], default: 2.2 },
});
const brand = computed(() => (props.name?.startsWith('brand:') ? BRAND[props.name.slice(6)] || null : null));
// 'l:<name>' comes from the Lucide set (only the markup shipped with this app, never user text)
const ext = computed(() => {
  if (!isExtra(props.name)) return null;
  if (!extra.value) {
    loadExtra();
    return '';
  }
  return extra.value[props.name.slice(2)]?.[0] ?? '';
});
</script>
<template>
  <img
    v-if="brand"
    :src="brand"
    :width="size"
    :height="size"
    alt=""
    aria-hidden="true"
    draggable="false"
    style="flex-shrink: 0; object-fit: contain"
  />
  <svg
    v-else
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <g v-if="ext !== null" v-html="ext" />
    <path v-else :d="ICONS[name] || ICONS.star" />
  </svg>
</template>
