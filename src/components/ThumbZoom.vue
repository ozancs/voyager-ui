<script setup>
// The large picture of a thumbnail under the mouse (thumbZoom.js): up to 500 px, beside the pointer, on the side
// of the window that has room.
import { computed } from 'vue';
import { zoom } from '../thumbZoom';
const SIZE = 500;
const style = computed(() => {
  const s = Math.min(SIZE, window.innerHeight - 40, window.innerWidth - 40);
  const right = zoom.x + 24 + s < window.innerWidth;
  const left = right ? zoom.x + 24 : Math.max(8, zoom.x - 24 - s);
  const top = Math.max(8, Math.min(zoom.y - s / 2, window.innerHeight - s - 8));
  return { width: s + 'px', height: s + 'px', left: left + 'px', top: top + 'px' };
});
</script>
<template>
  <div v-if="zoom.src" class="tz" :style="style"><img :src="zoom.src" alt="" /></div>
</template>
<style scoped>
.tz {
  position: fixed;
  z-index: 400;
  pointer-events: none;
  background: var(--s1);
  border: 1px solid var(--bd);
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
  padding: 10px;
  display: grid;
  place-items: center;
}
.tz img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
