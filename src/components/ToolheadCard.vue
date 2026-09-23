<script setup>
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { state, S, gcode, isPrinting, toast } from '../store'
const th = computed(() => S('toolhead'))
const gm = computed(() => S('gcode_move'))
const homed = computed(() => th.value.homed_axes || '')
const pos = computed(() => gm.value.gcode_position || th.value.position || [0, 0, 0, 0])
const zoff = computed(() => gm.value.homing_origin?.[2] ?? 0)
const can = (a) => homed.value.includes(a.toLowerCase())
const hasProbe = computed(() => state.objects.some((o) => o === 'probe' || o.startsWith('probe_eddy') || o === 'bltouch' || o.startsWith('beacon') || o.startsWith('cartographer')))
const AX = [
  { a: 'X', steps: [100, 10, 1] },
  { a: 'Y', steps: [100, 10, 1] },
  { a: 'Z', steps: [25, 1, 0.1] },
]
function jog(axis, d) {
  const i = 'XYZ'.indexOf(axis)
  const cur = th.value.position?.[i] ?? 0
  const lo = th.value.axis_minimum?.[i] ?? -Infinity, hi = th.value.axis_maximum?.[i] ?? Infinity
  const target = Math.min(hi, Math.max(lo, cur + d))
  const dd = Math.round((target - cur) * 1000) / 1000
  if (!dd) { toast(`${axis} is at its limit`); return }
  const f = axis === 'Z' ? 900 : 6000
  gcode(`SAVE_GCODE_STATE NAME=_ui_jog\nG91\nG1 ${axis}${dd} F${f}\nRESTORE_GCODE_STATE NAME=_ui_jog`)
}
// editable position fields: keep showing the current value while editing
const edit = ref({})
function onFocus(a, i, e) { edit.value[a] = (pos.value[i] ?? 0).toFixed(a === 'Z' ? 3 : 2); requestAnimationFrame(() => e.target.select()) }
function moveTo(axis, e) {
  const v = parseFloat(String(e.target.value).replace(',', '.'))
  edit.value[axis] = undefined
  e.target.blur()
  if (isNaN(v)) return
  const i = 'XYZ'.indexOf(axis)
  const lo = th.value.axis_minimum?.[i], hi = th.value.axis_maximum?.[i]
  if ((lo != null && v < lo) || (hi != null && v > hi)) { toast(`${axis}${v} is outside ${lo}..${hi}`, 'error'); return }
  gcode(`SAVE_GCODE_STATE NAME=_ui_move\nG90\nG1 ${axis}${v} F${axis === 'Z' ? 900 : 6000}\nRESTORE_GCODE_STATE NAME=_ui_move`)
}
const speed = computed(() => Math.round((gm.value.speed_factor ?? 1) * 100))
const flow = computed(() => Math.round((gm.value.extrude_factor ?? 1) * 100))
function setSpeed(v) { v = Math.max(1, Math.min(500, Math.round(v))); gcode(`M220 S${v}`) }
function setFlow(v) { v = Math.max(1, Math.min(300, Math.round(v))); gcode(`M221 S${v}`) }
const dstep = ref(10)
const zdir = computed(() => (state.settings.invertZ ? -1 : 1))
function saveZ() { gcode(hasProbe.value ? 'Z_OFFSET_APPLY_PROBE' : 'Z_OFFSET_APPLY_ENDSTOP') }
</script>
<template>
  <section class="card">
    <div class="card-h">
      <h2>Toolhead</h2>
      <div class="acts">
        <button class="btn acc" :disabled="isPrinting" @click="gcode('G28')"><Icon name="home" :size="16" :stroke="2.4" />Home All</button>
        <button class="btn" :disabled="isPrinting" @click="gcode('Z_TILT_ADJUST')"><Icon name="tilt" :size="16" :stroke="2.4" />Z Tilt</button>
        <button class="btn" :disabled="isPrinting" @click="gcode('M84')"><Icon name="power" :size="16" :stroke="2.4" />Motors off</button>
      </div>
    </div>
    <div class="body">
      <div class="grp pos3">
        <div v-for="(a, i) in ['X', 'Y', 'Z']" :key="a" class="pos" :data-tip="!can(a) ? a + ' must be homed first' : isPrinting ? 'Not while printing' : 'Type a position and press Enter'">
          <span class="ax">{{ a }}<i :style="{ background: can(a) ? 'var(--ok)' : 'var(--dg)' }"></i></span>
          <input class="mono pin" :value="edit[a] ?? (pos[i] ?? 0).toFixed(a === 'Z' ? 3 : 2)" :disabled="!can(a) || isPrinting" :aria-label="'Move ' + a + ' to position'"
            @focus="onFocus(a, i, $event)" @input="edit[a] = $event.target.value" @keydown.enter="moveTo(a, $event)" @keydown.esc="edit[a] = undefined; $event.target.blur()" @blur="edit[a] = undefined" />
        </div>
      </div>
      <div class="grp jog">
        <div v-for="r in AX" :key="r.a" class="jr" :data-tip="!can(r.a) ? r.a + ' must be homed first' : ''">
          <button v-for="st in r.steps" :key="'-' + st" class="jb" :disabled="!can(r.a) || isPrinting" @click="jog(r.a, -st)">−{{ st }}</button>
          <button class="axb" :class="{ homed: can(r.a) }" :aria-label="'Home ' + r.a" :disabled="isPrinting" @click="gcode('G28 ' + r.a)">{{ r.a }}</button>
          <button v-for="st in [...r.steps].reverse()" :key="'+' + st" class="jb" :disabled="!can(r.a) || isPrinting" @click="jog(r.a, st)">+{{ st }}</button>
        </div>
      </div>
      <div class="grp dpad" :data-tip="!can('X') || !can('Y') ? 'Home X and Y first' : ''">
        <span></span><button class="jb" aria-label="Y+" :disabled="!can('Y') || isPrinting" @click="jog('Y', dstep)"><Icon name="up" :stroke="2.6" /></button><span></span>
        <button class="jb" aria-label="X-" :disabled="!can('X') || isPrinting" @click="jog('X', -dstep)"><Icon name="left" :stroke="2.6" /></button>
        <button class="axb homed" aria-label="Home X Y" :disabled="isPrinting" @click="gcode('G28 X Y')"><Icon name="home" :size="18" :stroke="2.6" /></button>
        <button class="jb" aria-label="X+" :disabled="!can('X') || isPrinting" @click="jog('X', dstep)"><Icon name="right" :stroke="2.6" /></button>
        <span></span><button class="jb" aria-label="Y-" :disabled="!can('Y') || isPrinting" @click="jog('Y', -dstep)"><Icon name="down" :stroke="2.6" /></button><span></span>
      </div>
      <div class="grp zcol" :data-tip="!can('Z') ? 'Z must be homed first' : ''">
        <button class="jb" :aria-label="state.settings.invertZ ? 'Bed up (Z-' + dstep + ')' : 'Z+' + dstep" :disabled="!can('Z') || isPrinting" @click="jog('Z', zdir * Math.min(dstep, 25))"><Icon name="up" :stroke="2.6" /></button>
        <button class="axb" :class="{ homed: can('Z') }" aria-label="Home Z" :disabled="isPrinting" @click="gcode('G28 Z')">Z</button>
        <button class="jb" :aria-label="state.settings.invertZ ? 'Bed down (Z+' + dstep + ')' : 'Z-' + dstep" :disabled="!can('Z') || isPrinting" @click="jog('Z', -zdir * Math.min(dstep, 25))"><Icon name="down" :stroke="2.6" /></button>
      </div>
      <div class="steps" role="group" aria-label="D-pad step (mm)">
        <button v-for="v in [100, 50, 10, 1, 0.1]" :key="v" :class="{ on: dstep === v }" :aria-label="'Step ' + v + ' mm'" @click="dstep = v">{{ v }}</button>
      </div>
      <div class="grp zo">
        <div class="zh">
          <span class="lbl"><Icon name="layers" :size="14" style="vertical-align:-2px" /> Z-Offset <b class="mono" style="color:var(--tx);font-size:14px">{{ zoff.toFixed(3) }}</b></span>
          <div class="row" style="gap:4px"><button class="btn clear" :disabled="!zoff" @click="gcode('SET_GCODE_OFFSET Z=0 MOVE=1')">Clear</button><button class="btn clear" style="color:var(--ac)" :disabled="!zoff || isPrinting" aria-label="Save z offset to config" @click="saveZ">Save</button></div>
        </div>
        <div class="zr"><button v-for="z in [0.005, 0.01, 0.025, 0.05]" :key="'u' + z" class="jb" @click="gcode(`SET_GCODE_OFFSET Z_ADJUST=${z} MOVE=1`)"><Icon name="up" :size="12" :stroke="2.6" />{{ z }}</button></div>
        <div class="zr"><button v-for="z in [0.005, 0.01, 0.025, 0.05]" :key="'d' + z" class="jb" @click="gcode(`SET_GCODE_OFFSET Z_ADJUST=-${z} MOVE=1`)"><Icon name="down" :size="12" :stroke="2.6" />{{ z }}</button></div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.card { overflow: auto; }
