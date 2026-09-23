<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import Icon from './Icon.vue'
import { state, useApiEvent, activeTasks } from '../store'
import { healthIssues } from '../features'
import { route, go } from '../router'
import { api } from '../api/moonraker'
import { t } from '../i18n'
defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const NAV = [
  ['dashboard', 'dash', 'Dashboard'], ['webcam', 'cam', 'Webcam'], ['console', 'term', 'Console'], ['heightmap', 'hmap', 'Heightmap'],
  ['files', 'file', 'G-code Files'], ['viewer', 'cube', 'G-code Viewer'], ['history', 'clock', 'History'], ['machine', 'cpu', 'Machine'], ['health', 'heart', 'Health'],
]
const NAV2 = [['quick', 'sliders', 'Quick Config'], ['theme', 'gear', 'Settings']]
const cfgs = ref([])
async function loadCfgs() {
  try {
    const r = await api.call('server.files.list', { root: 'config' })
    const all = r.map((f) => f.path).filter((p) => !p.includes('/') && !p.startsWith('.') && !p.includes('::TMPNAME') && !/\.(zip|gz|tar|png|jpe?g|bin|uf2|elf|db|sqlite)$/i.test(p) && !/^printer-\d{8}_\d{6}\.cfg$/.test(p))
    const pri = ['printer.cfg', 'moonraker.conf']
    cfgs.value = [...pri.filter((p) => all.includes(p)), ...all.filter((p) => !pri.includes(p)).sort()]
  } catch {}
}
onMounted(() => { if (state.connected) loadCfgs() })
watch(() => state.connected, (c) => c && loadCfgs())
useApiEvent('notify_filelist_changed', ([p]) => { if (p?.item?.root === 'config') loadCfgs() })
function nav(n, a) { go(n, a); emit('close') }
const hBadge = computed(() => {
  const l = healthIssues.value
  if (!l.length) return null
  return { n: l.length, c: l.some((i) => i.level === 'error') ? 'var(--dg)' : l.some((i) => i.level === 'warn') ? 'var(--wn)' : 'var(--bl)' }
})
const editCfg = ref(false)
const tick = ref(Date.now())
setInterval(() => (tick.value = Date.now()), 250)
const slowTasks = computed(() => state.booted ? activeTasks.value.filter((t) => tick.value - t.t > 400) : [])
const hidden = (c) => (state.settings.hiddenCfgs || []).includes(c)
const shown = computed(() => (editCfg.value ? cfgs.value : cfgs.value.filter((c) => !hidden(c))))
function toggleCfg(c) {
  const h = state.settings.hiddenCfgs || (state.settings.hiddenCfgs = [])
  const i = h.indexOf(c)
  if (i >= 0) h.splice(i, 1); else h.push(c)
}
</script>
<template>
  <nav class="sn" :class="{ open }" :aria-label="t('Main')">
    <button v-for="[k, i, l] in NAV" :key="k" class="it" :class="{ on: route.name === k }" @click="nav(k)"><Icon :name="i" /><span>{{ t(l) }}</span><span v-if="k === 'health' && hBadge" class="nb" :style="{ background: hBadge.c }">{{ hBadge.n }}</span></button>
    <div class="sep"></div>
    <button v-for="[k, i, l] in NAV2" :key="k" class="it" :class="{ on: route.name === k }" @click="nav(k)"><Icon :name="i" /><span>{{ t(l) }}</span></button>
    <div class="hd row"><span class="sec-lbl grow">{{ t('Config files') }}</span><button class="btn clear ibtn sm ed" :class="{ on: editCfg }" :aria-label="editCfg ? t('Done') : t('Show hidden files')" @click="editCfg = !editCfg"><Icon :name="editCfg ? 'check' : 'pencil'" :size="14" /></button></div>
    <div class="cf">
      <div v-for="c in shown" :key="c" class="cfr" :class="{ hid: hidden(c) }">
        <button class="cfi" :class="{ on: route.name === 'config' && (route.arg === c || route.arg === 'config/' + c) }" @click="nav('config', c)"><Icon name="file" :size="16" /><span>{{ c }}</span></button>
        <button class="eye" :class="{ show: editCfg }" :aria-label="hidden(c) ? t('Show {name}', { name: c }) : t('Hide {name}', { name: c })" @click="toggleCfg(c)"><Icon :name="hidden(c) ? 'eye' : 'eyeoff'" :size="14" /></button>
      </div>
      <div v-if="!shown.length" class="mu" style="font-size:12px;padding:4px 12px">{{ t('All files hidden') }}</div>
    </div>
    <div class="ft">
      <template v-if="slowTasks.length"><Icon name="refresh" :size="13" class="spin" style="color:var(--heat)" /><span class="tk">{{ slowTasks[0].label }}…<template v-if="slowTasks.length > 1"> +{{ slowTasks.length - 1 }}</template></span></template>
      <template v-else><span class="d" :style="{ background: state.connected ? 'var(--ok)' : 'var(--dg)' }"></span>{{ state.connected ? t('Moonraker connected') : t('Connecting…') }}</template>
    </div>
  </nav>
  <div v-if="open" class="scrim" @click="emit('close')"></div>
</template>
<style scoped>
.sn { width: 232px; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; padding: 16px 12px; background: var(--bg); border-right: 1px solid var(--bd); overflow-y: auto; }
.it { display: flex; align-items: center; gap: 12px; height: 42px; padding: 0 12px; background: transparent; color: var(--tx); border: none; border-radius: 10px; font-size: 14px; font-weight: 500; text-align: left; flex-shrink: 0; }
.it :deep(svg) { color: var(--mu); }
.it:hover { background: var(--s2); }
.it.on { background: rgba(255,107,26,.13); color: var(--tx); font-weight: 600; }
.it.on :deep(svg) { color: var(--heat); }
.nb { margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; color: #111; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.sep { height: 1px; background: var(--bd); margin: 6px 4px; flex-shrink: 0; }
.hd { padding: 12px 4px 4px 12px; flex-shrink: 0; }
.ed { width: 26px; height: 26px; }
.ed.on { color: var(--ac); }
.cfr { position: relative; display: flex; }
.cfr .cfi { flex: 1; min-width: 0; padding-right: 30px; }
.cfr.hid .cfi { opacity: .4; }
.eye { position: absolute; right: 4px; top: 5px; width: 24px; height: 24px; border: none; border-radius: 6px; background: var(--s2); color: var(--mu); display: none; align-items: center; justify-content: center; }
.cfr:hover .eye, .eye.show { display: flex; }
.eye:hover { color: var(--ac); }
.cf { display: flex; flex-direction: column; gap: 1px; flex-shrink: 0; }
.cfi { display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 12px; background: transparent; color: var(--tx); border: none; border-radius: 10px; font-family: var(--fm); font-size: 13px; text-align: left; flex-shrink: 0; }
.cfi span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cfi :deep(svg) { color: var(--mu); flex-shrink: 0; }
.cfi:hover { background: var(--s2); }
.cfi.on { background: var(--s2); color: var(--ac); font-weight: 700; }
.cfi.on :deep(svg) { color: var(--ac); }
.ft { flex-shrink: 0; margin-top: auto; display: flex; align-items: center; gap: 8px; padding: 10px 12px 0; font-size: 12px; color: var(--mu); }
.tk { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.d { width: 8px; height: 8px; border-radius: 4px; }
.scrim { display: none; }
@media (max-width: 1100px) {
  .sn { position: fixed; left: 0; top: 0; bottom: 0; z-index: 90; transform: translateX(-100%); transition: transform .2s; }
  .sn.open { transform: none; }
  .scrim { display: block; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 80; }
}
</style>
