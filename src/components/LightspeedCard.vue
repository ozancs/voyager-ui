<script setup>
// Dashboard card for Lightspeed (Add card, when the printer has the plugin): on/off and brightness for all of it,
// which state's scene shows (Auto follows the printer), and every strip with its effect running live; a strip
// opens the same pop-up as its status tile. The arrow opens the plugin's designer page.
import { ref, computed } from 'vue';
import CardTitle from './CardTitle.vue';
import CardCollapse from './CardCollapse.vue';
import Icon from './Icon.vue';
import Popover from './Popover.vue';
import RangeSlider from './RangeSlider.vue';
import LightspeedSwatch from './LightspeedSwatch.vue';
import LightspeedPop from './LightspeedPop.vue';
import { S } from '../store';
import { t } from '../i18n';
import { go } from '../router';
import {
  E,
  lsStrips,
  parseEffect,
  known,
  EFFECT_LABEL,
  stripObject,
  setBrightness,
  setEnabled,
  showState,
  pageUrl,
} from '../lightspeed';
const ls = computed(() => S('lightspeed'));
const strips = computed(() => Object.values(lsStrips.value));
const STATE_LABEL = {
  idle: 'Idle',
  heating: 'Heating',
  printing: 'Printing',
  paused: 'Paused',
  complete: 'Complete',
  homing: 'Homing',
  probing: 'Probing',
  error: 'Error',
  shutdown: 'Shutdown',
};
const states = computed(() => (E?.STATES || Object.keys(STATE_LABEL)).slice().reverse());
const OUT = { neopixel: 'Neopixel', dotstar: 'Dotstar', pin: 'Pin', wled: 'WLED', esp_bridge: 'ESP node' };
const outLabel = (s) => {
  const o = stripObject(s);
  return [OUT[s.kind] || s.kind, o ? o.split(' ').slice(1).join(' ') : s.output.split(/\s+/).slice(1).join(' ')]
    .filter(Boolean)
    .join(' · ');
};
const fxLabel = (s) => {
  const n = parseEffect(s.effect)[0];
  return known(n) ? t(EFFECT_LABEL[n]) : n;
};
const open = ref(null); // { name, anchor }
const bright = computed(() => Math.round((ls.value.brightness ?? 1) * 100));
</script>
<template>
  <section class="card lsc">
    <div class="card-h">
      <CardTitle :text="t('Lightspeed')" />
      <div class="acts">
        <span v-if="ls.guard" class="chip" :data-tip="t('Printer LEDs pause while homing or probing')"
          ><i></i>{{ t('LEDs held') }}</span
        >
        <a
          class="btn clear ibtn sm"
          :href="pageUrl"
          target="_blank"
          rel="noopener"
          :aria-label="t('Open Lightspeed')"
          :data-tip="t('Open Lightspeed')"
          @click.prevent="go('lightspeed')"
          ><Icon name="ext" :size="15" :stroke="2.4"
        /></a>
        <!-- on / off as a bulb: lit when Lightspeed drives the LEDs, faded when it is off -->
        <button
          class="btn clear ibtn sm bulb"
          :class="{ lit: ls.enabled }"
          role="switch"
          :aria-checked="!!ls.enabled"
          :aria-label="t('Lightspeed')"
          :data-tip="t('Lightspeed') + ': ' + t(ls.enabled ? 'On' : 'Off')"
          @click="setEnabled(!ls.enabled)"
        >
          <Icon name="bulb" :size="17" :stroke="2.3" />
        </button>
      </div>
      <CardCollapse />
    </div>
    <div class="body" data-fit>
      <RangeSlider
        :label="t('Brightness')"
        :model-value="bright"
        :display="bright + '%'"
        unit="%"
        @commit="(v) => setBrightness(v / 100)"
      />
      <div class="row sc">
        <span class="lbl">{{ t('Scene') }}</span>
        <select
          class="input"
          :value="ls.override ? ls.state : 'auto'"
          :aria-label="t('Scene')"
          @change="showState($event.target.value)"
        >
          <option value="auto">{{ t('Auto') }} · {{ t(STATE_LABEL[ls.auto_state] || ls.auto_state || '') }}</option>
          <option v-for="st in states" :key="st" :value="st">{{ t(STATE_LABEL[st] || st) }}</option>
        </select>
      </div>
      <div class="list">
        <button
          v-for="s in strips"
          :key="s.name"
          class="it"
          :class="{ off: s.disabled }"
          @click="open = open?.name === s.name ? null : { name: s.name, anchor: $event.currentTarget }"
        >
          <LightspeedSwatch :strips="[s.name]" :glow="false" />
          <span class="col grow" style="gap: 1px; min-width: 0; text-align: left">
            <b class="ell">{{ s.name }}</b>
            <span class="mono mu ell sm">{{ outLabel(s) }}</span>
          </span>
          <span class="fxl ell" :class="{ man: s.manual }">{{ s.disabled ? t('stopped') : fxLabel(s) }}</span>
        </button>
        <p v-if="!strips.length" class="mu sm">{{ t('No strips in lightspeed.cfg yet.') }}</p>
      </div>
    </div>
    <Popover v-if="open" :anchor="open.anchor" :width="300" @close="open = null">
      <LightspeedPop :strips="[open.name]" />
    </Popover>
  </section>
</template>
<style scoped>
.bulb {
  color: var(--mu);
  opacity: 0.45;
  transition:
    color 0.2s,
    opacity 0.2s,
    filter 0.2s;
}
.bulb.lit {
  color: #f5b23a; /* Lightspeed's amber */
  opacity: 1;
}
/* the glow is on the bulb itself, not on the button around it */
.bulb.lit svg {
  filter: drop-shadow(0 0 3px rgba(245, 178, 58, 0.9));
}
.bulb:hover {
  opacity: 1;
}
.ell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: auto;
}
.sc {
  justify-content: space-between;
  gap: 10px;
}
.sc .input {
  max-width: 60%;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.it {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: var(--s2);
  color: var(--tx);
  font: inherit;
  cursor: pointer;
  min-width: 0;
}
.it:hover {
  background: var(--s3);
}
.it.off {
  opacity: 0.55;
}
.sm {
  font-size: 11.5px;
  margin: 0;
}
.fxl {
  font-size: 12.5px;
  color: var(--mu);
  max-width: 40%;
}
.fxl.man {
  color: var(--ac);
}
</style>
