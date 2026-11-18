<script setup>
// Temperatures, in one of two styles (Settings > Dashboard > Temperatures card):
//   classic: a table of current, target and power for heaters and sensors; targets can be typed in
//   compact: one row per heater (and temperature fan) with its temperature, the target as a chip (a tap opens a
//            small popup to set it) and the power as a line along the bottom of the row; sensors without a target
//            as small two-line chips below, two to a row. Fits a narrow card.
// Presets and cooldown are in the header.
import { groupTemperatures } from '../temperatureGroups';
import { heatEta, fmtEta } from '../heatEta';
import { longHist } from '../temphist';
import { computed, ref } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import SensorPicker from './SensorPicker.vue';
import SensorIcon from './SensorIcon.vue';
import Popover from './Popover.vue';
import { state, S, sensors, setHeater, applyPreset, gcode, allPresets, isPrinting, hist } from '../store';
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
const compact = computed(() => state.settings.tempsStyle === 'compact');
const settable = (s) => s.isHeater || s.isTempFan;
// power of a heater, speed of a temperature fan (0..1), for the line under the row
const pwr = (s) => (s.power != null ? s.power : s.speed != null ? s.speed : null);
const pwrText = (s) =>
  s.power != null
    ? t('Power') + ' ' + Math.round(s.power * 100) + '%'
    : s.speed != null
      ? t('fan {n}%', { n: Math.round(s.speed * 100) })
      : '';
// lowest and highest reading: a temperature_sensor's own since Klipper started (what Mainsail shows); for heaters
// and temperature fans, which Klipper doesn't track, the temperature history this browser keeps (up to a day)
function minMax(s) {
  const o = S(s.name);
  if (typeof o.measured_min_temp === 'number' && typeof o.measured_max_temp === 'number' && o.measured_max_temp > 0)
    return { min: o.measured_min_temp, max: o.measured_max_temp, src: 'klipper' };
  let min = Infinity,
    max = -Infinity;
  for (const arr of [longHist[s.name]?.t, hist[s.name]?.t])
    for (const v of arr || [])
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
  return Number.isFinite(min) ? { min, max, src: 'history' } : null;
}
const mmTip = (s) => {
  const r = minMax(s);
  return r ? t('Highest {max}° · lowest {min}°', { max: r.max.toFixed(1), min: r.min.toFixed(1) }) : null;
};
// tap a temperature: a popup with its highest and lowest reading
const mmFor = ref(null);
const mmEl = ref(null);
const mm = computed(() => (mmFor.value ? minMax(mmFor.value) : null));
function openMinMax(s, e) {
  mmFor.value = s;
  mmEl.value = e.currentTarget;
}
const fmtT = (v) => (v != null ? v.toFixed(1) + '°' : '--');
// tap a target chip: a popup to set it
const tgtFor = ref(null);
const tgtEl = ref(null);
const tgtVal = ref('');
function openTarget(s, e) {
  tgtFor.value = s;
  tgtEl.value = e.currentTarget;
  tgtVal.value = s.target > 0 ? s.target.toFixed(0) : '';
}
function setTarget(v) {
  const n = Number(v);
  if (tgtFor.value && String(v) !== '' && Number.isFinite(n)) setHeater(tgtFor.value.name, n);
  tgtFor.value = null;
}
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
// heaters first, then the sensors without a target; a group heading stays with the first item of its group
const heaters = computed(() => groupTemperatures(sensors.value.filter(settable), state.settings.sensorGroups));
const plain = computed(() =>
  groupTemperatures(
    sensors.value.filter((s) => !settable(s)),
    state.settings.sensorGroups,
  ),
);
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
    <div v-if="compact" data-fit style="overflow: auto; min-height: 0">
      <template v-for="s in heaters" :key="s.name">
        <div v-if="s.head" class="ghd">{{ s.head }}</div>
        <div class="hr">
          <SensorIcon :name="s.name" :color="colorOf(s.ci, s.name)" class="ic" />
          <span class="hn"
            >{{ s.label
            }}<template v-if="s.isHeater && s.target > 0 && heatEta(s.name)"
              ><small
                v-if="heatEta(s.name).levels != null"
                class="eta lv mono"
                :data-tip="t('Levels off around {n}°, short of the target', { n: heatEta(s.name).levels.toFixed(0) })"
                >~{{ heatEta(s.name).levels.toFixed(0) }}°</small
              ><small v-else class="eta mono" :data-tip="t('Time to reach the target')">{{
                fmtEta(heatEta(s.name).secs)
              }}</small></template
            ></span
          >
          <button
            class="mono hv tv"
            :style="{ color: heatColor(s.temperature) }"
            :data-tip="mmTip(s)"
            @click.stop="openMinMax(s, $event)"
          >
            {{ fmtT(s.temperature) }}
          </button>
          <button
            class="chip-t mono"
            :class="{ on: s.target > 0 }"
            :aria-label="t('{name} target', { name: s.label })"
            @click.stop="openTarget(s, $event)"
          >
            → {{ s.target > 0 ? s.target.toFixed(0) : t('off') }}
          </button>
          <i v-if="pwr(s) != null" class="pb" :class="{ fan: s.power == null }" :data-tip="pwrText(s)"
            ><i :style="{ width: pwr(s) * 100 + '%' }"></i
          ></i>
        </div>
      </template>
      <div v-if="plain.length" class="sg">
        <template v-for="s in plain" :key="s.name">
          <div v-if="s.head" class="ghd sgh">{{ s.head }}</div>
          <div
            class="sc"
            :data-tip="mmTip(s)"
            role="button"
            tabindex="0"
            @keydown.enter.prevent="openMinMax(s, $event)"
            @keydown.space.prevent="openMinMax(s, $event)"
            @click.stop="openMinMax(s, $event)"
          >
            <SensorIcon :name="s.name" :color="colorOf(s.ci, s.name)" class="ic" />
            <span class="sx">
              <span class="sn">{{ s.label }}</span>
              <span class="mono sv" :style="{ color: heatColor(s.temperature) }">{{ fmtT(s.temperature) }}</span>
            </span>
          </div>
        </template>
      </div>
    </div>
    <div v-else data-fit style="overflow: auto; min-height: 0">
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
                <button class="tv mono" :data-tip="mmTip(s)" @click.stop="openMinMax(s, $event)">
                  {{ s.temperature != null ? s.temperature.toFixed(1) + '°' : '--' }}
                </button>
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
    <Popover v-if="mmFor" :anchor="mmEl" :width="230" @close="mmFor = null">
      <div class="mmp" @click.stop>
        <b>{{ mmFor.label }}</b>
        <template v-if="mm">
          <div class="mmr">
            <span class="mu">{{ t('Highest') }}</span
            ><span class="mono" :style="{ color: heatColor(mm.max) }">{{ mm.max.toFixed(1) }}°</span>
          </div>
          <div class="mmr">
            <span class="mu">{{ t('Lowest') }}</span
            ><span class="mono" :style="{ color: heatColor(mm.min) }">{{ mm.min.toFixed(1) }}°</span>
          </div>
        </template>
        <span v-else class="mu">{{ t('No readings yet') }}</span>
      </div>
    </Popover>
    <Popover v-if="tgtFor" :anchor="tgtEl" :width="240" @close="tgtFor = null">
      <div class="tp" @click.stop>
        <b>{{ tgtFor.label }}</b>
        <div class="tpr">
          <input
            v-model="tgtVal"
            class="input mono"
            type="number"
            inputmode="numeric"
            :aria-label="t('{name} target', { name: tgtFor.label })"
            @keydown.enter="setTarget(tgtVal)"
          /><span class="mu">°C</span>
        </div>
        <div class="tpr">
          <button class="btn" @click="setTarget(0)">{{ t('Off') }}</button>
          <button class="btn acc" style="flex: 1" @click="setTarget(tgtVal)">{{ t('Set') }}</button>
        </div>
      </div>
    </Popover>
  </section>
