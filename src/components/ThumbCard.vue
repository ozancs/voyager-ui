<script setup>
// Thumbnail card: the current (or last) file's picture as big as the card, with its name and progress. A click
// shows it over the whole window.
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import ImageZoom from './ImageZoom.vue';
import { state, S, printState, progress } from '../store';
import { api } from '../api/moonraker';
import { t } from '../i18n';
const ps = computed(() => S('print_stats'));
const src = computed(() => {
  const m = state.currentMeta;
  if (!m?.thumbnails?.length) return null;
  const big = [...m.thumbnails].sort((a, b) => b.width - a.width)[0];
  const dir = (ps.value.filename || '').split('/').slice(0, -1).join('/');
  return api.fileUrl('gcodes', (dir ? dir + '/' : '') + big.relative_path);
});
const active = computed(() => ['printing', 'paused'].includes(printState.value));
const zoom = ref(false);
</script>
<template>
  <section class="card tc">
    <div class="card-h">
      <h2>{{ t('Thumbnail') }}</h2>
      <span v-if="active" class="mono mu">{{ Math.round(progress * 100) }}%</span>
      <CardCollapse />
    </div>
    <button v-if="src" class="pic" :aria-label="t('Show larger')" @click="zoom = true">
      <img :src="src" alt="" />
    </button>
    <div v-else class="pic none">
      <Icon name="cube" :size="40" :stroke="1.4" />
      <span>{{ ps.filename ? t('This file has no thumbnail') : t('No file loaded') }}</span>
    </div>
    <span v-if="ps.filename" class="fn mono">{{ ps.filename.split('/').pop() }}</span>
    <ImageZoom v-if="zoom && src" :src="src" @close="zoom = false" />
  </section>
</template>
<style scoped>
.tc {
  gap: 10px;
}
.pic {
  flex: 1;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  padding: 0;
  border-radius: 10px;
  background: var(--plate);
  overflow: hidden;
  cursor: zoom-in;
}
.pic img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.pic.none {
  flex-direction: column;
  gap: 8px;
  color: var(--mu2);
  font-size: 12.5px;
  cursor: default;
}
.fn {
  font-size: 12px;
  color: var(--mu);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mu {
  color: var(--mu);
  font-size: 12.5px;
}
</style>
