<script setup>
// Webcam page: one camera large, or all of them side by side ("All cameras", the default when there is more than
// one). Click a camera in the grid to open it on its own.
import { ref, computed, onMounted, watch } from 'vue'
import Icon from '../components/Icon.vue'
import WebcamView from '../components/WebcamView.vue'
import { state } from '../store'
import { api } from '../api/moonraker'
import { t } from '../i18n'
const cams = computed(() => state.webcams.filter((w) => w.enabled !== false))
const opts = () => (state.settings.cardOpts ||= {})
// '' = all cameras, otherwise a camera name. Remembered between visits.
const sel = ref(opts().camPage ?? '')
watch(sel, (v) => { opts().camPage = v })
function takeAnchor() { if (state.anchor?.startsWith('cam:')) { sel.value = state.anchor.slice(4); state.anchor = '' } }
onMounted(takeAnchor)
watch(() => state.anchor, takeAnchor)
const all = computed(() => cams.value.length > 1 && !cams.value.some((w) => w.name === sel.value))
const cam = computed(() => cams.value.find((w) => w.name === sel.value) || cams.value[0] || null)
const wrap = ref(null)
function full() { wrap.value?.requestFullscreen?.() }
function snapshot(c) { if (c) window.open(api.url(c.snapshot_url), '_blank') }
</script>
<template>
  <div class="split" style="min-height:calc(100vh / var(--zoom, 1) - 208px)">
    <section class="card grow" ref="wrap">
      <div class="card-h"><h2>{{ all ? t('All cameras') : cam?.name || t('Webcam') }}</h2><div class="acts"><button v-if="!all" class="btn" :disabled="!cam" @click="snapshot(cam)"><Icon name="snap" :size="16" :stroke="2.4" />{{ t('Snapshot') }}</button><button class="btn" @click="full"><Icon name="ext" :size="16" :stroke="2.4" />{{ t('Fullscreen') }}</button></div></div>
      <div v-if="all" class="cg" :class="'n' + Math.min(cams.length, 4)">
        <div v-for="w in cams" :key="w.name" class="ct">
          <WebcamView :cam="w" />
          <div class="ctb"><b>{{ w.name }}</b><button class="btn sm" @click="sel = w.name">{{ t('Open') }}</button></div>
        </div>
      </div>
      <WebcamView v-else :cam="cam" />
    </section>
    <div class="side-col">
      <section class="card">
        <div class="card-h"><h2>{{ t('Cameras') }}</h2></div>
        <div v-if="!cams.length" class="empty">{{ t('No webcams. Add one in Mainsail or moonraker.conf ([webcam] section).') }}</div>
        <button v-if="cams.length > 1" class="cm" :class="{ on: all }" @click="sel = ''">
          <Icon name="grid" :size="18" /><div class="col" style="gap:2px"><b>{{ t('All cameras') }}</b><span class="mono mu" style="font-size:11px">{{ t('{n} side by side', { n: cams.length }) }}</span></div>
        </button>
        <button v-for="w in cams" :key="w.name" class="cm" :class="{ on: !all && w.name === cam?.name }" @click="sel = w.name">
          <Icon name="camera" :size="18" /><div class="col" style="gap:2px"><b>{{ w.name }}</b><span class="mono mu" style="font-size:11px">{{ w.service }} · {{ w.target_fps }} fps</span></div>
        </button>
      </section>
      <section v-if="cam && !all" class="card">
        <div class="card-h"><h2>{{ t('Stream') }}</h2></div>
        <div class="kv"><span class="mu">{{ t('Stream') }}</span><span class="mono">{{ cam.stream_url }}</span></div>
        <div class="kv"><span class="mu">{{ t('Snapshot') }}</span><span class="mono">{{ cam.snapshot_url }}</span></div>
        <div class="kv"><span class="mu">{{ t('Flip / rotate') }}</span><span class="mono">{{ cam.flip_horizontal ? 'H ' : '' }}{{ cam.flip_vertical ? 'V ' : '' }}{{ cam.rotation || 0 }}°</span></div>
      </section>
    </div>
  </div>
</template>
<style scoped>
.cm { display: flex; align-items: center; gap: 12px; padding: 12px; background: transparent; border: 1px solid var(--bd); border-radius: 10px; text-align: left; color: var(--tx); }
.cm.on { background: var(--s2); border-color: var(--ac); }
.mu { color: var(--mu); }
.kv { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.kv .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cg { flex: 1; display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; }
.cg.n2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cg.n3, .cg.n4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 900px) { .cg { grid-template-columns: 1fr !important; } }
.ct { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ctb { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; }
</style>
