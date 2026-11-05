<script setup>
// Favorites bar. Pencil = edit right here: drag to reorder, click a button to change it, + to add.
import { ref, computed } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import Toggle from './Toggle.vue';
import CmdInput from './CmdInput.vue';
import { state, gcode, macroList, isPrinting, dangerIn } from '../store';
// while printing, buttons whose command homes, probes or levels look locked (clicking still asks, see GuardDialog)
const locked = (g) => isPrinting.value && !!dangerIn(g);
import IconPicker from './IconPicker.vue';
import { t } from '../i18n';

defineProps({ card: Boolean }); // card: the same buttons as a dashboard card instead of the bar
const busy = ref(null);
const favs = computed(() => state.settings.favorites);
// button size, set while editing: only the buttons (and the bar's height with them) grow or shrink, within limits so
// they stay readable and the bar never sits far bigger than what is in it
const SC_MIN = 0.7,
  SC_MAX = 1.3;
const scale = computed(() => Math.min(SC_MAX, Math.max(SC_MIN, Number(state.settings.favScale) || 1)));
const setScale = (d) =>
  (state.settings.favScale = Math.round(Math.min(SC_MAX, Math.max(SC_MIN, scale.value + d)) * 10) / 10);
const isz = (n) => Math.round(n * scale.value);
async function run(f) {
  if (state.favEdit) {
    edit(f);
    return;
  }
  busy.value = f.id;
  try {
    await gcode(f.gcode);
  } catch {}
  busy.value = null;
}
// ---- editing ----
const form = ref(null); // copy being edited
const askHide = ref(false); // 'hide the favorites bar?' dialog
function hideBar() {
  state.settings.favBar = 'off';
  state.favEdit = false;
  askHide.value = false;
}
const pickIcon = ref(false);
function edit(f) {
  form.value = { ...f };
  pickIcon.value = false;
}
function add() {
  form.value = { id: 'f' + Date.now(), name: '', icon: 'star', gcode: '', highlight: false, isNew: true };
  pickIcon.value = false;
}
function save() {
  const f = { ...form.value };
  if (!f.name.trim()) f.name = f.gcode.trimStart().split(/\s/)[0] || t('Button');
  const isNew = f.isNew;
  delete f.isNew;
  if (isNew) favs.value.push(f);
  else
    Object.assign(
      favs.value.find((x) => x.id === f.id),
      f,
    );
  form.value = null;
}
function remove(f) {
  state.settings.favorites = favs.value.filter((x) => x.id !== f.id);
  form.value = null;
}
function fromMacro(m) {
  form.value.gcode = m;
  if (!form.value.name)
    form.value.name = m
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
}
// reordering: the button being dragged takes the place of the one it is over at once, the others slide aside,
// so where it lands is visible before letting go. A short pause after each move stops two buttons of different
// widths from swapping back and forth under the pointer.
const dragI = ref(null);
let lastMove = 0;
function dragEnter(i) {
  if (dragI.value == null || dragI.value === i || Date.now() - lastMove < 180) return;
  const a = favs.value;
  const [x] = a.splice(dragI.value, 1);
  a.splice(i, 0, x);
  dragI.value = i;
  lastMove = Date.now();
}
</script>

