<script setup>
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import SensorPicker from './SensorPicker.vue';
import { state, sensors, setHeater, applyPreset, gcode } from '../store';
import { go } from '../router';
import { t } from '../i18n';
const COLORS = [
  'var(--ac)',
  '#5aa9ff',
  '#3dd68c',
  '#f5c451',
  '#c38bff',
  '#ff7ab6',
  '#4fd1c5',
  '#a3a7ae',
  '#e8a87c',
  '#9bd5ff',
];
const colorOf = (i) => COLORS[i % COLORS.length];
const showPresets = ref(false);
const edit = ref({});
function commitTarget(s, e) {
  const v = e.target.value;
  edit.value[s.name] = undefined;
  if (v !== '' && Number(v) !== s.target) setHeater(s.name, v);
}
const presets = computed(() => state.settings.presets || []);
</script>
<template>
  <section class="card temps">
    <div class="card-h">
      <h2>{{ t('Temperatures') }}</h2>
      <div class="acts">
        <SensorPicker />
        <div style="position: relative">
          <button class="btn" @click.stop="showPresets = !showPresets">
            <Icon name="flame" :size="16" :stroke="2.4" />{{ t('Presets') }}
          </button>
          <div
            v-if="showPresets"
            class="pp card"
            v-away="() => (showPresets = false)"
            @mouseleave="showPresets = false"
          >
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
              <b>{{ p.name }}</b
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
          </div>
        </div>
        <button class="btn out" @click="gcode('TURN_OFF_HEATERS')">
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
            <td class="nm"><i :style="{ background: colorOf(i) }"></i>{{ s.label }}</td>
            <td class="mono v">{{ s.temperature != null ? s.temperature.toFixed(1) + '°' : '--' }}</td>
            <td>
              <input
                v-if="s.isHeater || s.isTempFan"
                class="tg mono"
                :class="{ on: s.target > 0 }"
                type="number"
                :value="edit[s.name] ?? s.target?.toFixed(0)"
                @focus="edit[s.name] = s.target?.toFixed(0)"
                @input="edit[s.name] = $event.target.value"
                @keydown.enter="$event.target.blur()"
                @blur="commitTarget(s, $event)"
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
  padding: 3px 0;
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
.pp {
  position: absolute;
  right: 0;
  top: 40px;
  width: 260px;
  z-index: 30;
  gap: 2px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
</style>
