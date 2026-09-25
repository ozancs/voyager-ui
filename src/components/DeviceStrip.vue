<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import Toggle from './Toggle.vue'
import Modal from './Modal.vue'
import RangeSlider from './RangeSlider.vue'
import { state, S, stripAll, stripVisible, prettyName, shortName, setFan, setHeater, gcode, saveSettings } from '../store'
import { t } from '../i18n'
const open = ref(null)
const close = () => (open.value = null)
// tiles come in the user's order (drag them in Customize). Until an order is set they are grouped by kind:
// heaters, sensors, fans, lights, filament, spool. Rows are balanced so the last row is not left half empty
const RANK = (d) => d.kind === 'temp' ? (d.obj.startsWith('temperature_fan ') ? 2 : canTarget(d) ? 0 : 1) : { fan: 2, pin: 3, led: 3, filament: 4, spoolman: 5 }[d.kind] ?? 6
const items = computed(() => {
  const list = state.editDash ? stripAll.value : stripVisible.value
  if ((state.settings.strip?.order || []).length) return list
  return list.map((d, i) => [d, i]).sort((a, b) => RANK(a[0]) - RANK(b[0]) || a[1] - b[1]).map((x) => x[0])
})
const box = ref(null), boxW = ref(0)
let ro
onMounted(() => { ro = new ResizeObserver(([e]) => (boxW.value = e.contentRect.width)); if (box.value) ro.observe(box.value.$el || box.value) })
onBeforeUnmount(() => ro?.disconnect())
const cols = computed(() => {
  const n = items.value.length
  if (!n || !boxW.value) return null
  const max = Math.max(1, Math.floor((boxW.value + 4) / 154))
  const rows = Math.ceil(n / max)
  return Math.ceil(n / rows)
})
const isHidden = (d) => (state.settings.strip.hidden || []).includes(d.id) || state.settings.devices.hidden.includes(d.obj)
function toggleHide(d) {
  const h = state.settings.strip.hidden
  if (isHidden(d)) {
    // hidden through either list: show again
    const i = h.indexOf(d.id); if (i >= 0) h.splice(i, 1)
    const j = state.settings.devices.hidden.indexOf(d.obj); if (j >= 0) state.settings.devices.hidden.splice(j, 1)
  } else h.push(d.id)
}
const dragId = ref(null)
const renaming = ref(null)
function startRename(d) { renaming.value = { obj: d.obj, value: state.settings.devices.names?.[d.obj] || '' } }
function saveRename() {
  const r = renaming.value
  if (!state.settings.devices.names) state.settings.devices.names = {}
  if (r.value.trim()) state.settings.devices.names[r.obj] = r.value.trim()
  else delete state.settings.devices.names[r.obj]
  renaming.value = null
}
// Reordering in Customize: the tile follows the pointer, the tile under it lights up, and on release the two
// swap places, so every other tile stays where it was. Nothing moves in the DOM while dragging, so the browser
// cannot lose the pointer half way. Any tile can go anywhere.
const dragPos = ref({ x: 0, y: 0 })
const overId = ref(null)
let dragStart = null, dragEl = null, slots = []
// where every tile sits when the drag starts (offset coords, untouched by the preview translations), so the
// target is found by slot and not by whatever element happens to be under the pointer while tiles slide
const slotOf = (id) => slots.find((x) => x.id === id)
const swapOff = ref({ x: 0, y: 0 })
const settle = ref(false) // on drop: no slide back, the reorder itself puts every tile where it was shown
function moveTo(id, targetId) {
  const ids = items.value.map((x) => x.id).concat(stripAll.value.map((x) => x.id).filter((i) => !items.value.some((y) => y.id === i)))
  const from = ids.indexOf(id), to = ids.indexOf(targetId)
  if (from < 0 || to < 0 || from === to) return
  ;[ids[from], ids[to]] = [ids[to], ids[from]]
  state.settings.strip.order = ids
}
const basePos = (el) => { const pr = el.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 }; return { x: pr.left + el.offsetLeft, y: pr.top + el.offsetTop } }
function pDown(d, e) {
  if (!state.editDash || e.button !== 0 || e.target.closest('button, input, a')) return
  const el = e.currentTarget, b = basePos(el)
  dragEl = el
  dragStart = { x: e.clientX, y: e.clientY, id: d.id, ox: e.clientX - b.x, oy: e.clientY - b.y }
  window.addEventListener('pointermove', pMove)
  window.addEventListener('pointerup', pUp)
  window.addEventListener('pointercancel', pUp)
  e.preventDefault()
}
function pMove(e) {
  if (!dragStart || !dragEl) return
  if (!dragId.value) { if (Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) < 6) return; dragId.value = dragStart.id }
  const b = basePos(dragEl)
  dragPos.value = { x: e.clientX - dragStart.ox - b.x, y: e.clientY - dragStart.oy - b.y }
  if (!slots.length) slots = [...dragEl.parentElement.children].filter((x) => x.classList?.contains('dc')).map((x) => ({ id: x.dataset.id, x: x.offsetLeft, y: x.offsetTop, w: x.offsetWidth, h: x.offsetHeight }))
  const pr = dragEl.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 }
  const px = e.clientX - pr.left, py = e.clientY - pr.top
  const hit = slots.find((x) => x.id !== dragId.value && px >= x.x && px < x.x + x.w && py >= x.y && py < x.y + x.h)
  overId.value = hit?.id || null
  // preview the swap: the target slides into the dragged tile's slot
  const me = slotOf(dragId.value)
  swapOff.value = hit && me ? { x: me.x - hit.x, y: me.y - hit.y } : { x: 0, y: 0 }
}
function pUp() {
  window.removeEventListener('pointermove', pMove); window.removeEventListener('pointerup', pUp); window.removeEventListener('pointercancel', pUp)
  if (dragId.value && overId.value) { settle.value = true; moveTo(dragId.value, overId.value); requestAnimationFrame(() => requestAnimationFrame(() => (settle.value = false))) }
  dragStart = null; dragEl = null; slots = []; dragId.value = null; overId.value = null; dragPos.value = { x: 0, y: 0 }; swapOff.value = { x: 0, y: 0 }
}
watch(() => state.editDash, (on) => { if (!on) pUp() })
const tgt = ref('')
function setT(d, v) { if (v === '' || v == null || isNaN(+v)) return; setHeater(d.obj, +v); open.value = null }
function tint(d) {
  if (d.kind === 'temp') return canTarget(d) ? 't-heat' : ''
  return { fan: 't-cool', pin: 't-light', led: 't-light', filament: 't-sense', spoolman: 't-spool' }[d.kind] || ''
}
const canTarget = (d) => (S('heaters').available_heaters || []).includes(d.obj) || d.obj.startsWith('temperature_fan ')
onMounted(() => document.addEventListener('click', close))
onBeforeUnmount(() => document.removeEventListener('click', close))
const popRight = ref(false) // pop-up opens to the left on tiles in the right half so it stays inside the page
function toggleOpen(id, e) { tgt.value = ''; if (e?.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); popRight.value = r.left + r.width / 2 > window.innerWidth / 2 } open.value = open.value === id ? null : id }

