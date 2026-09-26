<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import Icon from './Icon.vue';
import Logo from './Logo.vue';
import Modal from './Modal.vue';
import PowerList from './PowerList.vue';
import { powerAsk, flipPower } from '../power';
const pAsk = computed(() => powerAsk.value);
const closeAsk = () => (powerAsk.value = null);
import {
  state,
  S,
  printState,
  progress,
  printTimes,
  layerInfo,
  fmtTime,
  gcode,
  toast,
  printerName,
  dismiss,
  dismissAll,
  prettyName,
} from '../store';
import { api } from '../api/moonraker';
import { go } from '../router';
import { t } from '../i18n';

const emit = defineEmits(['exclude', 'menu']);
const fileInput = ref(null);
const uploading = ref(null);
const showBell = ref(false);
const showPower = ref(false);
const confirm = ref(null);
const askCancel = ref(false);
const thumb = computed(() => {
  const m = state.currentMeta;
  if (!m?.thumbnails?.length) return null;
  const t = [...m.thumbnails].sort((a, b) => b.width - a.width)[0];
  const fn = S('print_stats').filename || '';
  const dir = fn.split('/').slice(0, -1).join('/');
  return api.fileUrl('gcodes', (dir ? dir + '/' : '') + t.relative_path);
});
const eo = computed(() => S('exclude_object'));
const eta = computed(() =>
  printTimes.value.eta
    ? printTimes.value.eta.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '--',
);
function reprint() {
  const f = S('print_stats').filename;
  if (f) api.call('printer.print.start', { filename: f }).catch((e) => toast(e.message, 'error'));
}

const stateColor = computed(
  () =>
    ({ printing: 'var(--ac)', paused: 'var(--wn)', error: 'var(--dg)', complete: 'var(--bl)', cancelled: 'var(--mu)' })[
      printState.value
    ] || 'var(--mu)',
);
const label = computed(() => {
  if (!state.connected) return t('Disconnected');
  if (state.klippy !== 'ready') return t('Klipper {state}', { state: state.klippy });
  return t(printState.value.charAt(0).toUpperCase() + printState.value.slice(1));
});
const savePending = computed(() => S('configfile').save_config_pending);
const active = computed(() => ['printing', 'paused'].includes(printState.value));
const hostName = location.host;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

async function onFile(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  uploading.value = 0;
  try {
    await api.upload(f, { print: true, onProgress: (p) => (uploading.value = p) });
    toast(t('{name} uploaded, starting print', { name: f.name }));
  } catch (err) {
    toast(t('Upload failed: {msg}', { msg: err.message }), 'error');
  }
  uploading.value = null;
}
async function estop() {
  try {
    await api.call('printer.emergency_stop');
  } catch (e) {
    toast(e.message, 'error');
  }
}
const POWER = [
  { k: 'restart', label: 'Restart Klipper', icon: 'restart', run: () => gcode('RESTART') },
  { k: 'fw', label: 'Firmware Restart', icon: 'bolt', run: () => gcode('FIRMWARE_RESTART') },
  { k: 'moon', label: 'Restart Moonraker', icon: 'refresh', run: () => api.call('server.restart') },
  { k: 'reboot', label: 'Reboot Host', icon: 'rot', confirm: true, run: () => api.call('machine.reboot') },
  {
    k: 'off',
    label: 'Shutdown Host',
    icon: 'power',
    confirm: true,
    danger: true,
    run: () => api.call('machine.shutdown'),
  },
];
// a long printer name slides back and forth instead of being cut off
const nameEl = ref(null);
const over = ref(0);
function measureName() {
  const el = nameEl.value;
  if (!el) return;
  over.value = Math.max(0, el.scrollWidth - el.clientWidth);
}
onMounted(() => {
  measureName();
  nameRo = new ResizeObserver(measureName);
  nameRo.observe(nameEl.value);
  document.fonts?.ready.then(measureName);
});
onBeforeUnmount(() => nameRo?.disconnect());
let nameRo;
watch(printerName, () => nextTick(measureName));
function customize() {
  go('dashboard');
  state.dashEditReq = Date.now();
}
function doPower(p) {
  showPower.value = false;
  if (p.confirm || active.value) confirm.value = p;
  else p.run().catch?.((e) => toast(e.message, 'error'));
}
function runConfirmed() {
  const p = confirm.value;
  confirm.value = null;
  Promise.resolve(p.run()).catch((e) => toast(e.message, 'error'));
}
function pause() {
  gcode(printState.value === 'paused' ? 'RESUME' : 'PAUSE');
}
</script>

