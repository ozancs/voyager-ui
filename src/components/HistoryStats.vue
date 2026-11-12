<script setup>
// Print statistics: totals, jobs by status (pie) and the last 14 days (bars). On the History page it gets the
// jobs the page already loaded; on the G-code Files page it loads them itself (from the cache first).
import { ref, computed, onMounted } from 'vue';
import Icon from './Icon.vue';
import { state, fmtTime, useApiEvent } from '../store';
import { api } from '../api/moonraker';
import { go } from '../router';
import { t } from '../i18n';
const props = defineProps({
  jobs: { type: Array, default: null },
  totals: { type: Object, default: null },
  link: Boolean,
});
const ownJobs = ref(state.cache.jobs || []);
const ownTotals = ref(state.cache.totals || null);
const jobsL = computed(() => props.jobs || ownJobs.value);
const totals = computed(() => props.totals || ownTotals.value);
async function load() {
  if (props.jobs) return;
  try {
    const [r, tt] = await Promise.all([
      api.call('server.history.list', { limit: 1000, order: 'desc' }),
      api.call('server.history.totals'),
    ]);
    ownJobs.value = state.cache.jobs = r.jobs || [];
    ownTotals.value = state.cache.totals = tt.job_totals;
  } catch {
    /* the card stays with what the cache had */
  }
}
onMounted(load);
let rt;
useApiEvent('notify_history_changed', () => {
  clearTimeout(rt);
  rt = setTimeout(load, 500);
});
const pieMode = ref('jobs');
const barMode = ref('filament');
// stats
const avg = computed(() => (totals.value?.total_jobs ? totals.value.total_print_time / totals.value.total_jobs : 0));
const PIE_COLORS = {
  completed: '#3dd68c',
  cancelled: '#f5c451',
  error: '#e5484d',
  klippy_shutdown: '#b34040',
  klippy_disconnect: '#8a3434',
  interrupted: '#c96a6a',
  server_exit: '#7a3030',
  in_progress: '#5aa9ff',
};
const pie = computed(() => {
  const g = {};
  for (const j of jobsL.value) {
    const v =
      pieMode.value === 'jobs' ? 1 : pieMode.value === 'filament' ? j.filament_used / 1000 : j.print_duration / 3600;
    g[j.status] = (g[j.status] || 0) + v;
  }
  const total = Object.values(g).reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  const R = 40,
    C = 2 * Math.PI * R;
  return Object.entries(g)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => {
      const seg = {
        k,
        v,
        pct: v / total,
        dash: `${(v / total) * C} ${C}`,
        off: -acc * C,
        color: PIE_COLORS[k] || '#a3a7ae',
      };
      acc += v / total;
      return seg;
    });
});
const fmtPie = (s) =>
  pieMode.value === 'jobs' ? s.v : pieMode.value === 'filament' ? s.v.toFixed(1) + ' m' : s.v.toFixed(1) + ' h';
