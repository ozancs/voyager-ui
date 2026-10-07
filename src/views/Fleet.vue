<script setup>
// All printers: one card per saved printer with its state, print progress, temperatures and a camera snapshot,
// refreshed every few seconds (fleet.js). "Open" switches to that printer. Reached from the printer menu next to
// the printer name, and from Ctrl+K. Saved printers can be renamed, get a new address or be removed here too.
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import Icon from '../components/Icon.vue';
import { state, S, fmtTime, printerName, toast } from '../store';
import { selectPrinter, printerList, savePrinters, HOST_RE } from '../printers';
import Modal from '../components/Modal.vue';
import { fleetList, pollPrinter, timeLeft, testPrinter, looksIncomplete } from '../fleet';
import { go } from '../router';
import { api } from '../api/moonraker';
import { t } from '../i18n';
import { undoable } from '../undo';

const list = computed(fleetList);
const here = location.host;
const data = reactive({}); // id -> { state, status, hostname, cam }
const tick = ref(0);
let timer = null,
  busy = false;
async function refresh() {
  if (busy) return;
  busy = true;
  await Promise.all(
    list.value
      .filter((p) => !p.cur)
      .map(async (p) => {
        const prev = data[p.id] || {};
        const r = await pollPrinter(p, prev);
        data[p.id] = { ...prev, ...r };
      }),
  );
  tick.value++;
  busy = false;
}
onMounted(() => {
  refresh();
  timer = setInterval(() => document.visibilityState === 'visible' && refresh(), 4000);
});
onBeforeUnmount(() => clearInterval(timer));

// the connected printer from the live state, the others from polling
const cards = computed(() =>
  list.value.map((p) => {
    if (p.cur) {
      const status = {
        print_stats: S('print_stats'),
        virtual_sdcard: S('virtual_sdcard'),
        display_status: S('display_status'),
        extruder: S('extruder'),
        heater_bed: S('heater_bed'),
      };
      return {
        p,
        name: p.name || printerName.value,
        state: state.connected ? state.klippy : 'offline',
        status,
        cam: curCam.value,
      };
    }
    const d = data[p.id] || {};
    return {
      p,
      name: p.name || d.hostname || p.host || here,
      state: d.state || 'loading',
      status: d.status || {},
      cam: d.cam,
    };
  }),
);
const curCam = computed(() => {
  const c = (state.webcams || []).find((x) => x.enabled !== false && x.snapshot_url);
  return c ? c.snapshot_url : null;
});
const camUrl = (c) => {
  if (!c.cam) return '';
  const u = c.p.cur ? api.url(c.cam) : c.cam;
  return u + (u.includes('?') ? '&' : '?') + '_t=' + tick.value;
};

// one word for the card: the print state when Klipper is ready, otherwise Klipper's or the connection's
function label(c) {
  if (c.state === 'offline') return [t('Offline'), 'mu'];
  if (c.state === 'login') return [t('Login needed'), 'wn'];
  if (c.state === 'loading') return [t('Loading…'), 'mu'];
  if (c.state !== 'ready') return [t('Klipper {state}', { state: c.state }), 'dg'];
  const s = c.status.print_stats?.state || 'standby';
  const map = {
    printing: [t('Printing'), 'ac'],
    paused: [t('Paused'), 'wn'],
    complete: [t('Complete'), 'ok'],
    error: [t('Error'), 'dg'],
    cancelled: [t('Cancelled'), 'mu'],
  };
  return map[s] || [t('Ready'), 'mu'];
}
const progress = (c) => c.status.display_status?.progress || c.status.virtual_sdcard?.progress || 0;
const active = (c) => ['printing', 'paused'].includes(c.status.print_stats?.state);
const temp = (h) =>
  h && h.temperature != null
    ? `${Math.round(h.temperature)}°${h.target ? ' / ' + Math.round(h.target) + '°' : ''}`
    : '--';
