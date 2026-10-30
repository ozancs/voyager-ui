<script setup>
// Print bar: while a print runs (or is paused) the job moves out of the top bar into its own band under it, like
// the favorites bar: thumbnail, file, state, progress with layer / time left / ETA, and pause, cancel, exclude,
// pause at next layer and the queue. The band is tinted with the accent so it reads as "a print is on".
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import Popover from './Popover.vue';
import {
  state,
  S,
  printState,
  progress,
  printTimes,
  layerInfo,
  fmtTime,
  gcode,
  cancelPrint,
  pauseResume,
} from '../store';
import { api } from '../api/moonraker';
import { go } from '../router';
import { t } from '../i18n';
const emit = defineEmits(['exclude']);
const askCancel = ref(false);
// phone: one row with Pause and a menu for the rest, so Cancel is never a thumb's width from Pause
const moreOpen = ref(false);
const moreBtn = ref(null);
const paused = computed(() => printState.value === 'paused');
const thumb = computed(() => {
  const m = state.currentMeta;
  if (!m?.thumbnails?.length) return null;
  const th = [...m.thumbnails].sort((a, b) => b.width - a.width)[0];
  const fn = S('print_stats').filename || '';
  const dir = fn.split('/').slice(0, -1).join('/');
  return api.fileUrl('gcodes', (dir ? dir + '/' : '') + th.relative_path);
});
const eta = computed(() =>
  printTimes.value.eta
    ? printTimes.value.eta.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '--:--',
);
const eo = computed(() => S('exclude_object'));
const hasCmd = (c) => Object.keys(state.commands || {}).some((k) => k.toUpperCase() === c);
const pauseNext = computed(
  () =>
    !!(S('gcode_macro SET_PRINT_STATS_INFO').pause_next_layer || S('gcode_macro SET_PAUSE_NEXT_LAYER').pause_next_layer)
      ?.enable,
);
const fileName = computed(() => (S('print_stats').filename || '').split('/').pop());
</script>

<template>
  <div class="pbar" :class="{ paused }">
    <div class="pth"><img v-if="thumb" :src="thumb" alt="" /><Icon v-else name="cube" :size="20" :stroke="1.8" /></div>
    <div class="info">
      <div class="row top">
        <b class="st">{{ paused ? t('Paused') : t('Printing') }}</b>
        <span class="mono pct">{{ (progress * 100).toFixed(1) }}%</span>
        <span class="fn" :title="S('print_stats').filename">{{ fileName }}</span>
      </div>
      <div class="bar state" :style="{ height: '6px' }">
        <div :style="{ width: progress * 100 + '%' }"></div>
      </div>
      <div class="mmeta mono">
        {{ t('Layer {cur}/{total}', { cur: layerInfo.cur, total: layerInfo.total || '--' }) }} ·
        {{ t('Left {time}', { time: fmtTime(printTimes.left) }) }}
      </div>
    </div>
    <div class="row mono meta">
      <span>{{ t('Layer {cur}/{total}', { cur: layerInfo.cur, total: layerInfo.total || '--' }) }}</span
      ><span>{{ t('Left {time}', { time: fmtTime(printTimes.left) }) }}</span
      ><span class="eta">{{ t('ETA {time}', { time: eta }) }}</span>
    </div>
    <div class="acts">
      <button v-if="paused" class="btn pbtn" :aria-label="t('Resume')" @click="pauseResume('RESUME')">
        <Icon name="play" :size="16" :stroke="2.4" /><span class="lbl">{{ t('Resume') }}</span>
      </button>
      <button v-else class="btn pbtn" :aria-label="t('Pause')" @click="pauseResume('PAUSE')">
        <Icon name="pause" :size="16" :stroke="2.4" /><span class="lbl">{{ t('Pause') }}</span>
      </button>
      <button class="btn pbtn" :aria-label="t('Cancel print')" :data-tip="t('Cancel print')" @click="askCancel = true">
        <Icon name="sq" :size="16" :stroke="2.4" />
      </button>
      <button
        class="btn pbtn"
        :aria-label="t('Exclude object')"
        :data-tip="t('Exclude object')"
        :disabled="!eo.objects?.length"
        @click="emit('exclude')"
      >
        <Icon name="excl" :size="16" :stroke="2.4" /><span v-if="eo.objects?.length" class="mono cnt"
          >{{ eo.objects.length - (eo.excluded_objects?.length || 0) }}/{{ eo.objects.length }}</span
        >
      </button>
      <button
        v-if="hasCmd('SET_PAUSE_NEXT_LAYER')"
        class="btn pbtn"
        :class="{ on: pauseNext }"
        :aria-label="pauseNext ? t('Cancel pause at next layer') : t('Pause at next layer')"
        :data-tip="pauseNext ? t('Cancel pause at next layer') : t('Pause at next layer')"
        @click="gcode(pauseNext ? 'SET_PAUSE_NEXT_LAYER ENABLE=0' : 'SET_PAUSE_NEXT_LAYER ENABLE=1')"
      >
        <Icon name="layers" :size="16" :stroke="2.2" />
      </button>
      <button
        v-if="state.queue.jobs?.length"
        class="btn pbtn"
        :data-tip="t('{n} jobs queued', { n: state.queue.jobs.length })"
        :aria-label="t('Job queue')"
        @click="go('files')"
      >
        <Icon name="queue" :size="16" /><span class="mono cnt">{{ state.queue.jobs.length }}</span>
      </button>
    </div>
    <button
      ref="moreBtn"
      class="btn pbtn pmore"
      :aria-label="t('More')"
      :aria-expanded="moreOpen"
      @click="moreOpen = !moreOpen"
    >
      <Icon name="menu" :size="18" :stroke="2.4" />
    </button>
    <Popover v-if="moreOpen" :anchor="moreBtn" :width="250" @close="moreOpen = false">
      <div class="pm">
        <button class="btn clear dgt" @click="((moreOpen = false), (askCancel = true))">
          <Icon name="sq" :size="16" :stroke="2.4" />{{ t('Cancel print') }}
        </button>
        <button class="btn clear" :disabled="!eo.objects?.length" @click="((moreOpen = false), emit('exclude'))">
          <Icon name="excl" :size="16" :stroke="2.4" />{{ t('Exclude object') }}
        </button>
        <button
          v-if="hasCmd('SET_PAUSE_NEXT_LAYER')"
          class="btn clear"
          @click="
            moreOpen = false;
            gcode(pauseNext ? 'SET_PAUSE_NEXT_LAYER ENABLE=0' : 'SET_PAUSE_NEXT_LAYER ENABLE=1');
          "
        >
          <Icon name="layers" :size="16" />{{ pauseNext ? t('Cancel pause at next layer') : t('Pause at next layer') }}
        </button>
        <button v-if="state.queue.jobs?.length" class="btn clear" @click="((moreOpen = false), go('files'))">
          <Icon name="queue" :size="16" />{{ t('{n} jobs queued', { n: state.queue.jobs.length }) }}
        </button>
        <button class="btn clear" @click="((moreOpen = false), (state.settings.printBar = 'top'))">
          <Icon name="up" :size="16" />{{ t('Move the print up into the top bar') }}
        </button>
      </div>
    </Popover>
    <button
      class="side"
      :aria-label="t('Move the print up into the top bar')"
      :data-tip="t('Move the print up into the top bar')"
      @click="state.settings.printBar = 'top'"
    >
      <Icon name="up" :size="16" :stroke="2.4" />
    </button>
    <Modal v-if="askCancel" :title="t('Cancel print?')" @close="askCancel = false">
      <p class="mu" style="margin: 0">{{ t('The current print will be cancelled.') }}</p>
      <template #foot
        ><button class="btn lg" @click="askCancel = false">{{ t('Keep printing') }}</button
        ><button
          class="btn lg dgf"
          @click="
            askCancel = false;
            cancelPrint();
          "
        >
          {{ t('Cancel print') }}
        </button></template
      >
    </Modal>
  </div>