<template>
  <header class="tb">
    <button class="menu btn clear ibtn" :aria-label="t('Menu')" @click="emit('menu')">
      <Icon name="menu" :size="22" />
    </button>
    <a class="brand" href="#/dashboard">
      <Logo :size="40" own />
      <div class="col" style="gap: 0; min-width: 0">
        <b ref="nameEl" class="pn" :class="{ marq: over > 0 }" :style="{ '--ov': over + 'px' }"
          ><span>{{ printerName }}</span></b
        ><span class="mono mu" style="font-size: 11px">{{ hostName }}</span>
      </div>
    </a>
    <div class="pill" :class="{ act: active }">
      <div class="pth">
        <img v-if="thumb && S('print_stats').filename" :src="thumb" alt="" /><Icon
          v-else
          name="cube"
          :size="20"
          :stroke="1.8"
        />
      </div>
      <div class="col" style="gap: 1px; min-width: 0; flex-shrink: 1">
        <div class="row" style="gap: 8px; min-width: 0">
          <b class="st" :class="{ bad: !state.connected || state.klippy !== 'ready' || printState === 'error' }">{{
            label
          }}</b>
          <span v-if="active" class="mono st2">{{ (progress * 100).toFixed(1) }}%</span>
        </div>
        <span class="mono fn">{{
          state.klippy !== 'ready' && state.klippyMessage
            ? state.klippyMessage.split('\n')[0]
            : S('print_stats').filename || t('No file loaded')
        }}</span>
      </div>
      <template v-if="active">
        <div class="pb">
          <div class="bar state" :style="{ height: '8px', '--pst': stateColor }">
            <div :style="{ width: progress * 100 + '%' }"></div>
          </div>
          <div class="row mono meta">
            <span>{{ t('Layer {cur}/{total}', { cur: layerInfo.cur, total: layerInfo.total || '--' }) }}</span
            ><span>{{ t('Left {time}', { time: fmtTime(printTimes.left) }) }}</span
            ><span class="hide-m">{{ t('ETA {time}', { time: eta }) }}</span>
          </div>
        </div>
        <button v-if="printState === 'paused'" class="btn pbtn" :aria-label="t('Resume')" @click="gcode('RESUME')">
          <Icon name="play" :size="16" :stroke="2.4" /><span class="hide-m">{{ t('Resume') }}</span>
        </button>
        <button v-else class="btn pbtn" :aria-label="t('Pause')" @click="gcode('PAUSE')">
          <Icon name="pause" :size="16" :stroke="2.4" /><span class="hide-m">{{ t('Pause') }}</span>
        </button>
        <button class="btn pbtn" :aria-label="t('Cancel print')" @click="askCancel = true">
          <Icon name="sq" :size="16" :stroke="2.4" />
        </button>
        <button
          class="btn pbtn exo"
          :aria-label="t('Exclude object')"
          :disabled="!eo.objects?.length"
          @click="emit('exclude')"
        >
          <Icon name="excl" :size="16" :stroke="2.4" /><span
            v-if="eo.objects?.length"
            class="mono"
            style="font-size: 11px"
            >{{ eo.objects.length - (eo.excluded_objects?.length || 0) }}/{{ eo.objects.length }}</span
          >
        </button>
      </template>
      <button
        v-if="state.queue.jobs?.length"
        class="btn pbtn qb"
        :title="t('{n} jobs queued', { n: state.queue.jobs.length })"
        @click="go('files')"
      >
        <Icon name="queue" :size="16" /><span class="mono">{{ state.queue.jobs.length }}</span>
      </button>
      <template v-if="!active">
        <div class="grow"></div>
        <button
          v-if="S('print_stats').filename && state.klippy === 'ready'"
          class="btn pbtn"
          :aria-label="t('Print this file again')"
          @click="reprint"
        >
          <Icon name="refresh" :size="16" :stroke="2.4" /><span class="hide-m">{{ t('Reprint') }}</span>
        </button>
      </template>
    </div>
    <button class="btn lg srch hide-s" :aria-label="t('Search (Ctrl+K)')" @click="state.spotlight = true">
      <Icon name="search" :size="18" :stroke="2.4" /><kbd class="hide-m">{{ isMac ? '⌘' : 'Ctrl' }} K</kbd>
    </button>
    <button class="btn lg hide-s" :disabled="!savePending" :aria-label="t('Save Config')" @click="gcode('SAVE_CONFIG')">
      <Icon name="save" :stroke="2.4" /><span class="hide-m">{{ t('Save Config') }}</span>
    </button>
    <button
      class="btn lg hide-s"
      :aria-label="t('Upload & Print')"
      :disabled="uploading !== null"
      @click="fileInput.click()"
    >
      <Icon name="upload" :stroke="2.4" /><span v-if="uploading !== null">{{ Math.round(uploading * 100) + '%' }}</span
      ><span v-else class="hide-m">{{ t('Upload & Print') }}</span>
    </button>
    <input ref="fileInput" type="file" accept=".gcode,.g,.gco,.ufp,.nc" hidden @change="onFile" />
    <div class="rel">
      <button class="btn ibtn" :aria-label="t('Notifications')" @click="showBell = !showBell">
        <Icon name="bell" :size="22" :stroke="2.4" /><span
          v-if="state.notifications.length"
          class="badge"
          :style="
            state.notifications.some((n) => n.kind === 'error')
              ? { background: 'var(--dg)', color: '#111' }
              : state.notifications.some((n) => n.kind === 'warn')
                ? { background: 'var(--wn)', color: '#111' }
                : { background: 'var(--s3)', color: 'var(--tx)' }
          "
          >{{ state.notifications.length }}</span
        >
      </button>
      <div v-if="showBell" class="dd card" v-away="() => (showBell = false)" @mouseleave="showBell = false">
        <div class="card-h">
          <h2>{{ t('Notifications') }}</h2>
          <button class="btn" :disabled="!state.notifications.length" @click="dismissAll">
            {{ t('Dismiss all') }}
          </button>
        </div>
        <div v-if="!state.notifications.length" class="empty">{{ t('No notifications') }}</div>
        <div v-for="n in state.notifications" :key="n.id" class="nt">
          <Icon
            :name="n.kind === 'info' ? 'info' : 'warn'"
            :size="16"
            :style="{
              color: n.kind === 'error' ? 'var(--dg)' : n.kind === 'info' ? 'var(--bl)' : 'var(--wn)',
              flexShrink: 0,
            }"
          /><span class="grow">{{ n.msg }}</span
          ><button
            class="btn clear ibtn sm"
            style="width: 24px; height: 24px"
            :aria-label="t('Dismiss')"
            @click="dismiss(n)"
          >
            <Icon name="x" :size="14" />
          </button>
        </div>
      </div>
    </div>
    <button v-if="!state.editDash" class="btn ibtn hide-s" :aria-label="t('Customize dashboard')" @click="customize">
      <Icon name="layout" :size="21" :stroke="2.2" />
    </button>
    <button class="btn ibtn hide-s" :aria-label="t('Interface settings')" @click="state.settingsOpen = 'general'">
      <Icon name="gear" :size="22" :stroke="2.4" />
    </button>
    <div class="rel">
      <button class="btn ibtn" :aria-label="t('Power')" @click="showPower = !showPower">
        <Icon name="power" :size="22" :stroke="2.4" />
      </button>
      <div
        v-if="showPower"
        class="dd card"
        style="width: 280px"
        v-away="() => (showPower = false)"
        @mouseleave="showPower = false"
      >
        <template v-if="state.power.length"
          ><span class="sec-lbl" style="padding: 2px 4px">{{ t('Power devices') }}</span
          ><PowerList compact />
          <div style="height: 1px; background: var(--bd); margin: 4px 0"></div
        ></template>
        <button
          v-for="p in POWER"
          :key="p.k"
          class="btn clear"
          :style="{ justifyContent: 'flex-start', height: '40px', color: p.danger ? 'var(--dg)' : 'var(--tx)' }"
          @click="doPower(p)"
        >
          <Icon :name="p.icon" :size="18" />{{ t(p.label) }}
        </button>
      </div>
    </div>
    <button class="btn lg dgf estop" @click="estop">
      <Icon name="stop" :size="22" :stroke="2.6" /><span class="hide-s">{{ t('E-STOP') }}</span>
    </button>
  </header>
  <Modal v-if="askCancel" :title="t('Cancel print?')" @close="askCancel = false">
    <p class="mu" style="margin: 0">{{ t('The current print will be cancelled.') }}</p>
    <template #foot
      ><button class="btn lg" @click="askCancel = false">{{ t('Keep printing') }}</button
      ><button
        class="btn lg dgf"
        @click="
          askCancel = false;
          gcode('CANCEL_PRINT');
        "
      >
        {{ t('Cancel print') }}
      </button></template
    >
  </Modal>
  <Modal v-if="pAsk" :title="t('Turn off {name}?', { name: prettyName(pAsk.device) })" @close="closeAsk">
    <p class="mu" style="margin: 0">
      {{
        active
          ? t('A print is running. Cutting the power stops it for good.')
          : t('This device is marked as locked while printing.')
      }}
    </p>
    <template #foot
      ><button class="btn lg" @click="closeAsk">{{ t('Cancel') }}</button
      ><button class="btn lg dgf" @click="flipPower(pAsk, false, true)">{{ t('Turn off') }}</button></template
    >
  </Modal>
  <Modal v-if="confirm" :title="t('{action}?', { action: t(confirm.label) })" @close="confirm = null">
    <p class="mu" style="margin: 0">{{ active ? t('A print is running. Are you sure?') : t('Are you sure?') }}</p>
    <template #foot
      ><button class="btn lg" @click="confirm = null">{{ t('Cancel') }}</button
      ><button class="btn lg dgf" @click="runConfirmed">{{ t(confirm.label) }}</button></template
    >
  </Modal>
