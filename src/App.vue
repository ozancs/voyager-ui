<script setup>
import { ref, computed, defineAsyncComponent, h, watch } from 'vue'
import LoadingPanel from './components/LoadingPanel.vue'
import TopBar from './components/TopBar.vue'
import FavoritesBar from './components/FavoritesBar.vue'
import SideNav from './components/SideNav.vue'
import ExcludeModal from './components/ExcludeModal.vue'
import Icon from './components/Icon.vue'
import UpdateModal from './components/UpdateModal.vue'
import Tooltip from './components/Tooltip.vue'
import Dashboard from './views/Dashboard.vue'
import Spotlight from './components/Spotlight.vue'
import MachineDialogs from './components/MachineDialogs.vue'
import FirstRun from './components/FirstRun.vue'
import Handoff from './components/Handoff.vue'
import LoginScreen from './components/LoginScreen.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import { initSync } from './sync'
import { initFeatures } from './features'
import { nextTick } from 'vue'
initFeatures()
import { state, gcode, VERSION, activeTasks, APP_NAME, closeToast } from './store'
import { route, go } from './router'
import { api } from './api/moonraker'
import { t } from './i18n'

const LOADERS = {
  webcam: ['Webcam', () => import('./views/WebcamPage.vue')],
  console: ['Console', () => import('./views/ConsolePage.vue')],
  heightmap: ['Heightmap', () => import('./views/Heightmap.vue')],
  files: ['G-code Files', () => import('./views/Files.vue')],
  viewer: ['G-code Viewer', () => import('./views/Viewer.vue')],
  history: ['History', () => import('./views/History.vue')],
  machine: ['Machine', () => import('./views/Machine.vue')],
  health: ['Health', () => import('./views/Health.vue')],
  quick: ['Printer settings', () => import('./views/QuickConfig.vue')],
  config: ['Editor', () => import('./views/ConfigEditor.vue')],
}
const VIEWS = { dashboard: Dashboard }
for (const [k, [name, loader]] of Object.entries(LOADERS)) {
  VIEWS[k] = defineAsyncComponent({ loader, delay: 0, loadingComponent: { render: () => h(LoadingPanel, { title: t('Opening {name}…', { name: t(name) }), compact: true }) } })
}
// once the printer is loaded, fetch the other pages in the background so the first click is instant
watch(() => state.booted, (b) => {
  if (!b) return
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500))
  idle(() => {
    Object.values(LOADERS).forEach(([, l], i) => setTimeout(() => l().catch(() => {}), i * 150))
    setTimeout(() => import('./components/Surface3D.vue').catch(() => {}), 4000)
    setTimeout(() => import('gcode-preview').catch(() => {}), 6000)
  })
}, { immediate: true })
// scroll to a section after navigating (settings found through Ctrl+K)
// a new page starts at the top
watch(() => route.name, () => { const m = document.querySelector('main.main'); if (m) m.scrollTop = 0 })
watch([() => state.anchor, () => route.name], async () => {
  const a = state.anchor
  if (!a || a.startsWith('file:')) return
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 100))
    const el = document.getElementById(a)
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); state.anchor = ''; return }
  }
  state.anchor = '' // not on this page: forget it instead of scrolling some later page
})
const view = computed(() => VIEWS[route.name] || Dashboard)
// the old settings page is a dialog now: old links and the first-run flow land on the dashboard with it open
watch(() => route.name, (n) => { if (n === 'theme') { state.settingsOpen = state.settingsOpen || 'general'; go('dashboard') } }, { immediate: true })
watch(() => state.settingsLoaded && state.connected, (ok) => { if (ok) initSync() }, { immediate: true })
const showExclude = ref(false)
const navOpen = ref(false)
// side menu: pinned (in the layout), hidden (button opens it over the page), auto (opens when the mouse reaches the left edge)
const narrow = ref(window.innerWidth <= 1100)
window.addEventListener('resize', () => (narrow.value = window.innerWidth <= 1100))
const navMode = computed(() => (narrow.value ? 'hidden' : state.settings.navMode || 'pinned'))
// the button inside the menu: pinned -> hidden, hidden/auto -> pinned
function pinNav() { state.settings.navMode = navMode.value === 'pinned' ? 'hidden' : 'pinned'; navOpen.value = false }
function toggleNav() {
  if (narrow.value || navMode.value === 'auto') navOpen.value = !navOpen.value
  else { state.settings.navMode = navMode.value === 'pinned' ? 'hidden' : 'pinned'; navOpen.value = false }
}
let navT
function peek(on) { clearTimeout(navT); if (on) navOpen.value = true; else navT = setTimeout(() => (navOpen.value = false), 350) }
const location = window.location
const bootTask = computed(() => activeTasks.value[0]?.label || t('Loading printer'))
const notReady = computed(() => state.connected && state.klippy !== 'ready')
</script>

