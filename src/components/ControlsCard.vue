<script setup>
// Controls card: sliders, switches, multi-position selectors and small forms that run macros with parameters.
// Each control reads its state from a printer object (state.objects / S()), so a switch shows the real position
// and a slider the value Klipper reports. Commands go through gcode(), so the print guard still applies.
import { computed, ref } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import Toggle from './Toggle.vue';
import Rng from './Rng.vue';
import { state, gcode, toast, APP } from '../store';
import { perPrinterKey } from '../printers';
import { badParamValue, withArgs } from '../macros';
import { readState, isOn } from '../controls';
import { t } from '../i18n';
const props = defineProps({ id: String });
const c = computed(() => state.settings.customCards?.[props.id] || { type: 'ctl', controls: [] });
const controls = computed(() => c.value.controls || []);

const num = (v, d) => (v === '' || v == null || isNaN(+v) ? d : +v);
// a slider without a state source keeps the last value it sent (in this browser, per printer), so it does not
// jump back to its minimum after a reload
const LAST_KEY = () => perPrinterKey(APP + '-ctl-last');
const last = ref(
  (() => {
    try {
      return JSON.parse(localStorage.getItem(LAST_KEY()) || '{}') || {};
    } catch {
      return {};
    }
  })(),
);
function remember(ct, v) {
  last.value = { ...last.value, [props.id + ':' + ct.id]: v };
  try {
    localStorage.setItem(LAST_KEY(), JSON.stringify(last.value));
  } catch {}
}
// slider: the printer's value scaled for display (fan speed 0..1 shown as 0..100). The read value has a scale of
// its own when set (a macro variable kept as 0..1 behind a 0..100 slider)
const sliderVal = (ct) => {
  const raw = readState(ct.obj, ct.field);
  const sc = num(ct.readScale, num(ct.scale, 1)) || 1;
  if (typeof raw === 'number') return Math.round(raw * sc * 1000) / 1000;
  return last.value[props.id + ':' + ct.id] ?? num(ct.min, 0);
};
// the value under the thumb while dragging, so the number next to it follows
const live = ref({});
// a value typed into the box next to the slider: kept inside min..max and on the step
function typed(ct, e) {
  const lo = num(ct.min, 0),
    hi = num(ct.max, 100),
    st = num(ct.step, 1) || 1;
  let v = Number(String(e.target.value).replace(',', '.'));
  if (!isFinite(v)) return (e.target.value = sliderVal(ct));
  v = Math.min(hi, Math.max(lo, lo + Math.round((v - lo) / st) * st));
  v = Math.round(v * 1e6) / 1e6;
  e.target.value = v;
  slide(ct, v);
}
// a switch without a state source remembers what it sent last, so its off command stays reachable
const local = ref({});
const toggleOn = (ct) => (ct.obj ? isOn(readState(ct.obj, ct.field), ct.when) : !!local.value[ct.id]);
const multiVal = (ct) => {
  const raw = readState(ct.obj, ct.field);
  return raw === undefined || raw === null
    ? null
    : String(typeof raw === 'number' ? Math.round(raw * 1000) / 1000 : raw);
};
function flip(ct, on) {
  if (!ct.obj) local.value = { ...local.value, [ct.id]: on };
  run(on ? ct.on : ct.off, ct.id);
}
const busy = ref(null);
async function run(cmd, key) {
  if (state.editDash || !cmd) return;
  busy.value = key;
  try {
    await gcode(cmd);
  } catch (e) {
    toast(e.message, 'error');
  }
  busy.value = null;
}
// {v} in a slider command is the slider value divided by the scale (50 on a 0..100 fan slider -> 0.5)
function slide(ct, v) {
  if (state.editDash) return;
  remember(ct, v);
  const sc = num(ct.scale, 1) || 1;
  const out = Math.round((v / sc) * 10000) / 10000;
  run(String(ct.cmd || '').replace(/\{v\}/g, String(out)), ct.id);
}
// form: one field per parameter, the values typed here, run as WORD PARAM=value ...
const formVals = ref({});
const fv = (ct, f) =>
  formVals.value[ct.id + ':' + f.param] ?? (f.type === 'toggle' ? (f.def ?? f.off ?? '0') : (f.def ?? ''));
