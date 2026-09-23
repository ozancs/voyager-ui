<script setup>
import { ref, computed } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { state, S, printState, progress, printTimes, layerInfo, fmtTime, gcode, toast, printerName, dismiss, dismissAll } from '../store'
import { api } from '../api/moonraker'
import { go } from '../router'

const emit = defineEmits(['exclude', 'menu'])
const fileInput = ref(null)
const uploading = ref(null)
const showBell = ref(false)
const showPower = ref(false)
const confirm = ref(null)
const askCancel = ref(false)
const thumb = computed(() => {
  const m = state.currentMeta
  if (!m?.thumbnails?.length) return null
  const t = [...m.thumbnails].sort((a, b) => b.width - a.width)[0]
  const fn = S('print_stats').filename || ''
  const dir = fn.split('/').slice(0, -1).join('/')
  return api.url(`/server/files/gcodes/${dir ? dir + '/' : ''}${encodeURI(t.relative_path)}`)
})
const eo = computed(() => S('exclude_object'))
const eta = computed(() => printTimes.value.eta ? printTimes.value.eta.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '--')
function reprint() { const f = S('print_stats').filename; if (f) api.call('printer.print.start', { filename: f }).catch((e) => toast(e.message, 'error')) }

const stateColor = computed(() => ({ printing: 'var(--ok)', paused: 'var(--wn)', error: 'var(--dg)', complete: 'var(--bl)', cancelled: 'var(--mu)' }[printState.value] || 'var(--mu)'))
const label = computed(() => {
  if (!state.connected) return 'Disconnected'
  if (state.klippy !== 'ready') return 'Klipper ' + state.klippy
  return printState.value.charAt(0).toUpperCase() + printState.value.slice(1)
})
const savePending = computed(() => S('configfile').save_config_pending)
const active = computed(() => ['printing', 'paused'].includes(printState.value))
const hostName = location.host

async function onFile(e) {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  uploading.value = 0
  try {
    await api.upload(f, { print: true, onProgress: (p) => (uploading.value = p) })
    toast(`${f.name} uploaded, starting print`)
  } catch (err) { toast('Upload failed: ' + err.message, 'error') }
  uploading.value = null
}
async function estop() {
  try { await api.call('printer.emergency_stop') } catch (e) { toast(e.message, 'error') }
}
const POWER = [
  { k: 'restart', label: 'Restart Klipper', icon: 'restart', run: () => gcode('RESTART') },
  { k: 'fw', label: 'Firmware Restart', icon: 'bolt', run: () => gcode('FIRMWARE_RESTART') },
  { k: 'moon', label: 'Restart Moonraker', icon: 'refresh', run: () => api.call('server.restart') },
  { k: 'reboot', label: 'Reboot Host', icon: 'rot', confirm: true, run: () => api.call('machine.reboot') },
  { k: 'off', label: 'Shutdown Host', icon: 'power', confirm: true, danger: true, run: () => api.call('machine.shutdown') },
]
function doPower(p) {
  showPower.value = false
  if (p.confirm || active.value) confirm.value = p
  else p.run().catch?.((e) => toast(e.message, 'error'))
}
function runConfirmed() {
  const p = confirm.value
  confirm.value = null
  Promise.resolve(p.run()).catch((e) => toast(e.message, 'error'))
}
function pause() { gcode(printState.value === 'paused' ? 'RESUME' : 'PAUSE') }
</script>

