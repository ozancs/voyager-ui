<script setup>
// Editor for one control of the Controls card (used inside the card editor in Dashboard.vue). The control object
// is edited in place. State source: a printer object and one of its fields, picked from what Klipper reports now.
import { computed } from 'vue';
import Icon from './Icon.vue';
import Toggle from './Toggle.vue';
import CmdInput from './CmdInput.vue';
import { state, S } from '../store';
import { readState } from '../controls';
import { macroParams } from '../macros';
import { t } from '../i18n';
const props = defineProps({ ct: Object });
const emit = defineEmits(['icon', 'remove']);
const KINDS = [
  ['slider', 'Slider'],
  ['toggle', 'Switch'],
  ['multi', 'Positions'],
  ['form', 'Macro with inputs'],
];
// printer objects a control can read, the gcode_macro variables included (gcode_macro X exposes its variables)
const objects = computed(() => [...state.objects].sort());
const fields = computed(() => {
  const o = S(props.ct.obj || '');
  return Object.keys(o || {}).filter((k) => typeof o[k] !== 'object' || o[k] === null);
});
const preview = computed(() => {
  const v = readState(props.ct.obj, props.ct.field);
  return v === undefined ? t('no value') : typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : String(v);
});
// form: parameters of the macro, taken from its gcode
function loadParams() {
  const ps = macroParams(props.ct.word || '');
  const have = new Set((props.ct.fields || []).map((f) => f.param));
  props.ct.fields = [
    ...(props.ct.fields || []),
    ...ps.filter((p) => !have.has(p.name)).map((p) => ({ param: p.name, type: 'text', def: p.def || '' })),
  ];
}
const FT = [
  ['text', 'Text'],
  ['number', 'Number'],
  ['slider', 'Slider'],
  ['toggle', 'Switch'],
];
</script>
<template>
  <div class="ce">
    <div class="row" style="gap: 8px">
      <button
        class="btn ibtn"
        style="width: 40px; height: 40px; flex: none"
        :aria-label="t('Change icon')"
        @click="emit('icon', ct)"
      >
        <Icon :name="ct.icon || 'sliders'" :size="20" />
      </button>
      <select v-model="ct.kind" class="input" style="width: 150px" :aria-label="t('Control type')">
        <option v-for="[k, l] in KINDS" :key="k" :value="k">{{ t(l) }}</option>
      </select>
      <input v-model="ct.label" class="input grow" :placeholder="t('Label')" :aria-label="t('Label')" />
      <button class="btn clear ibtn sm" :aria-label="t('Remove control')" @click="emit('remove')">
        <Icon name="trash" :size="16" />
      </button>
    </div>

    <!-- state source (not for forms) -->
    <div v-if="ct.kind !== 'form'" class="src">
      <span class="lbl">{{ t('Reads its state from') }}</span>
      <div class="row" style="gap: 6px; flex-wrap: wrap">
        <select v-model="ct.obj" class="input" style="flex: 1; min-width: 160px" :aria-label="t('Printer object')">
          <option value="">{{ t('(none)') }}</option>
          <option v-for="o in objects" :key="o" :value="o">{{ o }}</option>
        </select>
        <input
          v-model="ct.field"
          class="input code"
          style="width: 150px"
          list="ce-fields"
          :placeholder="t('field')"
          :aria-label="t('Field')"
        />
        <datalist id="ce-fields"><option v-for="f in fields" :key="f" :value="f"></option></datalist>
        <span class="mono mu" style="font-size: 12px; align-self: center">= {{ preview }}</span>
      </div>
    </div>

    <template v-if="ct.kind === 'slider'">
      <div class="row" style="gap: 6px; flex-wrap: wrap">
        <label class="nf"
          ><span>{{ t('Min') }}</span
          ><input v-model="ct.min" class="input mono" type="number"
        /></label>
        <label class="nf"
          ><span>{{ t('Max') }}</span
          ><input v-model="ct.max" class="input mono" type="number"
        /></label>
        <label class="nf"
          ><span>{{ t('Step') }}</span
          ><input v-model="ct.step" class="input mono" type="number"
        /></label>
        <label class="nf"
          ><span>{{ t('Unit') }}</span
          ><input v-model="ct.unit" class="input" style="width: 60px"
        /></label>
        <label
          class="nf"
          :data-tip="t('Shown value = printer value × scale. A fan reports 0..1, so 100 shows percent.')"
          ><span>{{ t('Scale') }}</span
          ><input v-model="ct.scale" class="input mono" type="number" placeholder="1"
        /></label>
      </div>
      <CmdInput
        v-model="ct.cmd"
        input-class="input"
        :placeholder="t('Command with {v}, e.g. SET_FAN_SPEED FAN=aux SPEED={v}')"
        :aria-label="t('Command')"
      />
      <span class="mu hint">{{ t('{v} is the slider value divided by the scale.') }}</span>
    </template>

    <template v-else-if="ct.kind === 'toggle'">
      <label class="nf" style="align-self: flex-start"
        ><span>{{ t('On when') }}</span
        ><input v-model="ct.when" class="input mono" style="width: 120px" placeholder="> 0" :aria-label="t('On when')"
      /></label>
      <div class="two">
        <label class="col" style="gap: 4px"
          ><span class="lbl">{{ t('Command for on') }}</span
          ><CmdInput v-model="ct.on" input-class="input" :placeholder="t('command')" :aria-label="t('Command for on')"
        /></label>
        <label class="col" style="gap: 4px"
          ><span class="lbl">{{ t('Command for off') }}</span
          ><CmdInput
            v-model="ct.off"
            input-class="input"
            :placeholder="t('command')"
            :aria-label="t('Command for off')"
        /></label>
      </div>
    </template>

    <template v-else-if="ct.kind === 'multi'">
      <span class="lbl">{{ t('Positions: the one whose value equals the state is highlighted') }}</span>
      <div v-for="(o, k) in ct.options || []" :key="k" class="row" style="gap: 6px">
        <input
          v-model="o.label"
          class="input"
          style="width: 110px"
          :placeholder="t('Label')"
          :aria-label="t('Label')"
        />
        <input
          v-model="o.value"
          class="input mono"
          style="width: 90px"
          :placeholder="t('value')"
          :aria-label="t('State value')"
        />
        <CmdInput v-model="o.cmd" input-class="input" :placeholder="t('command')" :aria-label="t('Command')" />
        <button class="btn clear ibtn sm" :aria-label="t('Remove')" @click="ct.options.splice(k, 1)">
          <Icon name="trash" :size="15" />
        </button>
      </div>
      <button
        class="btn"
        style="align-self: flex-start"
        @click="(ct.options ||= []).push({ label: '', value: '', cmd: '' })"
      >
        <Icon name="plus" :size="15" />{{ t('Add position') }}
      </button>
    </template>

    <template v-else-if="ct.kind === 'form'">
      <div class="row" style="gap: 6px">
        <CmdInput v-model="ct.word" input-class="input" :placeholder="t('Macro name')" :aria-label="t('Macro name')" />
        <button class="btn" @click="loadParams"><Icon name="sparkle" :size="15" />{{ t('Read parameters') }}</button>
      </div>
      <div v-for="(f, k) in ct.fields || []" :key="k" class="row" style="gap: 6px; flex-wrap: wrap">
        <input
          v-model="f.param"
          class="input code"
          style="width: 110px"
          :placeholder="t('PARAM')"
          :aria-label="t('Parameter')"
        />
        <select v-model="f.type" class="input" style="width: 110px" :aria-label="t('Field type')">
          <option v-for="[v, l] in FT" :key="v" :value="v">{{ t(l) }}</option>
        </select>
        <template v-if="f.type === 'toggle'">
          <input
            v-model="f.on"
            class="input mono"
            style="width: 70px"
            placeholder="1"
            :aria-label="t('Value when on')"
          />
          <input
            v-model="f.off"
            class="input mono"
            style="width: 70px"
            placeholder="0"
            :aria-label="t('Value when off')"
          />
        </template>
        <template v-else-if="f.type === 'slider' || f.type === 'number'">
          <input v-model="f.min" class="input mono" style="width: 64px" :placeholder="t('min')" />
          <input v-model="f.max" class="input mono" style="width: 64px" :placeholder="t('max')" />
          <input v-model="f.step" class="input mono" style="width: 64px" :placeholder="t('step')" />
        </template>
        <input
          v-model="f.def"
          class="input mono"
          style="width: 80px"
          :placeholder="t('default')"
          :aria-label="t('Default')"
        />
        <button class="btn clear ibtn sm" :aria-label="t('Remove')" @click="ct.fields.splice(k, 1)">
          <Icon name="trash" :size="15" />
        </button>
      </div>
      <button
        class="btn"
        style="align-self: flex-start"
        @click="(ct.fields ||= []).push({ param: '', type: 'text', def: '' })"
      >
        <Icon name="plus" :size="15" />{{ t('Add field') }}
      </button>
    </template>
  </div>
</template>
<style scoped>
.ce {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}
.src {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nf {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--mu);
}
.nf .input {
  width: 72px;
  height: 32px;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.hint {
  font-size: 12px;
}
.mu {
  color: var(--mu);
}
</style>
