<script setup>
import { ref, computed, onMounted } from 'vue'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import { state, S, prettyName, gcode, toast } from '../store'
import { api } from '../api/moonraker'
import { t, tn } from '../i18n'
import { health, mcuHist, heaterLive, healthIssues, printStats, loadPrintStats, maintUsed, maintDueDays, MAINT_DEFAULTS } from '../features'

onMounted(loadPrintStats)

// ---------- host ----------
const host = ref(null)
async function loadHost() { try { host.value = await api.call('machine.proc_stats') } catch {} }
onMounted(loadHost)
const throttled = computed(() => host.value?.throttled_state?.flags || [])

// ---------- MCUs / CAN ----------
const mcus = computed(() => {
  health.tick
  return state.objects.filter((o) => o === 'mcu' || o.startsWith('mcu ')).map((o) => {
    const s = S(o), st = s.last_stats || {}
    const h = mcuHist[o] || []
    const d = h.length > 1 ? h[h.length - 1].re - h[0].re : 0
    const di = h.length > 1 ? h[h.length - 1].inv - h[0].inv : 0
    const load = (st.mcu_task_avg + 3 * st.mcu_task_stddev) / 0.0025
    const bus = S('canbus_stats ' + (o === 'mcu' ? 'mcu' : o.slice(4)))
    // per-sample retransmit increments for the sparkline
    const inc = h.slice(1).map((x, i) => Math.max(0, x.re - h[i].re))
    return {
      id: o, name: o === 'mcu' ? t('Main MCU') : o.slice(4), chip: s.mcu_constants?.MCU || '', ver: s.mcu_version || '',
      load: isFinite(load) ? load : null, srtt: st.srtt, re: st.bytes_retransmit ?? 0, inv: st.bytes_invalid ?? 0, dRe: d, dInv: di,
      mins: h.length > 1 ? Math.max(1, Math.round((h[h.length - 1].t - h[0].t) / 60)) : 0, inc, bus,
      level: d > 500 || di > 0 ? 'error' : d > 0 || load > 80 ? 'warn' : 'ok',
    }
  })
})
function spark(arr) {
  if (!arr.length) return ''
  const n = arr.length, max = Math.max(1, ...arr)
  return arr.map((v, i) => `${(i / Math.max(1, n - 1)) * 100},${28 - (v / max) * 26}`).join(' ')
}

// ---------- heaters ----------
const heaters = computed(() => {
  health.tick
  return (S('heaters').available_heaters || []).map((n) => {
    const s = S(n), l = heaterLive[n] || {}
    const base = l.target ? state.settings.heaterBase?.[n + '@' + Math.round(l.target / 5) * 5] : null
    let level = 'ok', note = ''
    if (!s.target) { level = 'idle'; note = t('Off') }
    else if (!l.holding) { note = t('Heating or settling…') }
    else {
      note = t('Holding {target}° with {p}% power, swing ±{s}°', { target: l.target, p: Math.round(l.power * 100), s: l.std.toFixed(2) })
      if (l.std > 0.6) level = 'warn'
      if (base && l.power - base.power > 0.12 && l.power / base.power > 1.3) level = 'warn'
    }
    return { n, name: prettyName(n), temp: s.temperature, target: s.target, power: s.power, l, base, level, note }
  })
})
const baseList = computed(() => Object.entries(state.settings.heaterBase || {}).map(([k, v]) => ({ k, heater: k.split('@')[0], target: +k.split('@')[1], ...v })))
function forgetBase(k) { const b = { ...state.settings.heaterBase }; delete b[k]; state.settings.heaterBase = b }
const pidFor = ref(null)
function runPid() {
  const h = pidFor.value; pidFor.value = null
  gcode(`PID_CALIBRATE HEATER=${h.n.split(' ').pop()} TARGET=${h.target}`).catch(() => {})
  toast(t('PID calibration started, run SAVE_CONFIG when it finishes'))
}

