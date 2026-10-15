<script setup>
// A picture shown as large as the window allows, over everything; a click anywhere or Escape closes it.
import { onMounted, onBeforeUnmount } from 'vue';
import { t } from '../i18n';
defineProps({ src: String });
const emit = defineEmits(['close']);
const key = (e) => e.key === 'Escape' && emit('close');
onMounted(() => window.addEventListener('keydown', key));
onBeforeUnmount(() => window.removeEventListener('keydown', key));
</script>
<template>
  <Teleport to="body">
    <div class="iz" role="dialog" :aria-label="t('Thumbnail')" @click="emit('close')">
      <img :src="src" alt="" />
    </div>
  </Teleport>
</template>
<style scoped>
.iz {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  cursor: zoom-out;
}
.iz img {
  max-width: 100%;
  max-height: 100%;
  min-width: min(480px, 90vw);
  object-fit: contain;
  image-rendering: auto;
}
</style>
