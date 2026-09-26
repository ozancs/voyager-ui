<script setup>
// Shows an image from a Moonraker root (e.g. the Shake&Tune graphs in config/ShakeTune_results).
// The arrows (and the arrow keys) go through the other images of the same folder.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Modal from './Modal.vue'
import Icon from './Icon.vue'
import { api } from '../api/moonraker'
import { t } from '../i18n'
const props = defineProps({ root: { type: String, default: 'config' }, list: Array, start: String })
const emit = defineEmits(['close'])
const i = ref(Math.max(0, props.list.indexOf(props.start)))
const cur = computed(() => props.list[i.value])
const name = computed(() => cur.value.split('/').pop())
const url = computed(() => api.fileUrl(props.root, cur.value))
const go = (d) => { i.value = (i.value + d + props.list.length) % props.list.length }
const key = (e) => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1) }
onMounted(() => window.addEventListener('keydown', key))
onBeforeUnmount(() => window.removeEventListener('keydown', key))
</script>
<template>
  <Modal :title="name" width="min(1200px, 96vw)" @close="emit('close')">
    <div class="iv">
      <img :src="url" :alt="name" />
    </div>
    <template #foot>
      <span v-if="list.length > 1" class="mono mu" style="font-size:12px;margin-right:auto">{{ i + 1 }} / {{ list.length }}</span>
      <button v-if="list.length > 1" class="btn lg ibtn" :aria-label="t('Previous')" @click="go(-1)"><Icon name="left" :size="20" :stroke="2.4" /></button>
      <button v-if="list.length > 1" class="btn lg ibtn" :aria-label="t('Next')" @click="go(1)"><Icon name="right" :size="20" :stroke="2.4" /></button>
      <a class="btn lg" :href="url" :download="name"><Icon name="download" :size="18" />{{ t('Download') }}</a>
      <a class="btn lg" :href="url" target="_blank" rel="noopener"><Icon name="ext" :size="18" />{{ t('Open') }}</a>
    </template>
  </Modal>
</template>
<style scoped>
.iv { display: flex; justify-content: center; background: #fff; border-radius: 10px; overflow: auto; max-height: calc(72vh / var(--zoom, 1)); }
.iv img { max-width: 100%; height: auto; display: block; }
.mu { color: var(--mu); }
</style>
