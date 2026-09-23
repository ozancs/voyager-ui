<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import Donut from './Donut.vue'
import { state, S, fmtBytes, useApiEvent } from '../store'
import { api } from '../api/moonraker'
import { t } from '../i18n'
defineProps({ compact: Boolean })
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
</script>
<template>
  <section class="card">
    <div class="card-h"><h2 class="row"><Icon name="cpu" :size="18" />{{ t('System Loads') }}</h2></div>
    <div v-for="m in mcus" :key="m.name" class="it">
      <div class="grow col" style="gap:2px;min-width:0">
        <div><b>{{ m.name }}</b> <span class="mu sm" v-if="m.chip">({{ m.chip }})</span></div>
        <span class="sm">{{ t('Version: {v}', { v: m.version }) }}</span>
        <span class="sm">{{ t('Load: {l}, Awake: {a}', { l: m.load.toFixed(2), a: m.awake.toFixed(2) }) }}<template v-if="m.freq">, {{ t('Freq: {f} MHz', { f: m.freq }) }}</template><template v-if="m.temp != null">, {{ t('Temp: {n}°C', { n: m.temp.toFixed(0) }) }}</template></span>
      </div>
      <Donut :value="m.load * 100" />
    </div>
    <div class="it">
      <div class="grow col" style="gap:2px;min-width:0">
        <div><b>{{ t('Host') }}</b> <span class="mu sm">({{ cpu.processor || '?' }}, {{ cpu.bits || '' }})</span></div>
        <span class="sm">{{ t('Version: {v}', { v: state.versions.klipper }) }}</span>
        <span class="sm" v-if="sys?.distribution">{{ t('OS: {v}', { v: sys.distribution.name }) }}</span>
        <span class="sm">{{ t('Load: {l}', { l: S('system_stats').sysload?.toFixed(1) ?? '--' }) }}<template v-if="mem">, {{ t('Mem: {used} / {total}', { used: fmtBytes(mem.used * 1024), total: fmtBytes(mem.total * 1024) }) }}</template><template v-if="proc?.cpu_temp != null">, {{ t('Temp: {n}°C', { n: proc.cpu_temp.toFixed(0) }) }}</template></span>
        <template v-if="!compact">
          <span v-for="n in nets" :key="n.name" class="sm net">{{ n.name }}<template v-if="n.ip"> ({{ n.ip }})</template>: {{ t('Bandwidth: {bw}/s, Received: {rx}, Transmitted: {tx}', { bw: fmtBytes(n.bw), rx: fmtBytes(n.rx), tx: fmtBytes(n.tx) }) }}</span>
        </template>
      </div>
      <Donut :value="cpuPct" :label="t('CPU')" />
      <Donut :value="memPct" :label="t('MEM')" color="var(--bl)" />
    </div>
  </section>
</template>
<style scoped>
.it { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--bd); }
.sm { font-size: 13px; }
.mu { color: var(--mu); }
.net { word-break: break-word; }
b { font-size: 14px; }
</style>
