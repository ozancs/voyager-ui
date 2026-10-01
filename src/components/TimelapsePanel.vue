<script setup>
// Timelapse: what the running print has captured so far (frame count, the newest frames as a film strip, how long
// the clip will be), a Render button, and the finished clips as a gallery that opens in the player.
import { ref, computed, watch, onMounted } from 'vue';
import Icon from './Icon.vue';
import TimelapsePlayer from './TimelapsePlayer.vue';
import {
  tl,
  frameUrl,
  previewUrl,
  clipDate,
  clipLength,
  framesAtEnd,
  loadFiles,
  loadFrames,
  render,
  saveFrames,
  deleteClip,
} from '../timelapse';
import { state, printState, fmtBytes, fmtTime, askConfirm, toast } from '../store';
import { t } from '../i18n';

const printing = computed(() => ['printing', 'paused'].includes(printState.value));
const open = ref(null); // clip in the player
const q = ref('');
const files = computed(() => {
  const s = q.value.trim().toLowerCase();
  return s ? tl.files.filter((f) => f.name.toLowerCase().includes(s)) : tl.files;
});
// the newest frames, newest last: frame000123.jpg -> the 7 before it
const strip = computed(() => {
  const m = /^(.*?)(\d+)(\.\w+)$/.exec(tl.lastFrame || '');
  if (!m) return [];
  const n = +m[2];
  const out = [];
  for (let k = Math.max(1, n - 7); k <= n; k++)
    out.push({ n: k, f: m[1] + String(k).padStart(m[2].length, '0') + m[3] });
  return out;
});
const camName = computed(() => {
  const c = tl.settings?.camera;
  return c ? c : state.webcams[0]?.name || t('first camera');
});
const lengthNow = computed(() => clipLength());
const lengthEnd = computed(() => (framesAtEnd.value > tl.frames ? clipLength(framesAtEnd.value) : 0));
const secs = (s) => (s >= 60 ? fmtTime(s) : s.toFixed(1) + ' s');
async function del(f) {
  if (!(await askConfirm({ title: t('Delete clip'), text: f.name, ok: t('Delete') }))) return;
  try {
    await deleteClip(f);
    if (open.value === f) open.value = null;
  } catch (e) {
    toast(e.message, 'error');
  }
}
async function renderNow() {
  if (!tl.frames) return toast(t('No frames yet'), 'warn');
  if (
    printing.value &&
    !(await askConfirm({
      title: t('Render now?'),
      text: t(
        'The clip will only have the frames taken so far. Rendering also loads the printer computer while it prints.',
      ),
      ok: t('Render'),
    }))
  )
    return;
  render();
}
// opened from the "Timelapse ready" message
watch(
  () => state.anchor,
  (a) => {
    if (!a?.startsWith('timelapse:')) return;
    const name = a.slice(10).split('/').pop();
    state.anchor = '';
    loadFiles().then(() => {
      const f = tl.files.find((x) => x.name === name);
      if (f) open.value = f;
    });
  },
  { immediate: true },
);
onMounted(() => {
  loadFiles();
  loadFrames();
});
</script>
<template>
  <div class="tlp">
    <!-- current print -->
    <div class="live" :class="{ off: !tl.settings?.enabled }">
      <div class="lhd">
        <div class="col" style="gap: 2px">
          <b v-if="!tl.settings?.enabled">{{ t('Timelapse is off') }}</b>
          <b v-else-if="printing">{{ t('Recording {name}', { name: camName }) }}</b>
          <b v-else-if="tl.frames">{{ t('Frames from the last print') }}</b>
          <b v-else>{{ t('Ready for the next print') }}</b>
          <span class="mu" style="font-size: 12.5px">
            <template v-if="!tl.settings?.enabled">{{
              t('Turn it on in the settings on the right; the next print is recorded.')
            }}</template>
            <template v-else-if="tl.settings?.mode === 'hyperlapse'">{{
              t('One frame every {n} s', { n: tl.settings.hyperlapse_cycle })
            }}</template>
            <template v-else>{{ t('One frame per layer') }}</template>
          </span>
        </div>
        <div class="row" style="gap: 6px">
          <button class="btn sm" :disabled="!tl.frames" @click="saveFrames">
            <Icon name="save" :size="15" :stroke="2.4" />{{ t('Save frames') }}
          </button>
          <button class="btn sm acc" :disabled="!tl.frames || tl.render?.status === 'running'" @click="renderNow">
            <Icon name="video" :size="15" :stroke="2.4" />{{ t('Render now') }}
          </button>
        </div>
      </div>
      <div class="stats">
        <div>
          <span class="mono n">{{ tl.frames }}</span
          ><span class="mu">{{ t('frames') }}</span>
        </div>
        <div>
          <span class="mono n">{{ tl.frames ? secs(lengthNow) : '--' }}</span
          ><span class="mu">{{ t('clip so far') }}</span>
        </div>
        <div v-if="lengthEnd">
          <span class="mono n">≈{{ secs(lengthEnd) }}</span
          ><span class="mu">{{ t('at the end ({n} frames)', { n: framesAtEnd }) }}</span>
        </div>
        <div v-if="tl.render?.status === 'running' || tl.render?.status === 'started'">
          <span class="mono n">{{ Math.round(tl.render.progress || 0) }}%</span
          ><span class="mu">{{ t('rendering') }}</span>
        </div>
      </div>
      <div v-if="strip.length" class="strip">
        <img
          v-for="s in strip"
          :key="s.f"
          :src="frameUrl(s.f)"
          :title="'#' + s.n"
          :class="{ last: s.f === tl.lastFrame }"
          loading="lazy"
          alt=""
        />
      </div>
    </div>

    <!-- clips -->
    <div class="ghd">
      <b
        >{{ t('Clips') }} <span class="mu mono" style="font-weight: 500">{{ tl.files.length }}</span></b
      >
      <div class="row" style="gap: 6px">
        <input
          v-if="tl.files.length > 6"
          v-model="q"
          class="input sm"
          :placeholder="t('Search…')"
          style="width: 160px"
        />
        <button class="btn clear ibtn sm" :aria-label="t('Refresh')" @click="loadFiles">
          <Icon name="refresh" :size="15" :stroke="2.4" />
        </button>
      </div>
    </div>
    <div v-if="!tl.files.length && !tl.loading" class="empty">
      {{
        t(
          'No clips yet. When a recorded print ends, moonraker-timelapse renders the frames into a video and it shows up here.',
        )
      }}
    </div>
    <div class="gal">
      <button v-for="f in files" :key="f.name" class="clip" @click="open = f">
        <span class="th">
          <img v-if="f.preview" :src="previewUrl(f)" loading="lazy" alt="" />
          <Icon v-else name="video" :size="28" class="mu" />
          <Icon name="play" :size="26" class="pl" />
        </span>
        <span class="meta">
          <b class="nm">{{ f.printfile }}</b>
          <span class="mu mono" style="font-size: 11px"
            >{{ clipDate(f.date) || new Date(f.modified * 1000).toLocaleDateString() }} · {{ fmtBytes(f.size) }}</span
          >
        </span>
      </button>
    </div>
    <TimelapsePlayer v-if="open" :clip="open" :clips="files" @close="open = null" @pick="open = $event" @delete="del" />
  </div>
</template>
<style scoped>
.tlp {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
}
.live {
  background: var(--s2);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.live.off {
  opacity: 0.8;
}
.lhd {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.stats {
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
}
.stats > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}
.stats .n {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.1;
}
.strip {
  display: flex;
  gap: 4px;
  overflow: hidden;
}
.strip img {
  flex: 1 1 0;
  min-width: 0;
  aspect-ratio: 16/9;
  object-fit: cover;
  border-radius: 6px;
  background: var(--s3);
  opacity: 0.55;
}
.strip img.last {
  opacity: 1;
  outline: 2px solid var(--ac);
}
.ghd {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.gal {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.clip {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  background: transparent;
  border: none;
  text-align: left;
  color: var(--tx);
  min-width: 0;
}
.th {
  position: relative;
  aspect-ratio: 16/9;
  border-radius: 10px;
  overflow: hidden;
  background: var(--s2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.th img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.th .pl {
  position: absolute;
  padding: 8px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s;
}
.clip:hover .pl,
.clip:focus-visible .pl {
  opacity: 1;
}
.meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.nm {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mu {
  color: var(--mu);
}
</style>
