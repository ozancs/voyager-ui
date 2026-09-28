<script setup>
// Eye button in the Temperatures card and graph: pick which sensors they show (same list as Settings > Dashboard),
// their colour and their order, and for the graph the line width. Colour and order are shared by the card and
// the graph (sensorStyle.js).
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import Popover from './Popover.vue';
import { state, prettyName, tempSensors, saveSettings } from '../store';
import { sensorColor, sortSensors, moveSensor } from '../sensorStyle';
import { t } from '../i18n';
defineProps({ lines: Boolean });
const open = ref(false);
const btn = ref(null);
function toggle(s) {
  const h = state.settings.hiddenSensors || (state.settings.hiddenSensors = []);
  const i = h.indexOf(s);
  i >= 0 ? h.splice(i, 1) : h.push(s);
}
const list = computed(() => sortSensors(tempSensors.value, state.settings.sensorOrder));
const hidden = (s) => (state.settings.hiddenSensors || []).includes(s);
const colorOf = (s, i) => sensorColor(state.settings.sensorColors, s, i);
function setColor(s, v) {
  state.settings.sensorColors = { ...(state.settings.sensorColors || {}), [s]: v };
  saveSettings();
}
function resetColor(s) {
  const c = { ...(state.settings.sensorColors || {}) };
  delete c[s];
  state.settings.sensorColors = c;
  saveSettings();
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
      class="btn ibtn"
      :class="{ on: open }"
      :aria-label="t('Shown sensors')"
      :data-tip="t('Shown sensors')"
      @click.stop="open = !open"
    >
      <Icon name="eye" :size="16" :stroke="2.4" />
    </button>
    <Popover v-if="open" :anchor="btn" @close="open = false">
      <span class="lbl">{{ t('Sensors') }}</span>
      <div class="rows">
        <div v-for="(s, i) in list" :key="s" class="srow" :class="{ off: hidden(s) }">
          <label class="dot" :aria-label="t('Colour of {name}', { name: prettyName(s) })">
            <i :style="{ background: colorOf(s, i) }"></i>
            <input
              type="color"
              :value="colorOf(s, i).startsWith('#') ? colorOf(s, i) : '#5aa9ff'"
              @input="setColor(s, $event.target.value)"
            />
          </label>
          <button class="nm" :aria-pressed="!hidden(s)" :data-tip="t('Show or hide')" @click="toggle(s)">
            {{ prettyName(s) }}
          </button>
          <button
            v-if="state.settings.sensorColors?.[s]"
            class="mini"
            :aria-label="t('Default colour')"
            :data-tip="t('Default colour')"
            @click="resetColor(s)"
          >
            <Icon name="rot" :size="13" />
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
      </template>
    </Popover>
  </div>
</template>
<style scoped>
.sp {
  position: relative;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
  overflow: auto;
}
.srow {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
}
.srow.off .nm {
  color: var(--mu2);
  text-decoration: line-through;
}
.dot {
  position: relative;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
}
.dot i {
  display: block;
  width: 11px;
  height: 11px;
  margin: 3px;
  border-radius: 50%;
}
.dot input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.nm {
  flex: 1;
  min-width: 0;
  text-align: left;
  background: none;
  border: 0;
  padding: 0 2px;
  color: var(--tx);
  font-size: 12.5px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--mu);
  cursor: pointer;
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
