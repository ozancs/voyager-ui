<script setup>
// Favorites bar. Pencil = edit right here: drag to reorder, click a button to change it, + to add.
import { ref, computed } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import Toggle from './Toggle.vue'
import CmdInput from './CmdInput.vue'
import { state, gcode, macroList } from '../store'
import { ICON_NAMES } from '../icons'
import { t } from '../i18n'

const busy = ref(null)
const INKS = ['var(--heat)', 'var(--cool)', 'var(--sense)', 'var(--light)', 'var(--spool)']
const favs = computed(() => state.settings.favorites)
async function run(f) {
  if (state.favEdit) { edit(f); return }
  busy.value = f.id
  try { await gcode(f.gcode) } catch {}
  busy.value = null
}
// ---- editing ----
const form = ref(null) // copy being edited
const pickIcon = ref(false)
function edit(f) { form.value = { ...f }; pickIcon.value = false }
function add() { form.value = { id: 'f' + Date.now(), name: '', icon: 'star', gcode: '', highlight: false, isNew: true }; pickIcon.value = false }
function save() {
  const f = { ...form.value }
  if (!f.name.trim()) f.name = f.gcode.split(/\s/)[0] || t('Button')
  const isNew = f.isNew
  delete f.isNew
  if (isNew) favs.value.push(f)
  else Object.assign(favs.value.find((x) => x.id === f.id), f)
  form.value = null
}
function remove(f) { state.settings.favorites = favs.value.filter((x) => x.id !== f.id); form.value = null }
function fromMacro(m) {
  form.value.gcode = m
  if (!form.value.name) form.value.name = m.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}
const dragI = ref(null)
function onDrop(i) {
  if (dragI.value == null || dragI.value === i) return
  const a = favs.value
  const [x] = a.splice(dragI.value, 1)
  a.splice(i, 0, x)
  dragI.value = null
}
</script>

<template>
  <div class="fb" :class="{ editing: state.favEdit }">
    <div class="list">
      <button v-for="(f, i) in favs" :key="f.id" class="fav" :class="{ hot: f.highlight, busy: busy === f.id, drag: dragI === i }" :style="{ '--k': INKS[i % INKS.length] }"
        :data-tip="state.favEdit ? '' : f.gcode" :draggable="state.favEdit" @dragstart="dragI = i" @dragend="dragI = null" @dragover.prevent @drop.prevent="onDrop(i)" @click="run(f)">
        <Icon v-if="state.favEdit" name="grip" :size="14" :stroke="3" class="gr" />
        <Icon :name="f.icon" :size="20" :stroke="2.3" class="fi" />
        <span>{{ f.name }}</span>
        <Icon v-if="state.favEdit" name="pencil" :size="13" class="pe" />
      </button>
      <div v-if="!favs.length" class="hint">{{ t('No favorites yet. Press + to add a macro or command.') }}</div>
    </div>
    <button class="side" :aria-label="t('Add favorite')" @click="add"><Icon name="plus" :size="18" :stroke="2.4" /></button>
    <button class="side" :class="{ on: state.favEdit }" :aria-label="state.favEdit ? t('Done') : t('Edit favorites')" @click="state.favEdit = !state.favEdit"><Icon :name="state.favEdit ? 'check' : 'pencil'" :size="16" :stroke="2.4" /></button>
  </div>

  <Modal v-if="form" :title="form.isNew ? t('New favorite') : t('Edit favorite')" width="600px" @close="form = null">
    <div class="row">
      <button class="btn ibtn" style="width:44px;height:44px" :aria-label="t('Change icon')" @click="pickIcon = !pickIcon"><Icon :name="form.icon" :size="22" style="color:var(--ac)" /></button>
      <input v-model="form.name" class="input grow" :placeholder="t('Button name')" style="font-weight:700" />
      <Toggle v-model="form.highlight" :label="t('Highlight')" /><span class="mu sm">{{ t('Highlight') }}</span>
    </div>
    <div v-if="pickIcon" class="ig">
      <button v-for="n in ICON_NAMES" :key="n" class="btn" :class="{ acc: form.icon === n }" style="height:40px;padding:0" :aria-label="n" @click="form.icon = n; pickIcon = false"><Icon :name="n" :size="20" /></button>
    </div>
    <CmdInput v-model="form.gcode" input-class="input" :placeholder="t('Command or macro, e.g. CHAMBER TEMP=50')" :aria-label="t('Command')" />
    <div class="row" style="flex-wrap:wrap;gap:6px"><span class="lbl">{{ t('Your macros:') }}</span><button v-for="m in macroList.slice(0, 40)" :key="m" class="chip mb" @click="fromMacro(m)">{{ m }}</button></div>
    <template #foot>
      <button v-if="!form.isNew" class="btn lg dg" style="margin-right:auto" @click="remove(form)"><Icon name="trash" :size="16" />{{ t('Delete') }}</button>
      <button class="btn lg" @click="form = null">{{ t('Cancel') }}</button>
      <button class="btn lg acc" :disabled="!form.gcode.trim()" @click="save">{{ t('Save') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.fb { height: 72px; flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 0 20px; background: var(--bg); }
.list { flex: 1; display: flex; gap: 8px; min-width: 0; overflow-x: auto; }
.fav { flex: 1 0 auto; min-width: 120px; height: 48px; display: flex; align-items: center; justify-content: center; gap: 10px; background: var(--s1); color: var(--tx); border: none; border-radius: 12px; font-weight: 600; font-size: 13.5px; white-space: nowrap; transition: background .12s, transform .08s; padding: 0 16px; position: relative; }
.fav:hover { background: var(--s2); }
.fav:active { transform: scale(.97); }
.fav .fi { color: var(--k); flex-shrink: 0; }
.fav.hot { background: var(--ac); color: var(--oa); }
.fav.hot:hover { filter: brightness(1.08); }
.fav.hot .fi { color: var(--oa); }
.fav.busy { opacity: .6; }
.editing .fav { outline: 1px dashed var(--mu2); outline-offset: -1px; cursor: grab; }
.fav.drag { opacity: .4; }
.gr { color: var(--mu2); margin-left: -6px; }
.pe { color: var(--mu); }
.hot .gr, .hot .pe { color: var(--oa); }
.hint { color: var(--mu2); font-size: 13px; display: flex; align-items: center; padding-left: 4px; }
.side { width: 40px; height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: transparent; color: var(--mu2); border: 1px dashed var(--s3); border-radius: 12px; }
.side:hover { color: var(--tx); border-color: var(--mu2); }
.side.on { background: var(--ac); color: var(--oa); border: none; }
.ig { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 6px; }
.mb { border: 1px solid var(--bd); color: var(--mu); cursor: pointer; font-family: var(--fm); font-size: 11px; background: transparent; }
.mb:hover { color: var(--ac); border-color: var(--ac); }
.mu { color: var(--mu); } .sm { font-size: 12.5px; }
@media (max-width: 1100px) { .fb { padding: 0 10px; } .fav { min-width: 96px; } }
</style>