</template>

<style scoped>
/* a band under the top bar, a faint wash of the accent so it is clearly the print and not more chrome */
.pbar {
  height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 20px;
  background: color-mix(in srgb, var(--ac) 9%, var(--bg));
  border-bottom: 1px solid color-mix(in srgb, var(--ac) 22%, var(--bd));
  --pst: var(--ac);
}
.pbar.paused {
  background: color-mix(in srgb, var(--wn) 9%, var(--bg));
  border-bottom-color: color-mix(in srgb, var(--wn) 22%, var(--bd));
  --pst: var(--wn);
}
.pth {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 10px;
  background: color-mix(in srgb, var(--pst) 12%, var(--s1));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mu);
  overflow: hidden;
}
.pth img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.info {
  flex: 1;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.top {
  gap: 10px;
  min-width: 0;
}
.st {
  font-size: 13px;
  white-space: nowrap;
}
.pct {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--mu);
}
.fn {
  font-size: 12px;
  color: var(--mu);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.bar.state {
  background: color-mix(in srgb, var(--pst) 18%, var(--s1));
}
.bar.state > div {
  background: var(--pst);
}
.meta {
  gap: 14px;
  font-size: 11.5px;
  color: var(--mu);
  white-space: nowrap;
  flex-shrink: 0;
}
.acts {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.pbtn {
  height: 40px;
  background: var(--s1);
}
.pbtn.on {
  background: color-mix(in srgb, var(--pst) 25%, var(--s1));
  color: var(--tx);
}
.cnt {
  font-size: 11px;
}
/* the same dashed side button as the favorites bar: moves the print back up into the top bar */
.side {
  width: 36px;
  height: 40px;
  flex-shrink: 0;
  margin-left: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--mu2);
  border: 1px dashed color-mix(in srgb, var(--pst) 35%, var(--s3));
  border-radius: 12px;
}
.side:hover {
  color: var(--tx);
  border-color: var(--mu2);
}
.mu {
  color: var(--mu);
}
@media (max-width: 1100px) {
  .pbar {
    padding: 0 10px;
    gap: 10px;
  }
  .eta {
    display: none;
  }
  .lbl {
    display: none;
  }
  .pbtn {
    width: 40px;
    padding: 0;
  }
}
.mmeta,
.pmore {
  display: none;
}
.pm {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pm .btn {
  justify-content: flex-start;
  height: 44px;
  color: var(--tx);
}
.pm .btn.dgt {
  color: var(--dg);
}
/* phone: one row, Pause and a menu with Cancel and the rest, buttons a thumb wide */
@media (max-width: 720px) {
  .pbar {
    height: auto;
    padding: 8px 10px;
    gap: 10px;
  }
  .pth,
  .meta,
  .side,
  .acts .pbtn:not(:first-child) {
    display: none;
  }
  .info {
    min-width: 0;
    gap: 5px;
  }
  .mmeta {
    display: block;
    font-size: 11px;
    color: var(--mu);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pbtn,
  .pmore {
    width: 44px;
    height: 44px;
  }
  .pmore {
    display: inline-flex;
    padding: 0;
    flex-shrink: 0;
  }
}
</style>
