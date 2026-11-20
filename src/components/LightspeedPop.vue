<script setup>
// The pop-up of a light Lightspeed drives (a status tile, a row of the Lightspeed card): its effects, colour and
// speed, live on the printer, plus Auto (back to the scene of the printer's state) and the plugin's own page. One
// light can carry several strips (one chain split in parts): a switch on top picks which one.
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import RangeSlider from './RangeSlider.vue';
import ColorEditor from './ColorEditor.vue';
import LightspeedSwatch from './LightspeedSwatch.vue';
import { t } from '../i18n';
import { go } from '../router';
import {
  E,
  lsStrips,
  parseEffect,
  known,
  EFFECT_LABEL,
  effectsFor,
  specOf,
  setEffect,
  backToAuto,
  pageUrl,
} from '../lightspeed';
const props = defineProps({ strips: { type: Array, required: true } });
const emit = defineEmits(['close']);
const pick = ref(props.strips[0]);
const s = computed(() => lsStrips.value[pick.value] || lsStrips.value[props.strips[0]]);
const cur = computed(() => parseEffect(s.value?.effect));
const name = computed(() => cur.value[0]);
const params = computed(() => cur.value[1]);
const effects = computed(() => effectsFor(s.value?.kind));
const hasColor = computed(() => known(name.value) && 'color' in (E.EFFECTS[name.value] || {}));
const hasPeriod = computed(() => known(name.value) && 'period' in (E.EFFECTS[name.value] || {}));
const SWATCH = ['ffffff', 'ff3020', 'ff6b1a', 'ffc040', '30e070', '20c0ff', '1a3cff', '9040ff', 'ff40a0'];
const colorNow = computed(() => (hasColor.value ? params.value.color : null));
const editing = ref(false);

// a new effect keeps the colour and speed it can take from the one running
function chooseEffect(fx) {
  const keep = {};
  for (const k of ['color', 'color2', 'period'])
    if (k in (E.EFFECTS[fx] || {}) && k in params.value && name.value !== 'off') keep[k] = params.value[k];
  if (fx === name.value) return;
  setEffect(s.value.name, specOf(fx, keep));
}
// a colour on an effect without one (off, rainbow, fire) lights the strip in that colour
function chooseColor(hex) {
  const c = hex.replace(/^#/, '').toLowerCase();
  if (hasColor.value) setEffect(s.value.name, specOf(name.value, { ...params.value, color: c }));
  else setEffect(s.value.name, specOf('solid', { color: c }));
}
function choosePeriod(v) {
  setEffect(s.value.name, specOf(name.value, { ...params.value, period: v }));
}
</script>
<template>
  <div class="lsp" @click.stop>
    <template v-if="!editing">
      <div class="row sb" style="gap: 8px">
        <div v-if="strips.length > 1" class="seg">
          <button v-for="n in strips" :key="n" :class="{ on: pick === n }" @click="pick = n">{{ n }}</button>
        </div>
        <span v-else class="lbl mono">{{ s?.name }}</span>
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
      </div>
      <div class="row now" style="gap: 8px; min-width: 0">
        <LightspeedSwatch :strips="[s.name]" :glow="false" />
        <span class="ell" style="min-width: 0"
          ><b>{{ known(name) ? t(EFFECT_LABEL[name]) : name }}</b>
          <span class="mu"> · {{ s.manual ? t('set here') : t('scene') }}</span></span
        >
      </div>
      <p v-if="s.error" class="mu sm err">{{ s.error }}</p>
      <div class="fx">
        <button v-for="fx in effects" :key="fx" class="btn" :class="{ on: fx === name }" @click="chooseEffect(fx)">
          {{ t(EFFECT_LABEL[fx]) }}
        </button>
      </div>
      <template v-if="s.kind !== 'pin'">
        <span class="lbl">{{ t('Color') }}</span>
        <div class="sws">
          <button
            v-for="c in SWATCH"
            :key="c"
            class="swb"
            :class="{ on: colorNow === c }"
            :style="{ background: '#' + c }"
            :aria-label="'#' + c"
            @click="chooseColor(c)"
          ></button>
          <button
            class="swb more"
            :aria-label="t('Custom colour')"
            :data-tip="t('Custom colour')"
            @click="editing = true"
          >
            <Icon name="plus" :size="14" :stroke="2.4" />
          </button>
        </div>
      </template>
      <RangeSlider
        v-if="hasPeriod"
        :label="t('Speed')"
        :min="0.3"
        :max="10"
        :step="0.1"
        :model-value="Number(params.period) || 1"
        :display="(Number(params.period) || 1).toFixed(1) + ' s'"
        unit=" s"
        @commit="choosePeriod"
      />
      <div class="row" style="gap: 6px">
        <button
          class="btn grow"
          :disabled="!s.manual"
          :data-tip="t('Back to the scene for the printer\'s state')"
          @click="backToAuto(s.name)"
        >
          <Icon name="refresh" :size="15" />{{ t('Auto') }}
        </button>
        <button class="btn grow" :disabled="name === 'off'" @click="setEffect(s.name, 'off')">
          <Icon name="power" :size="15" />{{ t('Turn off') }}
        </button>
      </div>
    </template>
    <ColorEditor
      v-else
      :color="'#' + (colorNow || 'ffffff')"
      @confirm="(hex) => (chooseColor(hex), (editing = false))"
      @cancel="editing = false"
    />
  </div>
</template>
<style scoped>
.ell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lsp {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.sb {
  justify-content: space-between;
}
.now {
  font-size: 13px;
}
.sm {
  font-size: 12px;
  margin: 0;
}
.err {
  color: var(--dg);
}
.fx {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}
.fx .btn {
  height: 30px;
  padding: 0 6px;
  font-size: 12px;
  justify-content: center;
}
.fx .btn.on {
  background: color-mix(in srgb, var(--ac) 18%, var(--s2));
  color: var(--tx);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ac) 55%, transparent);
}
.sws {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.swb {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx) 18%, transparent);
}
.swb.on {
  box-shadow:
    0 0 0 2px var(--s1),
    0 0 0 4px var(--ac);
}
.swb.more {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--s2);
  color: var(--mu);
}
</style>