// ---------- drivers ----------
const FLAG_TXT = { ot: 'overtemperature', otpw: 'overtemp warning', s2ga: 'short to GND A', s2gb: 'short to GND B', s2vsa: 'short to supply A', s2vsb: 'short to supply B', ola: 'open load A', olb: 'open load B', uv_cp: 'charge pump undervoltage' }
const drivers = computed(() => state.objects.filter((o) => o.startsWith('tmc')).map((o) => {
  const s = S(o), ds = s.drv_status || {}
  const flags = Object.keys(FLAG_TXT).filter((k) => ds[k])
  return { id: o, model: o.split(' ')[0].toUpperCase(), stepper: o.split(' ').slice(1).join(' '), cur: s.run_current, temp: s.temperature, flags, level: flags.some((f) => !['otpw', 'ola', 'olb'].includes(f)) ? 'error' : flags.length ? 'warn' : 'ok' }
}))

// ---------- maintenance ----------
const tasks = computed(() => state.settings.maintenance || [])
const editT = ref(null)
function done(tk) { tk.doneAt = printStats.totalHours; tk.doneDate = Date.now(); toast(t('“{name}” marked done, counter reset', { name: t(tk.name) })) }
function addTask() { editT.value = { id: 'm' + Date.now(), name: '', hours: 100, isNew: true } }
function saveTask() {
  const t = editT.value; editT.value = null
  if (!t.name) return
  if (t.isNew) { delete t.isNew; state.settings.maintenance = [...tasks.value, { ...t, doneAt: printStats.totalHours ?? 0, doneDate: Date.now() }] }
  else Object.assign(tasks.value.find((x) => x.id === t.id), { name: t.name, hours: t.hours })
}
function delTask(t) { state.settings.maintenance = tasks.value.filter((x) => x.id !== t.id); editT.value = null }
function resetDefaults() { state.settings.maintenance = MAINT_DEFAULTS().map((t) => ({ ...t, doneAt: printStats.totalHours ?? 0, doneDate: Date.now() })) }
const dueTxt = (tk) => {
  const d = maintDueDays(tk)
  if (d === 0) return t('Due now')
  if (d == null) return t('no recent prints to estimate')
  if (d < 1.5) return t('due in about a day')
  if (d < 60) return t('due in ~{n} days', { n: Math.round(d) })
  return t('due in ~{n} months', { n: Math.round(d / 30) })
}
const ago = (ts) => { const d = (Date.now() - ts) / 86400000; return d < 1 ? t('today') : d < 2 ? t('yesterday') : t('{n} days ago', { n: Math.round(d) }) }
const LV = { ok: 'var(--ok)', warn: 'var(--wn)', error: 'var(--dg)', idle: 'var(--mu2)', info: 'var(--bl)' }
</script>