</template>

<style scoped>
.tb {
  height: 68px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px;
  background: var(--bg);
  border-bottom: 1px solid var(--bd);
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 212px;
  flex-shrink: 0;
  color: var(--tx);
  text-decoration: none;
}
.brand b {
  font-size: 18px;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  max-width: 190px;
  display: block;
}
.brand b span {
  display: inline-block;
}
.brand b.marq span {
  animation: marq 6s ease-in-out infinite alternate;
}
.brand b.marq {
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}
@keyframes marq {
  0%,
  20% {
    transform: translateX(0);
  }
  80%,
  100% {
    transform: translateX(calc(-1 * var(--ov)));
  }
}
@media (prefers-reduced-motion: reduce) {
  .brand b.marq span {
    animation: none;
  }
  .brand b {
    text-overflow: ellipsis;
  }
}
.logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--ac);
  color: var(--oa);
  display: flex;
  align-items: center;
  justify-content: center;
}
.srch {
  gap: 10px;
  color: var(--mu);
}
.srch kbd {
  font-family: var(--fm);
  font-size: 11px;
  background: var(--s3);
  padding: 2px 6px;
  border-radius: 5px;
}
.pill {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 6px 0 5px;
  height: 52px;
  background: var(--s1);
  border: none;
  border-radius: 14px;
  min-width: 0;
}
.pth {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--s2);
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
.st {
  font-size: 14px;
  white-space: nowrap;
}
.st2 {
  font-size: 13px;
  font-weight: 600;
  color: var(--mu);
}
.st.bad {
  color: var(--dg);
}
.pb {
  flex: 1;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.meta {
  gap: 14px;
  font-size: 11px;
  color: var(--mu);
  white-space: nowrap;
  overflow: hidden;
}
.pbtn {
  height: 40px;
  flex-shrink: 0;
}
.fn {
  font-size: 12px;
  color: var(--mu);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:root.ew-lt-1750 .hide-m {
  display: none;
}
.msg {
  font-size: 12px;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 8px;
}
.rel {
  position: relative;
}
.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border-radius: 10px;
  background: var(--dg);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dd {
  position: absolute;
  right: 0;
  top: 52px;
  width: 380px;
  max-width: calc(100vw - 20px);
  max-height: 420px;
  overflow: auto;
  z-index: 50;
  gap: 4px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.nt {
  display: flex;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--bd);
  font-size: 13px;
  word-break: break-word;
}
.estop {
  letter-spacing: 0.06em;
  font-size: 15px;
}
.menu {
  display: none;
}
@media (max-width: 1100px) {
  .menu {
    display: inline-flex;
  }
}
@media (max-width: 1100px) {
  .brand {
    width: auto;
  }
  .brand .col {
    display: none;
  }
  .hide-s {
    display: none;
  }
  .tb {
    padding: 0 10px;
    gap: 8px;
  }
  .pill > .col {
    overflow: hidden;
  }
  .fn {
    max-width: 180px;
  }
}
/* phones: the pill keeps state, progress and the pause / cancel buttons, the rest goes */
@media (max-width: 720px) {
  .pb,
  .fn,
  .qb,
  .pbtn.exo {
    display: none;
  }
  .pill {
    gap: 8px;
  }
  .pill > .col {
    min-width: 84px !important;
  }
  .st {
    font-size: 13px;
  }
  .estop span {
    display: none;
  }
}
@media (max-width: 480px) {
  .pth,
  .brand,
  .st2 {
    display: none;
  }
  .pill {
    padding: 0 6px;
    gap: 6px;
  }
  .pill > .col {
    min-width: 64px !important;
  }
  .pbtn {
    width: 36px;
    padding: 0;
  }
  .tb {
    gap: 6px;
  }
}
</style>
