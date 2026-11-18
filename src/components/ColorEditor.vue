<script setup>
import { computed, reactive, ref } from 'vue';
import { t } from '../i18n';
import { clamp, normalizeHex, hexToHsl, hslHex, hexRgb, rgbHex, COLOR_SWATCHES } from '../colorMath';
const props = defineProps({ color: { type: String, default: '#ff6b1a' }, white: { type: Number, default: null } });
const emit = defineEmits(['confirm', 'cancel']);
const original = normalizeHex(props.color) || '#ff6b1a';
const hsl = reactive(hexToHsl(original));
const draft = ref(original),
  hexInput = ref(original),
  white = ref(props.white);
const rgb = computed(() => hexRgb(draft.value));
const error = ref('');
const eyedropper = typeof window.EyeDropper === 'function' && window.isSecureContext;
function setHex(value) {
  const c = normalizeHex(value);
  if (!c) return false;
  const next = hexToHsl(c);
  if (next.s === 0) next.h = hsl.h;
  Object.assign(hsl, next);
  draft.value = c;
  hexInput.value = c;
  error.value = '';
  return true;
}
function fromHsl() {
  draft.value = hslHex(hsl.h, hsl.s, hsl.l);
  hexInput.value = draft.value;
  error.value = '';
}
function field(kind, index, value) {
  if (value === '') return;
  if (kind === 'rgb') {
    const values = [...rgb.value];
    values[index] = clamp(value, 255);
    setHex(rgbHex(values));
  } else {
    hsl[index] = clamp(value, index === 'h' ? 360 : 100);
    fromHsl();
  }
}
function pick(e, bar = false) {
  const r = e.currentTarget.getBoundingClientRect();
  if (bar) hsl.s = clamp(100 * (1 - (e.clientY - r.top) / r.height));
  else {
    hsl.h = clamp((360 * (e.clientX - r.left)) / r.width, 359.99);
    hsl.l = clamp(100 * (1 - (e.clientY - r.top) / r.height));
  }
  fromHsl();
}
function down(e, bar) {
  e.currentTarget.setPointerCapture(e.pointerId);
  pick(e, bar);
}
function move(e, bar) {
  if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e, bar);
}
function key(e, bar = false) {
  const d = e.shiftKey ? 10 : 1;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  if (bar) hsl.s = clamp(hsl.s + (['ArrowUp', 'ArrowRight'].includes(e.key) ? d : -d));
  else if (['ArrowLeft', 'ArrowRight'].includes(e.key)) hsl.h = (hsl.h + (e.key === 'ArrowRight' ? d : -d) + 360) % 360;
  else hsl.l = clamp(hsl.l + (e.key === 'ArrowUp' ? d : -d));
  fromHsl();
}
async function eye() {
  try {
    const result = await new window.EyeDropper().open();
    setHex(result.sRGBHex);
  } catch (e) {
    if (e.name !== 'AbortError') error.value = t('Could not pick a screen colour');
  }
}
function confirm() {
  if (!setHex(hexInput.value)) {
    error.value = t('Enter a valid hex colour');
    return;
  }
  emit('confirm', draft.value, white.value);
}
</script>
<template>
  <div class="color-editor" @pointerdown.stop @click.stop>
    <div class="ce-map">
      <div
        class="ce-saturation"
        tabindex="0"
        role="slider"
        :aria-label="t('Saturation')"
        :aria-valuenow="Math.round(hsl.s)"
        aria-valuemin="0"
        aria-valuemax="100"
        :style="{ background: `linear-gradient(hsl(${hsl.h} 100% ${hsl.l}%), hsl(${hsl.h} 0% ${hsl.l}%))` }"
        @pointerdown.prevent="down($event, true)"
        @pointermove="move($event, true)"
        @keydown="key($event, true)"
      >
        <i :style="{ top: 100 - hsl.s + '%' }"></i>
      </div>
      <div
        class="ce-spectrum"
        tabindex="0"
        role="slider"
        :aria-label="t('Hue and lightness')"
        :aria-valuetext="`${Math.round(hsl.h)}°, ${Math.round(hsl.l)}%`"
        :aria-valuenow="Math.round(hsl.h)"
        aria-valuemin="0"
        aria-valuemax="360"
        @pointerdown.prevent="down($event, false)"
        @pointermove="move($event, false)"
        @keydown="key($event)"
      >
        <div class="ce-grey" :style="{ opacity: 1 - hsl.s / 100 }"></div>
        <i :style="{ left: (hsl.h / 360) * 100 + '%', top: 100 - hsl.l + '%', background: draft }"></i>
      </div>
    </div>
    <div class="ce-fields">
      <label class="ce-hex"
        >Hex<input
          v-model="hexInput"
          class="input mono"
          aria-label="Hex"
          maxlength="7"
          :aria-invalid="!normalizeHex(hexInput)"
          @change="setHex(hexInput)"
          @keydown.enter.prevent="confirm"
      /></label>
      <div class="ce-numbers">
        <label v-for="k in ['h', 's', 'l']" :key="k"
          >{{ k.toUpperCase()
          }}<input
            class="input mono"
            type="number"
            :aria-label="k.toUpperCase()"
            :value="Math.round(hsl[k])"
            min="0"
            :max="k === 'h' ? 360 : 100"
            @change="field('hsl', k, $event.target.value)"
        /></label>
      </div>
      <div class="ce-numbers">
        <label v-for="(k, i) in ['R', 'G', 'B']" :key="k"
          >{{ k
          }}<input
            class="input mono"
            type="number"
            :aria-label="k"
            :value="rgb[i]"
            min="0"
            max="255"
            @change="field('rgb', i, $event.target.value)"
        /></label>
      </div>
    </div>
    <label v-if="white != null" class="ce-white"
      >{{ t('White') }}<input v-model.number="white" type="range" min="0" max="255" :aria-label="t('White')" /><span>{{
        white
      }}</span></label
    >
    <div class="ce-palette">
      <div class="ce-compare">
        <button
          type="button"
          :style="{ background: original }"
          :aria-label="t('Previous colour')"
          :title="t('Previous colour')"
          @click="setHex(original)"
        ></button
        ><span :style="{ background: draft }" :aria-label="t('New colour')" :title="t('New colour')"></span>
      </div>
      <div class="ce-swatches">
        <button
          v-for="c in COLOR_SWATCHES"
          :key="c"
          type="button"
          :style="{ background: c }"
          :aria-label="c"
          :aria-pressed="draft === c"
          @click="setHex(c)"
        ></button>
      </div>
    </div>
    <p v-if="error" class="ce-error" role="alert">{{ error }}</p>
    <div class="ce-actions">
      <button v-if="eyedropper" type="button" class="btn" @click="eye">{{ t('Pick from screen') }}</button
      ><span class="grow"></span><button type="button" class="btn" @click="emit('cancel')">{{ t('Cancel') }}</button
      ><button type="button" class="btn acc" :disabled="!normalizeHex(hexInput)" @click="confirm">{{ t('OK') }}</button>
    </div>
  </div>
