<script setup>
// Health page: MCU and CAN connection errors, TMC driver flags, host throttling and power, heater
// behaviour, maintenance reminders based on print hours. The checks themselves are in features.js.
import { ref, computed, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import { state, S, prettyName, gcode, toast, THROTTLE } from '../store';
import { api } from '../api/moonraker';
import { t } from '../i18n';
import {
  counterGrowth,
  health,
  mcuHist,
  heaterLive,
  healthIssues,
  printStats,
  loadPrintStats,
  maintUsed,
  maintDueDays,
  MAINT_DEFAULTS,
} from '../features';

onMounted(loadPrintStats);

// ---------- host ----------
const host = ref(null);
async function loadHost() {
  try {
    host.value = await api.call('machine.proc_stats');
  } catch {}
}
onMounted(loadHost);
// Moonraker's flags: the first four are happening now, 'Previously …' ones happened at some point since boot
// Read from the bits, not the flag names: bits 0-3 are happening now, 16-19 happened at some point since boot.
// Moonraker sends flags ['?'] with bits 0 when it cannot read the state (no vcgencmd, not a Raspberry Pi).
const thr = computed(() => host.value?.throttled_state || null);
const thrUnknown = computed(() => !thr.value || (!thr.value.bits && (thr.value.flags || []).includes('?')));
const thrNames = (lo, hi) =>
  Object.entries(THROTTLE)
    .filter(([b]) => +b >= lo && +b <= hi && (thr.value?.bits || 0) & (1 << b))
    .map(([, txt]) => t(txt));
const throttled = computed(() => thrNames(0, 3));
const thrPast = computed(() => thrNames(16, 19));

// ---------- MCUs / CAN ----------
const mcus = computed(() => {
  health.tick;
  return state.objects
    .filter((o) => o === 'mcu' || o.startsWith('mcu '))
    .map((o) => {
      const s = S(o),
        st = s.last_stats || {};
      const h = mcuHist[o] || [];
      const d = counterGrowth(h, 're'),
        di = counterGrowth(h, 'inv'); // restarts reset the counters
      const load = (st.mcu_task_avg + 3 * st.mcu_task_stddev) / 0.0025;
      const bus = S('canbus_stats ' + (o === 'mcu' ? 'mcu' : o.slice(4)));
      // per-sample retransmit increments for the sparkline
      const inc = h.slice(1).map((x, i) => Math.max(0, x.re - h[i].re));
      return {
        id: o,
        name: o === 'mcu' ? t('Main MCU') : o.slice(4),
        chip: s.mcu_constants?.MCU || '',
        ver: s.mcu_version || '',
        load: isFinite(load) ? load : null,
        srtt: st.srtt,
        re: st.bytes_retransmit ?? 0,
        inv: st.bytes_invalid ?? 0,
        dRe: d,
        dInv: di,
        mins: h.length > 1 ? Math.max(1, Math.round((h[h.length - 1].t - h[0].t) / 60)) : 0,
        inc,
        bus,
        level: healthIssues.value.some((i) => i.key === o && i.level === 'error')
          ? 'error'
          : healthIssues.value.some((i) => i.key === o)
            ? 'warn'
            : 'ok',
      };
    });
});
function spark(arr) {
  if (!arr.length) return '';
  const n = arr.length,
    max = Math.max(1, ...arr);
  return arr.map((v, i) => `${(i / Math.max(1, n - 1)) * 100},${28 - (v / max) * 26}`).join(' ');
}

// ---------- heaters ----------
const heaters = computed(() => {
  health.tick;
  return (S('heaters').available_heaters || []).map((n) => {
    const s = S(n),
      l = heaterLive[n] || {};
    let level = 'ok',
      note = '';
    if (!s.target) {
      level = 'idle';
      note = t('Off');
    } else if (!l.holding) {
      note = t('Heating or settling…');
    } else {
      note = t('Holding {target}° with {p}% power, swing ±{s}°', {
        target: l.target,
        p: Math.round(l.power * 100),
        s: l.std.toFixed(2),
      });
    }
    return { n, name: prettyName(n), temp: s.temperature, target: s.target, power: s.power, l, level, note };
  });
});
const pidFor = ref(null);
function runPid() {
  const h = pidFor.value;
  pidFor.value = null;
  gcode(`PID_CALIBRATE HEATER=${h.n.split(' ').pop()} TARGET=${h.target}`).catch(() => {});
  toast(t('PID calibration started, run SAVE_CONFIG when it finishes'));
}

// ---------- drivers ----------
const FLAG_TXT = {
  ot: 'overtemperature',
  otpw: 'overtemp warning',
  s2ga: 'short to GND A',
  s2gb: 'short to GND B',
  s2vsa: 'short to supply A',
  s2vsb: 'short to supply B',
  ola: 'open load A',
  olb: 'open load B',
  uv_cp: 'charge pump undervoltage',
};
const drivers = computed(() =>
  state.objects
    .filter((o) => o.startsWith('tmc'))
    .map((o) => {
      const s = S(o),
        ds = s.drv_status || {};
      // open load (ola/olb) and undervoltage flags show up on healthy drivers at standstill or power up, so they are not listed
      const flags = ['ot', 's2ga', 's2gb', 's2vsa', 's2vsb', 'otpw'].filter((k) => ds[k] && FLAG_TXT[k]);
      return {
        id: o,
        model: o.split(' ')[0].toUpperCase(),
        stepper: o.split(' ').slice(1).join(' '),
        cur: s.run_current,
        temp: s.temperature,
        flags,
        level: flags.some((f) => f !== 'otpw') ? 'error' : 'ok',
      };
    }),
);

// ---------- maintenance ----------
const tasks = computed(() => state.settings.maintenance || []);
const editT = ref(null);
function done(tk) {
  tk.doneAt = printStats.totalHours;
  tk.doneDate = Date.now();
  toast(t('“{name}” marked done, counter reset', { name: t(tk.name) }));
}
function addTask() {
  editT.value = { id: 'm' + Date.now(), name: '', hours: 100, isNew: true };
}
function saveTask() {
  const t = editT.value;
  editT.value = null;
  if (!t.name) return;
  if (t.isNew) {
    delete t.isNew;
    state.settings.maintenance = [...tasks.value, { ...t, doneAt: printStats.totalHours ?? 0, doneDate: Date.now() }];
  } else
    Object.assign(
      tasks.value.find((x) => x.id === t.id),
      { name: t.name, hours: t.hours },
    );
}
function delTask(t) {
  state.settings.maintenance = tasks.value.filter((x) => x.id !== t.id);
  editT.value = null;
}
function resetDefaults() {
  state.settings.maintenance = MAINT_DEFAULTS().map((t) => ({
    ...t,
    doneAt: printStats.totalHours ?? 0,
    doneDate: Date.now(),
  }));
}
const dueTxt = (tk) => {
  const d = maintDueDays(tk);
  if (d === 0) return t('Due now');
  if (d == null) return t('no recent prints to estimate');
  if (d < 1.5) return t('due in about a day');
  if (d < 60) return t('due in ~{n} days', { n: Math.round(d) });
  return t('due in ~{n} months', { n: Math.round(d / 30) });
};
const ago = (ts) => {
  const d = (Date.now() - ts) / 86400000;
  return d < 1 ? t('today') : d < 2 ? t('yesterday') : t('{n} days ago', { n: Math.round(d) });
};
// maintenance ring
const RING = 2 * Math.PI * 22;
const ringOff = (tk) => RING * (1 - Math.min(1, maintUsed(tk) / tk.hours));
const LV = { ok: 'var(--ok)', warn: 'var(--wn)', error: 'var(--dg)', idle: 'var(--mu2)', info: 'var(--bl)' };
</script>

<template>
  <div class="page">
    <!-- open issues only; the page itself shows the live data below -->
    <section v-if="healthIssues.length" class="sum">
      <div v-if="healthIssues.length" class="iss">
        <div v-for="i in healthIssues" :key="i.area + i.key + i.msg" class="is">
          <span class="d" :style="{ background: LV[i.level] }"></span>{{ i.msg }}
        </div>
      </div>
    </section>

    <div class="hg">
      <!-- MCU / CAN -->
      <section id="h-mcu" class="card">
        <div class="card-h">
          <h2>{{ t('MCU & CAN links') }}</h2>
          <Icon name="link" :size="18" style="color: var(--mu)" />
        </div>
        <div v-for="m in mcus" :key="m.id" class="mc">
          <div class="row">
            <span class="d" :style="{ background: LV[m.level] }"></span><b class="grow">{{ m.name }}</b
            ><span class="mono mu sm">{{ m.chip }}</span>
          </div>
          <div class="kv">
            <div>
              <span class="lbl">{{ t('MCU load') }}</span
              ><b class="mono">{{ m.load != null ? m.load.toFixed(1) + '%' : '--' }}</b>
            </div>
            <div>
              <span class="lbl">{{ t('Round trip') }}</span
              ><b class="mono">{{ m.srtt != null ? (m.srtt * 1000).toFixed(1) + ' ms' : '--' }}</b>
            </div>
            <div>
              <span class="lbl">{{ t('Retransmit') }}</span
              ><b class="mono" :style="{ color: m.dRe ? 'var(--wn)' : '' }"
                >{{ m.dRe }} <small class="mu">/ {{ m.mins || '–' }} min</small></b
              >
            </div>
            <div>
              <span class="lbl">{{ t('Invalid') }}</span
              ><b class="mono" :style="{ color: m.dInv ? 'var(--dg)' : '' }">{{ m.dInv }}</b>
            </div>
          </div>
          <svg class="sp" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
            <polyline
              :points="spark(m.inc)"
              fill="none"
              :stroke="m.dRe ? 'var(--wn)' : 'var(--sense)'"
              stroke-width="1.6"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div v-if="m.bus.bus_state" class="row mono mu sm" style="gap: 14px">
            <span>CAN {{ m.bus.bus_state }}</span
            ><span>{{ t('rx err {n}', { n: m.bus.rx_error }) }}</span
            ><span>{{ t('tx err {n}', { n: m.bus.tx_error }) }}</span
            ><span>{{ t('retries {n}', { n: m.bus.tx_retries }) }}</span>
          </div>
          <span class="mono mu sm">{{ m.ver }} · {{ t('total retransmit {n} bytes', { n: m.re }) }}</span>
        </div>
        <p class="mu sm" style="margin: 0">
          {{
            t(
              'Retransmits that keep growing usually mean a loose cable, missing CAN termination or electrical noise. A few after a restart are normal.',
            )
          }}
        </p>
      </section>

      <!-- heaters -->
      <section id="h-heat" class="card tint" style="--tint: var(--tn-heat)">
        <div class="card-h">
          <h2>{{ t('Heaters') }}</h2>
          <Icon name="flame" :size="18" style="color: var(--mu)" />
        </div>
        <div v-for="h in heaters" :key="h.n" class="hr">
          <span class="d" :style="{ background: LV[h.level] }"></span>
          <div class="col grow" style="gap: 1px; min-width: 0">
            <div class="row">
              <b>{{ h.name }}</b
              ><span class="mono mu sm">{{ h.temp?.toFixed(1) }}° / {{ h.target || 0 }}°</span>
            </div>
            <div v-if="h.target" class="hb">
              <div :style="{ width: Math.min(100, ((h.temp || 0) / h.target) * 100) + '%' }"></div>
            </div>
            <span class="mu sm">{{ h.note }}</span>
          </div>
          <button v-if="h.target && h.l.holding" class="btn sm2" @click="pidFor = h">{{ t('PID tune') }}</button>
        </div>
        <p class="mu sm" style="margin: 0">
          {{
            t(
              'Shown for information only. How much power a heater needs depends on fans, enclosure and room temperature, so it is not judged here.',
            )
          }}
        </p>
      </section>

      <!-- drivers -->
      <section id="h-tmc" class="card tint" style="--tint: var(--tn-slate)">
        <div class="card-h">
          <h2>{{ t('Stepper drivers') }}</h2>
          <Icon name="motor" :size="18" style="color: var(--mu)" />
        </div>
        <div v-if="!drivers.length" class="empty">{{ t('No TMC drivers in the config.') }}</div>
        <div v-else style="overflow: auto">
          <table class="tbl">
            <thead>
              <tr>
                <th></th>
                <th>{{ t('Stepper') }}</th>
                <th>{{ t('Driver') }}</th>
                <th>{{ t('Current') }}</th>
                <th>{{ t('Status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in drivers" :key="d.id">
                <td style="width: 14px"><span class="d" :style="{ background: LV[d.level] }"></span></td>
                <td>
                  <b>{{ d.stepper }}</b>
                </td>
                <td class="mono mu sm">{{ d.model }}</td>
                <td class="mono sm">
                  {{ d.cur != null ? d.cur.toFixed(2) + ' A' : '--'
                  }}<span v-if="d.temp != null" class="mu"> · {{ d.temp.toFixed(0) }}°</span>
                </td>
                <td class="sm">
                  <span v-if="!d.flags.length" class="mu">{{ t('OK') }}</span
                  ><span
                    v-for="f in d.flags"
                    :key="f"
                    class="chip"
                    :style="{ marginRight: '4px', color: f === 'otpw' ? 'var(--mu)' : 'var(--dg)' }"
                    >{{ t(FLAG_TXT[f]) }}</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- host -->
      <section id="h-host" class="card">
        <div class="card-h">
          <h2>{{ t('Host') }}</h2>
          <button class="btn clear ibtn sm" :aria-label="t('Refresh')" @click="loadHost">
            <Icon name="refresh" :size="16" />
          </button>
        </div>
        <div class="kv">
          <div>
            <span class="lbl">{{ t('CPU temp') }}</span
            ><b class="mono">{{ host?.cpu_temp != null ? host.cpu_temp.toFixed(1) + '°' : '--' }}</b>
          </div>
          <div>
            <span class="lbl">CPU</span
            ><b class="mono">{{
              host?.system_cpu_usage?.cpu != null ? host.system_cpu_usage.cpu.toFixed(0) + '%' : '--'
            }}</b>
          </div>
          <div>
            <span class="lbl">{{ t('Memory') }}</span
            ><b class="mono">{{
              host?.system_memory ? Math.round((host.system_memory.used / host.system_memory.total) * 100) + '%' : '--'
            }}</b>
          </div>
          <div>
            <span class="lbl">{{ t('Power') }}</span
            ><b
              :style="{ color: thrUnknown ? 'var(--mu)' : throttled.length ? 'var(--wn)' : 'var(--ok)' }"
              :data-tip="thrUnknown ? t('Moonraker cannot read the power state on this host') : ''"
              >{{ thrUnknown ? '--' : throttled.length ? t('throttled') : t('OK') }}</b
            >
          </div>
        </div>
        <span v-for="f in throttled" :key="f" class="mu sm">{{ f }}</span>
        <span v-if="thrPast.length" class="mu sm">{{ t('Since boot: {list}', { list: thrPast.join(', ') }) }}</span>
      </section>
    </div>

    <!-- maintenance -->
    <section id="h-maint" class="card">
      <div class="card-h">
        <h2>{{ t('Maintenance') }}</h2>
        <div class="acts">
          <span class="mono mu sm"
            >{{ printStats.totalHours != null ? t('{n} h printed', { n: printStats.totalHours.toFixed(0) }) : ''
            }}<template v-if="printStats.hoursPerDay">
              · {{ t('~{n} h/day lately', { n: printStats.hoursPerDay.toFixed(1) }) }}</template
            ></span
          >
          <button class="btn" @click="addTask"><Icon name="plus" :size="16" />{{ t('Add task') }}</button>
        </div>
      </div>
      <div class="mt">
        <div v-for="tk in tasks" :key="tk.id" class="tk" :class="{ due: maintUsed(tk) >= tk.hours }">
          <div class="row">
            <Icon
              name="wrench"
              :size="18"
              :style="{ color: maintUsed(tk) >= tk.hours ? 'var(--heat)' : 'var(--mu)' }"
            /><b class="grow">{{ t(tk.name) }}</b
            ><button
              class="btn clear ibtn sm"
              :aria-label="t('Edit {name}', { name: t(tk.name) })"
              @click="editT = { ...tk }"
            >
              <Icon name="pencil" :size="14" />
            </button>
          </div>
          <div class="row" style="gap: 14px">
            <svg class="ring" viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="22" class="rt" />
              <circle
                cx="26"
                cy="26"
                r="22"
                class="rv"
                :stroke="
                  maintUsed(tk) >= tk.hours ? 'var(--heat)' : maintUsed(tk) / tk.hours > 0.8 ? 'var(--wn)' : 'var(--k)'
                "
                :stroke-dasharray="RING"
                :stroke-dashoffset="ringOff(tk)"
              />
            </svg>
            <div class="col" style="gap: 2px">
              <b class="mono" style="font-size: 17px"
                >{{ maintUsed(tk).toFixed(0)
                }}<span class="mu" style="font-size: 12px; font-weight: 500"> / {{ tk.hours }} h</span></b
              ><span class="sm" :style="{ color: maintUsed(tk) >= tk.hours ? 'var(--heat)' : 'var(--mu)' }">{{
                dueTxt(tk)
              }}</span>
            </div>
          </div>
          <div class="row">
            <span class="mu sm grow">{{ t('Last done {when}', { when: ago(tk.doneDate) }) }}</span
            ><button class="btn" :class="{ acc: maintUsed(tk) >= tk.hours }" @click="done(tk)">
              <Icon name="check" :size="16" :stroke="2.6" />{{ t('Done') }}
            </button>
          </div>
        </div>
      </div>
      <p class="mu sm" style="margin: 0">
        {{
          t(
            "Counters use print time from Moonraker's history. The due date is estimated from how much you printed in the last 30 days.",
          )
        }}
      </p>
    </section>
  </div>

  <Modal v-if="editT" :title="editT.isNew ? t('New maintenance task') : t('Edit task')" @close="editT = null">
    <label class="col" style="gap: 4px"
      ><span class="lbl">{{ t('Task') }}</span
      ><input v-model="editT.name" class="input" :placeholder="t('e.g. Check belt tension')"
    /></label>
    <label class="col" style="gap: 4px"
      ><span class="lbl">{{ t('Every (print hours)') }}</span
      ><input v-model.number="editT.hours" type="number" min="1" class="input mono" style="width: 140px"
    /></label>
    <template #foot>
      <button v-if="!editT.isNew" class="btn lg dg" style="margin-right: auto" @click="delTask(editT)">
        {{ t('Delete') }}
      </button>
      <button
        v-if="editT.isNew"
        class="btn lg clear"
        style="margin-right: auto"
        @click="
          resetDefaults();
          editT = null;
        "
      >
        {{ t('Reset to default list') }}
      </button>
      <button class="btn lg" @click="editT = null">{{ t('Cancel') }}</button
      ><button class="btn lg acc" @click="saveTask">{{ t('Save') }}</button>
    </template>
  </Modal>
  <Modal v-if="pidFor" :title="t('PID tune {name}?', { name: pidFor.name })" @close="pidFor = null">
    <p style="margin: 0">
      {{ t('Runs') }}
      <span class="code">PID_CALIBRATE HEATER={{ pidFor.n.split(' ').pop() }} TARGET={{ pidFor.target }}</span
      >. {{ t('It takes a few minutes, then save with SAVE_CONFIG.') }}
    </p>
    <template #foot
      ><button class="btn lg" @click="pidFor = null">{{ t('Cancel') }}</button
      ><button class="btn lg acc" @click="runPid">{{ t('Start') }}</button></template
    >
  </Modal>
</template>

<style scoped>
.sum {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--r);
  background: var(--s1);
  border: 1px solid var(--bd);
}
.hb {
  height: 4px;
  border-radius: 2px;
  background: var(--s3);
  overflow: hidden;
  margin: 4px 0 2px;
  max-width: 220px;
}
.hb > div {
  height: 100%;
  background: var(--k);
}
.ring {
  width: 52px;
  height: 52px;
  transform: rotate(-90deg);
  flex-shrink: 0;
}
.ring circle {
  fill: none;
  stroke-width: 5;
}
.ring .rt {
  stroke: var(--s3);
}
.ring .rv {
  stroke-linecap: round;
  transition: stroke-dashoffset 0.4s;
}
.iss {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.is {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
}
.d {
  width: 8px;
  height: 8px;
  border-radius: 4px;
  flex-shrink: 0;
  display: inline-block;
}
.hg {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12px;
}
.mc {
  background: var(--s2);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.kv {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.kv > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.kv b {
  font-size: 15px;
}
.sp {
  width: 100%;
  height: 30px;
}
.hr {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  background: var(--s2);
  border-radius: 12px;
}
.sm2 {
  height: 30px;
  font-size: 12px;
}
.bl summary {
  cursor: pointer;
}
.bl > div {
  padding: 2px 0;
}
.mt {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 14px;
}
.tk {
  background: var(--s2);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tk.due {
  background: var(--heat-bg);
}
@media (max-width: 1100px) {
  .hg {
    grid-template-columns: 1fr;
  }
  .kv {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
