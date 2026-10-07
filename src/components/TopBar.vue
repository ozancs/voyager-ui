<script setup>
// Top bar: printer name and logo, the printer state with the loaded file (while a print runs the job moves to the
// PrintBar band underneath), search, Save Config, upload & print, notifications, customize, settings, power menu
// and E-STOP.
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { UPLOAD_ACCEPT } from '../gcode3mf';
import Icon from './Icon.vue';
import Logo from './Logo.vue';
import Modal from './Modal.vue';
import Popover from './Popover.vue';
import { printerList, currentPrinter, selectPrinter } from '../printers';
import PowerList from './PowerList.vue';
import { powerAsk, flipPower } from '../power';
import LockButton from './LockButton.vue';
import JobMenu from './JobMenu.vue';
const pAsk = computed(() => powerAsk.value);
const closeAsk = () => (powerAsk.value = null);
import {
  state,
  S,
  printState,
  isPrinting,
  progress,
  printTimes,
  fmtTime,
  gcode,
  toast,
  printerName,
  dismiss,
  dismissAll,
  prettyName,
  restartKlipper,
} from '../store';
import { api } from '../api/moonraker';
import { go } from '../router';
import { t } from '../i18n';
import { startPrint, askReprint, uploadName } from '../preprint';

const emit = defineEmits(['exclude', 'menu']);
const fileInput = ref(null);
const uploading = ref(null);
const showBell = ref(false);
const showPower = ref(false);
const showMore = ref(false); // narrow screens: search, upload, save config, customize, settings, power
const confirm = ref(null);
const thumb = computed(() => {
  const m = state.currentMeta;
  if (!m?.thumbnails?.length) return null;
  const t = [...m.thumbnails].sort((a, b) => b.width - a.width)[0];
  const fn = S('print_stats').filename || '';
  const dir = fn.split('/').slice(0, -1).join('/');
  return api.fileUrl('gcodes', (dir ? dir + '/' : '') + t.relative_path);
});
async function reprint() {
  const f = S('print_stats').filename;
  if (f && (await askReprint(f))) startPrint(f);
}

const stateColor = computed(() => (printState.value === 'paused' ? 'var(--wn)' : 'var(--ac)'));
const label = computed(() => {
  if (!state.connected) return t('Disconnected');
  if (state.klippy !== 'ready') return t('Klipper {state}', { state: state.klippy });
  return t(printState.value.charAt(0).toUpperCase() + printState.value.slice(1));
});
const savePending = computed(() => S('configfile').save_config_pending);
const active = isPrinting; // the job itself is in the PrintBar band while it runs
const here = location.host;
const hostName = currentPrinter()?.host || here;
// printer switcher next to the name
const printers = printerList;
const curId = currentPrinter()?.id || '';
const pmOpen = ref(false);
const pmBtn = ref(null);
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

