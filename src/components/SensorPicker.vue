<script setup>
// Edit button in the Temperatures card and graph: pick which sensors each shows (the card and the graph separately),
// their colour and their order, and for the graph the line width. Colour and order are shared by the card and
// the graph (sensorStyle.js).
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import Popover from './Popover.vue';
import SensorIcon from './SensorIcon.vue';
import IconPicker from './IconPicker.vue';
import { state, prettyName, tempSensors, saveSettings, graphHidden } from '../store';
import { sensorColor, sortSensors, moveSensor } from '../sensorStyle';
import { t } from '../i18n';
const props = defineProps({ lines: Boolean }); // lines: the graph's picker, which hides sensors on its own
const open = ref(false);
const picking = ref(null); // sensor whose icon and colour are being picked
const btn = ref(null);
function toggle(s) {
  const key = props.lines ? 'hiddenGraph' : 'hiddenSensors';
  const h = [...(props.lines ? graphHidden() : state.settings.hiddenSensors || [])];
  const i = h.indexOf(s);
  i >= 0 ? h.splice(i, 1) : h.push(s);
  state.settings[key] = h;
}
const list = computed(() => sortSensors(tempSensors.value, state.settings.sensorOrder));
const hidden = (s) => (props.lines ? graphHidden() : state.settings.hiddenSensors || []).includes(s);
const colorOf = (s, i) => sensorColor(state.settings.sensorColors, s, i);
function setColor(s, v) {
  state.settings.sensorColors = { ...(state.settings.sensorColors || {}), [s]: v };
  saveSettings();
}
function setIcon(s, v) {
  state.settings.sensorIcons = { ...(state.settings.sensorIcons || {}), [s]: v };
  saveSettings();
}
// back to the default icon and colour
function resetColor(s) {
  const c = { ...(state.settings.sensorColors || {}) },
    ic = { ...(state.settings.sensorIcons || {}) };
  delete c[s];
  delete ic[s];
  state.settings.sensorColors = c;
  state.settings.sensorIcons = ic;
  saveSettings();
}
const custom = (s) => !!(state.settings.sensorColors?.[s] || state.settings.sensorIcons?.[s]);
function pickColor(s, v) {
  if (v) setColor(s, v);
  else {
    const c = { ...(state.settings.sensorColors || {}) };
    delete c[s];
    state.settings.sensorColors = c;
    saveSettings();
  }
}
function move(s, dir) {
  const o = moveSensor(tempSensors.value, state.settings.sensorOrder || [], s, dir);
  if (!o) return;
  state.settings.sensorOrder = o;
  saveSettings();
}
</script>
<template>
  <div class="sp">
    <button
      ref="btn"
      class="btn"
      :class="{ on: open }"
      :data-tip="t('Sensors, colours and order')"
      @click.stop="open = !open"
    >
      <Icon name="pencil" :size="15" :stroke="2.4" />{{ t('Edit') }}
    </button>
    <Popover v-if="open" :anchor="btn" :width="300" @close="!picking && (open = false)">
      <div class="hd">
        <span class="c1">{{ t('Icon') }}</span
        ><span class="c2">{{ t('Sensor') }}</span
        ><span class="c3">{{ t('Show') }}</span
        ><span class="c4">{{ t('Order') }}</span>
      </div>
      <div class="rows">
        <div v-for="(s, i) in list" :key="s" class="srow" :class="{ off: hidden(s) }">
          <button
            class="sw"
            :data-tip="t('Icon and colour')"
            :aria-label="t('Icon and colour of {name}', { name: prettyName(s) })"
            @click="picking = s"
          >
            <SensorIcon :name="s" :color="colorOf(s, i)" :size="17" />
          </button>
          <span class="nm">{{ prettyName(s) }}</span>
          <button
            v-if="custom(s)"
            class="mini"
            :aria-label="t('Default icon and colour')"
            :data-tip="t('Default icon and colour')"
            @click="resetColor(s)"
          >
            <Icon name="rot" :size="13" />
          </button>
          <button
            class="mini eye"
            :aria-pressed="!hidden(s)"
            :aria-label="t('Show or hide')"
            :data-tip="t('Show or hide')"
            @click="toggle(s)"
          >
            <Icon :name="hidden(s) ? 'eyeoff' : 'eye'" :size="15" :stroke="2.2" />
          </button>
          <button class="mini" :disabled="i === 0" :aria-label="t('Move up')" @click="move(s, -1)">
            <Icon name="up" :size="14" :stroke="2.6" />
          </button>
          <button class="mini" :disabled="i === list.length - 1" :aria-label="t('Move down')" @click="move(s, 1)">
            <Icon name="down" :size="14" :stroke="2.6" />
          </button>
        </div>
      </div>
      <template v-if="lines">
        <span class="lbl">{{ t('Line width') }}</span>
        <div class="seg">
          <button
            v-for="w in [1, 1.5, 2.5, 3.5]"
            :key="w"
            :class="{ on: (state.settings.graphLine || 2.5) === w }"
            @click="state.settings.graphLine = w"
          >
            {{ w }}
          </button>
        </div>
        <label class="fl">
          <input v-model="state.settings.graphFill" type="checkbox" @change="saveSettings()" />{{
            t('Shade under the lines')
          }}
        </label>
      </template>
    </Popover>
    <IconPicker
      v-if="picking"
      :icon="state.settings.sensorIcons?.[picking]"
      :color="state.settings.sensorColors?.[picking]"
      @pick="setIcon(picking, $event)"
      @color="pickColor(picking, $event)"
      @close="picking = null"
    />
  </div>
</template>
<style scoped>
.sp {
  position: relative;
}
.hd {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--mu2);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--bd);
}
.hd .c1 {
  width: 40px;
}
.hd .c2 {
  flex: 1;
}
.hd .c3 {
  width: 26px;
  text-align: center;
}
.hd .c4 {
  width: 48px;
  text-align: center;
}
/* grows with the sensor count; only a very long list on a short window scrolls */
.rows {
  display: flex;
  flex-direction: column;
  max-height: calc(75vh / var(--zoom, 1));
  overflow: auto;
}
.srow {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  border-bottom: 1px solid var(--bd);
}
.srow:last-child {
  border-bottom: 0;
}
.srow.off .nm {
  color: var(--mu2);
}
.srow.off .sw {
  opacity: 0.35;
}
.sw {
  position: relative;
  width: 40px;
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.sw {
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: var(--s2);
}
.sw:hover {
  background: var(--s3);
}
.fl {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  margin-top: 8px;
  cursor: pointer;
}
.nm {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--mu);
  cursor: pointer;
}
.mini.eye {
  width: 26px;
  color: var(--tx);
}
.srow.off .mini.eye {
  color: var(--mu2);
}
.mini:hover:not(:disabled) {
  background: var(--s2);
  color: var(--tx);
}
.mini:disabled {
  opacity: 0.25;
  cursor: default;
}
.btn.on {
  background: var(--s3);
}
</style>
