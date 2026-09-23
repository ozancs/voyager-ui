<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import { state, fmtTime, fmtDate, toast, isPrinting, useApiEvent } from '../store'
import { api } from '../api/moonraker'
import { t } from '../i18n'
const jobs = ref(state.cache.jobs || [])
const totals = ref(state.cache.totals || null)
const loading = ref(!state.cache.jobs)
const q = ref('')
const page = ref(0)
const per = ref(10)
const sort = ref({ k: 'start_time', d: -1 })
const pieMode = ref('jobs')
const barMode = ref('filament')
const del = ref(null) // array of jobs to delete
const picked = ref(new Set())
const allOnPage = computed(() => shown.value.length > 0 && shown.value.every((j) => picked.value.has(j.job_id)))
function togglePick(j) { const s = new Set(picked.value); s.has(j.job_id) ? s.delete(j.job_id) : s.add(j.job_id); picked.value = s }
function togglePage() { const s = new Set(picked.value); if (allOnPage.value) shown.value.forEach((j) => s.delete(j.job_id)); else shown.value.forEach((j) => s.add(j.job_id)); picked.value = s }
async function load() {
  try {
    const [r, t] = await Promise.all([api.call('server.history.list', { limit: 1000, order: 'desc' }), api.call('server.history.totals')])
    jobs.value = r.jobs || []
    totals.value = t.job_totals
    state.cache.jobs = jobs.value; state.cache.totals = totals.value
  } catch (e) { toast(e.message, 'error') }
  loading.value = false
}
onMounted(load)
let rt
useApiEvent('notify_history_changed', () => { clearTimeout(rt); rt = setTimeout(load, 500) })
const STATUS = {
  completed: { c: 'var(--ok)', i: 'check' }, cancelled: { c: 'var(--wn)', i: 'x' }, error: { c: 'var(--dg)', i: 'warn' },
  klippy_shutdown: { c: 'var(--dg)', i: 'warn' }, klippy_disconnect: { c: 'var(--dg)', i: 'warn' }, interrupted: { c: 'var(--dg)', i: 'warn' },
  server_exit: { c: 'var(--dg)', i: 'warn' }, in_progress: { c: 'var(--bl)', i: 'play' },
}
const st = (s) => STATUS[s] || { c: 'var(--mu)', i: 'info' }
const filtered = computed(() => {
  const f = q.value.toLowerCase()
  const { k, d } = sort.value
  const val = (j) => (k === 'estimated' ? j.metadata?.estimated_time ?? 0 : k === 'filename' ? j.filename.toLowerCase() : j[k] ?? 0)
  return jobs.value.filter((j) => !f || j.filename.toLowerCase().includes(f) || j.status.includes(f)).sort((a, b) => (val(a) > val(b) ? d : val(a) < val(b) ? -d : 0))
})
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / per.value)))
const shown = computed(() => filtered.value.slice(page.value * per.value, (page.value + 1) * per.value))
watch([q, per], () => (page.value = 0))
function sortBy(k) { sort.value = { k, d: sort.value.k === k ? -sort.value.d : -1 } }
const arrow = (k) => (sort.value.k === k ? (sort.value.d > 0 ? ' ↑' : ' ↓') : '')

// stats
const avg = computed(() => (totals.value?.total_jobs ? totals.value.total_print_time / totals.value.total_jobs : 0))
const PIE_COLORS = { completed: '#3dd68c', cancelled: '#f5c451', error: '#e5484d', klippy_shutdown: '#b34040', klippy_disconnect: '#8a3434', interrupted: '#c96a6a', server_exit: '#7a3030', in_progress: '#5aa9ff' }
const pie = computed(() => {
  const g = {}
  for (const j of jobs.value) {
    const v = pieMode.value === 'jobs' ? 1 : pieMode.value === 'filament' ? j.filament_used / 1000 : j.print_duration / 3600
    g[j.status] = (g[j.status] || 0) + v
  }
  const total = Object.values(g).reduce((a, b) => a + b, 0) || 1
  let acc = 0
  const R = 40, C = 2 * Math.PI * R
  return Object.entries(g).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
    const seg = { k, v, pct: v / total, dash: `${(v / total) * C} ${C}`, off: -acc * C, color: PIE_COLORS[k] || '#a3a7ae' }
    acc += v / total
    return seg
  })
})
const fmtPie = (s) => (pieMode.value === 'jobs' ? s.v : pieMode.value === 'filament' ? s.v.toFixed(1) + ' m' : s.v.toFixed(1) + ' h')
const DAYS = 14
const bars = computed(() => {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const start = now.getTime() / 1000 - (DAYS - 1) * 86400
  const b = Array.from({ length: DAYS }, (_, i) => ({ day: new Date((start + i * 86400) * 1000).getDate(), fil: 0, time: 0, n: 0 }))
  for (const j of jobs.value) {
    const i = Math.floor((j.start_time - start) / 86400)
    if (i < 0 || i >= DAYS) continue
    b[i].fil += j.filament_used / 1000; b[i].time += j.print_duration; b[i].n++
  }
  return b.map((x) => ({ ...x, v: barMode.value === 'filament' ? x.fil : x.n ? x.time / x.n / 60 : 0 }))
})
const barMax = computed(() => { const m = Math.max(...bars.value.map((b) => b.v), 1); const p = Math.pow(10, Math.floor(Math.log10(m))); return Math.ceil(m / p) * p })

