<script setup>
// The variables of the printer's macros (variable_ lines of [gcode_macro]) as Klipper has them right now, and
// a way to change one with SET_GCODE_VARIABLE. A change lasts until Klipper restarts; the config keeps the
// starting value. `only` shows one macro (from the Macros card), otherwise every macro that has variables.
import { ref, computed, nextTick } from 'vue';
import Icon from './Icon.vue';
import { state, gcode } from '../store';
import { macroVars, pyLiteral, typedLiteral, setVarCommand, openMacroDef } from '../features';
import { t } from '../i18n';
const props = defineProps({ only: String });
const emit = defineEmits(['opened']);

const q = ref('');
const open = ref({});
const macros = computed(() => {
  const names = props.only
    ? [props.only]
    : state.objects
        .filter((o) => o.startsWith('gcode_macro '))
        .map((o) => o.slice(12))
        .sort((a, b) => a.replace(/^_/, '').localeCompare(b.replace(/^_/, '')));
  const s = q.value.trim().toLowerCase();
  return names
    .map((name) => ({ name, vars: Object.entries(macroVars(name)) }))
    .filter((m) => m.vars.length || props.only)
    .filter((m) => !s || m.name.toLowerCase().includes(s) || m.vars.some(([k]) => k.includes(s)));
});
const isOpen = (m) => props.only || q.value.trim() || open.value[m.name];
const shown = (v) => {
  const s = pyLiteral(v);
  return s.length > 120 ? s.slice(0, 117) + '…' : s;
};

const edit = ref(null); // { macro, key, text, error }
function start(macro, key, v) {
  edit.value = { macro, key, text: typeof v === 'string' ? v : pyLiteral(v), error: '' };
  nextTick(() => document.querySelector('.mv .ed input')?.select());
}
async function save() {
  const e = edit.value;
  const r = typedLiteral(e.text, macroVars(e.macro)[e.key]);
  if (r.error)
    return (e.error = {
      chars: t('# ; and * cannot be sent to Klipper'),
      number: t('Not a number'),
      empty: t('Empty value'),
    }[r.error]);
  try {
    await gcode(setVarCommand(e.macro, e.key, r.value));
    edit.value = null;
  } catch (err) {
    e.error = err.message;
  }
}
async function def(name, key) {
  await openMacroDef(name, key);
  emit('opened');
}
const count = computed(() => macros.value.reduce((n, m) => n + m.vars.length, 0));
defineExpose({ count });
</script>
<template>
  <div class="mv">
    <p class="mu note">{{ t('A change lasts until Klipper restarts. The config file keeps the starting value.') }}</p>
    <label v-if="!only" class="sr"
      ><Icon name="search" :size="14" /><input
        v-model="q"
        :placeholder="t('Filter')"
        :aria-label="t('Filter macro variables')"
    /></label>
    <div v-for="m in macros" :key="m.name" class="mac">
      <div class="mh">
        <button v-if="!only" class="btn clear tg" :aria-expanded="!!isOpen(m)" @click="open[m.name] = !open[m.name]">
          <Icon name="chev" :size="14" :class="{ rot: isOpen(m) }" /><b class="mono">{{ m.name }}</b
          ><span class="mu sm">{{ m.vars.length }}</span>
        </button>
        <span class="grow"></span>
        <button v-if="only" class="btn clear sm" @click="def(m.name)">
          <Icon name="file" :size="15" />{{ t('Open in the config') }}
        </button>
        <button
          v-else
          class="btn clear ibtn sm"
          :aria-label="t('Open in the config')"
          :data-tip="t('Open in the config')"
          @click="def(m.name)"
        >
          <Icon name="file" :size="15" />
        </button>
      </div>
      <template v-if="isOpen(m)">
        <div v-if="!m.vars.length" class="mu sm">{{ t('This macro has no variables.') }}</div>
        <div v-for="[k, v] in m.vars" :key="k" class="vr" :class="{ flat: only }">
          <button class="vk mono" :data-tip="t('Open in the config')" @click="def(m.name, k)">{{ k }}</button>
          <form
            v-if="edit && edit.macro === m.name && edit.key === k"
            class="ed"
            @submit.prevent="save"
            @keydown.esc.stop="edit = null"
          >
            <input v-model="edit.text" class="input mono" :aria-label="k" @input="edit.error = ''" />
            <button class="btn acc sm" type="submit">{{ t('Set') }}</button>
            <button class="btn clear ibtn sm" type="button" :aria-label="t('Cancel')" @click="edit = null">
              <Icon name="x" :size="14" />
            </button>
            <span v-if="edit.error" class="err">{{ edit.error }}</span>
          </form>
          <button v-else class="vv mono" :data-tip="t('Change')" @click="start(m.name, k, v)">{{ shown(v) }}</button>
        </div>
      </template>
    </div>
    <div v-if="!macros.length" class="empty">
      {{ q ? t('Nothing matches') : t('No macro has variables') }}
    </div>
  </div>
</template>
<style scoped>
.mv {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.note {
  font-size: 12px;
  margin: 0 0 4px;
}
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12px;
}
.sr {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--bd);
  border-radius: 8px;
  padding: 0 8px;
  height: 32px;
  color: var(--mu);
}
.sr input {
  flex: 1;
  min-width: 0;
  background: none;
  border: 0;
  outline: 0;
  color: var(--tx);
  font: inherit;
  font-size: 13px;
}
.mac {
  border-bottom: 1px solid var(--bd);
  padding-bottom: 6px;
}
.mac:last-of-type {
  border-bottom: 0;
}
.mh {
  display: flex;
  align-items: center;
  min-height: 32px;
}
.tg {
  gap: 6px;
  padding-left: 2px;
  min-width: 0;
}
.tg b {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rot {
  transform: rotate(90deg);
}
.vr {
  display: grid;
  grid-template-columns: minmax(90px, 40%) 1fr;
  gap: 8px;
  align-items: center;
  min-height: 30px;
  padding-left: 22px;
}
.vr.flat {
  padding-left: 0;
}
.vk,
.vv {
  background: none;
  border: 0;
  padding: 2px 4px;
  border-radius: 6px;
  font-size: 12.5px;
  text-align: left;
  color: var(--tx);
  cursor: pointer;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vk {
  color: var(--mu);
}
.vk:hover,
.vv:hover {
  background: var(--s2);
}
.ed {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.ed .input {
  flex: 1;
  min-width: 80px;
  height: 30px;
  font-size: 12.5px;
}
.err {
  flex-basis: 100%;
  color: var(--dg);
  font-size: 12px;
}
</style>
