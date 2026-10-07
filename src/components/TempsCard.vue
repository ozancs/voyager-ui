<script setup>
// Temperature table: current, target and power for heaters and sensors. Targets can be typed in,
// presets and cooldown are in the header.
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import SensorPicker from './SensorPicker.vue';
import Popover from './Popover.vue';
import { state, sensors, setHeater, applyPreset, gcode, allPresets, isPrinting } from '../store';
import { go } from '../router';
import { t } from '../i18n';
import { sensorColor, heatColor } from '../sensorStyle';
const colorOf = (i, name) => sensorColor(state.settings.sensorColors, name, i);
const showPresets = ref(false);
const presetBtn = ref(null);
const edit = ref({});
const typed = {}; // only a typed value is sent, and only on Enter: Esc, Tab or a click elsewhere drop it
function commitTarget(s, e) {
  const v = e.target.value;
  edit.value[s.name] = undefined;
  if (!typed[s.name]) return;
  typed[s.name] = false;
  const n = Number(v);
  if (v !== '' && Number.isFinite(n) && n !== s.target) setHeater(s.name, n);
}
const presets = allPresets;
</script>
<template>
  <section class="card temps">
    <div class="card-h">
      <h2>{{ t('Temperatures') }}</h2>
      <div class="acts">
        <SensorPicker />
        <div>
          <button ref="presetBtn" class="btn" @click.stop="showPresets = !showPresets">
            <Icon name="flame" :size="16" :stroke="2.4" />{{ t('Presets') }}
          </button>
          <Popover v-if="showPresets" :anchor="presetBtn" :width="260" @close="showPresets = false">
            <button
              v-for="p in presets"
              :key="p.id"
              class="btn clear"
              style="justify-content: space-between; height: 40px; color: var(--tx)"
              @click="
                applyPreset(p);
                showPresets = false;
              "
            >
              <b
                ><Icon v-if="p.spool" name="spool" :size="14" style="margin-right: 6px; vertical-align: -2px" />{{
                  p.name
                }}</b
              ><span class="mono mu" style="font-size: 12px">{{
                Object.values(p.temps)
                  .filter((v) => v)
                  .join(' / ')
              }}</span>
            </button>
            <button
              class="btn clear"
              style="height: 36px; justify-content: flex-start"
              @click="state.settingsOpen = 'presets'"
            >
              <Icon name="pencil" :size="14" />{{ t('Edit presets') }}
            </button>
          </Popover>
        </div>
        <button
          class="btn out"
          :disabled="isPrinting"
          :data-tip="isPrinting ? t('Not while printing') : null"
          @click="gcode('TURN_OFF_HEATERS')"
        >
          <Icon name="fan" :size="16" :stroke="2.4" />{{ t('Cooldown') }}
        </button>
      </div>
    </div>
    <div data-fit style="overflow: auto; min-height: 0">
      <table class="tt">
        <thead>
          <tr>
            <th>{{ t('Heater') }}</th>
            <th>{{ t('Actual') }}</th>
            <th>{{ t('Target') }}</th>
            <th>{{ t('Power') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, i) in sensors" :key="s.name">
            <td class="nm"><i :style="{ background: colorOf(i, s.name) }"></i>{{ s.label }}</td>
            <td class="mono v" :style="{ color: heatColor(s.temperature) }">
              {{ s.temperature != null ? s.temperature.toFixed(1) + '°' : '--' }}
            </td>
            <td>
              <input
                v-if="s.isHeater || s.isTempFan"
                class="tg mono"
                :class="{ on: s.target > 0 }"
                type="number"
                :value="edit[s.name] ?? s.target?.toFixed(0)"
                @focus="
                  edit[s.name] = s.target?.toFixed(0);
                  typed[s.name] = false;
                "
                @input="
                  edit[s.name] = $event.target.value;
                  typed[s.name] = true;
                "
                @keydown.enter="
                  commitTarget(s, $event);
                  $event.target.blur();
                "
                @keydown.esc.stop="$event.target.blur()"
                @blur="edit[s.name] = undefined"
                :aria-label="t('{name} target', { name: s.label })"
              />
            </td>
            <td class="mono mu">
              {{
                s.power != null
                  ? Math.round(s.power * 100) + '%'
                  : s.speed != null
                    ? t('fan {n}%', { n: Math.round(s.speed * 100) })
                    : ''
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
<style scoped>
.tt {
  width: 100%;
  border-collapse: collapse;
}
.tt th {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--mu2);
  text-align: left;
  padding: 0 0 6px;
}
.tt td {
  padding: 5px 0;
  border-bottom: 1px solid var(--bd);
}
.tt tbody tr:last-child td {
  border-bottom: 0;
}
.nm {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}
.nm i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 5px;
  margin-right: 8px;
}
.v {
  font-size: 16px;
  font-weight: 700;
}
.tg {
  width: 76px;
  height: 30px;
  background: var(--s2);
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 0 10px;
  font-size: 14px;
  font-weight: 700;
  outline: none;
  -moz-appearance: textfield;
}
.tg::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
.tg:focus {
  border-color: var(--ac);
}
.tg.on {
  color: var(--tx);
}
.mu {
  color: var(--mu);
  font-size: 13px;
}
.chart {
  position: relative;
  flex: 1;
  min-height: 140px;
  padding-left: 30px;
}
.chart svg {
  width: 100%;
  height: 100%;
  display: block;
}
.ylab {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 10px;
  color: var(--mu2);
}
</style>
