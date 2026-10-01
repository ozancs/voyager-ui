<script setup>
// Player for a finished timelapse clip: speed, loop, frame stepping (, and . keys), save a still of the current
// frame, download or delete the clip, and arrows to move to the previous or next clip.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import { clipUrl, clipDate } from '../timelapse';
import { fmtBytes } from '../store';
import { t } from '../i18n';
const props = defineProps({ clip: Object, clips: Array });
const emit = defineEmits(['close', 'pick', 'delete']);
const v = ref(null);
const speed = ref(1);
const loop = ref(true);
const playing = ref(false);
const cur = ref(0);
const dur = ref(0);
const fps = ref(0); // frames per second of the clip when the browser can tell (frame stepping needs it)
const idx = computed(() => props.clips.indexOf(props.clip));
const prev = computed(() => props.clips[idx.value + 1]); // newest first, so "previous" is older
const next = computed(() => props.clips[idx.value - 1]);
const SPEEDS = [0.25, 0.5, 1, 2, 4];
function setSpeed(s) {
  speed.value = s;
  if (v.value) v.value.playbackRate = s;
}
function toggle() {
  const el = v.value;
  if (!el) return;
  el.paused ? el.play() : el.pause();
}
function step(d) {
  const el = v.value;
  if (!el) return;
  el.pause();
  el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + d / (fps.value || 30)));
}
function seek(e) {
  if (v.value) v.value.currentTime = +e.target.value;
}
// a PNG of the frame on screen, named after the clip and the time
function still() {
  const el = v.value;
  if (!el || !el.videoWidth) return;
  const c = document.createElement('canvas');
  c.width = el.videoWidth;
  c.height = el.videoHeight;
  c.getContext('2d').drawImage(el, 0, 0);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = props.clip.name.replace(/\.mp4$/i, '') + '_' + cur.value.toFixed(2).replace('.', '_') + 's.png';
  a.click();
}
function onMeta() {
  const el = v.value;
  dur.value = el.duration || 0;
  el.playbackRate = speed.value;
  // frame rate: count presented frames over a short stretch when the browser offers it
  if (el.requestVideoFrameCallback) {
    let first = null;
    const cb = (now, m) => {
      if (first == null) first = m.mediaTime;
      else if (m.mediaTime > first + 1.5) {
        // snap to the usual rates: the count over a short stretch is a little off
        const raw = m.presentedFrames / (m.mediaTime - first);
        const near = [10, 12, 15, 20, 24, 25, 30, 50, 60].find((r) => Math.abs(r - raw) / r < 0.12);
        return (fps.value = near || Math.round(raw) || 0);
      }
      el.requestVideoFrameCallback(cb);
    };
    el.requestVideoFrameCallback(cb);
  }
}
const fmt = (s) => {
  s = Math.max(0, s || 0);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 10))}`;
};
function key(e) {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === ' ' || e.key === 'k') {
    e.preventDefault();
    toggle();
  } else if (e.key === ',') step(-1);
  else if (e.key === '.') step(1);
  else if (e.key === 'ArrowLeft' && e.shiftKey && prev.value) emit('pick', prev.value);
  else if (e.key === 'ArrowRight' && e.shiftKey && next.value) emit('pick', next.value);
  else if (e.key === 'ArrowLeft') step(-fps.value || -30);
  else if (e.key === 'ArrowRight') step(fps.value || 30);
}
watch(
  () => props.clip,
  () => {
    cur.value = 0;
    fps.value = 0;
  },
);
onMounted(() => window.addEventListener('keydown', key));
onBeforeUnmount(() => window.removeEventListener('keydown', key));
</script>
<template>
  <Modal :title="clip.printfile" width="min(960px, 96vw)" @close="emit('close')">
    <div class="pl">
      <div class="vw">
        <video
          ref="v"
          :key="clip.name"
          :src="clipUrl(clip)"
          :loop="loop"
          autoplay
          playsinline
          @loadedmetadata="onMeta"
          @timeupdate="cur = $event.target.currentTime"
          @play="playing = true"
          @pause="playing = false"
          @click="toggle"
        ></video>
        <button v-if="prev" class="nav l" :aria-label="t('Older clip')" @click="emit('pick', prev)">
          <Icon name="left" :size="20" :stroke="2.6" />
        </button>
        <button v-if="next" class="nav r" :aria-label="t('Newer clip')" @click="emit('pick', next)">
          <Icon name="right" :size="20" :stroke="2.6" />
        </button>
      </div>
      <input
        class="scrub"
        type="range"
        :min="0"
        :max="dur || 0"
        :step="0.01"
        :value="cur"
        @input="seek"
        :aria-label="t('Position')"
      />
      <div class="ctl">
        <button class="btn clear ibtn sm" :aria-label="playing ? t('Pause') : t('Play')" @click="toggle">
          <Icon :name="playing ? 'pause' : 'play'" :size="18" :stroke="2.4" />
        </button>
        <button
          class="btn clear ibtn sm"
          :aria-label="t('Previous frame')"
          :data-tip="t('Previous frame (,)')"
          @click="step(-1)"
        >
          <Icon name="rewind" :size="16" :stroke="2.4" />
        </button>
        <button
          class="btn clear ibtn sm"
          :aria-label="t('Next frame')"
          :data-tip="t('Next frame (.)')"
          @click="step(1)"
        >
          <Icon name="skip" :size="16" :stroke="2.4" />
        </button>
        <span class="mono tm">{{ fmt(cur) }} / {{ fmt(dur) }}</span>
        <div class="seg" style="width: auto">
          <button v-for="s in SPEEDS" :key="s" :class="{ on: speed === s }" @click="setSpeed(s)">{{ s }}×</button>
        </div>
        <button
          class="btn clear ibtn sm"
          :class="{ acc: loop }"
          :aria-label="t('Loop')"
          :data-tip="t('Loop')"
          @click="loop = !loop"
        >
          <Icon name="repeat" :size="16" :stroke="2.4" />
        </button>
        <span class="grow"></span>
        <button class="btn sm" :data-tip="t('Save the frame on screen as PNG')" @click="still">
          <Icon name="snap" :size="15" :stroke="2.4" />{{ t('Still') }}
        </button>
        <a class="btn sm" :href="clipUrl(clip)" :download="clip.name"
          ><Icon name="download" :size="15" :stroke="2.4" />{{ t('Download') }}</a
        >
        <button class="btn sm dg" @click="emit('delete', clip)">
          <Icon name="trash" :size="15" :stroke="2.4" />{{ t('Delete') }}
        </button>
      </div>
      <div class="mu" style="font-size: 12px">
        {{ clip.name }} · {{ clipDate(clip.date) }} · {{ fmtBytes(clip.size)
        }}<template v-if="fps"> · {{ fps }} fps</template>
        <span style="float: right">{{ t('Space play/pause · , . frame · ← → second · Shift+← → other clip') }}</span>
      </div>
    </div>
  </Modal>
</template>
<style scoped>
.pl {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.vw {
  position: relative;
  background: #000;
  border-radius: 10px;
  overflow: hidden;
  aspect-ratio: 16/9;
}
video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  cursor: pointer;
}
.nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 56px;
  border: none;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}
.vw:hover .nav {
  opacity: 1;
}
.nav.l {
  left: 10px;
}
.nav.r {
  right: 10px;
}
.scrub {
  width: 100%;
  accent-color: var(--ac);
}
.ctl {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.tm {
  font-size: 12.5px;
  color: var(--mu);
  min-width: 108px;
}
.grow {
  flex: 1;
}
.mu {
  color: var(--mu);
}
</style>
