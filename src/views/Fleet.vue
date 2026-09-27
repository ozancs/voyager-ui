<script setup>
// All printers: one card per saved printer with its state, print progress, temperatures and a camera snapshot,
// refreshed every few seconds (fleet.js). "Open" switches to that printer. Reached from the printer menu next to
// the printer name, and from Ctrl+K.
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import Icon from '../components/Icon.vue';
import { state, S, fmtTime, printerName } from '../store';
import { selectPrinter } from '../printers';
import { fleetList, pollPrinter, timeLeft } from '../fleet';
import { go } from '../router';
import { api } from '../api/moonraker';
import { t } from '../i18n';

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
          <button class="btn op" @click="open(c)">
            {{ c.p.cur ? t('Dashboard') : t('Open') }}<Icon name="right" :size="15" />
          </button>
        </div>
      </section>
    </div>
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
.op {
  align-self: flex-start;
  margin-top: 4px;
}
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12px;
}
</style>