<template>
  <header class="tb">
    <button class="menu btn clear ibtn" aria-label="Menu" @click="emit('menu')"><Icon name="menu" :size="22" /></button>
    <a class="brand" href="#/dashboard">
      <div class="logo"><Icon name="cube" :size="24" :stroke="2.4" /></div>
      <div class="col" style="gap:0"><b class="pn">{{ printerName }}</b><span class="mono mu" style="font-size:11px">{{ hostName }}</span></div>
    </a>
    <div class="pill" :class="{ act: active }">
      <div class="pth"><img v-if="thumb && S('print_stats').filename" :src="thumb" alt="" /><Icon v-else name="cube" :size="20" :stroke="1.8" /></div>
      <div class="col" style="gap:1px;min-width:0;flex-shrink:1">
        <div class="row" style="gap:8px;min-width:0">
          <span class="dot" :style="{ background: state.connected && state.klippy === 'ready' ? stateColor : 'var(--dg)' }"></span>
          <b class="st">{{ label }}</b>
          <span v-if="active" class="mono st2">{{ (progress * 100).toFixed(1) }}%</span>
        </div>
        <span class="mono fn">{{ state.klippy !== 'ready' && state.klippyMessage ? state.klippyMessage.split('\n')[0] : S('print_stats').filename || 'No file loaded' }}</span>
      </div>
      <template v-if="active">
        <div class="pb"><div class="bar" style="height:8px"><div :style="{ width: progress * 100 + '%' }"></div></div>
          <div class="row mono meta"><span>Layer {{ layerInfo.cur }}/{{ layerInfo.total || '--' }}</span><span>Left {{ fmtTime(printTimes.left) }}</span><span class="hide-m">ETA {{ eta }}</span></div>
        </div>
        <button v-if="printState === 'paused'" class="btn acc pbtn" aria-label="Resume" @click="gcode('RESUME')"><Icon name="play" :size="16" :stroke="2.4" /><span class="hide-m">Resume</span></button>
        <button v-else class="btn pbtn" aria-label="Pause" @click="gcode('PAUSE')"><Icon name="pause" :size="16" :stroke="2.4" /><span class="hide-m">Pause</span></button>
        <button class="btn dg pbtn" aria-label="Cancel print" @click="askCancel = true"><Icon name="sq" :size="16" :stroke="2.4" /></button>
        <button class="btn out pbtn" aria-label="Exclude object" :disabled="!eo.objects?.length" @click="emit('exclude')"><Icon name="excl" :size="16" :stroke="2.4" /><span v-if="eo.objects?.length" class="mono" style="font-size:11px">{{ eo.objects.length - (eo.excluded_objects?.length || 0) }}/{{ eo.objects.length }}</span></button>
      </template>
      <template v-else>
        <div class="grow"></div>
        <button v-if="S('print_stats').filename && state.klippy === 'ready'" class="btn pbtn" aria-label="Print this file again" @click="reprint"><Icon name="refresh" :size="16" :stroke="2.4" /><span class="hide-m">Reprint</span></button>
      </template>
    </div>
    <button class="btn lg hide-s" :class="{ acc: savePending }" :disabled="!savePending" aria-label="Save Config" @click="gcode('SAVE_CONFIG')"><Icon name="save" :stroke="2.4" /><span class="hide-m">Save Config</span></button>
    <button class="btn lg acc hide-s" aria-label="Upload & Print" :disabled="uploading !== null" @click="fileInput.click()"><Icon name="upload" :stroke="2.4" /><span v-if="uploading !== null">{{ Math.round(uploading * 100) + '%' }}</span><span v-else class="hide-m">Upload &amp; Print</span></button>
    <input ref="fileInput" type="file" accept=".gcode,.g,.gco,.ufp,.nc" hidden @change="onFile" />
    <div class="rel">
      <button class="btn ibtn" aria-label="Notifications" @click="showBell = !showBell"><Icon name="bell" :size="22" :stroke="2.4" /><span v-if="state.notifications.length" class="badge" :style="{ background: state.notifications.some((n) => n.kind === 'error') ? 'var(--dg)' : state.notifications.some((n) => n.kind === 'warn') ? 'var(--wn)' : 'var(--bl)', color: '#111' }">{{ state.notifications.length }}</span></button>
      <div v-if="showBell" class="dd card" @mouseleave="showBell = false">
        <div class="card-h"><h2>Notifications</h2><button class="btn" :disabled="!state.notifications.length" @click="dismissAll">Dismiss all</button></div>
        <div v-if="!state.notifications.length" class="empty">No notifications</div>
        <div v-for="n in state.notifications" :key="n.id" class="nt"><Icon :name="n.kind === 'info' ? 'info' : 'warn'" :size="16" :style="{ color: n.kind === 'error' ? 'var(--dg)' : n.kind === 'info' ? 'var(--bl)' : 'var(--wn)', flexShrink: 0 }" /><span class="grow">{{ n.msg }}</span><button class="btn clear ibtn sm" style="width:24px;height:24px" aria-label="Dismiss" @click="dismiss(n)"><Icon name="x" :size="14" /></button></div>
      </div>
    </div>
    <button class="btn ibtn hide-s" aria-label="Settings" @click="go('theme')"><Icon name="gear" :size="22" :stroke="2.4" /></button>
    <div class="rel">
      <button class="btn ibtn" aria-label="Power" @click="showPower = !showPower"><Icon name="power" :size="22" :stroke="2.4" /></button>
      <div v-if="showPower" class="dd card" style="width:240px" @mouseleave="showPower = false">
        <button v-for="p in POWER" :key="p.k" class="btn clear" :style="{ justifyContent: 'flex-start', height: '40px', color: p.danger ? 'var(--dg)' : 'var(--tx)' }" @click="doPower(p)"><Icon :name="p.icon" :size="18" />{{ p.label }}</button>
      </div>
    </div>
    <button class="btn lg dgf estop" @click="estop"><Icon name="stop" :size="22" :stroke="2.6" /><span class="hide-s">E-STOP</span></button>
  </header>
  <Modal v-if="askCancel" title="Cancel print?" @close="askCancel = false">
    <p class="mu" style="margin:0">The current print will be cancelled.</p>
    <template #foot><button class="btn lg" @click="askCancel = false">Keep printing</button><button class="btn lg dgf" @click="askCancel = false; gcode('CANCEL_PRINT')">Cancel print</button></template>
  </Modal>
  <Modal v-if="confirm" :title="confirm.label + '?'" @close="confirm = null">
    <p class="mu" style="margin:0">{{ active ? 'A print is running. ' : '' }}Are you sure?</p>
    <template #foot><button class="btn lg" @click="confirm = null">Cancel</button><button class="btn lg dgf" @click="runConfirmed">{{ confirm.label }}</button></template>
  </Modal>
