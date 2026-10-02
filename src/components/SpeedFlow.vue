<script setup>
// Speed factor (M220) and flow (M221): slider, -/+ and a typed value. The slider shows the value while dragging and
// sends it when released; a typed value is sent on Enter, Esc or leaving the field puts the current value back.
// Used by the Print controls card and, when that card is not on the dashboard, by the Machine Limits card.
import { computed, reactive } from 'vue';
import Rng from './Rng.vue';
import Icon from './Icon.vue';
import { S, gcode } from '../store';
import { t } from '../i18n';
defineProps({ resets: Boolean }); // show "100%" buttons next to the values
const lv = reactive({ speed: null, flow: null }); // value under the thumb while dragging
const gm = computed(() => S('gcode_move'));
const speed = computed(() => Math.round((gm.value.speed_factor ?? 1) * 100));
const flow = computed(() => Math.round((gm.value.extrude_factor ?? 1) * 100));
function setSpeed(v) {
  if (v === '' || isNaN(v)) return;
  v = Math.max(1, Math.min(500, Math.round(v)));
  gcode(`M220 S${v}`);
}
function setFlow(v) {
  if (v === '' || isNaN(v)) return;
  v = Math.max(1, Math.min(300, Math.round(v)));
  gcode(`M221 S${v}`);
}
</script>
<template>
  <div class="g2">
    <div class="fac">
      <div class="row" style="justify-content: space-between; gap: 6px">
        <span class="nl" style="margin-right: auto">{{ t('Speed factor') }}</span
        ><label class="nb"
          ><input
            class="mono"
            type="number"
            :value="lv.speed ?? speed"
            @keydown.enter="
              setSpeed($event.target.value === '' ? '' : +$event.target.value);
              $event.target.blur();
            "
            @keydown.esc.stop="$event.target.blur()"
            @blur="$event.target.value = speed"
            :aria-label="t('Speed factor')"
          />%</label
        ><button v-if="resets" class="btn clear rs" :class="{ at: speed === 100 }" @click="setSpeed(100)">100%</button>
      </div>
      <div class="row">
        <button class="btn clear ibtn sm" :aria-label="t('Speed -5%')" @click="setSpeed(speed - 5)">
          <Icon name="minus" :size="16" :stroke="2.6" /></button
        ><Rng
          :value="speed"
          :min="10"
          :max="300"
          :step="5"
          :label="t('Speed factor')"
          @live="lv.speed = $event"
          @commit="setSpeed($event)"
        /><button class="btn clear ibtn sm" :aria-label="t('Speed +5%')" @click="setSpeed(speed + 5)">
          <Icon name="plus" :size="16" :stroke="2.6" />
        </button>
      </div>
    </div>
    <div class="fac">
      <div class="row" style="justify-content: space-between; gap: 6px">
        <span class="nl" style="margin-right: auto">{{ t('Flow') }}</span
        ><label class="nb"
          ><input
            class="mono"
            type="number"
            :value="lv.flow ?? flow"
            @keydown.enter="
              setFlow($event.target.value === '' ? '' : +$event.target.value);
              $event.target.blur();
            "
            @keydown.esc.stop="$event.target.blur()"
            @blur="$event.target.value = flow"
            :aria-label="t('Flow')"
          />%</label
        ><button v-if="resets" class="btn clear rs" :class="{ at: flow === 100 }" @click="setFlow(100)">100%</button>
      </div>
      <div class="row">
        <button class="btn clear ibtn sm" :aria-label="t('Flow -1%')" @click="setFlow(flow - 1)">
          <Icon name="minus" :size="16" :stroke="2.6" /></button
        ><Rng
          :value="flow"
          :min="50"
          :max="150"
          :label="t('Flow')"
          @live="lv.flow = $event"
          @commit="setFlow($event)"
        /><button class="btn clear ibtn sm" :aria-label="t('Flow +1%')" @click="setFlow(flow + 1)">
          <Icon name="plus" :size="16" :stroke="2.6" />
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.g2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
}
.rs {
  height: 26px;
  padding: 0 8px;
  font-size: 11.5px;
}
.rs.at {
  visibility: hidden;
}
.fac {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.nl {
  font-size: 13px;
  font-weight: 700;
}
.nb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  color: var(--mu);
}
.nb input {
  width: 64px;
  height: 30px;
  text-align: right;
  background: var(--s2);
  border: 1px solid var(--bd);
  border-radius: 8px;
  padding: 0 8px;
  font-size: 14px;
  font-weight: 700;
  outline: none;
  -moz-appearance: textfield;
}
.nb input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
.nb input:focus {
  border-color: var(--ac);
}
</style>
