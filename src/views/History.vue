<script setup>
// Print history from Moonraker: totals, a searchable list with results and filament used, reprint
// and delete.
import { ref, computed, onMounted, watch } from 'vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import HistoryStats from '../components/HistoryStats.vue';
import { state, fmtTime, fmtDate, toast, isPrinting, useApiEvent } from '../store';
import { api } from '../api/moonraker';
import { t } from '../i18n';
import { startPrint } from '../preprint';
import { undoable, isHidden } from '../undo';
import { shots, loadShots, getShot, dropShots } from '../endShot';
const jobs = ref(state.cache.jobs || []);
const totals = ref(state.cache.totals || null);
const loading = ref(!state.cache.jobs);
const q = ref('');
const page = ref(0);
const per = ref(10);
const sort = ref({ k: 'start_time', d: -1 });
const del = ref(null); // array of jobs to delete
const picked = ref(new Set());
const allOnPage = computed(() => shown.value.length > 0 && shown.value.every((j) => picked.value.has(j.job_id)));
function togglePick(j) {
  const s = new Set(picked.value);
  s.has(j.job_id) ? s.delete(j.job_id) : s.add(j.job_id);
  picked.value = s;
}
function togglePage() {
  const s = new Set(picked.value);
  if (allOnPage.value) shown.value.forEach((j) => s.delete(j.job_id));
  else shown.value.forEach((j) => s.add(j.job_id));
  picked.value = s;
}
async function load() {
  try {
    const [r, t] = await Promise.all([
      api.call('server.history.list', { limit: 1000, order: 'desc' }),
      api.call('server.history.totals'),
    ]);
    jobs.value = r.jobs || [];
    totals.value = t.job_totals;
    state.cache.jobs = jobs.value;
    state.cache.totals = totals.value;
  } catch (e) {
    toast(e.message, 'error');
  }
  loading.value = false;
}
onMounted(load);
onMounted(loadShots);
// the webcam picture kept at the end of a job (endShot.js)
const hasShot = (j) => shots.ids.includes(String(j.job_id));
const shot = ref(null); // { job, img } while open
async function openShot(j) {
  shot.value = { job: j, img: '' };
  try {
    const v = await getShot(j.job_id);
    if (shot.value?.job === j) shot.value.img = v?.img || '';
  } catch (e) {
    toast(e.message, 'error');
    shot.value = null;
  }
}
let rt;
useApiEvent('notify_history_changed', () => {
  clearTimeout(rt);
  rt = setTimeout(load, 500);
  setTimeout(loadShots, 12000); // the picture is taken a few seconds after the job ends
});
const STATUS = {
  completed: { c: 'var(--ok)', i: 'check' },
  cancelled: { c: 'var(--wn)', i: 'x' },
  error: { c: 'var(--dg)', i: 'warn' },
  klippy_shutdown: { c: 'var(--dg)', i: 'warn' },
  klippy_disconnect: { c: 'var(--dg)', i: 'warn' },
  interrupted: { c: 'var(--dg)', i: 'warn' },
  server_exit: { c: 'var(--dg)', i: 'warn' },
  in_progress: { c: 'var(--bl)', i: 'play' },
};
const st = (s) => STATUS[s] || { c: 'var(--mu)', i: 'info' };
// filter by Spoolman spool: Moonraker stores the spools a job used in auxiliary_data (spool_ids)
const spoolOf = (j) => (j.auxiliary_data || []).find((d) => d.name === 'spool_ids')?.value || [];
const spoolIds = computed(() => [...new Set(jobs.value.flatMap(spoolOf))].sort((a, b) => a - b));
const spoolF = ref('');
const spoolNames = ref({});
watch(
  () => spoolIds.value.length,
  async (n) => {
    if (!n || Object.keys(spoolNames.value).length) return;
    try {
      const r = await api.call('server.spoolman.proxy', {
        request_method: 'GET',
        path: '/v1/spool',
        use_v2_response: true,
      });
      const o = {};
      for (const s of r.response || [])
        o[s.id] = [s.filament?.vendor?.name, s.filament?.name].filter(Boolean).join(' ');
      spoolNames.value = o;
    } catch {
      /* names are a nicety; the ids still work */
    }
  },
  { immediate: true },
);
const spoolLabel = (id) => '#' + id + (spoolNames.value[id] ? ' ' + spoolNames.value[id] : '');
const filtered = computed(() => {
  const f = q.value.toLowerCase();
  const { k, d } = sort.value;
  const val = (j) =>
    k === 'estimated' ? (j.metadata?.estimated_time ?? 0) : k === 'filename' ? j.filename.toLowerCase() : (j[k] ?? 0);
  return jobs.value
    .filter((j) => !isHidden('j:' + j.job_id))
    .filter((j) => !f || j.filename.toLowerCase().includes(f) || j.status.includes(f))
    .filter((j) => !spoolF.value || spoolOf(j).includes(+spoolF.value))
    .sort((a, b) => (val(a) > val(b) ? d : val(a) < val(b) ? -d : 0));
});
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / per.value)));
const shown = computed(() => filtered.value.slice(page.value * per.value, (page.value + 1) * per.value));
watch([q, per, spoolF], () => (page.value = 0));
// fewer pages after a delete: stay on the last one that exists
watch(pages, (n) => page.value > n - 1 && (page.value = n - 1));
function sortBy(k) {
  sort.value = { k, d: sort.value.k === k ? -sort.value.d : -1 };
}
const arrow = (k) => (sort.value.k === k ? (sort.value.d > 0 ? ' ↑' : ' ↓') : '');