</template>

<style scoped>
.tb { height: 68px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 0 20px; background: var(--bg); border-bottom: 1px solid var(--bd); }
.brand { display: flex; align-items: center; gap: 12px; width: 212px; flex-shrink: 0; color: var(--tx); text-decoration: none; }
.brand b { font-size: 18px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
.logo { width: 40px; height: 40px; border-radius: 10px; background: var(--ac); color: var(--oa); display: flex; align-items: center; justify-content: center; }
.pill { flex: 1; display: flex; align-items: center; gap: 12px; padding: 0 6px 0 5px; height: 52px; background: var(--s1); border: none; border-radius: 14px; min-width: 0; }
.pth { width: 42px; height: 42px; flex-shrink: 0; border-radius: 10px; background: var(--s2); display: flex; align-items: center; justify-content: center; color: var(--mu); overflow: hidden; }
.pth img { width: 100%; height: 100%; object-fit: contain; }
.st { font-size: 14px; white-space: nowrap; }
.st2 { font-size: 13px; font-weight: 600; color: var(--heat); }
.pb { flex: 1; min-width: 120px; display: flex; flex-direction: column; gap: 6px; }
.meta { gap: 14px; font-size: 11px; color: var(--mu); white-space: nowrap; overflow: hidden; }
.pbtn { height: 40px; flex-shrink: 0; }
.dot { width: 10px; height: 10px; border-radius: 5px; flex-shrink: 0; }
.fn { font-size: 12px; color: var(--mu); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 1750px) { .hide-m { display: none; } }
.msg { font-size: 12px; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; }
.rel { position: relative; }
.badge { position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 4px; border-radius: 10px; background: var(--dg); color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.dd { position: absolute; right: 0; top: 52px; width: 380px; max-height: 420px; overflow: auto; z-index: 50; gap: 4px; box-shadow: 0 12px 40px rgba(0,0,0,.5); }
.nt { display: flex; gap: 10px; padding: 8px 4px; border-bottom: 1px solid var(--bd); font-size: 13px; font-family: var(--fm); word-break: break-word; }
.estop { letter-spacing: .06em; font-size: 15px; }
.menu { display: none; }
@media (max-width: 1100px) {
  .menu { display: inline-flex; }
  .brand { width: auto; }
  .brand .col { display: none; }
  .hide-s { display: none; }
  .tb { padding: 0 10px; gap: 8px; }
}
</style>
