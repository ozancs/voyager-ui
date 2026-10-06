<script setup>
// Webcam page: one camera large, or all of them side by side ("All cameras", the default when there is more than
// one). Click a camera in the grid to open it on its own.
import { ref, computed, onMounted, watch } from 'vue';
import Icon from '../components/Icon.vue';
import WebcamView from '../components/WebcamView.vue';
import TimelapsePanel from '../components/TimelapsePanel.vue';
import TimelapseSettings from '../components/TimelapseSettings.vue';
import { state } from '../store';
import { api } from '../api/moonraker';
import { route } from '../router';
import { tl } from '../timelapse';
import { t } from '../i18n';
const cams = computed(() => state.webcams.filter((w) => w.enabled !== false));
const opts = () => (state.settings.cardOpts ||= {});
// '' = all cameras, 'timelapse' = the timelapse panel, otherwise a camera name. Remembered between visits.
const TL = '\u0000timelapse'; // cannot clash with a camera name
const sel = ref(route.arg === 'timelapse' ? TL : (opts().camPage ?? ''));
watch(sel, (v) => {
  opts().camPage = v;
});
function takeAnchor() {
  if (state.anchor?.startsWith('cam:')) {
    sel.value = state.anchor.slice(4);
    state.anchor = '';
  } else if (state.anchor?.startsWith('timelapse:')) sel.value = TL; // the panel takes the anchor from there
}
onMounted(takeAnchor);
watch(() => state.anchor, takeAnchor);
watch(
  () => route.arg,
  (a) => a === 'timelapse' && (sel.value = TL),
);
const lapse = computed(() => sel.value === TL && tl.has);
const all = computed(() => !lapse.value && cams.value.length > 1 && !cams.value.some((w) => w.name === sel.value));
const cam = computed(() => cams.value.find((w) => w.name === sel.value) || cams.value[0] || null);
const wrap = ref(null);
function full() {
  wrap.value?.requestFullscreen?.();
}
function snapshot(c) {
  if (c) window.open(api.url(c.snapshot_url), '_blank', 'noopener');
}
</script>
<template>
  <div class="split" style="min-height: calc(100vh / var(--zoom, 1) - 208px)">
    <section class="card grow" ref="wrap">
      <div class="card-h">
        <h2>{{ lapse ? t('Timelapse') : all ? t('All cameras') : cam?.name || t('Webcam') }}</h2>
        <div v-if="!lapse" class="acts">
          <button v-if="!all" class="btn" :disabled="!cam" @click="snapshot(cam)">
            <Icon name="snap" :size="16" :stroke="2.4" />{{ t('Snapshot') }}</button
          ><button class="btn" @click="full"><Icon name="ext" :size="16" :stroke="2.4" />{{ t('Fullscreen') }}</button>
        </div>
      </div>
      <TimelapsePanel v-if="lapse" />
      <div v-else-if="all" class="cg" :class="'n' + Math.min(cams.length, 4)">
        <div v-for="w in cams" :key="w.name" class="ct">
          <WebcamView :cam="w" />
          <div class="ctb">
            <b>{{ w.name }}</b
            ><button class="btn sm" @click="sel = w.name">{{ t('Open') }}</button>
          </div>
        </div>
      </div>
      <WebcamView v-else :cam="cam" />
    </section>
    <div class="side-col">
      <section class="card">
        <div class="card-h">
          <h2>{{ t('Cameras') }}</h2>
        </div>
        <div v-if="!cams.length" class="empty">
          {{ t('No webcams. Add one in Mainsail or moonraker.conf ([webcam] section).') }}
        </div>
        <button v-if="cams.length > 1" class="cm" :class="{ on: all }" @click="sel = ''">
          <Icon name="grid" :size="18" />
          <div class="col" style="gap: 2px">
            <b>{{ t('All cameras') }}</b
            ><span class="mono mu" style="font-size: 11px">{{ t('{n} side by side', { n: cams.length }) }}</span>
          </div>
        </button>
        <button
          v-for="w in cams"
          :key="w.name"
          class="cm"
          :class="{ on: !all && !lapse && w.name === cam?.name }"
          @click="sel = w.name"
        >
          <Icon name="camera" :size="18" />
          <div class="col" style="gap: 2px">
            <b>{{ w.name }}</b
            ><span class="mono mu" style="font-size: 11px">{{ w.service }} · {{ w.target_fps }} fps</span>
          </div>
        </button>
        <button v-if="tl.has" class="cm" :class="{ on: lapse }" @click="sel = TL">
          <Icon name="video" :size="18" />
          <div class="col" style="gap: 2px">
            <b>{{ t('Timelapse') }}</b
            ><span class="mono mu" style="font-size: 11px">{{
              tl.settings?.enabled
                ? tl.frames
                  ? t('{n} frames', { n: tl.frames })
                  : t('recording the next print')
                : t('off')
            }}</span>
          </div>
        </button>
      </section>
      <section v-if="lapse" class="card">
        <div class="card-h">
          <h2>{{ t('Timelapse settings') }}</h2>
        </div>
        <TimelapseSettings />
      </section>
      <section v-if="cam && !all && !lapse" class="card">
        <div class="card-h">
          <h2>{{ t('Stream') }}</h2>
        </div>
        <div class="kv">
          <span class="mu">{{ t('Stream') }}</span
          ><span class="mono">{{ cam.stream_url }}</span>
        </div>
        <div class="kv">
          <span class="mu">{{ t('Snapshot') }}</span
          ><span class="mono">{{ cam.snapshot_url }}</span>
        </div>
        <div class="kv">
          <span class="mu">{{ t('Flip / rotate') }}</span
          ><span class="mono"
            >{{ cam.flip_horizontal ? 'H ' : '' }}{{ cam.flip_vertical ? 'V ' : '' }}{{ cam.rotation || 0 }}°</span
          >
        </div>
      </section>
    </div>
  </div>
</template>
<style scoped>
.cm {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: transparent;
  border: 1px solid var(--bd);
  border-radius: 10px;
  text-align: left;
  color: var(--tx);
}
.cm.on {
  background: var(--s2);
  border-color: var(--ac);
}
.mu {
  color: var(--mu);
}
.kv {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}
.kv .mono {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cg {
  flex: 1;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
}
.cg.n2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.cg.n3,
.cg.n4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (max-width: 900px) {
  .cg {
    grid-template-columns: 1fr !important;
  }
}
.ct {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.ctb {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}
</style>