</template>
<style scoped>
.color-editor {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ce-map {
  display: flex;
  gap: 18px;
  height: 190px;
  padding: 7px;
}
.ce-saturation {
  width: 16px;
  flex: none;
  border-radius: 8px;
  border: 1px solid var(--bd);
  position: relative;
  touch-action: none;
}
.ce-spectrum {
  flex: 1;
  position: relative;
  border-radius: 8px;
  touch-action: none;
  background:
    linear-gradient(to bottom, #fff, transparent 50%, #000),
    linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
}
.ce-grey {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(#fff, #808080, #000);
  pointer-events: none;
}
.ce-map i {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 2px solid white;
  box-shadow: 0 0 0 1px #111;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.ce-saturation i {
  left: 50%;
}
.ce-fields {
  display: grid;
  grid-template-columns: minmax(90px, 1.5fr) repeat(2, minmax(66px, 1fr));
  gap: 10px;
}
.ce-fields label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--mu);
  min-width: 0;
}
.ce-hex {
  align-self: start;
  flex-direction: column;
  align-items: stretch !important;
}
.ce-numbers {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ce-fields .input {
  min-width: 0;
  width: 100%;
  height: 32px;
  padding: 4px 6px;
}
.ce-fields .input[aria-invalid='true'] {
  border-color: var(--dg);
}
.ce-palette {
  display: flex;
  gap: 12px;
}
.ce-compare {
  display: flex;
  flex: none;
}
.ce-compare > * {
  width: 36px;
  min-height: 56px;
  border: 1px solid var(--bd);
}
.ce-compare > :first-child {
  border-radius: 7px 0 0 7px;
}
.ce-compare > :last-child {
  border-radius: 0 7px 7px 0;
}
.ce-swatches {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 4px;
}
.ce-swatches button {
  min-width: 0;
  min-height: 25px;
  border: 1px solid var(--bd);
  border-radius: 4px;
}
.ce-swatches button[aria-pressed='true'] {
  outline: 2px solid var(--ac);
  outline-offset: 1px;
}
.ce-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ce-white {
  display: flex;
  gap: 8px;
  align-items: center;
}
.ce-white input {
  flex: 1;
  min-width: 0;
}
.ce-error {
  color: var(--dg);
  font-size: 12px;
  margin: 0;
}
@media (max-width: 420px) {
  .ce-map {
    height: 165px;
  }
  .ce-fields {
    gap: 6px;
  }
  .ce-palette {
    gap: 8px;
  }
  .ce-compare > * {
    width: 28px;
  }
}
</style>
