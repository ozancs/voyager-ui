<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import NumField from './NumField.vue'
import { S, gcode } from '../store'
const gm = computed(() => S('gcode_move'))
const speed = computed(() => Math.round((gm.value.speed_factor ?? 1) * 100))
const flow = computed(() => Math.round((gm.value.extrude_factor ?? 1) * 100))
function setSpeed(v) { v = Math.max(1, Math.min(500, Math.round(v))); gcode(`M220 S${v}`) }
function setFlow(v) { v = Math.max(1, Math.min(300, Math.round(v))); gcode(`M221 S${v}`) }
const th = computed(() => S('toolhead'))
const cfg = computed(() => S('configfile').settings?.printer || {})
const hasMcr = computed(() => th.value.minimum_cruise_ratio !== undefined)
function reset() {
  const c = cfg.value
  let s = `SET_VELOCITY_LIMIT VELOCITY=${c.max_velocity} ACCEL=${c.max_accel} SQUARE_CORNER_VELOCITY=${c.square_corner_velocity ?? 5}`
  if (hasMcr.value && c.minimum_cruise_ratio != null) s += ` MINIMUM_CRUISE_RATIO=${c.minimum_cruise_ratio}`
  gcode(s)
}
</script>
<template>
  <section class="card">
    <div class="card-h"><h2>Machine Limits</h2><button class="btn" @click="reset"><Icon name="refresh" :size="16" :stroke="2.4" />Reset</button></div>
    <div class="g2">
      <NumField label="Velocity" unit="mm/s" :model-value="th.max_velocity" :step="10" :min="1" @commit="gcode(`SET_VELOCITY_LIMIT VELOCITY=${$event}`)" />
      <NumField label="Acceleration" unit="mm/s²" :model-value="th.max_accel" :step="500" :min="1" @commit="gcode(`SET_VELOCITY_LIMIT ACCEL=${$event}`)" />
      <NumField label="Square corner vel." unit="mm/s" :model-value="th.square_corner_velocity" :step="1" :min="0" :decimals="1" @commit="gcode(`SET_VELOCITY_LIMIT SQUARE_CORNER_VELOCITY=${$event}`)" />
      <NumField v-if="hasMcr" label="Min cruise ratio" :model-value="th.minimum_cruise_ratio" :step="0.05" :min="0" :max="0.99" :decimals="2" @commit="gcode(`SET_VELOCITY_LIMIT MINIMUM_CRUISE_RATIO=${$event}`)" />
      <NumField v-else label="Accel to decel" unit="mm/s²" :model-value="th.max_accel_to_decel" :step="500" :min="1" @commit="gcode(`SET_VELOCITY_LIMIT ACCEL_TO_DECEL=${$event}`)" />
    </div>
    <div class="g2">
      <div class="fac">
        <div class="row" style="justify-content:space-between"><span class="nl">Speed factor</span><label class="nb"><input class="mono" type="number" :value="speed" @change="setSpeed(+$event.target.value)" aria-label="Speed factor" />%</label></div>
        <div class="row"><button class="btn clear ibtn sm" aria-label="Speed -5%" @click="setSpeed(speed - 5)"><Icon name="minus" :size="16" :stroke="2.6" /></button><input class="rng" type="range" min="10" max="300" step="5" :value="speed" :style="{ '--p': ((speed - 10) / 290) * 100 + '%' }" @change="setSpeed(+$event.target.value)" aria-label="Speed factor" /><button class="btn clear ibtn sm" aria-label="Speed +5%" @click="setSpeed(speed + 5)"><Icon name="plus" :size="16" :stroke="2.6" /></button></div>
      </div>
      <div class="fac">
        <div class="row" style="justify-content:space-between"><span class="nl">Flow</span><label class="nb"><input class="mono" type="number" :value="flow" @change="setFlow(+$event.target.value)" aria-label="Flow" />%</label></div>
        <div class="row"><button class="btn clear ibtn sm" aria-label="Flow -1%" @click="setFlow(flow - 1)"><Icon name="minus" :size="16" :stroke="2.6" /></button><input class="rng" type="range" min="50" max="150" :value="flow" :style="{ '--p': ((flow - 50) / 100) * 100 + '%' }" @change="setFlow(+$event.target.value)" aria-label="Flow" /><button class="btn clear ibtn sm" aria-label="Flow +1%" @click="setFlow(flow + 1)"><Icon name="plus" :size="16" :stroke="2.6" /></button></div>
      </div>
    </div>
    <span class="mu" style="font-size:12px">Live values. Klipper resets them to printer.cfg on restart.</span>
  </section>
</template>
<style scoped>
.g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.mu { color: var(--mu); }
.card { overflow: auto; }
.fac { display: flex; flex-direction: column; gap: 6px; }
.nl { font-size: 13px; font-weight: 700; }
.nb { display: flex; align-items: center; gap: 4px; font-family: var(--fm); font-size: 13px; color: var(--mu); }
.nb input { width: 64px; height: 30px; text-align: right; background: var(--s2); border: 1px solid var(--bd); border-radius: 8px; padding: 0 8px; font-size: 14px; font-weight: 700; outline: none; -moz-appearance: textfield; }
.nb input::-webkit-inner-spin-button { -webkit-appearance: none; }
.nb input:focus { border-color: var(--ac); }
</style>