function thumb(j, big = false) {
  const t = (j.metadata?.thumbnails || [])
    .slice()
    .sort((a, b) => (big ? b.width - a.width : a.width - b.width))
    .find((t) => t.width >= 32);
  if (!t || !j.exists) return null;
  const dir = j.filename.split('/').slice(0, -1).join('/');
  return api.fileUrl('gcodes', (dir ? dir + '/' : '') + t.relative_path);
}
async function reprint(j) {
  await startPrint(j.filename, { reprint: true });
}
function remove() {
  const list = del.value;
  del.value = null;
  picked.value = new Set();
  undoable(list.length === 1 ? t('Job deleted') : t('{n} jobs deleted', { n: list.length }), {
    hideKeys: list.map((j) => 'j:' + j.job_id),
    commit: async () => {
      let fail = 0;
      for (const j of list) {
        // some moonraker versions key jobs differently; try the id as given, then without padding
        const ids = [...new Set([j.job_id, String(j.job_id).replace(/^0+/, '')])];
        let ok = false;
        for (const uid of ids) {
          try {
            await api.call('server.history.delete_job', { uid });
            ok = true;
            break;
          } catch {}
        }
        if (!ok) fail++;
      }
      await dropShots(list.map((j) => j.job_id));
      await load();
      if (fail) toast(t('{n} job(s) could not be deleted (already removed?). List refreshed.', { n: fail }), 'error');
    },
  });
}
function exportCsv() {
  const rows = [['file', 'status', 'start', 'estimated_s', 'print_s', 'total_s', 'filament_mm', 'slicer']];
  for (const j of filtered.value)
    rows.push([
      j.filename,
      j.status,
      new Date(j.start_time * 1000).toISOString(),
      Math.round(j.metadata?.estimated_time || 0),
      Math.round(j.print_duration),
      Math.round(j.total_duration),
      Math.round(j.filament_used),
      (j.metadata?.slicer || '') + ' ' + (j.metadata?.slicer_version || ''),
    ]);
  const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], {
    type: 'text/csv',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'print-history.csv';
  a.click();
}
const fmtFil = (mm) => (mm >= 1000 ? (mm / 1000).toFixed(2) + ' m' : mm.toFixed(2) + ' mm');
</script>
<template>
  <div class="page">
    <HistoryStats :jobs="jobs" :totals="totals" />
    <section class="card">
      <div class="card-h">
        <h2 class="row"><Icon name="clock" :size="18" />{{ t('Print History') }}</h2>
        <div class="acts">
          <select
            v-if="spoolIds.length"
            v-model="spoolF"
            class="input spf"
            :aria-label="t('Filter by spool')"
            :data-tip="t('Filter by spool')"
          >
            <option value="">{{ t('All spools') }}</option>
            <option v-for="id in spoolIds" :key="id" :value="String(id)">{{ spoolLabel(id) }}</option>
          </select>
          <label class="row input sr"
            ><Icon name="search" :size="16" /><input
              v-model="q"
              :placeholder="t('Search')"
              :aria-label="t('Search history')"
          /></label>
          <button
            v-if="picked.size"
            class="btn dg"
            style="height: 40px"
            @click="del = jobs.filter((j) => picked.has(j.job_id))"
          >
            <Icon name="trash" :size="16" />{{ t('Delete ({n})', { n: picked.size }) }}
          </button>
          <button class="btn" style="height: 40px" @click="exportCsv">
            <Icon name="download" :size="16" />{{ t('Export CSV') }}
          </button>
        </div>
      </div>
      <div style="overflow: auto">
        <table class="tbl">
          <thead>
            <tr>
              <th style="width: 36px">
                <input
                  type="checkbox"
                  class="cb"
                  :checked="allOnPage"
                  :aria-label="t('Select page')"
                  @change="togglePage"
                />
              </th>
              <th style="width: 56px"></th>
              <th class="s" @click="sortBy('filename')">{{ t('Filename') }}{{ arrow('filename') }}</th>
              <th>{{ t('Status') }}</th>
              <th class="s" @click="sortBy('start_time')">{{ t('Start time') }}{{ arrow('start_time') }}</th>
              <th class="s" @click="sortBy('estimated')">{{ t('Estimated') }}{{ arrow('estimated') }}</th>
              <th class="s" @click="sortBy('print_duration')">{{ t('Print time') }}{{ arrow('print_duration') }}</th>
              <th class="s" @click="sortBy('filament_used')">{{ t('Filament') }}{{ arrow('filament_used') }}</th>
              <th>{{ t('Slicer') }}</th>
              <th style="width: 116px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in shown" :key="j.job_id" :class="{ gone: !j.exists, sel: picked.has(j.job_id) }">
              <td>
                <input
                  type="checkbox"
                  class="cb"
                  :checked="picked.has(j.job_id)"
                  :aria-label="t('Select job')"
                  @change="togglePick(j)"
                />
              </td>
              <td>
                <div class="th">
                  <img v-if="thumb(j)" v-zoom="thumb(j, true)" :src="thumb(j)" alt="" loading="lazy" /><Icon
                    v-else
                    name="file"
                    :size="20"
                    :stroke="1.8"
                  />
                </div>
              </td>
              <td class="fn">{{ j.filename }}</td>
              <td>
                <span
                  :style="{ color: st(j.status).c }"
                  :aria-label="t(j.status.replace('_', ' '))"
                  :data-tip="t(j.status.replace('_', ' '))"
                  ><Icon :name="st(j.status).i" :size="22" :stroke="2.4"
                /></span>
              </td>
              <td class="mono">{{ fmtDate(j.start_time) }}</td>
              <td class="mono">{{ fmtTime(j.metadata?.estimated_time) }}</td>
              <td class="mono">{{ fmtTime(j.print_duration) }}</td>
              <td class="mono">{{ fmtFil(j.filament_used) }}</td>
              <td class="mu sl">{{ j.metadata?.slicer }} {{ j.metadata?.slicer_version }}</td>
              <td>
                <div class="row" style="gap: 4px">
                  <button
                    v-if="hasShot(j)"
                    class="btn ibtn sm clear"
                    :aria-label="t('Picture at the end')"
                    :data-tip="t('Picture at the end')"
                    @click="openShot(j)"
                  >
                    <Icon name="image" :size="19" /></button
                  ><button
                    class="btn ibtn sm"
                    :aria-label="t('Print again')"
                    :disabled="isPrinting || !j.exists"
                    @click="reprint(j)"
                  >
                    <Icon name="refresh" :size="19" /></button
                  ><button class="btn ibtn sm clear" :aria-label="t('Delete from history')" @click="del = [j]">
                    <Icon name="trash" :size="19" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="empty">{{ t('Loading…') }}</div>
        <div v-else-if="!filtered.length" class="empty">{{ t('No jobs') }}</div>
      </div>
      <div class="pg">
        <span class="lbl">{{ t('Jobs') }}</span>
        <select class="input" style="height: 32px" v-model.number="per" :aria-label="t('Jobs per page')">
          <option v-for="n in [10, 25, 50, 100]" :key="n" :value="n">{{ n }}</option>
        </select>
        <span class="mono mu">{{
          t('{a}-{b} of {n}', {
            a: filtered.length ? page * per + 1 : 0,
            b: Math.min((page + 1) * per, filtered.length),
            n: filtered.length,
          })
        }}</span>
        <button class="btn clear ibtn sm" :aria-label="t('Previous page')" :disabled="page === 0" @click="page--">
          <Icon name="left" :size="18" />
        </button>
        <button class="btn clear ibtn sm" :aria-label="t('Next page')" :disabled="page >= pages - 1" @click="page++">
          <Icon name="right" :size="18" />
        </button>
      </div>
    </section>
  </div>
  <Modal v-if="shot" :title="shot.job.filename" width="min(760px, 96vw)" @close="shot = null">
    <div class="shot">
      <img v-if="shot.img" :src="shot.img" :alt="t('Picture at the end')" />
      <span v-else class="mu">{{ t('Loading…') }}</span>
    </div>
    <div class="row mu" style="gap: 10px; font-size: 13px; flex-wrap: wrap">
      <span :style="{ color: st(shot.job.status).c }"
        ><Icon :name="st(shot.job.status).i" :size="15" :stroke="2.4" style="vertical-align: -2px" />
        {{ t(shot.job.status.replace('_', ' ')) }}</span
      >
      <span class="mono">{{ fmtDate(shot.job.end_time || shot.job.start_time) }}</span>
      <span class="mono">{{ fmtTime(shot.job.print_duration) }}</span>
    </div>
  </Modal>
  <Modal
    v-if="del"
    :title="del.length > 1 ? t('Delete {n} jobs from history?', { n: del.length }) : t('Delete job from history?')"
    @close="del = null"
  >
    <div class="mono" style="max-height: 200px; overflow: auto; font-size: 12px">
      <div v-for="j in del" :key="j.job_id">{{ j.filename }}</div>
    </div>
    <template #foot
      ><button class="btn lg" @click="del = null">{{ t('Cancel') }}</button
      ><button class="btn lg dgf" @click="remove">{{ t('Delete') }}</button></template
    >
  </Modal>
</template>
<style scoped>
.shot {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}
.shot img {
  display: block;
  width: 100%;
  object-fit: contain;
  max-height: 70vh;
}
.seg button {
  text-transform: capitalize;
}
.sr {
  width: 260px;
  height: 40px;
}
.sr input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
}
.th {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--s2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mu);
  overflow: hidden;
}
.th img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.fn {
  font-weight: 600;
  word-break: break-all;
  min-width: 170px; /* the table scrolls sideways before the name is squeezed into a few letters per line */
}
td.mono {
  font-size: 13px;
  white-space: nowrap;
}
.sl {
  font-size: 12px;
}
tr.gone td {
  color: var(--mu);
}
tr.gone .fn {
  font-weight: 500;
}
th.s {
  cursor: pointer;
}
th.s:hover {
  color: var(--tx);
}
.pg {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
.spf {
  height: 40px;
  max-width: 200px;
}
</style>