const setFv = (ct, f, v) => (formVals.value = { ...formVals.value, [ct.id + ':' + f.param]: v });
function runForm(ct) {
  const args = {};
  for (const f of ct.fields || []) {
    const v = fv(ct, f);
    if (badParamValue(v))
      return toast(t('{name}: the characters # ; * and " cannot be sent to Klipper', { name: f.param }), 'warn');
    if (v !== '' && v != null) args[f.param] = v;
  }
  run(
    withArgs(
      String(ct.word || '')
        .trim()
        .split(/\s/)[0],
      args,
    ),
    ct.id,
  );
}
</script>
<template>
  <section class="card cc">
    <div class="card-h">
      <CardTitle :text="c.name || t('Controls')" :icon="c.icon" :color="c.color" />
      <CardCollapse />
    </div>
    <div v-if="!controls.length" class="mu" style="font-size: 13px">
      {{ t('No controls yet. Edit this card to add some.') }}
    </div>
    <div class="list">
      <div v-for="ct in controls" :key="ct.id" class="ct" :class="['k-' + ct.kind, { busy: busy === ct.id }]">
        <!-- slider -->
        <template v-if="ct.kind === 'slider'">
          <div class="row" style="justify-content: space-between; gap: 8px">
            <span class="nl"><Icon v-if="ct.icon" :name="ct.icon" :size="15" />{{ ct.label }}</span>
            <span class="vbox"
              ><input
                class="input mono vin"
                type="number"
                inputmode="decimal"
                :min="num(ct.min, 0)"
                :max="num(ct.max, 100)"
                :step="num(ct.step, 1)"
                :value="live[ct.id] ?? sliderVal(ct)"
                :aria-label="t('Value of {name}', { name: ct.label || '' })"
                @keydown.enter="$event.target.blur()"
                @change="typed(ct, $event)"
              /><span v-if="ct.unit" class="mu val">{{ ct.unit }}</span></span
            >
          </div>
          <Rng
            :value="sliderVal(ct)"
            :min="num(ct.min, 0)"
            :max="num(ct.max, 100)"
            :step="num(ct.step, 1)"
            :label="ct.label"
            @live="live[ct.id] = $event"
            @commit="slide(ct, $event)"
          />
        </template>
        <!-- switch -->
        <div v-else-if="ct.kind === 'toggle'" class="row" style="justify-content: space-between; gap: 8px">
          <span class="nl"><Icon v-if="ct.icon" :name="ct.icon" :size="15" />{{ ct.label }}</span>
          <Toggle :model-value="toggleOn(ct)" :label="ct.label" @update:model-value="flip(ct, $event)" />
        </div>
        <!-- several positions -->
        <template v-else-if="ct.kind === 'multi'">
          <span class="nl"><Icon v-if="ct.icon" :name="ct.icon" :size="15" />{{ ct.label }}</span>
          <div class="seg">
            <button
              v-for="(o, k) in ct.options || []"
              :key="k"
              :class="{ on: multiVal(ct) !== null && String(o.value) === multiVal(ct) }"
              :data-tip="o.cmd"
              @click="run(o.cmd, ct.id)"
            >
              {{ o.label || o.value }}
            </button>
          </div>
        </template>
        <!-- macro with parameters -->
        <template v-else-if="ct.kind === 'form'">
          <div class="row" style="justify-content: space-between; gap: 8px">
            <span class="nl"><Icon v-if="ct.icon" :name="ct.icon" :size="15" />{{ ct.label || ct.word }}</span>
            <button class="btn sm acc" :disabled="!ct.word" @click="runForm(ct)">
              <Icon name="play" :size="14" :stroke="2.6" />{{ t('Run') }}
            </button>
          </div>
          <div class="fields">
            <label v-for="(f, k) in ct.fields || []" :key="k" class="fld">
              <span class="code">{{ f.param }}</span>
              <Toggle
                v-if="f.type === 'toggle'"
                :model-value="String(fv(ct, f)) === String(f.on ?? '1')"
                :label="f.param"
                @update:model-value="setFv(ct, f, $event ? (f.on ?? '1') : (f.off ?? '0'))"
              />
              <template v-else-if="f.type === 'slider'">
                <Rng
                  :value="num(fv(ct, f), num(f.min, 0))"
                  :min="num(f.min, 0)"
                  :max="num(f.max, 100)"
                  :step="num(f.step, 1)"
                  :label="f.param"
                  @live="(v) => v != null && setFv(ct, f, v)"
                  @commit="setFv(ct, f, $event)"
                />
                <span class="mono val">{{ fv(ct, f) }}</span>
              </template>
              <input
                v-else
                class="input code"
                :type="f.type === 'number' ? 'number' : 'text'"
                :min="f.min"
                :max="f.max"
                :step="f.step"
                :value="fv(ct, f)"
                :placeholder="f.def ?? ''"
                @change="setFv(ct, f, $event.target.value)"
              />
            </label>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
<style scoped>
.cc {
  overflow: auto;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ct {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--s2);
}
.ct.busy {
  opacity: 0.6;
}
.nl {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}
.val {
  font-size: 13px;
  color: var(--mu);
}
.seg {
  flex-wrap: wrap;
}
.fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fld {
  display: grid;
  grid-template-columns: 110px 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}
.fld .input {
  height: 32px;
  grid-column: 2 / 4;
}
/* fields of a macro stand out a little from the card */
.fld .input,
.vin {
  background: color-mix(in srgb, var(--ac) 7%, var(--s1));
  border-color: color-mix(in srgb, var(--ac) 25%, var(--bd));
}
.vbox {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.vin {
  width: 76px;
  height: 28px;
  font-size: 13px;
  text-align: right;
  padding: 0 6px;
}
.fld .toggle {
  justify-self: start;
}
.mu {
  color: var(--mu);
}
</style>
