<script setup>
// The large picture of a thumbnail under the mouse (thumbZoom.js): up to 500 px, over the thumbnail, which sits in
// its bottom left corner (bottom right when there is no room to the right; a top corner when none above).
import { computed } from 'vue';
import { zoom } from '../thumbZoom';
const SIZE = 500;
const style = computed(() => {
  const r = zoom.rect;
  if (!r) return {};
  const W = window.innerWidth,
    Hh = window.innerHeight;
  const s = Math.min(SIZE, Hh - 16, W - 16);
  let left = r.left + s <= W - 8 ? r.left : r.right - s;
  let top = r.bottom - s >= 8 ? r.bottom - s : r.top;
  left = Math.max(8, Math.min(left, W - s - 8));
  top = Math.max(8, Math.min(top, Hh - s - 8));
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