// editing a saved printer (name and address) and removing it
const edit = ref(null); // { id, name, host, test }
const cleanHost = (h) =>
  String(h || '')
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/\/.*$/, '');
const editOk = computed(() => edit.value && HOST_RE.test(cleanHost(edit.value.host)));
function startEdit(c) {
  edit.value = { id: c.p.id, name: c.p.name, host: c.p.host, test: null };
}
async function testEdit() {
  const e = edit.value;
  e.test = { busy: true };
  e.test = await testPrinter(cleanHost(e.host));
}
function saveEdit() {
  const e = edit.value,
    host = cleanHost(e.host);
  const old = printerList.value.find((p) => p.id === e.id);
  const wasCur = list.value.find((p) => p.id === e.id)?.cur;
  savePrinters(printerList.value.map((p) => (p.id === e.id ? { ...p, name: e.name.trim() || host, host } : p)));
  edit.value = null;
  if (old && old.host !== host) {
    delete data[e.id]; // asked again at the new address
    if (wasCur) selectPrinter(e.id); // the printer on screen moved: reconnect there
  }
}
const del = ref(null); // card asking to be removed
function doDelete() {
  const c = del.value;
  del.value = null;
  const before = printerList.value.slice();
  savePrinters(before.filter((p) => p.id !== c.p.id));
  delete data[c.p.id];
  // removed at once (only this browser's list changes), Undo puts it back where it was. Removing the printer on
  // screen reloads the page, so there is nothing to undo there: it says so instead
  if (c.p.cur) {
    toast(t('{name} removed', { name: c.p.name || c.p.host }));
    setTimeout(() => selectPrinter(''), 300); // back to this page's own address
    return;
  }
  undoable(t('{name} removed', { name: c.p.name || c.p.host }), {
    undo: () => savePrinters(before.map((p) => printerList.value.find((x) => x.id === p.id) || p)),
  });
}
function open(c) {
  if (c.p.cur) go('dashboard');
  else selectPrinter(c.p.id);
}
</script>