function thumb(j) {
  const t = (j.metadata?.thumbnails || []).slice().sort((a, b) => a.width - b.width).find((t) => t.width >= 32)
  if (!t || !j.exists) return null
  const dir = j.filename.split('/').slice(0, -1).join('/')
  return api.url(`/server/files/gcodes/${dir ? dir + '/' : ''}${encodeURI(t.relative_path)}`)
}
async function reprint(j) { try { await api.call('printer.print.start', { filename: j.filename }) } catch (e) { toast(e.message, 'error') } }
async function remove() {
  const list = del.value
  del.value = null
  let fail = 0
  for (const j of list) {
    // some moonraker versions key jobs differently; try the id as given, then without padding
    const ids = [...new Set([j.job_id, String(j.job_id).replace(/^0+/, ''), String(parseInt(j.job_id, 16))])]
    let ok = false
    for (const uid of ids) { try { await api.call('server.history.delete_job', { uid }); ok = true; break } catch {} }
    if (!ok) fail++
  }
  picked.value = new Set()
  await load()
  if (fail) toast(t('{n} job(s) could not be deleted (already removed?). List refreshed.', { n: fail }), 'error')
  else toast(t('{n} job(s) deleted', { n: list.length }))
}
function exportCsv() {
  const rows = [['file', 'status', 'start', 'estimated_s', 'print_s', 'total_s', 'filament_mm', 'slicer']]
  for (const j of filtered.value) rows.push([j.filename, j.status, new Date(j.start_time * 1000).toISOString(), Math.round(j.metadata?.estimated_time || 0), Math.round(j.print_duration), Math.round(j.total_duration), Math.round(j.filament_used), (j.metadata?.slicer || '') + ' ' + (j.metadata?.slicer_version || '')])
  const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'print-history.csv'; a.click()
}
const fmtFil = (mm) => (mm >= 1000 ? (mm / 1000).toFixed(2) + ' m' : mm.toFixed(2) + ' mm')
</script>
<template>
  <div class="page">
    <section class="card">
      <div class="card-h"><h2 class="row"><Icon name="hmap" :size="18" />{{ t('Statistics') }}</h2></div>
      <div class="stats">
        <div class="kv">
          <div><span>{{ t('Total Print Time') }}</span><b class="mono">{{ fmtTime(totals?.total_print_time) }}</b></div>
          <div><span>{{ t('Longest Print Time') }}</span><b class="mono">{{ fmtTime(totals?.longest_print) }}</b></div>
          <div><span>{{ t('Print Time Ø') }}</span><b class="mono">{{ fmtTime(avg) }}</b></div>
          <div><span>{{ t('Total Filament Used') }}</span><b class="mono">{{ totals ? (totals.total_filament_used / 1000).toFixed(1) + ' m' : '--' }}</b></div>
          <div><span>{{ t('Total Jobs') }}</span><b class="mono">{{ totals?.total_jobs ?? '--' }}</b></div>
        </div>
        <div class="pie">
          <div class="row" style="gap:20px;align-items:center">
            <svg width="150" height="150" viewBox="0 0 100 100" :aria-label="t('Jobs by status')">
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--s2)" stroke-width="14" />
              <circle v-for="s in pie" :key="s.k" cx="50" cy="50" r="40" fill="none" :stroke="s.color" stroke-width="14" :stroke-dasharray="s.dash" :stroke-dashoffset="s.off" transform="rotate(-90 50 50)" />
            </svg>
            <div class="col" style="gap:6px">
              <div v-for="s in pie" :key="s.k" class="row lg"><i :style="{ background: s.color }"></i><span class="grow">{{ t(s.k.replace('_', ' ')) }}</span><b class="mono">{{ fmtPie(s) }}</b><span class="mono mu">{{ Math.round(s.pct * 100) }}%</span></div>
            </div>
          </div>
          <div class="seg" style="width:240px"><button v-for="m in ['jobs', 'filament', 'time']" :key="m" :class="{ on: pieMode === m }" @click="pieMode = m">{{ t(m) }}</button></div>
        </div>
        <div class="bc">
          <span class="lbl">{{ barMode === 'filament' ? t('Filament (m), last 14 days') : t('Avg print time (min), last 14 days') }}</span>
          <div class="chart">
            <div class="ya mono"><span>{{ barMax }}</span><span>{{ barMax / 2 }}</span><span>0</span></div>
            <div class="bars">
              <div v-for="(b, i) in bars" :key="i" class="bw" :title="b.v.toFixed(1)">
                <div class="b" :style="{ height: (b.v / barMax) * 100 + '%', background: i === bars.length - 1 ? 'var(--ac)' : '#5a6068' }"></div>
                <span class="mono">{{ b.day }}</span>
              </div>
            </div>
          </div>
          <div class="seg" style="width:280px;align-self:center;margin-top:16px"><button :class="{ on: barMode === 'filament' }" @click="barMode = 'filament'">{{ t('Filament usage') }}</button><button :class="{ on: barMode === 'time' }" @click="barMode = 'time'">{{ t('Print time Ø') }}</button></div>
        </div>
      </div>
    </section>
    <section class="card">
      <div class="card-h">
        <h2 class="row"><Icon name="clock" :size="18" />{{ t('Print History') }}</h2>
        <div class="acts">
          <label class="row input sr"><Icon name="search" :size="16" /><input v-model="q" :placeholder="t('Search')" :aria-label="t('Search history')" /></label>
          <button v-if="picked.size" class="btn dg" style="height:40px" @click="del = jobs.filter((j) => picked.has(j.job_id))"><Icon name="trash" :size="16" />{{ t('Delete ({n})', { n: picked.size }) }}</button>
          <button class="btn" style="height:40px" @click="exportCsv"><Icon name="download" :size="16" />{{ t('Export CSV') }}</button>
        </div>
      </div>
      <div style="overflow:auto">
        <table class="tbl">
          <thead><tr>
            <th style="width:36px"><input type="checkbox" class="cb" :checked="allOnPage" :aria-label="t('Select page')" @change="togglePage" /></th><th style="width:56px"></th><th class="s" @click="sortBy('filename')">{{ t('Filename') }}{{ arrow('filename') }}</th><th></th>
            <th class="s" @click="sortBy('start_time')">{{ t('Start time') }}{{ arrow('start_time') }}</th><th class="s" @click="sortBy('estimated')">{{ t('Estimated') }}{{ arrow('estimated') }}</th>
            <th class="s" @click="sortBy('print_duration')">{{ t('Print time') }}{{ arrow('print_duration') }}</th><th class="s" @click="sortBy('filament_used')">{{ t('Filament') }}{{ arrow('filament_used') }}</th><th>{{ t('Slicer') }}</th><th style="width:80px"></th>
          </tr></thead>
          <tbody>
            <tr v-for="j in shown" :key="j.job_id" :class="{ gone: !j.exists, sel: picked.has(j.job_id) }">
              <td><input type="checkbox" class="cb" :checked="picked.has(j.job_id)" :aria-label="t('Select job')" @change="togglePick(j)" /></td>
              <td><div class="th"><img v-if="thumb(j)" :src="thumb(j)" alt="" loading="lazy" /><Icon v-else name="file" :size="20" :stroke="1.8" /></div></td>
              <td class="fn">{{ j.filename }}</td>
              <td><span :style="{ color: st(j.status).c }" :aria-label="t(j.status.replace('_', ' '))" :data-tip="t(j.status.replace('_', ' '))"><Icon :name="st(j.status).i" :size="18" :stroke="2.4" /></span></td>
              <td class="mono">{{ fmtDate(j.start_time) }}</td>
              <td class="mono">{{ fmtTime(j.metadata?.estimated_time) }}</td>
              <td class="mono">{{ fmtTime(j.print_duration) }}</td>
              <td class="mono">{{ fmtFil(j.filament_used) }}</td>
              <td class="mu sl">{{ j.metadata?.slicer }} {{ j.metadata?.slicer_version }}</td>
              <td><div class="row" style="gap:4px"><button class="btn ibtn sm" :aria-label="t('Print again')" :disabled="isPrinting || !j.exists" @click="reprint(j)"><Icon name="refresh" :size="16" /></button><button class="btn ibtn sm clear" :aria-label="t('Delete from history')" @click="del = [j]"><Icon name="trash" :size="16" /></button></div></td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="empty">{{ t('Loading…') }}</div>
        <div v-else-if="!filtered.length" class="empty">{{ t('No jobs') }}</div>
      </div>
      <div class="pg">
        <span class="lbl">{{ t('Jobs') }}</span>
        <select class="input" style="height:32px" v-model.number="per" :aria-label="t('Jobs per page')"><option v-for="n in [10, 25, 50, 100]" :key="n" :value="n">{{ n }}</option></select>
        <span class="mono mu">{{ t('{a}-{b} of {n}', { a: filtered.length ? page * per + 1 : 0, b: Math.min((page + 1) * per, filtered.length), n: filtered.length }) }}</span>
        <button class="btn clear ibtn sm" :aria-label="t('Previous page')" :disabled="page === 0" @click="page--"><Icon name="left" :size="18" /></button>
        <button class="btn clear ibtn sm" :aria-label="t('Next page')" :disabled="page >= pages - 1" @click="page++"><Icon name="right" :size="18" /></button>
      </div>
    </section>
  </div>
  <Modal v-if="del" :title="del.length > 1 ? t('Delete {n} jobs from history?', { n: del.length }) : t('Delete job from history?')" @close="del = null">
    <div class="mono" style="max-height:200px;overflow:auto;font-size:12px"><div v-for="j in del" :key="j.job_id">{{ j.filename }}</div></div>
    <template #foot><button class="btn lg" @click="del = null">{{ t('Cancel') }}</button><button class="btn lg dgf" @click="remove">{{ t('Delete') }}</button></template>
  </Modal>