const DAYS = 14;
const bars = computed(() => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = now.getTime() / 1000 - (DAYS - 1) * 86400;
  const b = Array.from({ length: DAYS }, (_, i) => ({
    day: new Date((start + i * 86400) * 1000).getDate(),
    fil: 0,
    time: 0,
    n: 0,
  }));
  for (const j of jobsL.value) {
    const i = Math.floor((j.start_time - start) / 86400);
    if (i < 0 || i >= DAYS) continue;
    b[i].fil += j.filament_used / 1000;
    b[i].time += j.print_duration;
    b[i].n++;
  }
  return b.map((x) => ({ ...x, v: barMode.value === 'filament' ? x.fil : x.n ? x.time / x.n / 60 : 0 }));
});
const barMax = computed(() => {
  const m = Math.max(...bars.value.map((b) => b.v), 1);
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  return Math.ceil(m / p) * p;
});
</script>
<template>
  <section class="card">
    <div class="card-h">
      <h2 class="row"><Icon name="hmap" :size="18" />{{ t('Statistics') }}</h2>
      <div v-if="link" class="hd-acts">
        <button class="btn" @click="go('history')"><Icon name="clock" :size="16" />{{ t('Print History') }}</button>
      </div>
    </div>
    <div class="stats">
      <div class="kv">
        <div>
          <span>{{ t('Total Print Time') }}</span
          ><b class="mono">{{ fmtTime(totals?.total_print_time) }}</b>
        </div>
        <div>
          <span>{{ t('Longest Print Time') }}</span
          ><b class="mono">{{ fmtTime(totals?.longest_print) }}</b>
        </div>
        <div>
          <span>{{ t('Print Time Ø') }}</span
          ><b class="mono">{{ fmtTime(avg) }}</b>
        </div>
        <div>
          <span>{{ t('Total Filament Used') }}</span
          ><b class="mono">{{ totals ? (totals.total_filament_used / 1000).toFixed(1) + ' m' : '--' }}</b>
        </div>
        <div>
          <span>{{ t('Total Jobs') }}</span
          ><b class="mono">{{ totals?.total_jobs ?? '--' }}</b>
        </div>
      </div>
      <div class="pie">
        <div class="row" style="gap: 20px; align-items: center">
          <svg width="150" height="150" viewBox="0 0 100 100" :aria-label="t('Jobs by status')">
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--s2)" stroke-width="14" />
            <circle
              v-for="s in pie"
              :key="s.k"
              cx="50"
              cy="50"
              r="40"
              fill="none"
              :stroke="s.color"
              stroke-width="14"
              :stroke-dasharray="s.dash"
              :stroke-dashoffset="s.off"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div class="col" style="gap: 6px">
            <div v-for="s in pie" :key="s.k" class="row lg">
              <i :style="{ background: s.color }"></i><span class="grow">{{ t(s.k.replace('_', ' ')) }}</span
              ><b class="mono">{{ fmtPie(s) }}</b
              ><span class="mono mu">{{ Math.round(s.pct * 100) }}%</span>
            </div>
          </div>
        </div>
        <div class="seg" style="width: 240px">
          <button
            v-for="m in ['jobs', 'filament', 'time']"
            :key="m"
            :class="{ on: pieMode === m }"
            @click="pieMode = m"
          >
            {{ t(m) }}
          </button>
        </div>
      </div>
      <div class="bc">
        <span class="lbl">{{
          barMode === 'filament' ? t('Filament (m), last 14 days') : t('Avg print time (min), last 14 days')
        }}</span>
        <div class="chart">
          <div class="ya mono">
            <span>{{ barMax }}</span
            ><span>{{ barMax / 2 }}</span
            ><span>0</span>
          </div>
          <div class="bars">
            <div v-for="(b, i) in bars" :key="i" class="bw" :title="b.v.toFixed(1)">
              <div
                class="b"
                :style="{
                  height: (b.v / barMax) * 100 + '%',
                  background: i === bars.length - 1 ? 'var(--ac)' : '#5a6068',
                }"
              ></div>
              <span class="mono">{{ b.day }}</span>
            </div>
          </div>
        </div>
        <div class="seg" style="width: 280px; align-self: center; margin-top: 16px">
          <button :class="{ on: barMode === 'filament' }" @click="barMode = 'filament'">
            {{ t('Filament usage') }}</button
          ><button :class="{ on: barMode === 'time' }" @click="barMode = 'time'">{{ t('Print time Ø') }}</button>
        </div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.hd-acts {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.stats {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(320px, 1.2fr) minmax(320px, 1.4fr);
  gap: 24px;
  align-items: center;
}
.kv > div {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--bd);
  font-size: 14px;
}
.kv span {
  color: var(--mu);
  font-weight: 600;
}
.pie {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
}
.lg {
  font-size: 13px;
  text-transform: capitalize;
  gap: 8px;
  min-width: 200px;
}
.lg i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.lg .mono {
  font-size: 12px;
}
.mu {
  color: var(--mu);
}
.bc {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chart {
  display: flex;
  gap: 8px;
  height: 150px;
}
.ya {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 10px;
  color: var(--mu2);
  padding-bottom: 18px;
  text-align: right;
}
.bars {
  flex: 1;
  display: flex;
  gap: 6px;
  border-left: 1px solid var(--bd);
  border-bottom: 1px solid var(--bd);
  padding: 0 4px;
  position: relative;
}
.bw {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
}
.b {
  width: 100%;
  border-radius: 3px 3px 0 0;
  min-height: 1px;
}
.bw span {
  font-size: 10px;
  color: var(--mu2);
  height: 14px;
  margin-bottom: -18px;
}
.seg button {
  text-transform: capitalize;
}
:root.ew-lt-1300 .stats {
  grid-template-columns: 1fr 1fr;
}
:root.ew-lt-1300 .bc {
  grid-column: span 2;
}
/* phone: one column, the switches shrink to the card */
@media (max-width: 720px) {
  .stats,
  :root.ew-lt-1300 .stats {
    grid-template-columns: minmax(0, 1fr);
  }
  :root.ew-lt-1300 .bc {
    grid-column: auto;
  }
  .stats .seg {
    width: 100% !important;
    max-width: 320px;
  }
  .pie > .row {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
