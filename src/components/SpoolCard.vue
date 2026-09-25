<script setup>
defineOptions({ inheritAttrs: false })
import { ref, computed } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { state, toast } from '../store'
import { loadSpool } from '../store'
import { api } from '../api/moonraker'
import { t } from '../i18n'

const sp = computed(() => state.spoolman.spool)
const pct = computed(() => (sp.value?.initial_weight ? Math.max(0, Math.min(100, (sp.value.remaining_weight / sp.value.initial_weight) * 100)) : null))
const color = computed(() => '#' + (sp.value?.filament?.color_hex || '777777'))
const picking = ref(false)
const spools = ref([])
const q = ref('')
async function openPick() {
  picking.value = true
  try {
    const r = await api.call('server.spoolman.proxy', { request_method: 'GET', path: '/v1/spool', query: 'allow_archived=false', use_v2_response: true })
    spools.value = r.response || []
  } catch (e) { toast(e.message, 'error') }
}
const shown = computed(() => spools.value.filter((s) => !q.value || JSON.stringify([s.id, s.filament?.name, s.filament?.material, s.filament?.vendor?.name]).toLowerCase().includes(q.value.toLowerCase())))
async function pick(s) {
  picking.value = false
  try { await api.call('server.spoolman.post_spool_id', { spool_id: s ? s.id : null }); await loadSpool() } catch (e) { toast(e.message, 'error') }
}
</script>

<template>
  <section v-bind="$attrs" class="card t-spool">
    <div class="card-h"><h2>{{ t('Spool') }}</h2><button class="btn" @click="openPick"><Icon name="spool" :size="16" />{{ t('Change') }}</button></div>
    <div v-if="sp" class="row" style="gap:16px">
      <div class="reel" :style="{ '--c': color }"><div></div></div>
      <div class="col grow" style="gap:4px;min-width:0">
        <b style="font-size:16px">{{ sp.filament?.name || t('Spool') }} <span class="mu">#{{ sp.id }}</span></b>
        <span class="mu">{{ [sp.filament?.vendor?.name, sp.filament?.material].filter(Boolean).join(' · ') }}</span>
        <div class="bar"><div :style="{ width: (pct ?? 0) + '%', background: 'var(--spool)' }"></div></div>
        <span class="mono">{{ Math.round(sp.remaining_weight || 0) }} g <span class="mu">/ {{ Math.round(sp.initial_weight || 0) }} g</span></span>
      </div>
    </div>
    <div v-else class="empty">{{ state.spoolman.server ? t('No active spool') : t('Spoolman is not set up in moonraker.conf') }}</div>
  </section>
  <Modal v-if="picking" :title="t('Choose spool')" width="560px" @close="picking = false">
    <input v-model="q" class="input" :placeholder="t('Search spools')" />
    <div class="pl">
      <button v-for="s in shown" :key="s.id" class="btn clear pi" :class="{ on: sp?.id === s.id }" @click="pick(s)">
        <i class="sw" :style="{ background: '#' + (s.filament?.color_hex || '777') }"></i>
        <span class="grow" style="text-align:left">#{{ s.id }} {{ s.filament?.name }} <span class="mu">{{ s.filament?.material }}</span></span>
        <span class="mono mu">{{ Math.round(s.remaining_weight || 0) }} g</span>
      </button>
      <div v-if="!shown.length" class="empty">{{ t('No spools found') }}</div>
    </div>
    <template #foot><button class="btn lg" @click="pick(null)">{{ t('Clear active spool') }}</button></template>
  </Modal>
</template>

<style scoped>
.reel { width: 64px; height: 64px; border-radius: 32px; background: var(--c); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: inset 0 0 0 6px rgba(0,0,0,.25); }
.reel div { width: 20px; height: 20px; border-radius: 10px; background: var(--spool-bg); }
.mu { color: var(--mu); font-size: 12.5px; font-weight: 400; }
.pl { max-height: calc(50vh / var(--zoom, 1)); overflow: auto; display: flex; flex-direction: column; }
.pi { justify-content: flex-start; height: 42px; font-weight: 500; color: var(--tx); gap: 10px; }
.pi.on { background: var(--s2); }
.sw { width: 16px; height: 16px; border-radius: 8px; flex-shrink: 0; box-shadow: 0 0 0 1px rgba(255,255,255,.2); }
</style>