</template>
<style scoped>
.stats { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(320px, 1.2fr) minmax(320px, 1.4fr); gap: 24px; align-items: center; }
.kv > div { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--bd); font-size: 14px; }
.kv span { color: var(--mu); font-weight: 600; }
.pie { display: flex; flex-direction: column; gap: 14px; align-items: center; }
.lg { font-size: 13px; text-transform: capitalize; gap: 8px; min-width: 200px; }
.lg i { width: 10px; height: 10px; border-radius: 3px; }
.lg .mono { font-size: 12px; }
.mu { color: var(--mu); }
.bc { display: flex; flex-direction: column; gap: 10px; }
.chart { display: flex; gap: 8px; height: 150px; }
.ya { display: flex; flex-direction: column; justify-content: space-between; font-size: 10px; color: var(--mu2); padding-bottom: 18px; text-align: right; }
.bars { flex: 1; display: flex; gap: 6px; border-left: 1px solid var(--bd); border-bottom: 1px solid var(--bd); padding: 0 4px; position: relative; }
.bw { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; }
.b { width: 100%; border-radius: 3px 3px 0 0; min-height: 1px; }
.bw span { font-size: 10px; color: var(--mu2); height: 14px; margin-bottom: -18px; }
.seg button { text-transform: capitalize; }
.sr { width: 260px; height: 40px; }
.sr input { flex: 1; background: transparent; border: none; outline: none; }
.th { width: 40px; height: 40px; border-radius: 8px; background: var(--s2); display: flex; align-items: center; justify-content: center; color: var(--mu); overflow: hidden; }
.th img { width: 100%; height: 100%; object-fit: contain; }
.fn { font-weight: 700; word-break: break-all; }
td.mono { font-size: 13px; white-space: nowrap; }
.sl { font-size: 12px; }
tr.gone td { color: var(--mu); }
tr.gone .fn { font-weight: 500; }
th.s { cursor: pointer; }
th.s:hover { color: var(--tx); }
.cb { width: 16px; height: 16px; accent-color: var(--ac); cursor: pointer; }
.pg { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
@media (max-width: 1300px) { .stats { grid-template-columns: 1fr 1fr; } .bc { grid-column: span 2; } }
</style>
