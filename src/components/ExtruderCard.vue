<script setup>
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import NumField from './NumField.vue'
import { S, gcode, isPrinting } from '../store'
const len = ref(25)
const feed = ref(5)
const ext = computed(() => S('toolhead').extruder || 'extruder')
const e = computed(() => S(ext.value))
function move(dir) {
  gcode(`SAVE_GCODE_STATE NAME=_ui_ext\nM83\nG1 E${dir * len.value} F${feed.value * 60}\nRESTORE_GCODE_STATE NAME=_ui_ext`)
}
</script>
<template>
  <section class="card">
    <div class="card-h">
      <h2>Extruder</h2>
      <span class="chip" :style="{ color: e.can_extrude ? 'var(--ok)' : 'var(--wn)' }"><i></i>{{ e.temperature?.toFixed(1) }}° / {{ e.target?.toFixed(0) }}°</span>
    </div>
    <div class="g2">
      <div class="col" style="gap:6px"><span class="lbl">Length (mm)</span><div class="seg"><button v-for="v in [5, 10, 25, 50, 100]" :key="v" :class="{ on: len === v }" @click="len = v">{{ v }}</button></div></div>
      <div class="col" style="gap:6px"><span class="lbl">Feedrate (mm/s)</span><div class="seg"><button v-for="v in [1, 2, 5, 10]" :key="v" :class="{ on: feed === v }" @click="feed = v">{{ v }}</button></div></div>
      <NumField label="Pressure advance" :model-value="e.pressure_advance" :step="0.005" :min="0" :decimals="4" @commit="gcode(`SET_PRESSURE_ADVANCE ADVANCE=${$event}`)" />
      <NumField label="Smooth time" unit="s" :model-value="e.smooth_time" :step="0.005" :min="0" :max="0.2" :decimals="3" @commit="gcode(`SET_PRESSURE_ADVANCE SMOOTH_TIME=${$event}`)" />
    </div>
    <div v-if="!e.can_extrude" class="mu" style="font-size:12px">Heat the nozzle above min_extrude_temp to extrude.</div>
    <div class="g2">
      <button class="btn lg" style="height:48px;font-size:15px" :disabled="!e.can_extrude || isPrinting" @click="move(-1)"><Icon name="unload" :stroke="2.4" style="color:var(--ac)" />Retract</button>
      <button class="btn lg acc" style="height:48px;font-size:15px" :disabled="!e.can_extrude || isPrinting" @click="move(1)"><Icon name="load" :stroke="2.4" />Extrude</button>
    </div>
  </section>
</template>
<style scoped>
.g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.mu { color: var(--mu); }
</style>