<template>
  <div class="shell" :class="{ booting: state.connected && !state.booted }">
    <TopBar @exclude="state.showExclude = true" @menu="toggleNav" />
    <SettingsDialog v-if="state.settingsOpen" />
    <FavoritesBar />
    <div class="body">
      <SideNav :open="navOpen" :mode="navMode" @close="navOpen = false" @pin="pinNav" @mouseenter="navMode === 'auto' && peek(true)" @mouseleave="navMode === 'auto' && peek(false)" />
      <div v-if="navMode === 'auto' && !navOpen" class="edge" @mouseenter="peek(true)"></div>
      <button v-if="navMode !== 'pinned' && !navOpen && !narrow" class="navtab" :aria-label="t('Show / hide the side menu')" :data-tip="t('Menu')" @click="navMode === 'hidden' ? pinNav() : (navOpen = true)" @mouseenter="navMode === 'auto' && peek(true)"><Icon name="chevr2" :size="16" :stroke="2.4" /></button>
      <main class="main">
        <div v-if="!state.connected" class="banner"><Icon name="refresh" :size="20" class="spin" />
          <div class="grow"><b>{{ t('Connecting to Moonraker…') }}</b><span v-if="state.conn.attempts" class="mono" style="font-weight:400;font-size:12px;margin-left:10px;color:var(--mu)">{{ t('attempt {n}', { n: state.conn.attempts }) }}</span>
            <pre v-if="state.conn.probe">{{ state.conn.probe }}</pre></div>
        </div>
        <div v-else-if="notReady" class="banner err">
          <Icon name="warn" :size="20" />
          <div class="grow"><b>{{ t('Klipper {state}', { state: state.klippy }) }}</b><pre>{{ state.klippyMessage }}</pre></div>
          <button class="btn lg" @click="gcode('RESTART').catch(() => api.call('printer.restart'))">{{ t('Restart') }}</button>
          <button class="btn lg acc" @click="api.call('printer.firmware_restart')">{{ t('Firmware Restart') }}</button>
        </div>
        <component :is="view" :key="route.name === 'config' ? 'config' : route.name" @exclude="state.showExclude = true" />
        <footer class="ft mono">
          <span><b>{{ APP_NAME }}</b> v{{ VERSION }}</span>
          <span v-if="state.versions.klipper">Klipper {{ state.versions.klipper }}</span>
          <span v-if="state.versions.moonraker">Moonraker {{ state.versions.moonraker }}</span>
          <span v-if="state.versions.host">{{ state.versions.host }}</span>
          <span class="grow"></span>
          <Handoff />
          <a :href="'http://' + location.hostname + '/'" target="_blank" rel="noopener">{{ t('Open {name}', { name: 'Mainsail' }) }}</a>
        </footer>
      </main>
    </div>
    <MachineDialogs />
    <Spotlight />
    <FirstRun />
    <LoginScreen />
    <ExcludeModal v-if="state.showExclude" @close="state.showExclude = false" />
    <UpdateModal />
    <Transition name="fade"><div v-if="state.connected && !state.booted" class="bootpill"><Icon name="refresh" :size="15" class="spin" /><span>{{ bootTask }}</span></div></Transition>
    <Tooltip />
    <div class="toasts">
      <TransitionGroup name="tst">
        <div v-for="ts in state.toasts" :key="ts.id" class="toast" :class="ts.kind">
          <Icon v-if="ts.kind === 'error'" name="warn" :size="18" class="ti" />
          <div class="col grow" style="gap:3px;min-width:0">
            <span class="tm">{{ ts.msg }}<b v-if="ts.n > 1" class="mono tn">×{{ ts.n }}</b></span>
            <span v-if="ts.hint" class="th">{{ ts.hint }}</span>
            <button v-if="ts.console" class="tl" @click="closeToast(ts.id); go('console')">{{ t('Open console') }}</button>
          </div>
          <button class="tx" :aria-label="t('Dismiss')" @click="closeToast(ts.id)"><Icon name="x" :size="14" /></button>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.shell { height: 100%; display: flex; flex-direction: column; }
