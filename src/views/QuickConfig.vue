<script setup>
import { ref, computed } from 'vue'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import { state, S, saveSettings, toast, gcode, isPrinting, backupBeforeWrite } from '../store'
import { api } from '../api/moonraker'
import { t, tn } from '../i18n'
import { setOption, hasSection } from '../cfgedit'
const drafts = ref({})
const saving = ref(false)
const result = ref(null)
const adding = ref(null)
const raw = computed(() => S('configfile').config || {})
const rawSection = (s) => {
  const k = Object.keys(raw.value).find((x) => x.toLowerCase() === s.toLowerCase())
  return k ? raw.value[k] : null
}
const current = (f) => {
  const sec = rawSection(f.section)
  if (!sec) return undefined
  const k = Object.keys(sec).find((x) => x.toLowerCase() === f.key.toLowerCase())
  return k ? String(sec[k]).trim() : ''
}
const groups = computed(() => {
  const g = {}
  for (const f of state.settings.quickConfig) {
    if (current(f) === undefined) continue
    ;(g[f.section] ||= []).push(f)
  }
  return g
})
const id = (f) => f.section + '|' + f.key
const changes = computed(() => state.settings.quickConfig.filter((f) => drafts.value[id(f)] !== undefined && drafts.value[id(f)] !== current(f)))
async function cfgFiles() {
  const r = await api.call('server.files.list', { root: 'config' })
  const all = r.map((f) => f.path).filter((p) => /\.cfg$/.test(p) && !/^printer-\d{8}_\d{6}\.cfg$/.test(p) && !/(backup|bak|pre_|pre-)/i.test(p))
  return ['printer.cfg', ...all.filter((p) => p !== 'printer.cfg')]
}
async function save(restart) {
  saving.value = true
  const log = []
  try {
    const files = await cfgFiles()
    const texts = {}
    for (const f of changes.value) {
      const v = drafts.value[id(f)]
      let done = false
      for (const fn of files) {
        if (texts[fn] === undefined) texts[fn] = await api.getText(`/server/files/config/${fn.split('/').map(encodeURIComponent).join('/')}`)
        if (!hasSection(texts[fn], f.section)) continue
        const r = setOption(texts[fn], f.section, f.key, v)
        if (r) { texts[fn] = r.text; texts['__dirty_' + fn] = true; log.push({ f, v, file: fn, where: r.where }); done = true; break }
      }
      if (!done) log.push({ f, v, error: 'section not found in any .cfg' })
    }
    for (const fn of Object.keys(texts)) {
      if (!texts['__dirty_' + fn]) continue
      await backupBeforeWrite('config', fn)
      await api.upload(new Blob([texts[fn]], { type: 'text/plain' }), { root: 'config', path: fn.split('/').slice(0, -1).join('/'), name: fn.split('/').pop() })
    }
    drafts.value = {}
    result.value = log
    if (restart && !log.some((l) => l.error)) await gcode('RESTART')
  } catch (e) { toast(t('Save failed: {e}', { e: e.message }), 'error') }
  saving.value = false
}
function removeField(f) {
  state.settings.quickConfig = state.settings.quickConfig.filter((x) => id(x) !== id(f))
  saveSettings()
}
const secNames = computed(() => Object.keys(raw.value).sort())
function addField() {
  const a = adding.value
  if (!a.section || !a.key) return
  if (!state.settings.quickConfig.some((x) => x.section === a.section && x.key === a.key)) state.settings.quickConfig.push({ section: a.section, key: a.key, unit: a.unit || '' })
  saveSettings()
  adding.value = null
}
</script>
<template>
  <div class="page">
    <div class="head" :class="{ dirty: changes.length }">
      <span class="d"></span>
      <b>{{ changes.length ? tn(changes.length, '{n} unsaved change', '{n} unsaved changes') : t('Printer settings') }}</b>
      <span class="mu">{{ t('Edits the matching line in your .cfg files (SAVE_CONFIG block first). Klipper needs a restart to apply.') }}</span>
      <div class="grow"></div>
      <button class="btn" @click="adding = { section: '', key: '', unit: '' }"><Icon name="plus" :size="16" />{{ t('Add field') }}</button>
      <button class="btn" :disabled="!changes.length" @click="drafts = {}"><Icon name="x" :size="16" />{{ t('Discard') }}</button>
      <button class="btn" :disabled="!changes.length || saving" @click="save(false)"><Icon name="save" :size="16" />{{ t('Save') }}</button>
      <button class="btn acc lg" :disabled="!changes.length || saving || isPrinting" @click="save(true)"><Icon name="restart" :stroke="2.4" />{{ saving ? t('Saving…') : t('Save & Restart') }}</button>
    </div>
    <div class="grid3">
      <section v-for="(fields, sec) in groups" :key="sec" class="card">
        <div class="card-h"><h2 class="mono" style="font-size:14px">[{{ sec }}]</h2></div>
        <div class="g2">
          <label v-for="f in fields" :key="f.key" class="fld">
            <span class="row" style="justify-content:space-between"><span class="k mono">{{ f.key }}</span><button class="btn clear ibtn sm rm" :aria-label="t('Remove {k}', { k: f.key })" @click.prevent="removeField(f)"><Icon name="x" :size="12" /></button></span>
            <span class="ib" :class="{ ch: drafts[id(f)] !== undefined && drafts[id(f)] !== current(f) }">
              <input :value="drafts[id(f)] ?? current(f)" @input="drafts[id(f)] = $event.target.value" :aria-label="f.key" spellcheck="false" />
              <span v-if="f.unit" class="u">{{ f.unit }}</span>
            </span>
            <span v-if="drafts[id(f)] !== undefined && drafts[id(f)] !== current(f)" class="was mono">{{ t('was {v}', { v: current(f) }) }}</span>
          </label>
        </div>
      </section>
    </div>
    <div v-if="!Object.keys(groups).length" class="empty">{{ t('No fields match your config yet. Use “Add field”.') }}</div>
  </div>
  <Modal v-if="result" :title="t('Saved')" width="620px" @close="result = null">
    <div v-for="(l, i) in result" :key="i" class="row mono" style="font-size:12px;gap:12px;padding:6px 0;border-bottom:1px solid var(--bd)">
      <Icon :name="l.error ? 'warn' : 'check'" :size="16" :style="{ color: l.error ? 'var(--dg)' : 'var(--ok)', flexShrink: 0 }" />
      <span class="grow">[{{ l.f.section }}] {{ l.f.key }} = {{ l.v }}</span>
      <span class="mu">{{ l.error ? t(l.error) : l.file + ' · ' + l.where }}</span>
    </div>
    <template #foot><button class="btn lg" @click="result = null">{{ t('Close') }}</button><button class="btn lg acc" :disabled="isPrinting" @click="gcode('RESTART'); result = null">{{ t('Restart Klipper') }}</button></template>
  </Modal>
  <Modal v-if="adding" :title="t('Add field')" @close="adding = null">
    <label class="col"><span class="lbl">{{ t('Section') }}</span><select v-model="adding.section" class="input"><option value="" disabled>{{ t('choose…') }}</option><option v-for="s in secNames" :key="s" :value="s">{{ s }}</option></select></label>
    <label class="col" v-if="adding.section"><span class="lbl">{{ t('Option') }}</span><select v-model="adding.key" class="input"><option value="" disabled>{{ t('choose…') }}</option><option v-for="k in Object.keys(rawSection(adding.section) || {})" :key="k" :value="k">{{ k }}</option></select></label>
    <label class="col"><span class="lbl">{{ t('Unit (optional)') }}</span><input v-model="adding.unit" class="input" placeholder="mm/s" /></label>
    <template #foot><button class="btn lg" @click="adding = null">{{ t('Cancel') }}</button><button class="btn lg acc" :disabled="!adding.key" @click="addField">{{ t('Add') }}</button></template>
  </Modal>
</template>
<style scoped>
.head { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--s1); border: 1px solid var(--bd); border-radius: 12px; flex-wrap: wrap; }
.head.dirty { border-color: var(--ac); }
.head .d { width: 10px; height: 10px; border-radius: 5px; background: var(--mu2); }
.head.dirty .d { background: var(--ac); }
.mu { color: var(--mu); font-size: 13px; }
.grid3 { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; align-items: start; }
.g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.fld { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.k { font-size: 12px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
.rm { width: 22px; height: 22px; opacity: .4; }
.rm:hover { opacity: 1; }
.ib { display: flex; align-items: center; height: 40px; background: var(--s2); border: 1px solid var(--bd); border-radius: 10px; padding: 0 12px; gap: 6px; }
.ib:focus-within { border-color: var(--mu); }
.ib.ch { border-color: var(--ac); }
.ib input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; font-family: var(--fm); font-size: 14px; font-weight: 700; }
.u { font-family: var(--fm); font-size: 12px; color: var(--mu); }
.was { font-size: 11px; color: var(--ac); }
</style>