const pct = (v) => Math.round((v || 0) * 100)
function ledColor(id) {
  const c = S(id).color_data?.[0] || [0, 0, 0, 0]
  return c
}
function ledHex(id) {
  const [r, g, b, w = 0] = ledColor(id)
  const f = (x) => Math.round(Math.min(1, x + w) * 255).toString(16).padStart(2, '0')
  return '#' + f(r) + f(g) + f(b)
}
const ledOn = (id) => ledColor(id).some((x) => x > 0.001)
const lastColor = {}
function setLed(id, hex, white) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255
  lastColor[id] = hex
  const w = white != null ? ` WHITE=${white.toFixed(3)}` : ''
  gcode(`SET_LED LED=${shortName(id)} RED=${r.toFixed(3)} GREEN=${g.toFixed(3)} BLUE=${b.toFixed(3)}${w} SYNC=0 TRANSMIT=1`)
}
function ledToggle(id, on) {
  if (on) setLed(id, lastColor[id] || '#ffffff')
  else { lastColor[id] = ledHex(id); gcode(`SET_LED LED=${shortName(id)} RED=0 GREEN=0 BLUE=0 WHITE=0 SYNC=0 TRANSMIT=1`) }
}
const isPwm = (id) => {
  const s = S('configfile').settings?.[id.toLowerCase()]
  return !!s?.pwm
}
function setPin(id, v) { gcode(`SET_PIN PIN=${shortName(id)} VALUE=${v}`) }
const spool = computed(() => state.spoolman.spool)
const spoolUrl = computed(() => {
  let u = state.spoolman.server || ''
  u = u.replace(/\/\/(127\.0\.0\.1|localhost)/, '//' + (location.hostname || 'localhost'))
  return spool.value ? `${u}/spool/show/${spool.value.id}` : u
})
const SWATCH = ['#ffffff', '#ff3d7f', '#ff6b1a', '#f5c451', '#3dd68c', '#3da5ff', '#8b5cf6']
// how "full" a tile is, drawn as a level rising from the bottom in the panel style
function level(d) {
  const o = S(d.obj)
  let v = 0
  if (d.kind === 'temp') {
    const cur = o.temperature || 0
    const top = o.target > 0 ? o.target : (S('configfile').settings?.[d.obj.toLowerCase()]?.max_temp || 100)
    v = cur / top
  } else if (d.kind === 'fan') v = o.speed || 0
  else if (d.kind === 'pin') v = o.value > 0 ? (isPwm(d.obj) ? o.value : 1) : 0
  else if (d.kind === 'led') v = ledOn(d.obj) ? 1 : 0
  else if (d.kind === 'filament') v = o.filament_detected || (o.filament_detected === undefined && o.enabled !== false) ? 1 : 0
  else if (d.kind === 'spoolman' && spool.value) v = (spool.value.remaining_weight || 0) / (spool.value.initial_weight || spool.value.filament?.weight || 1000)
  return Math.max(0, Math.min(1, v || 0))
}
function sensorExtra(id) {
  const s = S(id)
  return Object.entries(s).filter(([k, v]) => typeof v !== 'object' && !['enabled', 'filament_detected'].includes(k)).slice(0, 2)
}
</script>
<template>
  <TransitionGroup tag="div" ref="box" class="ds" :class="{ editing: state.editDash, settle }" :style="cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : null" move-class="mv">
    <div v-for="(d, gi) in items" :key="d.id" class="dc" :class="[tint(d), { click: !state.editDash && (d.kind !== 'fan' || d.controllable), open: open === d.id, edit: state.editDash, hid: state.editDash && isHidden(d), drag: dragId === d.id, over: overId === d.id, wide: d.kind === 'temp' && canTarget(d), hot: d.kind === 'temp' && S(d.obj).target > 0 }]" :style="{ '--dx': dragId === d.id && state.editDash ? dragPos.x + 'px' : overId === d.id ? swapOff.x + 'px' : '0px', '--dy': dragId === d.id && state.editDash ? dragPos.y + 'px' : overId === d.id ? swapOff.y + 'px' : '0px', '--lvl': level(d), '--lc': d.kind === 'led' && ledOn(d.obj) ? ledHex(d.obj) : null }"
      :data-id="d.id" @pointerdown="pDown(d, $event)"
      @click.stop="state.editDash ? null : (d.kind === 'temp' && canTarget(d)) || (d.kind === 'fan' && d.controllable) || d.kind === 'led' || (d.kind === 'pin' && isPwm(d.obj)) ? toggleOpen(d.id, $event) : null">
      <div v-if="state.editDash" class="etools">
        <button v-if="d.kind !== 'spoolman'" class="btn clear ibtn sm" :aria-label="t('Rename card')" @click.stop="startRename(d)"><Icon name="pencil" :size="14" /></button>
        <button class="btn clear ibtn sm" :aria-label="isHidden(d) ? t('Show card') : t('Hide card')" @click.stop="toggleHide(d)"><Icon :name="isHidden(d) ? 'eyeoff' : 'eye'" :size="16" /></button>
      </div>
      <!-- TEMP -->
      <template v-if="d.kind === 'temp'">
        <div class="hd"><span class="lbl nm">{{ prettyName(d.obj) }}</span><span v-if="canTarget(d) && !state.editDash" class="mono tt" :class="{ on: S(d.obj).target > 0 }">{{ S(d.obj).target > 0 ? '→ ' + S(d.obj).target.toFixed(0) + '°' : t('off') }}</span></div>
        <div class="row" style="gap:4px;align-items:baseline"><span class="tbig">{{ S(d.obj).temperature != null ? S(d.obj).temperature.toFixed(1) : '--' }}</span><small class="mu" style="font-size:15px">°C</small></div>
        <div class="bar"><div :style="{ width: (S(d.obj).power != null ? S(d.obj).power * 100 : S(d.obj).speed != null ? S(d.obj).speed * 100 : 0) + '%', background: S(d.obj).target > 0 ? 'var(--heat)' : 'var(--mu2)' }"></div></div>
        <div v-if="open === d.id" class="pop card" :class="{ rt: popRight }" @click.stop>
          <span class="lbl">{{ t('{name} target', { name: prettyName(d.obj) }) }}</span>
          <div class="row"><input class="input mono grow" type="number" v-model="tgt" :placeholder="String(S(d.obj).target ?? 0)" @keydown.enter="setT(d, tgt)" :aria-label="t('Target temperature')" /><button class="btn acc" style="height:40px" @click="setT(d, tgt)">{{ t('Set') }}</button></div>
          <div class="seg"><button @click="setT(d, 0)">{{ t('Off') }}</button><button v-for="p in state.settings.presets.filter((p) => p.temps[d.obj])" :key="p.id" @click="setT(d, p.temps[d.obj])">{{ p.name }} {{ p.temps[d.obj] }}</button></div>
        </div>
      </template>
      <!-- FAN -->
      <template v-else-if="d.kind === 'fan'">
        <div class="hd"><span class="lbl nm">{{ prettyName(d.obj) }}</span><span v-if="d.auto" class="auto"><Icon name="lock" :size="11" :stroke="2.6" />{{ t('auto') }}</span></div>
        <div class="row" style="gap:10px"><Icon name="fan" :size="30" class="ki" :class="{ spin: S(d.obj).speed > 0 }" :style="{ animationDuration: (1.9 - 1.4 * (S(d.obj).speed || 0)) + 's' }" /><span class="big">{{ pct(S(d.obj).speed) }}<small>%</small></span>
          <span v-if="S(d.obj).temperature != null" class="mono mu" style="font-size:11px;margin-left:auto;text-align:right">{{ S(d.obj).temperature.toFixed(0) }}°<br />→{{ S(d.obj).target?.toFixed(0) }}°</span>
          <span v-else-if="S(d.obj).rpm" class="mono mu" style="font-size:11px;margin-left:auto">{{ Math.round(S(d.obj).rpm) }} rpm</span>
        </div>
        <div class="bar"><div :style="{ width: pct(S(d.obj).speed) + '%' }"></div></div>
        <div v-if="open === d.id" class="pop card" :class="{ rt: popRight }" @click.stop>
          <RangeSlider :label="prettyName(d.obj)" :model-value="pct(S(d.obj).speed)" :display="pct(S(d.obj).speed) + '%'" @commit="setFan(d.obj, $event)" />
          <div class="seg"><button v-for="v in [0, 25, 50, 75, 100]" :key="v" :class="{ on: pct(S(d.obj).speed) === v }" @click="setFan(d.obj, v)">{{ v ? v + '%' : t('Off') }}</button></div>
        </div>
      </template>
      <!-- OUTPUT PIN -->
      <template v-else-if="d.kind === 'pin'">
        <span class="lbl nm">{{ prettyName(d.obj) }}</span>
        <div class="row" style="justify-content:space-between"><Icon name="bulb" :size="30" :class="S(d.obj).value > 0 ? 'acc' : 'mu'" /><Toggle v-if="!isPwm(d.obj)" :model-value="S(d.obj).value > 0" :label="prettyName(d.obj)" @update:model-value="setPin(d.obj, $event ? 1 : 0)" /></div>
        <span class="mono sm">{{ S(d.obj).value > 0 ? t('ON') : t('OFF') }}<template v-if="isPwm(d.obj)"> · {{ pct(S(d.obj).value) }}%</template></span>
        <div v-if="open === d.id" class="pop card" :class="{ rt: popRight }" @click.stop>
          <RangeSlider :label="prettyName(d.obj)" :model-value="pct(S(d.obj).value)" :display="pct(S(d.obj).value) + '%'" @commit="setPin(d.obj, ($event / 100).toFixed(2))" />
        </div>
      </template>
      <!-- LED -->
      <template v-else-if="d.kind === 'led'">
        <span class="lbl nm">{{ prettyName(d.obj) }}</span>
        <div class="row" style="justify-content:space-between"><span class="sw" :style="{ background: ledOn(d.obj) ? ledHex(d.obj) : 'var(--s2)' }"></span><Toggle :model-value="ledOn(d.obj)" :label="prettyName(d.obj)" @update:model-value="ledToggle(d.obj, $event)" /></div>
        <span class="mono sm">{{ ledOn(d.obj) ? ledHex(d.obj).toUpperCase() : t('OFF') }}</span>
        <div v-if="open === d.id" class="pop card" :class="{ rt: popRight }" @click.stop>
          <span class="lbl">{{ t('Color') }}</span>
          <div class="row" style="flex-wrap:wrap"><button v-for="c in SWATCH" :key="c" class="swb" :style="{ background: c }" :aria-label="c" @click="setLed(d.obj, c)"></button></div>
          <label class="row"><input type="color" :value="ledHex(d.obj)" @change="setLed(d.obj, $event.target.value)" style="width:48px;height:36px;border:none;background:none;padding:0" /><span class="mu" style="font-size:13px">{{ t('Custom') }}</span></label>
          <button class="btn" @click="ledToggle(d.obj, false)">{{ t('Turn off') }}</button>
        </div>
      </template>
      <!-- FILAMENT SENSOR -->
      <template v-else-if="d.kind === 'filament'">
        <div class="hd"><span class="lbl nm">{{ prettyName(d.obj) }}</span><Toggle v-if="!d.custom && S(d.obj).enabled !== undefined" :model-value="!!S(d.obj).enabled" :label="t('Enable sensor')" @update:model-value="gcode(`SET_FILAMENT_SENSOR SENSOR=${shortName(d.obj)} ENABLE=${$event ? 1 : 0}`)" /></div>
        <div class="row" style="gap:10px" v-if="S(d.obj).filament_detected !== undefined">
          <Icon name="sensor" :size="30" :stroke="2.4" :style="{ color: S(d.obj).filament_detected ? 'var(--ok)' : 'var(--dg)' }" />
          <b style="font-size:17px" :style="{ color: S(d.obj).filament_detected ? 'var(--ok)' : 'var(--dg)' }">{{ S(d.obj).filament_detected ? t('Detected') : t('Empty') }}</b>
        </div>
        <div v-else class="row" style="gap:10px"><Icon name="sensor" :size="30" :stroke="2.4" class="ki" /><b style="font-size:15px">{{ S(d.obj).enabled === false ? t('Disabled') : t('Active') }}</b></div>
        <span class="mono sm mu">{{ S(d.obj).enabled === false ? t('disabled') : sensorExtra(d.obj).map(([k, v]) => `${k}: ${typeof v === 'number' ? +v.toFixed(2) : v}`).join(' · ') || t('enabled') }}</span>
      </template>
      <!-- SPOOLMAN -->
      <template v-else-if="d.kind === 'spoolman'">
        <a class="spl" :href="spoolUrl" target="_blank" rel="noopener" @click.stop>
          <div class="hd"><span class="lbl">Spoolman</span><Icon name="ext" :size="14" :stroke="2.4" class="mu" /></div>
          <div v-if="spool" class="row" style="gap:10px;min-width:0">
            <span class="spool" :style="{ background: '#' + (spool.filament?.color_hex || '333') }"></span>
            <div class="col" style="gap:0;min-width:0"><b class="ell" style="font-size:14px">{{ spool.filament?.name || spool.filament?.material }}</b><span class="mono mu" style="font-size:11px">{{ spool.filament?.material }} · #{{ spool.id }}</span></div>
          </div>
          <div v-else class="mu" style="font-size:13px">{{ t('No active spool') }}</div>
          <div v-if="spool" class="row"><div class="bar grow"><div :style="{ width: Math.min(100, (spool.remaining_weight / (spool.initial_weight || spool.filament?.weight || 1000)) * 100) + '%' }"></div></div><b class="mono" style="font-size:12px">{{ Math.round(spool.remaining_weight || 0) }} g</b></div>
        </a>
      </template>
    </div>
  </TransitionGroup>
  <Modal v-if="renaming" :title="t('Card name')" @close="renaming = null">
    <input v-model="renaming.value" class="input" :placeholder="prettyName(renaming.obj)" :aria-label="t('Card name')" @keydown.enter="saveRename" />
    <span class="mu" style="font-size:12px">{{ t('Empty uses the name from printer.cfg ({name}).', { name: renaming.obj }) }}</span>
    <template #foot><button class="btn lg" @click="renaming = null">{{ t('Cancel') }}</button><button class="btn lg acc" @click="saveRename">{{ t('Save') }}</button></template>
  </Modal>