<template>
  <component
    :is="card ? 'section' : 'div'"
    :class="[card ? 'card fcard' : 'fb', { editing: state.favEdit }]"
    :style="{ '--fs': scale }"
  >
    <div v-if="card" class="card-h">
      <CardTitle :text="t('Favorites')" />
      <div class="acts">
        <div v-if="state.favEdit" class="fsz">
          <button :aria-label="t('Smaller buttons')" :disabled="scale <= SC_MIN" @click="setScale(-0.1)">
            <Icon name="minus" :size="14" :stroke="2.4" /></button
          ><span class="mono">{{ Math.round(scale * 100) }}%</span
          ><button :aria-label="t('Bigger buttons')" :disabled="scale >= SC_MAX" @click="setScale(0.1)">
            <Icon name="plus" :size="14" :stroke="2.4" />
          </button>
        </div>
        <button class="btn ibtn" :aria-label="t('Add favorite')" @click="add">
          <Icon name="plus" :size="16" :stroke="2.4" /></button
        ><button
          class="btn ibtn"
          :class="{ acc: state.favEdit }"
          :aria-label="state.favEdit ? t('Done') : t('Edit favorites')"
          @click="state.favEdit = !state.favEdit"
        >
          <Icon :name="state.favEdit ? 'check' : 'pencil'" :size="15" :stroke="2.4" />
        </button>
      </div>
    </div>
    <TransitionGroup tag="div" name="fv" class="list">
      <button
        v-for="(f, i) in favs"
        :key="f.id"
        class="fav"
        :class="{ hot: f.highlight, busy: busy === f.id, drag: dragI === i, locked: !state.favEdit && locked(f.gcode) }"
        :style="{ '--k': f.color || null }"
        :data-tip="state.favEdit ? '' : locked(f.gcode) ? t('Locked while printing') + ': ' + f.gcode : f.gcode"
        :draggable="state.favEdit"
        @dragstart="dragI = i"
        @dragend="dragI = null"
        @dragenter.prevent="dragEnter(i)"
        @dragover.prevent
        @drop.prevent="dragI = null"
        @click="run(f)"
      >
        <Icon v-if="state.favEdit" name="grip" :size="14" :stroke="3" class="gr" />
        <Icon :name="f.icon" :size="isz(17)" :stroke="2.3" class="fi" :style="f.color ? { color: f.color } : null" />
        <span>{{ f.name }}</span>
        <Icon v-if="state.favEdit" name="pencil" :size="11" class="pe" />
      </button>
      <div v-if="!favs.length" key="hint" class="hint">
        {{ t('No favorites yet. Press + to add a macro or command.') }}
      </div>
    </TransitionGroup>
    <div v-if="!card && state.favEdit" class="fsz" :data-tip="t('Button size')">
      <button :aria-label="t('Smaller buttons')" :disabled="scale <= SC_MIN" @click="setScale(-0.1)">
        <Icon name="minus" :size="14" :stroke="2.4" /></button
      ><span class="mono">{{ Math.round(scale * 100) }}%</span
      ><button :aria-label="t('Bigger buttons')" :disabled="scale >= SC_MAX" @click="setScale(0.1)">
        <Icon name="plus" :size="14" :stroke="2.4" />
      </button>
    </div>
    <button v-if="!card" class="side" :aria-label="t('Add favorite')" @click="add">
      <Icon name="plus" :size="18" :stroke="2.4" />
    </button>
    <button
      v-if="!card && state.favEdit"
      class="side"
      :aria-label="t('Hide the favorites bar')"
      :data-tip="t('Hide the favorites bar')"
      @click="askHide = true"
    >
      <Icon name="eyeoff" :size="17" :stroke="2.4" />
    </button>
    <button
      v-if="!card"
      class="side"
      :class="{ on: state.favEdit }"
      :aria-label="state.favEdit ? t('Done') : t('Edit favorites')"
      @click="state.favEdit = !state.favEdit"
    >
      <Icon :name="state.favEdit ? 'check' : 'pencil'" :size="16" :stroke="2.4" />
    </button>

    <Modal v-if="askHide" :title="t('Hide the favorites bar?')" @close="askHide = false">
      <p class="mu" style="margin: 0">
        {{ t('You can turn it back on in Interface settings > Appearance > Favorites bar.') }}
      </p>
      <template #foot>
        <button class="btn lg" @click="askHide = false">{{ t('Cancel') }}</button>
        <button class="btn lg acc" @click="hideBar">{{ t('Hide') }}</button>
      </template>
    </Modal>
    <Modal v-if="form" :title="form.isNew ? t('New favorite') : t('Edit favorite')" width="600px" @close="form = null">
      <div class="row">
        <button
          class="btn ibtn"
          style="width: 44px; height: 44px"
          :aria-label="t('Change icon')"
          @click="pickIcon = !pickIcon"
        >
          <Icon :name="form.icon" :size="22" :style="{ color: form.color || 'var(--ac)' }" />
        </button>
        <input v-model="form.name" class="input grow" :placeholder="t('Button name')" style="font-weight: 600" />
        <Toggle v-model="form.highlight" :label="t('Highlight')" /><span class="mu sm">{{ t('Highlight') }}</span>
      </div>
      <IconPicker
        v-if="pickIcon"
        :icon="form.icon"
        :color="form.color"
        @pick="form.icon = $event"
        @color="form.color = $event"
        @close="pickIcon = false"
      />
      <CmdInput
        v-model="form.gcode"
        multiline
        input-class="input"
        :placeholder="t('Command or macro, e.g. CHAMBER TEMP=50')"
        :aria-label="t('Command')"
      />
      <div class="row" style="flex-wrap: wrap; gap: 6px">
        <span class="lbl">{{ t('Your macros:') }}</span
        ><button v-for="m in macroList.slice(0, 40)" :key="m" class="chip mb" @click="fromMacro(m)">{{ m }}</button>
      </div>
      <template #foot>
        <button v-if="!form.isNew" class="btn lg dg" style="margin-right: auto" @click="remove(form)">
          <Icon name="trash" :size="16" />{{ t('Delete') }}
        </button>
        <button class="btn lg" @click="form = null">{{ t('Cancel') }}</button>
        <button class="btn lg acc" :disabled="!form.gcode.trim()" @click="save">{{ t('Save') }}</button>
      </template>
    </Modal>
  </component>