.body { --h: 44px; --g: 8px; display: flex; flex-wrap: wrap; gap: 16px 20px; align-items: flex-start; }
.grp { height: calc(var(--h) * 3 + var(--g) * 2); display: grid; gap: var(--g); grid-template-rows: repeat(3, var(--h)); }
.pos3 { width: 190px; }
.pos { display: flex; align-items: center; justify-content: space-between; padding: 0 8px 0 14px; background: var(--s2); border-radius: 10px; }
.ax { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 800; color: var(--mu); }
.ax i { width: 7px; height: 7px; border-radius: 4px; }
.pin { width: 118px; text-align: right; background: transparent; border: 1px solid transparent; border-radius: 6px; font-size: 21px; font-weight: 700; padding: 2px 6px; outline: none; }
.pin:hover:not(:disabled) { border-color: var(--bd); }
.pin:focus { border-color: var(--ac); background: var(--bg); }
.pin:disabled { color: var(--tx); opacity: 1; pointer-events: none; }
.jog { flex: 1 1 380px; max-width: 480px; }
.jr { display: grid; grid-template-columns: repeat(3, 1fr) 52px repeat(3, 1fr); gap: 4px; }
.jb { height: 100%; min-width: 0; background: var(--s2); border: 1px solid transparent; border-radius: 8px; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; display: flex; align-items: center; justify-content: center; gap: 3px; }
.jb:hover:not(:disabled) { background: var(--s3); }
.jb:disabled, .axb:disabled { pointer-events: none; }
.axb { height: 100%; border-radius: 8px; border: none; background: var(--s3); color: var(--mu); font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.axb.homed { background: var(--cool-bg); color: var(--cool); box-shadow: inset 0 0 0 1px var(--cool-ln); }
.dpad { grid-template-columns: repeat(3, var(--h)); }
.zcol { grid-template-columns: var(--h); }
.steps { height: calc(var(--h) * 3 + var(--g) * 2); width: 52px; display: flex; flex-direction: column; gap: 4px; margin-left: -8px; }
.steps button { flex: 1; min-height: 0; background: var(--s2); border: none; border-radius: 6px; color: var(--mu); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.steps button:hover { color: var(--tx); }
.steps button.on { background: var(--s3); color: var(--tx); box-shadow: inset 3px 0 0 var(--ac); }
.zo { flex: 1 1 280px; max-width: 380px; }
.zh { display: flex; align-items: center; justify-content: space-between; }
.zr { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.zr .jb { font-size: 12px; }
</style>