</template>
<style scoped>
/* a temperature: tap (or hover) for its highest and lowest reading */
.tv {
  border: 0;
  padding: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sc {
  cursor: pointer;
}
.mmp {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mmr {
  display: flex;
  justify-content: space-between;
  font-size: 15px;
}
.mmr .mono {
  font-weight: 600;
}

.hr {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0 9px;
  border-bottom: 1px solid var(--bd);
}
.hn {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hv {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}
.chip-t {
  flex: none;
  height: 28px;
  min-width: 58px;
  padding: 0 9px;
  border: 0;
  border-radius: 9px;
  background: var(--s2);
  color: var(--mu);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.chip-t.on {
  color: var(--tx);
}
.chip-t:hover {
  background: var(--s3);
}
/* power: a line along the bottom of the row, as long as the power */
.pb {
  position: absolute;
  left: 26px;
  right: 0;
  bottom: -1px;
  height: 2px;
}
.pb > i {
  display: block;
  height: 100%;
  border-radius: 1px;
  background: var(--heat);
}
.pb.fan > i {
  background: var(--cool);
}
/* sensors without a target: two-line chips, two to a row even on a narrow card */
.sg {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px;
  margin-top: 10px;
}
.sgh {
  grid-column: 1 / -1;
}
.sc {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border-radius: 9px;
  background: var(--s2);
  min-width: 0;
}
.sc .ic {
  flex: none;
}
.sx {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sn {
  font-size: 11.5px;
  color: var(--mu);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sv {
  font-size: 14px;
  font-weight: 600;
}
.tp {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tpr {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tpr .input {
  flex: 1;
  height: 44px;
  font-size: 20px;
  text-align: center;
}
.ghd {
  padding: 12px 0 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mu);
}

.eta {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--mu);
}
.eta.lv {
  color: var(--wn);
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
/* classic table */
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
.ghd td {
  padding-top: 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mu);
  border-bottom: 0;
}
</style>