async function onFile(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const name = await uploadName(f.name);
  if (!name) return;
  uploading.value = 0;
  try {
    // uploaded first, then started through the pre-print check
    await api.upload(f, { name, onProgress: (p) => (uploading.value = p) });
    toast(t('{name} uploaded', { name }));
    uploading.value = null;
    await startPrint(name);
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
  { k: 'restart', label: 'Restart Klipper', icon: 'restart', run: () => restartKlipper(false, { force: true }) },
  { k: 'fw', label: 'Firmware Restart', icon: 'bolt', run: () => restartKlipper(true, { force: true }) },
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
    <button
      ref="pmBtn"
      class="btn clear ibtn sm pmb"
      :class="{ on: pmOpen }"
      :aria-label="t('Printers')"
      :data-tip="t('Printers')"
      @click.stop="pmOpen = !pmOpen"
    >
      <Icon name="down" :size="16" :stroke="2.4" />
    </button>
    <Popover v-if="pmOpen" :anchor="pmBtn" :width="280" @close="pmOpen = false">
      <button
        v-if="printers.length"
        class="btn clear pmi all"
        @click="
          pmOpen = false;
          go('fleet');
        "
      >
        <Icon name="grid" :size="15" /><span class="grow">{{ t('All printers') }}</span
        ><span class="mono mu">{{ printers.length + 1 }}</span>
      </button>
      <button class="btn clear pmi" :class="{ cur: !curId }" :disabled="!curId" @click="selectPrinter('')">
        <span class="grow">{{ t('This address') }}</span
        ><span class="mono mu">{{ here }}</span>
      </button>
      <button
        v-for="p in printers"
        :key="p.id"
        class="btn clear pmi"
        :class="{ cur: p.id === curId }"
        :disabled="p.id === curId"
        @click="selectPrinter(p.id)"
      >
        <span class="grow">{{ p.name }}</span
        ><span class="mono mu">{{ p.host }}</span>
      </button>
      <button
        class="btn clear pmi"
        @click="
          pmOpen = false;
          state.printersOpen = true;
        "
      >
        <Icon name="gear" :size="15" /><span class="grow">{{ t('Manage printers') }}</span>
      </button>
    </Popover>
    <!-- a running print: in its own band under the top bar by default; "moved up" it is this compact pill -->
    <template v-if="active && state.settings.printBar === 'top'">
      <div class="grow"></div>
      <div class="pill job" :style="{ '--pst': stateColor }">
        <div class="pth">
          <img v-if="thumb && S('print_stats').filename" :src="thumb" alt="" /><Icon
            v-else
            name="cube"
            :size="20"
            :stroke="1.8"
          />
        </div>
        <div class="col jc">
          <div class="row" style="gap: 8px; min-width: 0">
            <b class="st">{{ label }}</b>
            <span class="mono st2">{{ (progress * 100).toFixed(1) }}%</span>
            <span class="mono fn jf">{{ (S('print_stats').filename || '').split('/').pop() }}</span>
          </div>
          <div class="bar state" style="height: 4px">
            <div :style="{ width: progress * 100 + '%' }"></div>
          </div>
        </div>
        <span class="mono meta jl">{{ t('Left {time}', { time: fmtTime(printTimes.left) }) }}</span>
        <button
          class="btn ibtn jb"
          :aria-label="t('Move the print down into its own bar')"
          :data-tip="t('Move the print down into its own bar')"
          @click="state.settings.printBar = 'band'"
        >
          <Icon name="down" :size="16" :stroke="2.4" />
        </button>
        <JobMenu @exclude="emit('exclude')" />
      </div>
      <div class="grow"></div>
    </template>
    <div v-else-if="active" class="grow"></div>
    <div v-else class="pill">
      <div class="pth">
        <img v-if="thumb && S('print_stats').filename" :src="thumb" alt="" /><Icon
          v-else
          name="cube"
          :size="20"
          :stroke="1.8"
        />
      </div>
      <div class="col" style="gap: 1px; min-width: 0; flex-shrink: 1">
        <b class="st" :class="{ bad: !state.connected || state.klippy !== 'ready' || printState === 'error' }">{{
          label
        }}</b>
        <span class="mono fn">{{
          state.klippy !== 'ready' && state.klippyMessage
            ? state.klippyMessage.split('\n')[0]
            : S('print_stats').filename || t('No file loaded')
        }}</span>
      </div>
      <div class="grow"></div>
      <button
        v-if="state.queue.jobs?.length"
        class="btn pbtn qb"
        :title="t('{n} jobs queued', { n: state.queue.jobs.length })"
        @click="go('files')"
      >
        <Icon name="queue" :size="16" /><span class="mono">{{ state.queue.jobs.length }}</span>
      </button>
      <button
        v-if="S('print_stats').filename && state.klippy === 'ready'"
        class="btn pbtn"
        :aria-label="t('Print this file again')"
        @click="reprint"
      >
        <Icon name="refresh" :size="16" :stroke="2.4" /><span class="hide-m">{{ t('Reprint') }}</span>
      </button>
    </div>
    <button class="btn lg srch hide-s" :aria-label="t('Search (Ctrl+K)')" @click="state.spotlight = true">
      <Icon name="search" :size="18" :stroke="2.4" /><kbd class="hide-m">{{ isMac ? '⌘' : 'Ctrl' }} K</kbd>
    </button>
    <button
      class="btn lg hide-s"
      :disabled="!savePending || active"
      :aria-label="t('Save Config')"
      :data-tip="active && savePending ? t('Save Config restarts Klipper. Available when the print is done.') : null"
      @click="gcode('SAVE_CONFIG')"
    >
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
    <input ref="fileInput" type="file" :accept="UPLOAD_ACCEPT" hidden @change="onFile" />
    <div class="rel">
      <button class="btn ibtn" data-away="bell" :aria-label="t('Notifications')" @click="showBell = !showBell">
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
      <div v-if="showBell" class="dd card" v-away:bell="() => (showBell = false)" @mouseleave="showBell = false">
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
    <div class="rel more">
      <button class="btn ibtn" data-away="more" :aria-label="t('More')" @click="showMore = !showMore">
        <span class="dots" aria-hidden="true">···</span>
      </button>
      <div v-if="showMore" class="dd card" style="width: 260px" v-away:more="() => (showMore = false)">
        <button
          class="btn clear mi"
          @click="
            showMore = false;
            state.spotlight = true;
          "
        >
          <Icon name="search" :size="18" />{{ t('Search') }}
        </button>
        <button
          class="btn clear mi"
          :disabled="uploading !== null"
          @click="
            showMore = false;
            fileInput.click();
          "
        >
          <Icon name="upload" :size="18" />{{ t('Upload & Print') }}
        </button>
        <button
          class="btn clear mi"
          :disabled="!savePending || active"
          @click="
            showMore = false;
            gcode('SAVE_CONFIG');
          "
        >
          <Icon name="save" :size="18" />{{ t('Save Config')
          }}<span v-if="savePending" class="mono mu" style="margin-left: auto">{{
            active ? t('after the print') : t('pending')
          }}</span>
        </button>
        <button
          v-if="!state.editDash"
          class="btn clear mi"
          @click="
            showMore = false;
            customize();
          "
        >
          <Icon name="layout" :size="18" />{{ t('Customize dashboard') }}
        </button>
        <button
          class="btn clear mi"
          @click="
            showMore = false;
            state.settingsOpen = 'general';
          "
        >
          <Icon name="gear" :size="18" />{{ t('Interface settings') }}
        </button>
        <template v-if="state.power.length">
          <div style="height: 1px; background: var(--bd); margin: 4px 0"></div>
          <span class="sec-lbl" style="padding: 2px 4px">{{ t('Power devices') }}</span>
          <PowerList compact />
        </template>
        <div class="pwr-s">
          <div style="height: 1px; background: var(--bd); margin: 4px 0"></div>
          <button
            v-for="p in POWER"
            :key="p.k"
            class="btn clear mi"
            :style="{ color: p.danger ? 'var(--dg)' : 'var(--tx)' }"
            @click="
              showMore = false;
              doPower(p);
            "
          >
            <Icon :name="p.icon" :size="18" />{{ t(p.label) }}
          </button>
        </div>
      </div>
    </div>
    <LockButton />
    <div class="rel pwr">
      <button class="btn ibtn" data-away="power" :aria-label="t('Power')" @click="showPower = !showPower">
        <Icon name="power" :size="22" :stroke="2.4" />
      </button>
      <div
        v-if="showPower"
        class="dd card"
        style="width: 280px"
        v-away:power="() => (showPower = false)"
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
.st.bad {
  color: var(--dg);
}
.pbtn {
  height: 40px;
  flex-shrink: 0;
}
/* compact print pill: no stretch, sits between the name and the buttons with air on both sides */
.pill.job {
  flex: 0 1 auto;
  max-width: 460px;
  gap: 10px;
  background: color-mix(in srgb, var(--pst, var(--ac)) 8%, var(--s1));
}
.pill.job .jc {
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
  padding: 2px 0;
}
.pill.job .jf {
  max-width: 180px;
  font-size: 12px;
}
.pill.job .st {
  font-size: 13px;
}
.st2 {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--mu);
}
.pill.job .meta {
  font-size: 11.5px;
  color: var(--mu);
  white-space: nowrap;
}
.pill.job .bar.state {
  background: color-mix(in srgb, var(--pst) 18%, var(--s2));
}
.pill.job .bar.state > div {
  background: var(--pst);
}
.jb {
  width: 40px;
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
/* the ⋯ menu holds what hide-s takes off the bar on narrow screens */
.more {
  display: none;
}
.pwr-s {
  display: none;
}
.dots {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 1px;
  line-height: 1;
  margin-top: -4px;
}
.mi {
  justify-content: flex-start;
  gap: 10px;
  height: 40px;
  color: var(--tx);
  font-weight: 600;
}
@media (max-width: 1100px) {
  .more {
    display: block;
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
/* phones: the pill keeps the state, the file name goes */
@media (max-width: 720px) {
  .menu {
    display: none; /* the bottom bar has More */
  }
  .fn,
  .qb,
  .jl {
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
  .tb:has(.pill) .brand,
  .pwr {
    display: none; /* the name makes room for the state; while printing the band has the job and the name stays */
  }
  .pwr-s {
    display: block;
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
  /* the compact print pill on a phone: state and the two buttons only; the printer switcher gives up its spot */
  .pill.job {
    gap: 4px;
    padding: 0 4px;
  }
  .pill.job .jc {
    min-width: 56px !important;
  }
  .pill.job .st2,
  .tb:has(.pill.job) .pmb {
    display: none;
  }
  .jb,
  .pill.job :deep(.jm) {
    width: 32px;
  }
}
.pmb {
  margin-left: -6px;
  flex-shrink: 0;
}
.pmi {
  justify-content: flex-start;
  text-align: left;
  gap: 8px;
  height: 38px;
  color: var(--tx);
  font-weight: 600;
}
.pmi.all {
  border-bottom: 1px solid var(--bd);
  border-radius: 0;
  margin-bottom: 4px;
}
.pmi .mono {
  font-size: 11px;
  font-weight: 400;
}
.pmi.cur,
.pmi:disabled {
  opacity: 1;
  background: var(--s2);
}
</style>
