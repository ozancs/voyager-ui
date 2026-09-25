<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import Donut from './Donut.vue'
import { state, S, fmtBytes, useApiEvent } from '../store'
import { api } from '../api/moonraker'
import { t } from '../i18n'
defineProps({ compact: Boolean, detailed: Boolean })
const C = (state.cache.machine ||= {})
const sys = ref(C.sys || null), proc = ref(C.proc || null)
let tmr
async function loadSys() { try { sys.value = C.sys = (await api.call('machine.system_info')).system_info } catch {} }
async function loadProc() { try { proc.value = C.proc = await api.call('machine.proc_stats') } catch {} }
onMounted(() => { if (!C.sys) loadSys(); loadProc(); tmr = setInterval(loadProc, 5000) })
onBeforeUnmount(() => clearInterval(tmr))
useApiEvent('notify_proc_stat_update', ([p]) => {
  if (!proc.value) return
  Object.assign(proc.value, { cpu_temp: p.cpu_temp, system_cpu_usage: p.system_cpu_usage ?? proc.value.system_cpu_usage, system_memory: p.system_memory ?? proc.value.system_memory, network: p.network ?? proc.value.network })
})
const settings = computed(() => S('configfile').settings || {})
function mcuTemp(name) {
  for (const [k, v] of Object.entries(settings.value)) {
    if (!k.startsWith('temperature_sensor ') || v.sensor_type !== 'temperature_mcu') continue
    const m = (v.sensor_mcu || 'mcu').toLowerCase()
    if (m === name.toLowerCase()) {
      const obj = state.objects.find((o) => o.toLowerCase() === k)
      return obj ? S(obj).temperature : null
    }
  }
  return null
}
const mcus = computed(() => state.objects.filter((o) => o === 'mcu' || o.startsWith('mcu ')).map((o) => {
  const m = S(o), ls = m.last_stats || {}, mc = m.mcu_constants || {}
  const load = ls.mcu_task_avg != null ? (ls.mcu_task_avg + 3 * ls.mcu_task_stddev) / 0.0025 : 0
  return {
    name: o, chip: mc.MCU || '', version: m.mcu_version || '',
    load, awake: ls.mcu_awake != null ? ls.mcu_awake / 5 : 0,
    freq: ls.freq ? Math.round(ls.freq / 1e6) : mc.CLOCK_FREQ ? Math.round(mc.CLOCK_FREQ / 1e6) : null,
    temp: mcuTemp(o === 'mcu' ? 'mcu' : o.slice(4)),
  }
}))
const mem = computed(() => proc.value?.system_memory)
const memPct = computed(() => (mem.value ? (mem.value.used / mem.value.total) * 100 : 0))
const cpuPct = computed(() => proc.value?.system_cpu_usage?.cpu ?? 0)
const nets = computed(() => {
  const n = proc.value?.network || {}
  return Object.entries(n).filter(([k]) => k !== 'lo').map(([k, v]) => {
    const ip = sys.value?.network?.[k]?.ip_addresses?.find((a) => a.family === 'ipv4')?.address || sys.value?.network?.[k]?.ip_addresses?.[0]?.address
    return { name: k, ip, bw: v.bandwidth, rx: v.rx_bytes, tx: v.tx_bytes }
  }).filter((x) => x.rx || x.tx)
})
const cpu = computed(() => sys.value?.cpu_info || {})
const details = ref(false)
// one small tile per MCU plus CPU and memory of the host
const tiles = computed(() => [
  ...mcus.value.map((m) => ({ k: m.name, name: m.name === 'mcu' ? 'MCU' : m.name.slice(4), sub: m.temp != null ? m.temp.toFixed(0) + '°C' : m.chip, v: m.load * 100, color: 'var(--ac)', tip: [m.chip, m.version, m.freq && m.freq + ' MHz'].filter(Boolean).join('\n') })),
  { k: 'cpu', name: t('CPU'), sub: proc.value?.cpu_temp != null ? proc.value.cpu_temp.toFixed(0) + '°C' : cpu.value.processor || '', v: cpuPct.value, color: 'var(--cool)', tip: [cpu.value.model, sys.value?.distribution?.name].filter(Boolean).join('\n') },
  { k: 'mem', name: t('MEM'), sub: mem.value ? fmtBytes(mem.value.used * 1024) : '', v: memPct.value, color: 'var(--sense)', tip: mem.value ? fmtBytes(mem.value.used * 1024) + ' / ' + fmtBytes(mem.value.total * 1024) : '' },
])
</script>
<template>
  <!-- detailed: the Machine page, one row per MCU and one for the host with network counters -->
  <section v-if="detailed" class="card sld">
    <div class="card-h"><h2 class="row"><Icon name="cpu" :size="18" />{{ t('System Loads') }}</h2></div>
    <div v-for="m in mcus" :key="m.name" class="it">
      <div class="grow col" style="gap:2px;min-width:0">
        <div><b>{{ m.name }}</b> <span v-if="m.chip" class="mu sm">({{ m.chip }})</span></div>
        <span class="sm">{{ t('Version: {v}', { v: m.version || '--' }) }}</span>
        <span class="sm">{{ t('Load: {l}, Awake: {a}', { l: m.load.toFixed(2), a: m.awake.toFixed(2) }) }}<template v-if="m.freq">, {{ t('Freq: {f} MHz', { f: m.freq }) }}</template><template v-if="m.temp != null">, {{ t('Temp: {n}°C', { n: m.temp.toFixed(0) }) }}</template></span>
      </div>
      <Donut :value="m.load * 100" />
    </div>
    <div class="it">
      <div class="grow col" style="gap:2px;min-width:0">
        <div><b>{{ t('Host') }}</b> <span class="mu sm">({{ cpu.processor || '?' }}<template v-if="cpu.bits">, {{ cpu.bits }}</template>)</span></div>
        <span class="sm">{{ t('Version: {v}', { v: state.versions.klipper || '--' }) }}</span>
        <span v-if="sys?.distribution" class="sm">{{ t('OS: {v}', { v: sys.distribution.name }) }}</span>
        <span class="sm">{{ t('Load: {l}', { l: S('system_stats').sysload?.toFixed(1) ?? '--' }) }}<template v-if="mem">, {{ t('Mem: {used} / {total}', { used: fmtBytes(mem.used * 1024), total: fmtBytes(mem.total * 1024) }) }}</template><template v-if="proc?.cpu_temp != null">, {{ t('Temp: {n}°C', { n: proc.cpu_temp.toFixed(0) }) }}</template></span>
        <span v-for="n in nets" :key="n.name" class="sm mu net">{{ n.name }}<template v-if="n.ip"> ({{ n.ip }})</template>: {{ t('Bandwidth: {bw}/s, Received: {rx}, Transmitted: {tx}', { bw: fmtBytes(n.bw), rx: fmtBytes(n.rx), tx: fmtBytes(n.tx) }) }}</span>
      </div>
      <Donut :value="cpuPct" :label="t('CPU')" color="var(--cool)" />
      <Donut :value="memPct" :label="t('MEM')" color="var(--sense)" />
    </div>
  </section>
  <section v-else class="card sl">
    <div class="tiles">
      <div v-for="x in tiles" :key="x.k" class="tl" :data-tip="x.tip">
        <Donut :value="x.v" :color="x.color" :size="54" />
        <b class="nm">{{ x.name }}</b>
        <span class="sub mono">{{ x.sub }}</span>
      </div>
    </div>
    <button class="more" :aria-label="details ? t('Less') : t('Details')" :data-tip="details ? t('Less') : t('Details')" @click="details = !details"><Icon :name="details ? 'up' : 'info'" :size="14" /></button>
    <div v-if="details" class="det">
      <div v-for="m in mcus" :key="m.name" class="sm"><b>{{ m.name }}</b> <span class="mu">{{ m.chip }}</span> · {{ m.version }}<template v-if="m.freq"> · {{ m.freq }} MHz</template> · {{ t('Load: {l}, Awake: {a}', { l: m.load.toFixed(2), a: m.awake.toFixed(2) }) }}</div>
      <div class="sm"><b>{{ t('Host') }}</b> <span class="mu">{{ cpu.processor }} {{ cpu.bits }}</span><template v-if="sys?.distribution"> · {{ sys.distribution.name }}</template> · Klipper {{ state.versions.klipper }} · {{ t('Load: {l}', { l: S('system_stats').sysload?.toFixed(1) ?? '--' }) }}</div>
      <div v-for="n in nets" :key="n.name" class="sm mu net">{{ n.name }}<template v-if="n.ip"> ({{ n.ip }})</template>: {{ t('Bandwidth: {bw}/s, Received: {rx}, Transmitted: {tx}', { bw: fmtBytes(n.bw), rx: fmtBytes(n.rx), tx: fmtBytes(n.tx) }) }}</div>
    </div>
  </section>
</template>
<style scoped>
.sl { position: relative; padding: 14px; justify-content: center; }
.more { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border: none; border-radius: 6px; background: transparent; color: var(--mu2); display: flex; align-items: center; justify-content: center; opacity: .6; }
.more:hover { opacity: 1; color: var(--tx); background: var(--s2); }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
.tl { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 8px 10px; border-radius: 12px; background: var(--s2); min-width: 0; }
.nm { font-size: 13px; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: 11.5px; color: var(--mu); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.det { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid var(--bd); overflow: auto; min-height: 0; }
.sm { font-size: 12.5px; line-height: 1.5; }
.sm2 { height: 30px; font-size: 12.5px; }
.mu { color: var(--mu); }
.net { word-break: break-word; }
.sld .it { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--bd); }
.sld .it:first-of-type { border-top: none; }
.sld .sm { font-size: 13px; }
.sld b { font-size: 14px; }
</style>
