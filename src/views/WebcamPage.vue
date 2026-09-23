<script setup>
import { ref, computed } from 'vue'
import Icon from '../components/Icon.vue'
import WebcamView from '../components/WebcamView.vue'
import { state } from '../store'
import { api } from '../api/moonraker'
import { t } from '../i18n'
const sel = ref(0)
const cam = computed(() => state.webcams[sel.value] || null)
const wrap = ref(null)
function full() { wrap.value?.requestFullscreen?.() }
function snapshot() { if (cam.value) window.open(api.url(cam.value.snapshot_url), '_blank') }
</script>
<template>
  <div class="split" style="min-height:calc(100vh - 208px)">
    <section class="card grow" ref="wrap">
      <div class="card-h"><h2>{{ cam?.name || t('Webcam') }}</h2><div class="acts"><button class="btn" :disabled="!cam" @click="snapshot"><Icon name="snap" :size="16" :stroke="2.4" />{{ t('Snapshot') }}</button><button class="btn" @click="full"><Icon name="ext" :size="16" :stroke="2.4" />{{ t('Fullscreen') }}</button></div></div>
      <WebcamView :cam="cam" />
    </section>
    <div class="side-col">
      <section class="card">
        <div class="card-h"><h2>{{ t('Cameras') }}</h2></div>
        <div v-if="!state.webcams.length" class="empty">{{ t('No webcams. Add one in Mainsail or moonraker.conf ([webcam] section).') }}</div>
        <button v-for="(w, i) in state.webcams" :key="w.name" class="cm" :class="{ on: i === sel }" @click="sel = i">
          <div class="col" style="gap:2px"><b>{{ w.name }}</b><span class="mono mu" style="font-size:11px">{{ w.service }} · {{ w.target_fps }} fps</span></div>
        </button>
      </section>
      <section v-if="cam" class="card">
        <div class="card-h"><h2>{{ t('Stream') }}</h2></div>
        <div class="kv"><span class="mu">{{ t('Stream') }}</span><span class="mono">{{ cam.stream_url }}</span></div>
        <div class="kv"><span class="mu">{{ t('Snapshot') }}</span><span class="mono">{{ cam.snapshot_url }}</span></div>
        <div class="kv"><span class="mu">{{ t('Flip / rotate') }}</span><span class="mono">{{ cam.flip_horizontal ? 'H ' : '' }}{{ cam.flip_vertical ? 'V ' : '' }}{{ cam.rotation || 0 }}°</span></div>
      </section>
    </div>
  </div>
</template>
<style scoped>
.cm { display: flex; align-items: center; gap: 12px; padding: 12px; background: transparent; border: 1px solid var(--bd); border-radius: 10px; text-align: left; }
.cm.on { background: var(--s2); border-color: var(--ac); }
.mu { color: var(--mu); }
.kv { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.kv .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