.navtab { position: fixed; left: 0; top: 152px; z-index: 86; width: 22px; height: 44px; border: 1px solid var(--bd); border-left: none; border-radius: 0 10px 10px 0; background: var(--s1); color: var(--mu); display: flex; align-items: center; justify-content: center; padding: 0; }
.navtab:hover { color: var(--tx); width: 28px; }
.edge { position: fixed; left: 0; top: 140px; bottom: 0; width: 12px; z-index: 85; }
.body { flex: 1; min-height: 0; display: flex; }
.main > * { flex-shrink: 0; }
.main { flex: 1; min-width: 0; overflow: auto; padding: 24px 28px 24px; display: flex; flex-direction: column; gap: 20px; }
.banner { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--s1); border: 1px solid var(--wn); border-radius: var(--r); color: var(--wn); font-weight: 700; flex-shrink: 0; }
.banner.err { border-color: var(--dg); color: var(--tx); }
.banner.err > svg { color: var(--dg); }
.banner pre { margin: 4px 0 0; font-family: var(--fm); font-size: 12px; color: var(--mu); white-space: pre-wrap; font-weight: 400; }
.ft { margin-top: auto; flex-shrink: 0; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; padding: 18px 4px 4px; border-top: 1px solid var(--bd); font-size: 11px; color: var(--mu2); }
.ft b { color: var(--mu); }
.ft a { color: var(--mu); text-decoration: none; }
.ft a:hover { color: var(--ac); }
.main { padding-bottom: 24px !important; }
.bootpill { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: var(--s2); border-radius: 18px; font-size: 13px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,.4); z-index: 150; }
.bootpill :deep(svg) { color: var(--heat); }
.fade-leave-active { transition: opacity .3s; }
.fade-leave-to { opacity: 0; }
.toasts { position: fixed; right: 20px; bottom: 20px; display: flex; flex-direction: column; gap: 8px; z-index: 200; }
.toast { display: flex; align-items: flex-start; gap: 10px; padding: 12px 12px 12px 16px; background: var(--s2); border: 1px solid var(--bd); border-radius: 12px; font-weight: 600; width: 400px; max-width: calc(100vw - 40px); box-shadow: 0 8px 24px rgba(0,0,0,.4); }
.toast.error { border-color: rgba(240,106,106,.55); background: var(--toast-err); }
.ti { color: var(--dg); flex-shrink: 0; margin-top: 1px; }
.tm { word-break: break-word; }
.tn { margin-left: 8px; font-size: 11px; color: var(--mu); }
.th { font-weight: 400; font-size: 12.5px; color: var(--mu); line-height: 1.45; }
.tl { align-self: flex-start; background: none; border: none; padding: 0; color: var(--heat); font-size: 12px; font-weight: 600; }
.tx { background: none; border: none; color: var(--mu); padding: 2px; flex-shrink: 0; }
.tx:hover { color: var(--tx); }
.tst-enter-active, .tst-leave-active { transition: all .2s; }
.tst-enter-from, .tst-leave-to { opacity: 0; transform: translateX(20px); }
@media (max-width: 1100px) { .main { padding: 10px; } }
</style>