</template>
<style scoped>
.ds { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; flex: 1; min-width: 0; }
.dc { position: relative; background: var(--s1); border: 1px solid transparent; border-radius: var(--r); height: 96px; padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.dc.click { cursor: pointer; }
.dc.wide { }
.dc.edit .hd { padding-right: 56px; }
.dc.edit { cursor: grab; border-style: dashed; border-color: var(--mu2); }
.dc.hid { opacity: .35; }
.dc.drag { translate: var(--dx) var(--dy); opacity: .85; border-color: var(--ac); z-index: 30; box-shadow: 0 12px 30px rgba(0,0,0,.45); cursor: grabbing; }
.mv { transition: transform .25s ease; }
.ds.editing .dc:not(.drag) { translate: var(--dx) var(--dy); transition: translate .18s ease; }
.ds.settle .dc { transition: none; }
.dc.over { outline: 2px solid var(--ac); outline-offset: -2px; z-index: 20; }
.ds.editing .dc { cursor: grab; touch-action: none; user-select: none; }
.dc.hot { box-shadow: inset 0 0 0 1px var(--heat-ln); }
.dc.edit .spl { pointer-events: none; }
.etools { position: absolute; top: 4px; right: 4px; z-index: 2; display: flex; gap: 2px; }
.etools .btn { width: 26px; height: 26px; background: var(--s1); }
.tbig { font-size: 26px; font-weight: 700; line-height: 1; }
.tt { font-size: 12px; color: var(--mu); flex-shrink: 0; }
.tt.on { color: var(--heat); font-weight: 600; }
.dc.click:hover, .dc.open { border-color: var(--k, var(--mu2)); }
.dc.open { z-index: 60; }
.pop .seg button { padding: 0 6px; }
.hd { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; }
.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.auto { display: flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 500; color: var(--mu); flex-shrink: 0; }
.ki { color: var(--k, var(--mu)); }
.dc .bar > div { background: var(--k, var(--mu)); }
.dc .bar { background: rgba(255,255,255,.06); }
.mu { color: var(--mu); }
.big { font-size: 24px; font-weight: 700; }
.big small { font-size: 15px; color: var(--mu); }
.sm { font-size: 12px; font-weight: 700; }
.sw { width: 34px; height: 34px; border-radius: 17px; border: 3px solid var(--s2); outline: 2px solid var(--bd); }
.swb { width: 30px; height: 30px; border-radius: 15px; border: 2px solid var(--bd); }
.pop.rt { left: auto; right: 0; }
.pop { position: absolute; top: 102px; left: 0; width: 300px; z-index: 40; box-shadow: 0 12px 40px rgba(0,0,0,.5); cursor: default; }
.spl { display: flex; flex-direction: column; justify-content: space-between; height: 100%; color: var(--tx); text-decoration: none; gap: 4px; }
.spool { width: 34px; height: 34px; flex-shrink: 0; border-radius: 17px; border: 6px solid #3a3a3a; }
.ell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
