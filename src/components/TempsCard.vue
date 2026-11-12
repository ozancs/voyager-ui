<script setup>
// Temperature table: current, target and power for heaters and sensors. Targets can be typed in,
// presets and cooldown are in the header.
import { heatEta, fmtEta } from '../heatEta';
import { computed, ref } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import SensorPicker from './SensorPicker.vue';
import SensorIcon from './SensorIcon.vue';
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
// sensor groups from the Edit list: sensors without a group first, then one heading per group in the order the
// groups first appear
const grouped = computed(() => {
  const g = state.settings.sensorGroups || {};
  const list = sensors.value;
  if (!list.some((s) => g[s.name])) return list;
  const order = [''];
  for (const s of list) if (!order.includes(g[s.name] || '')) order.push(g[s.name]);
  const out = [];
  for (const name of order) {
    const part = list.filter((s) => (g[s.name] || '') === name);
    part.forEach((s, i) => out.push(i === 0 && name ? { ...s, head: name } : s));
  }
  return out;
});
</script>
<template>
  <section class="card temps">
    <div class="card-h">
      <CardTitle :text="t('Temperatures')" />
      <div class="acts">
        <SensorPicker />
        <div>
          <button
            ref="presetBtn"
            class="btn ibtn"
            :class="{ on: showPresets }"
            :aria-label="t('Presets')"
            :data-tip="t('Presets')"
            @click.stop="showPresets = !showPresets"
          >
            <Icon name="flame" :size="16" :stroke="2.4" />
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
          class="btn ibtn"
          :disabled="isPrinting"
          :aria-label="t('Cooldown')"
          :data-tip="isPrinting ? t('Not while printing') : t('Cooldown: all heaters off')"
          @click="gcode('TURN_OFF_HEATERS')"
        >
          <Icon name="flake" :size="16" :stroke="2" />
        </button>
      </div>
      <CardCollapse />
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
          <template v-for="s in grouped" :key="s.name">
            <tr v-if="s.head" class="ghd">
              <td colspan="4">{{ s.head }}</td>
            </tr>
            <tr>
              <td class="nm">
                <SensorIcon :name="s.name" :color="colorOf(s.ci, s.name)" class="ic" />{{ s.label
                }}<template v-if="s.isHeater && s.target > 0 && heatEta(s.name)"
                  ><small
                    v-if="heatEta(s.name).levels != null"
                    class="eta lv mono"
                    :data-tip="
                      t('Levels off around {n}°, short of the target', { n: heatEta(s.name).levels.toFixed(0) })
                    "
                    >~{{ heatEta(s.name).levels.toFixed(0) }}°</small
                  ><small v-else class="eta mono" :data-tip="t('Time to reach the target')">{{
                    fmtEta(heatEta(s.name).secs)
                  }}</small></template
                >
              </td>
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
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
<style scoped>
.eta {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--mu);
}
.eta.lv {
  color: var(--wn);
}
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
  font-weight: 600;
  white-space: nowrap;
  padding-right: 10px !important; /* a long name never runs into the value */
}
.nm .ic {
  margin-right: 8px;
}
.v {
  font-size: 16px;
  font-weight: 600;
}
.tg {
  width: 76px;
  height: 30px;
  background: var(--s2);
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 0 10px;
  font-size: 14px;
  font-weight: 600;
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
.ghd td {
  padding-top: 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mu);
  border-bottom: 0;
}
</style>
