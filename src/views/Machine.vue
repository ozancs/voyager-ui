<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import SystemLoads from '../components/SystemLoads.vue'
import FileBrowser from '../components/FileBrowser.vue'
import { state, S, gcode, toast, fmtBytes, useApiEvent } from '../store'
import { api } from '../api/moonraker'
const C = (state.cache.machine ||= {})
const sys = ref(C.sys || null), proc = ref(C.proc || null), upd = ref(C.upd || null), ends = ref(null)
const busy = ref(''), confirm = ref(null)
async function loadSys() { try { sys.value = C.sys = (await api.call('machine.system_info')).system_info } catch {} }
async function loadProc() { try { proc.value = C.proc = await api.call('machine.proc_stats') } catch {} }
async function loadUpd(refresh = false) {
  busy.value = refresh ? 'check' : ''
  try {
    let r
    if (refresh) { try { r = await api.call('machine.update.refresh', {}) } catch { r = await api.call('machine.update.status', { refresh: true }) } }
    else r = await api.call('machine.update.status', {})
    upd.value = C.upd = r
  } catch (e) { if (refresh) toast(e.message, 'error') }
  busy.value = ''
}
async function query() { try { ends.value = await api.call('printer.query_endstops.status') } catch (e) { toast(e.message, 'error') } }
let t
onMounted(() => { loadUpd() })
onBeforeUnmount(() => clearInterval(t))
useApiEvent('notify_proc_stat_update', ([p]) => { if (proc.value) Object.assign(proc.value, { cpu_temp: p.cpu_temp, system_cpu_usage: p.system_cpu_usage, system_memory: p.system_memory ?? proc.value.system_memory }) })
const cpu = computed(() => proc.value?.system_cpu_usage?.cpu ?? null)
const mem = computed(() => proc.value?.system_memory)
const mcus = computed(() => state.objects.filter((o) => o === 'mcu' || o.startsWith('mcu ')))
const updates = computed(() => Object.entries(upd.value?.version_info || {}).filter(([k]) => k !== 'system'))
const sysUpd = computed(() => upd.value?.version_info?.system)
function needs(v) {
  if (v.package_count) return v.package_count > 0
  if (v.commits_behind?.length) return true
  if (v.version && v.remote_version && v.remote_version !== '?' && v.version !== v.remote_version) return true
  return false
}
function verText(v) { return v.version || v.full_version_string || '' }
async function doUpdate(name) {
  confirm.value = null
  busy.value = name
  state.update = { app: name, lines: [], complete: false }
  try {
    await api.call(name === 'system' ? 'machine.update.system' : 'machine.update.upgrade', name === 'system' ? {} : { name })
  } catch (e) {
    if (state.update) { state.update.lines.push('!! ' + e.message); state.update.complete = true }
  }
  busy.value = ''
  loadUpd()
}
async function doUpdateAll() {
  confirm.value = null
  busy.value = 'all'
  state.update = { app: 'all', lines: [], complete: false }
  try { await api.call('machine.update.full') } catch (e) { if (state.update) { state.update.lines.push('!! ' + e.message); state.update.complete = true } }
  busy.value = ''
  loadUpd()
}
const logs = ['klippy.log', 'moonraker.log', 'crowsnest.log']
</script>
<template>
  <div class="mg">
    <div class="left"><FileBrowser class="fb" /></div>
    <div class="col" style="gap:16px">
      <SystemLoads />
    <section class="card">
      <div class="card-h"><h2>Update Manager</h2><div class="acts"><button v-if="updates.filter(([, v]) => needs(v)).length > 1" class="btn acc" :disabled="!!busy" @click="confirm = '__all'"><Icon name="download" :size="16" />Update all</button><button class="btn" :disabled="busy === 'check'" @click="loadUpd(true)"><Icon name="refresh" :size="16" />{{ busy === 'check' ? 'Checking…' : 'Check' }}</button></div></div>
      <div v-if="!upd" class="empty">Loading…</div>
      <div v-for="[name, v] in updates" :key="name" class="it">
        <div class="grow row" style="gap:10px;min-width:0;align-items:baseline"><b>{{ name }}</b><span class="mono mu" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ verText(v) }}<template v-if="needs(v)"> → {{ v.remote_version }}</template><template v-if="v.is_dirty"> · dirty</template><template v-if="v.detached"> · detached</template></span></div>
        <button v-if="needs(v)" class="btn acc" :disabled="!!busy" @click="confirm = name"><Icon name="download" :size="16" />{{ busy === name ? 'Updating…' : 'Update' }}</button>
        <span v-else class="chip" :style="{ color: v.detached || v.is_dirty ? 'var(--wn)' : 'var(--ok)' }"><i></i>{{ v.detached ? 'Pinned' : 'Up to date' }}</span>
      </div>
      <div v-if="sysUpd" class="it">
        <div class="grow col" style="gap:2px"><b>System</b><span class="mono mu" style="font-size:11px">{{ sysUpd.package_count }} packages</span></div>
        <button v-if="sysUpd.package_count" class="btn" :disabled="!!busy" @click="confirm = 'system'">Update</button>
        <span v-else class="chip" style="color:var(--ok)"><i></i>Up to date</span>
      </div>
    </section>
      <section class="card">
        <div class="card-h"><h2>Endstops</h2><button class="btn" @click="query"><Icon name="refresh" :size="16" />Query</button></div>
        <div v-if="!ends" class="mu" style="font-size:13px">Press query to read endstop states.</div>
        <div v-for="(v, k) in ends" :key="k" class="row sb" style="height:30px"><span class="mono">{{ k }}</span><span class="chip" :style="{ color: v === 'open' ? 'var(--ok)' : 'var(--ac)' }"><i></i>{{ v }}</span></div>
      </section>
      <section class="card">
        <div class="card-h"><h2>Logs</h2><button class="btn" @click="gcode('FIRMWARE_RESTART')"><Icon name="restart" :size="16" />Firmware restart</button></div>
        <div v-for="l in logs" :key="l" class="row" style="height:40px"><Icon name="file" :size="16" style="color:var(--mu)" /><span class="mono grow">{{ l }}</span><a class="btn ibtn sm clear" :href="api.url('/server/files/logs/' + l)" download :aria-label="'Download ' + l"><Icon name="download" :size="16" /></a></div>
      </section>
    </div>
  </div>
  <Modal v-if="confirm" :title="confirm === '__all' ? 'Update everything?' : 'Update ' + confirm + '?'" @close="confirm = null">
    <p class="mu" style="margin:0">Services may restart during the update.</p>
    <template #foot><button class="btn lg" @click="confirm = null">Cancel</button><button class="btn lg acc" @click="confirm === '__all' ? doUpdateAll() : doUpdate(confirm)">Update</button></template>
  </Modal>
</template>
<style scoped>
.mg { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
.left { position: relative; min-height: 520px; }
.left .fb { position: absolute; inset: 0; }
.sb { justify-content: space-between; }
.m { display: flex; flex-direction: column; gap: 6px; }
.m b { font-size: 13px; }
.mu { color: var(--mu); }
.it { display: flex; align-items: center; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--bd); min-height: 40px; }
.it:last-child { border-bottom: none; }
.it b { font-weight: 600; font-size: 13.5px; white-space: nowrap; }
@media (max-width: 1200px) { .mg { grid-template-columns: 1fr; } .left { min-height: 600px; } }
</style>