<template>
  <div class="fl">
    <div class="hd">
      <h1>{{ t('All printers') }}</h1>
      <span class="mu">{{ list.length }}</span>
      <span class="grow"></span>
      <button class="btn" @click="state.printersOpen = true">
        <Icon name="gear" :size="16" />{{ t('Manage printers') }}
      </button>
    </div>
    <p v-if="list.length < 2" class="mu hint">
      {{ t('Add your other printers with Manage printers, then they all show up here.') }}
    </p>
    <div class="grid">
      <section v-for="c in cards" :key="c.p.id" class="card pc" :class="{ cur: c.p.cur }">
        <div class="cam" :class="{ none: !c.cam }">
          <img v-if="c.cam && c.state !== 'offline'" :src="camUrl(c)" alt="" loading="lazy" />
          <Icon v-else name="printer3d" :size="34" :stroke="1.4" />
        </div>
        <div class="body">
          <div class="row1">
            <b class="nm">{{ c.name }}</b>
            <span v-if="c.p.cur" class="here">{{ t('Connected') }}</span>
            <span class="grow"></span>
            <span class="st" :class="label(c)[1]">{{ label(c)[0] }}</span>
          </div>
          <span class="mono mu sm">{{ c.p.host || here }}</span>
          <template v-if="c.state === 'ready' && active(c)">
            <span class="fn mono sm">{{ c.status.print_stats?.filename }}</span>
            <div class="bar"><div :style="{ width: progress(c) * 100 + '%' }"></div></div>
            <div class="row2 sm">
              <span>{{ Math.round(progress(c) * 100) }}%</span>
              <span class="mu">{{ t('{t} left', { t: fmtTime(timeLeft(c.status)) }) }}</span>
            </div>
          </template>
          <span v-else-if="c.state === 'ready' && c.status.print_stats?.filename" class="fn mono sm mu">{{
            c.status.print_stats.filename
          }}</span>
          <div v-if="c.state === 'ready'" class="row2 sm">
            <span><Icon name="nozzle" :size="14" />{{ temp(c.status.extruder) }}</span>
            <span><Icon name="bed" :size="14" />{{ temp(c.status.heater_bed) }}</span>
          </div>
          <div v-if="edit?.id === c.p.id && c.p.id" class="ed">
            <input v-model="edit.name" class="input" :placeholder="t('Nickname')" :aria-label="t('Nickname')" />
            <input
              v-model="edit.host"
              class="input mono"
              :class="{ bad: !editOk }"
              placeholder="192.168.1.20:7125"
              spellcheck="false"
              :aria-label="t('Address')"
            />
            <p v-if="edit.test && !edit.test.busy" class="res" :class="edit.test.level">
              {{ t(edit.test.text, edit.test.params) }}
            </p>
            <p v-if="editOk && looksIncomplete(cleanHost(edit.host))" class="res wn">
              {{ t('This address looks incomplete (an IP address has four numbers, like 192.168.1.20).') }}
            </p>
            <div class="acts">
              <button class="btn" :disabled="!editOk || edit.test?.busy" @click="testEdit">
                <Icon name="plug" :size="15" />{{ t('Test') }}
              </button>
              <span class="grow"></span>
              <button class="btn" @click="edit = null">{{ t('Cancel') }}</button>
              <button class="btn acc" :disabled="!editOk" @click="saveEdit">{{ t('Save') }}</button>
            </div>
          </div>
          <div v-else class="acts">
            <button class="btn op" @click="open(c)">
              {{ c.p.cur ? t('Dashboard') : t('Open') }}<Icon name="right" :size="15" />
            </button>
            <span class="grow"></span>
            <template v-if="c.p.id">
              <button class="btn clear ibtn sm" :aria-label="t('Edit')" :data-tip="t('Edit')" @click="startEdit(c)">
                <Icon name="pencil" :size="15" />
              </button>
              <button class="btn clear ibtn sm" :aria-label="t('Remove')" :data-tip="t('Remove')" @click="del = c">
                <Icon name="trash" :size="15" />
              </button>
            </template>
          </div>
        </div>
      </section>
    </div>
    <Modal v-if="del" :title="t('Remove printer')" @close="del = null">
      <p style="margin: 0">
        {{
          t('Remove {name} ({host}) from the printer list of this browser? Nothing changes on the printer.', {
            name: del.name,
            host: del.p.host,
          })
        }}
      </p>
      <template #foot>
        <button class="btn lg" @click="del = null">{{ t('Cancel') }}</button>
        <button class="btn lg dg" @click="doDelete">{{ t('Remove') }}</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.fl {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.hd {
  display: flex;
  align-items: center;
  gap: 10px;
}
.hd h1 {
  margin: 0;
  font-size: 20px;
}
.hint {
  margin: 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.pc {
  padding: 0;
  overflow: hidden;
  gap: 0;
}
.pc.cur {
  border-color: var(--ac);
}
.cam {
  aspect-ratio: 16 / 9;
  background: var(--s2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mu2, var(--mu));
}
.cam img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px 14px;
}
.row1,
.row2 {
  display: flex;
  align-items: center;
  gap: 10px;
}
.row2 span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.nm {
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.here {
  font-size: 11px;
  color: var(--mu);
}
.st {
  font-size: 12px;
  font-weight: 700;
}
.st.ac {
  color: var(--ac);
}
.st.wn {
  color: var(--wn);
}
.st.dg {
  color: var(--dg);
}
.st.ok {
  color: var(--ok, var(--ac));
}
.st.mu {
  color: var(--mu);
}
.fn {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar {
  height: 6px;
  border-radius: 3px;
  background: var(--s2);
  overflow: hidden;
}
.bar div {
  height: 100%;
  background: var(--ac);
}
.acts {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.ed {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.bad {
  border-color: var(--dg);
}
.res {
  margin: 0;
  font-size: 12px;
}
.res.ok {
  color: var(--ok, var(--ac));
}
.res.wn {
  color: var(--wn);
}
.res.dg {
  color: var(--dg);
}
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12px;
}
</style>