</template>

<style scoped>
.fav.locked {
  opacity: 0.4;
}
/* its own band under the top bar: a touch lighter than the page and closed with a hairline, so the macro row reads as one thing */
.fb {
  height: calc(40px * var(--fs, 1) + 20px);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  background: color-mix(in srgb, var(--s1) 45%, var(--bg));
  border-bottom: 1px solid var(--bd);
}
.fb .fav {
  background: var(--s1);
}
.list {
  flex: 1;
  display: flex;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
}
.fav {
  flex: 0 0 auto;
  min-width: 0;
  padding: 0 max(16px, calc(16px * var(--fs, 1))); /* room for the grip and pencil while editing */
  height: calc(40px * var(--fs, 1));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--s1);
  color: var(--tx);
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: calc(13px * var(--fs, 1));
  white-space: nowrap;
  transition:
    background 0.12s,
    transform 0.08s;
  position: relative;
}
.fav:hover {
  background: var(--s2);
}
.fav:active {
  transform: scale(0.97);
}
.fav .fi {
  color: var(--k, var(--mu));
  flex-shrink: 0;
}
.fav.hot {
  background: var(--s1);
  color: var(--tx);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ac) 55%, transparent);
}
.fav.hot:hover {
  background: var(--s2);
}
.fav.hot .fi {
  color: var(--ac);
}
.fav.busy {
  opacity: 0.6;
}
.editing .fav {
  outline: 1px dashed var(--mu2);
  outline-offset: -1px;
  cursor: grab;
}
.fav.drag {
  opacity: 0.4;
}
/* while editing the grip and the pencil sit over the button's own padding, so it keeps its size and the bar
   does not start scrolling */
.gr {
  position: absolute;
  left: 2px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--mu2);
}
.pe {
  position: absolute;
  top: 4px;
  right: 3px;
  color: var(--mu);
}
.fv-move {
  transition: transform 0.18s ease;
}

/* button size while editing: - 100% + */
.fsz {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 32px;
  border: 1px dashed var(--s3);
  border-radius: 10px;
}
.fsz button {
  width: 28px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--mu);
  cursor: pointer;
}
.fsz button:hover:not(:disabled) {
  color: var(--tx);
}
.fsz button:disabled {
  opacity: 0.35;
  cursor: default;
}
.fsz span {
  font-size: 11px;
  color: var(--mu);
  min-width: 34px;
  text-align: center;
}
.hint {
  color: var(--mu2);
  font-size: 13px;
  display: flex;
  align-items: center;
  padding-left: 4px;
}
.side {
  width: 36px;
  height: min(40px, calc(40px * var(--fs, 1)));
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--mu2);
  border: 1px dashed var(--s3);
  border-radius: 12px;
}
.side:hover {
  color: var(--tx);
  border-color: var(--mu2);
}
.side.on {
  background: var(--ac);
  color: var(--oa);
  border: none;
}
.ig {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 6px;
}
.mb {
  border: 1px solid var(--bd);
  color: var(--mu);
  cursor: pointer;
  font-family: var(--fm);
  font-size: 11px;
  background: transparent;
}
.mb:hover {
  color: var(--ac);
  border-color: var(--ac);
}
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12.5px;
}
@media (max-width: 1100px) {
  .fb {
    padding: 0 10px;
  }
  .fav {
    min-width: calc(96px * var(--fs, 1));
  }
}
/* as a dashboard card */
.fcard .list {
  flex-wrap: wrap;
  overflow: auto;
  align-content: flex-start;
}
.fcard .fav {
  background: var(--s2);
}
.fcard .fav:hover {
  background: var(--s3);
}
</style>