<template>
  <div class="page">
    <!-- summary -->
    <section class="card sum" :class="healthIssues.some((i) => i.level !== 'info') ? 't-heat' : 't-sense'">
      <div class="row" style="gap:14px">
        <div class="big" :style="{ color: healthIssues.some((i) => i.level === 'error') ? 'var(--dg)' : healthIssues.some((i) => i.level === 'warn') ? 'var(--wn)' : 'var(--ok)' }"><Icon name="heart" :size="28" :stroke="2.4" /></div>
        <div class="col" style="gap:2px">
          <h2 style="margin:0;font-size:20px">{{ healthIssues.length ? tn(healthIssues.length, '{n} thing to look at', '{n} things to look at') : t('Everything looks healthy') }}</h2>
          <span class="mu">{{ t('Live data from Klipper, sampled every 2 s while this UI is open.') }}</span>
        </div>
      </div>
      <div v-if="healthIssues.length" class="iss">
        <div v-for="i in healthIssues" :key="i.area + i.key + i.msg" class="is"><span class="d" :style="{ background: LV[i.level] }"></span>{{ i.msg }}</div>
      </div>
    </section>

    <div class="hg">
      <!-- MCU / CAN -->
      <section class="card">
        <div class="card-h"><h2>{{ t('MCU & CAN links') }}</h2><Icon name="link" :size="18" style="color:var(--mu)" /></div>
        <div v-for="m in mcus" :key="m.id" class="mc">
          <div class="row"><span class="d" :style="{ background: LV[m.level] }"></span><b class="grow">{{ m.name }}</b><span class="mono mu sm">{{ m.chip }}</span></div>
          <div class="kv">
            <div><span class="lbl">{{ t('MCU load') }}</span><b class="mono">{{ m.load != null ? m.load.toFixed(1) + '%' : '--' }}</b></div>
            <div><span class="lbl">{{ t('Round trip') }}</span><b class="mono">{{ m.srtt != null ? (m.srtt * 1000).toFixed(1) + ' ms' : '--' }}</b></div>
            <div><span class="lbl">{{ t('Retransmit') }}</span><b class="mono" :style="{ color: m.dRe ? 'var(--wn)' : '' }">{{ m.dRe }} <small class="mu">/ {{ m.mins || '–' }} min</small></b></div>
            <div><span class="lbl">{{ t('Invalid') }}</span><b class="mono" :style="{ color: m.dInv ? 'var(--dg)' : '' }">{{ m.dInv }}</b></div>
          </div>
          <svg class="sp" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline :points="spark(m.inc)" fill="none" :stroke="m.dRe ? 'var(--wn)' : 'var(--sense)'" stroke-width="1.6" vector-effect="non-scaling-stroke" /></svg>
          <div v-if="m.bus.bus_state" class="row mono mu sm" style="gap:14px"><span>CAN {{ m.bus.bus_state }}</span><span>{{ t('rx err {n}', { n: m.bus.rx_error }) }}</span><span>{{ t('tx err {n}', { n: m.bus.tx_error }) }}</span><span>{{ t('retries {n}', { n: m.bus.tx_retries }) }}</span></div>
          <span class="mono mu sm">{{ m.ver }} · {{ t('total retransmit {n} bytes', { n: m.re }) }}</span>
        </div>
        <p class="mu sm" style="margin:0">{{ t('Retransmits that keep growing usually mean a loose cable, missing CAN termination or electrical noise. A few after a restart are normal.') }}</p>
      </section>

      <!-- heaters -->
      <section class="card">
        <div class="card-h"><h2>{{ t('Heaters') }}</h2><Icon name="flame" :size="18" style="color:var(--mu)" /></div>
        <div v-for="h in heaters" :key="h.n" class="hr">
          <span class="d" :style="{ background: LV[h.level] }"></span>
          <div class="col grow" style="gap:1px;min-width:0">
            <div class="row"><b>{{ h.name }}</b><span class="mono mu sm">{{ h.temp?.toFixed(1) }}° / {{ h.target || 0 }}°</span></div>
            <span class="mu sm">{{ h.note }}</span>
            <span v-if="h.base && h.l.holding" class="mu sm">{{ t('First time at {target}° it needed {p}%', { target: h.l.target, p: Math.round(h.base.power * 100) }) }}</span>
          </div>
          <button v-if="h.target && h.l.holding && h.l.std > 0.6" class="btn sm2" @click="pidFor = h">{{ t('PID tune') }}</button>
        </div>
        <details v-if="baseList.length" class="bl">
          <summary class="mu sm">{{ t('Learned power baselines ({n})', { n: baseList.length }) }}</summary>
          <div v-for="b in baseList" :key="b.k" class="row mono sm" style="justify-content:space-between"><span>{{ prettyName(b.heater) }} @ {{ b.target }}°</span><span>{{ Math.round(b.power * 100) }}%</span><button class="btn clear ibtn sm" :aria-label="t('Forget {name}', { name: b.k })" @click="forgetBase(b.k)"><Icon name="x" :size="13" /></button></div>
        </details>
        <p class="mu sm" style="margin:0">{{ t('The first time a heater holds a temperature, the power it needs is remembered. Needing a lot more later can point to a torn silicone sock, a failing heater or a fan blowing on the block.') }}</p>
      </section>

      <!-- drivers -->
      <section class="card">
        <div class="card-h"><h2>{{ t('Stepper drivers') }}</h2><Icon name="motor" :size="18" style="color:var(--mu)" /></div>
        <div v-if="!drivers.length" class="empty">{{ t('No TMC drivers in the config.') }}</div>
        <table v-else class="tbl">
          <thead><tr><th></th><th>{{ t('Stepper') }}</th><th>{{ t('Driver') }}</th><th>{{ t('Current') }}</th><th>{{ t('Status') }}</th></tr></thead>
          <tbody><tr v-for="d in drivers" :key="d.id">
            <td style="width:14px"><span class="d" :style="{ background: LV[d.level] }"></span></td>
            <td><b>{{ d.stepper }}</b></td>
            <td class="mono mu sm">{{ d.model }}</td>
            <td class="mono sm">{{ d.cur != null ? d.cur.toFixed(2) + ' A' : '--' }}<span v-if="d.temp != null" class="mu"> · {{ d.temp.toFixed(0) }}°</span></td>
            <td class="sm"><span v-if="!d.flags.length" class="mu">{{ t('OK') }}</span><span v-for="f in d.flags" :key="f" class="chip" style="margin-right:4px;color:var(--wn)">{{ t(FLAG_TXT[f]) }}</span></td>
          </tr></tbody>
        </table>
      </section>

      <!-- host -->
      <section class="card">
        <div class="card-h"><h2>{{ t('Host') }}</h2><button class="btn clear ibtn sm" :aria-label="t('Refresh')" @click="loadHost"><Icon name="refresh" :size="16" /></button></div>
        <div class="kv">
          <div><span class="lbl">{{ t('CPU temp') }}</span><b class="mono">{{ host?.cpu_temp != null ? host.cpu_temp.toFixed(1) + '°' : '--' }}</b></div>
          <div><span class="lbl">CPU</span><b class="mono">{{ host?.system_cpu_usage?.cpu != null ? host.system_cpu_usage.cpu.toFixed(0) + '%' : '--' }}</b></div>
          <div><span class="lbl">{{ t('Memory') }}</span><b class="mono">{{ host?.system_memory ? Math.round(host.system_memory.used / host.system_memory.total * 100) + '%' : '--' }}</b></div>
          <div><span class="lbl">{{ t('Power') }}</span><b :style="{ color: throttled.length ? 'var(--wn)' : 'var(--ok)' }">{{ throttled.length ? t('throttled') : t('OK') }}</b></div>
        </div>
        <span v-for="f in throttled" :key="f" class="mu sm">{{ f }}</span>
      </section>
    </div>

    <!-- maintenance -->
    <section class="card">
      <div class="card-h">
        <h2>{{ t('Maintenance') }}</h2>
        <div class="acts">
          <span class="mono mu sm">{{ printStats.totalHours != null ? t('{n} h printed', { n: printStats.totalHours.toFixed(0) }) : '' }}<template v-if="printStats.hoursPerDay"> · {{ t('~{n} h/day lately', { n: printStats.hoursPerDay.toFixed(1) }) }}</template></span>
          <button class="btn" @click="addTask"><Icon name="plus" :size="16" />{{ t('Add task') }}</button>
        </div>
      </div>
      <div class="mt">
        <div v-for="tk in tasks" :key="tk.id" class="tk" :class="{ due: maintUsed(tk) >= tk.hours }">
          <div class="row"><Icon name="wrench" :size="18" :style="{ color: maintUsed(tk) >= tk.hours ? 'var(--heat)' : 'var(--mu)' }" /><b class="grow">{{ t(tk.name) }}</b><button class="btn clear ibtn sm" :aria-label="t('Edit {name}', { name: t(tk.name) })" @click="editT = { ...tk }"><Icon name="pencil" :size="14" /></button></div>
          <div class="bar"><div :style="{ width: Math.min(100, maintUsed(tk) / tk.hours * 100) + '%', background: maintUsed(tk) >= tk.hours ? 'var(--heat)' : maintUsed(tk) / tk.hours > .8 ? 'var(--wn)' : 'var(--sense)' }"></div></div>
          <div class="row mono sm" style="justify-content:space-between"><span>{{ maintUsed(tk).toFixed(0) }} / {{ tk.hours }} h</span><span :style="{ color: maintUsed(tk) >= tk.hours ? 'var(--heat)' : 'var(--mu)' }">{{ dueTxt(tk) }}</span></div>
          <div class="row"><span class="mu sm grow">{{ t('Last done {when}', { when: ago(tk.doneDate) }) }}</span><button class="btn" :class="{ acc: maintUsed(tk) >= tk.hours }" @click="done(tk)"><Icon name="check" :size="16" :stroke="2.6" />{{ t('Done') }}</button></div>
        </div>
      </div>
      <p class="mu sm" style="margin:0">{{ t("Counters use print time from Moonraker's history. The due date is estimated from how much you printed in the last 30 days.") }}</p>
    </section>
  </div>

  <Modal v-if="editT" :title="editT.isNew ? t('New maintenance task') : t('Edit task')" @close="editT = null">
    <label class="col" style="gap:4px"><span class="lbl">{{ t('Task') }}</span><input v-model="editT.name" class="input" :placeholder="t('e.g. Check belt tension')" /></label>
    <label class="col" style="gap:4px"><span class="lbl">{{ t('Every (print hours)') }}</span><input v-model.number="editT.hours" type="number" min="1" class="input mono" style="width:140px" /></label>
    <template #foot>
      <button v-if="!editT.isNew" class="btn lg dg" style="margin-right:auto" @click="delTask(editT)">{{ t('Delete') }}</button>
      <button v-if="editT.isNew" class="btn lg clear" style="margin-right:auto" @click="resetDefaults(); editT = null">{{ t('Reset to default list') }}</button>
      <button class="btn lg" @click="editT = null">{{ t('Cancel') }}</button><button class="btn lg acc" @click="saveTask">{{ t('Save') }}</button>
    </template>
  </Modal>
  <Modal v-if="pidFor" :title="t('PID tune {name}?', { name: pidFor.name })" @close="pidFor = null">
    <p style="margin:0">{{ t('Runs') }} <span class="code">PID_CALIBRATE HEATER={{ pidFor.n.split(' ').pop() }} TARGET={{ pidFor.target }}</span>. {{ t('It takes a few minutes, then save with SAVE_CONFIG.') }}</p>
    <template #foot><button class="btn lg" @click="pidFor = null">{{ t('Cancel') }}</button><button class="btn lg acc" @click="runPid">{{ t('Start') }}</button></template>
  </Modal>
</template>

<style scoped>
.sum { gap: 14px; }
.big { width: 52px; height: 52px; border-radius: 14px; background: rgba(0,0,0,.18); display: flex; align-items: center; justify-content: center; }
.iss { display: flex; flex-direction: column; gap: 6px; }
.is { display: flex; align-items: center; gap: 10px; font-size: 13.5px; }
.d { width: 8px; height: 8px; border-radius: 4px; flex-shrink: 0; display: inline-block; }
.hg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.mu { color: var(--mu); }
.sm { font-size: 12px; }
.mc { background: var(--s2); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.kv { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.kv > div { display: flex; flex-direction: column; gap: 2px; }
.kv b { font-size: 15px; }
.sp { width: 100%; height: 30px; }
.hr { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--s2); border-radius: 12px; }
.sm2 { height: 30px; font-size: 12px; }
.bl summary { cursor: pointer; }
.bl > div { padding: 2px 0; }
.mt { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.tk { background: var(--s2); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.tk.due { background: var(--heat-bg); }
@media (max-width: 1100px) { .hg { grid-template-columns: 1fr; } .kv { grid-template-columns: repeat(2, 1fr); } }
</style>
