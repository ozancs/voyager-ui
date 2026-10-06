<script setup>
// Dashboard card: is the timelapse recording, how many frames so far, the newest frame, and the last clips.
import { computed } from 'vue';
import Icon from './Icon.vue';
import Toggle from './Toggle.vue';
import { tl, frameUrl, previewUrl, clipLength, saveSettings } from '../timelapse';
import { printState, fmtTime, state, firstCam } from '../store';
import { go } from '../router';
import { t } from '../i18n';
const printing = computed(() => ['printing', 'paused'].includes(printState.value));
const secs = (s) => (s >= 60 ? fmtTime(s) : s.toFixed(1) + ' s');
const recent = computed(() => tl.files.slice(0, 3));
function openClip(f) {
  state.anchor = 'timelapse:' + f.name;
  go('webcam', 'timelapse');
}
</script>
<template>
  <section class="card">
    <div class="card-h">
      <h2>{{ t('Timelapse') }}</h2>
      <div class="acts">
        <Toggle
          :model-value="!!tl.settings?.enabled"
          :label="t('Record timelapse')"
          @update:model-value="saveSettings({ enabled: $event })"
        />
        <button class="btn clear" @click="go('webcam', 'timelapse')">{{ t('Open') }}</button>
      </div>
    </div>
    <div class="body">
      <div class="fr">
        <img v-if="tl.lastFrame" :src="frameUrl(tl.lastFrame)" alt="" />
        <Icon v-else name="video" :size="26" class="mu" />
        <span v-if="printing && tl.settings?.enabled" class="rec"><i></i>{{ t('REC') }}</span>
      </div>
      <div class="col" style="gap: 6px; min-width: 0; flex: 1">
        <div class="row" style="gap: 18px">
          <div class="st">
            <span class="mono n">{{ tl.frames }}</span
            ><span class="mu">{{ t('frames') }}</span>
          </div>
          <div class="st">
            <span class="mono n">{{ tl.frames ? secs(clipLength()) : '--' }}</span
            ><span class="mu">{{ t('clip') }}</span>
          </div>
        </div>
        <span class="mu" style="font-size: 12px">
          <template v-if="!tl.settings?.enabled">{{ t('Off. The next print is not recorded.') }}</template>
          <template v-else-if="tl.render?.status === 'running'">{{
            t('Rendering… {n}%', { n: Math.round(tl.render.progress || 0) })
          }}</template>
          <template v-else-if="printing">{{
            t('Recording {name}', { name: tl.settings?.camera || firstCam?.name || t('first camera') })
          }}</template>
          <template v-else>{{ t('Ready for the next print') }}</template>
        </span>
        <div v-if="recent.length" class="rc">
          <button v-for="f in recent" :key="f.name" class="ck" :title="f.name" @click="openClip(f)">
            <img v-if="f.preview" :src="previewUrl(f)" alt="" loading="lazy" />
            <Icon v-else name="video" :size="14" />
            <span>{{ f.printfile }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.body {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.fr {
  position: relative;
  width: 44%;
  max-width: 220px;
  aspect-ratio: 16/9;
  border-radius: 10px;
  background: var(--s2);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.fr img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.rec {
  position: absolute;
  top: 6px;
  left: 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}
.rec i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dg);
  animation: blink 1.2s infinite;
}
@keyframes blink {
  50% {
    opacity: 0.3;
  }
}
.st {
  display: flex;
  flex-direction: column;
  font-size: 11.5px;
}
.st .n {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
}
.rc {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ck {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--tx);
  font-size: 12px;
  padding: 2px 0;
  text-align: left;
  min-width: 0;
}
.ck img {
  width: 28px;
  height: 16px;
  object-fit: cover;
  border-radius: 3px;
  flex: none;
}
.ck span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ck:hover {
  color: var(--ac);
}
.mu {
  color: var(--mu);
}
</style>
