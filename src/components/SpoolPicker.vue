<script setup>
// Choose the active Spoolman spool (or clear it). Opened from the Spool card and the Spoolman tile above the
// dashboard through state.spoolPick; rendered once in App.vue.
import { ref, computed, onMounted } from 'vue';
import Modal from './Modal.vue';
import { state, toast, loadSpool } from '../store';
import { api } from '../api/moonraker';
import { t } from '../i18n';

const sp = computed(() => state.spoolman.spool);
const spools = ref([]);
const q = ref('');
const close = () => (state.spoolPick = false);
onMounted(async () => {
  try {
    const r = await api.call('server.spoolman.proxy', {
      request_method: 'GET',
      path: '/v1/spool',
      query: 'allow_archived=false',
      use_v2_response: true,
    });
    spools.value = r.response || [];
  } catch (e) {
    toast(e.message, 'error');
  }
});
const shown = computed(() =>
  spools.value.filter(
    (s) =>
      !q.value ||
      JSON.stringify([s.id, s.filament?.name, s.filament?.material, s.filament?.vendor?.name])
        .toLowerCase()
        .includes(q.value.toLowerCase()),
  ),
);
async function pick(s) {
  close();
  try {
    await api.call('server.spoolman.post_spool_id', { spool_id: s ? s.id : null });
    await loadSpool();
  } catch (e) {
    toast(e.message, 'error');
  }
}
</script>

<template>
  <Modal :title="t('Choose spool')" width="560px" @close="close">
    <input v-model="q" class="input" :placeholder="t('Search spools')" />
    <div class="pl">
      <button v-for="s in shown" :key="s.id" class="btn clear pi" :class="{ on: sp?.id === s.id }" @click="pick(s)">
        <i class="sw" :style="{ background: '#' + (s.filament?.color_hex || '777') }"></i>
        <span class="grow" style="text-align: left"
          >#{{ s.id }} {{ s.filament?.name }} <span class="mu">{{ s.filament?.material }}</span></span
        >
        <span class="mono mu">{{ Math.round(s.remaining_weight || 0) }} g</span>
      </button>
      <div v-if="!shown.length" class="empty">{{ t('No spools found') }}</div>
    </div>
    <template #foot
      ><button class="btn lg" @click="pick(null)">{{ t('Clear active spool') }}</button></template
    >
  </Modal>
</template>

<style scoped>
.mu {
  color: var(--mu);
  font-size: 12.5px;
  font-weight: 400;
}
.pl {
  max-height: calc(50vh / var(--zoom, 1));
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.pi {
  justify-content: flex-start;
  height: 42px;
  font-weight: 500;
  color: var(--tx);
  gap: 10px;
}
.pi.on {
  background: var(--s2);
}
.sw {
  width: 16px;
  height: 16px;
  border-radius: 8px;
  flex-shrink: 0;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2);
}
.empty {
  padding: 16px;
  color: var(--mu);
}
</style>
