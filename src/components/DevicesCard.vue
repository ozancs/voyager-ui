<script setup>
// Fans, output pins, LEDs and filament sensors as a list (Mainsail's "Miscellaneous" panel).
import { computed, reactive } from 'vue';
import Rng from './Rng.vue';
import Icon from './Icon.vue';
import Toggle from './Toggle.vue';
import { state, S, devices, prettyName, shortName, setFan, gcode } from '../store';
import { t } from '../i18n';

const list = computed(() =>
  devices.value.filter((d) => d.kind !== 'spoolman' && !state.settings.devices.hidden.includes(d.id)),
);
const live = reactive({}); // value under the thumb while a slider is being dragged
const pct = (v) => Math.round((v || 0) * 100);
const cfg = (id) => S('configfile').settings?.[id.toLowerCase()] || {};
let tm = {};
function later(id, fn) {
  clearTimeout(tm[id]);
  tm[id] = setTimeout(fn, 250);
}
function fan(d, v) {
  later(d.id, () => setFan(d.id, v));
}
function pin(d, v) {
  const sc = cfg(d.id).scale || 1;
  later(d.id, () => gcode(`SET_PIN PIN=${shortName(d.id)} VALUE=${((v / 100) * sc).toFixed(3)}`));
}
const pinVal = (d) => Math.round(((S(d.id).value || 0) / (cfg(d.id).scale || 1)) * 100);
const ledOn = (id) => (S(id).color_data?.[0] || []).some((x) => x > 0.001);
function led(id, on) {
  gcode(`SET_LED LED=${shortName(id)} RED=${on ? 1 : 0} GREEN=${on ? 1 : 0} BLUE=${on ? 1 : 0} SYNC=0 TRANSMIT=1`);
}
function sensor(id, on) {
  gcode(`SET_FILAMENT_SENSOR SENSOR=${shortName(id)} ENABLE=${on ? 1 : 0}`);
}
const ICON = { fan: 'fan', pin: 'bulb', led: 'bulb', filament: 'sensor' };
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>{{ t('Devices') }}</h2>
    </div>
    <div class="list">
      <div v-for="d in list" :key="d.id" class="dv">
        <Icon :name="ICON[d.kind]" :size="18" class="ic" :class="d.kind" />
        <span class="nm">{{ prettyName(d.id) }}</span>
        <template v-if="d.kind === 'fan'">
          <Rng
            v-if="d.controllable"
            :value="pct(S(d.id).speed)"
            :label="prettyName(d.id)"
            @input="fan(d, $event)"
            @live="live[d.id] = $event"
          />
          <span v-else class="grow mu sm">{{ t('auto') }}</span>
          <b class="mono v">{{ live[d.id] ?? pct(S(d.id).speed) }}%</b>
        </template>
        <template v-else-if="d.kind === 'pin'">
          <template v-if="cfg(d.id).pwm">
            <Rng :value="pinVal(d)" :label="prettyName(d.id)" @input="pin(d, $event)" @live="live[d.id] = $event" />
            <b class="mono v">{{ live[d.id] ?? pinVal(d) }}%</b>
          </template>
          <template v-else
            ><span class="grow"></span
            ><Toggle
              :model-value="!!S(d.id).value"
              :label="prettyName(d.id)"
              @update:model-value="(v) => pin(d, v ? 100 : 0)"
          /></template>
        </template>
        <template v-else-if="d.kind === 'led'"
          ><span class="grow"></span
          ><Toggle :model-value="ledOn(d.id)" :label="prettyName(d.id)" @update:model-value="(v) => led(d.id, v)"
        /></template>
        <template v-else-if="d.kind === 'filament'">
          <span class="grow sm" :style="{ color: S(d.id).filament_detected ? null : 'var(--wn)' }">{{
            S(d.id).filament_detected ? t('Detected') : t('Empty')
          }}</span>
          <Toggle
            :model-value="!!S(d.id).enabled"
            :label="prettyName(d.id)"
            @update:model-value="(v) => sensor(d.id, v)"
          />
        </template>
      </div>
      <div v-if="!list.length" class="empty">{{ t('No fans, pins or LEDs found') }}</div>
    </div>
  </section>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
  min-height: 0;
  flex: 1;
}
.dv {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 42px;
  padding: 0 4px;
  border-bottom: 1px solid var(--bd);
}
.dv:last-child {
  border-bottom: none;
}
.ic {
  flex-shrink: 0;
  color: var(--mu);
}

.nm {
  width: 36%;
  min-width: 90px;
  font-weight: 600;
  font-size: 13.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rng {
  flex: 1;
  min-width: 60px;
}
.v {
  width: 44px;
  text-align: right;
  font-size: 13px;
}
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12.5px;
}
</style>
