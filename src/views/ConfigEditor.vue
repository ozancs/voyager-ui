<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import Icon from '../components/Icon.vue'
import { state, toast, gcode, isPrinting, backupBeforeWrite } from '../store'
import { route } from '../router'
import { api } from '../api/moonraker'
const text = ref('')
const orig = ref('')
const loading = ref(false)
const saving = ref(false)
const ta = ref(null), pre = ref(null), gut = ref(null)
const ROOTS = ['config', 'gcodes', 'logs', 'config_examples', 'docs', 'timelapse']
const loc = computed(() => {
  const a = route.arg || ''
  const i = a.indexOf('/')
  if (i > 0 && ROOTS.includes(a.slice(0, i))) return { root: a.slice(0, i), path: a.slice(i + 1) }
  return { root: 'config', path: a }
})
const file = computed(() => loc.value.path)
const dirty = computed(() => text.value !== orig.value)
async function load() {
  if (!file.value) return
  loading.value = true
  try { text.value = orig.value = await api.getText(`/server/files/${loc.value.root}/${file.value}`) } catch (e) { toast(e.message, 'error'); text.value = orig.value = '' }
  loading.value = false
  applyJump()
}
onMounted(load)
watch(file, load)
// jump to a line (from Ctrl+K search)
const flash = ref(-1)
function applyJump() {
  const j = state.jump
  if (!j || j.file !== file.value || loading.value || !ta.value) return
  state.jump = null
  requestAnimationFrame(() => {
    const lines = text.value.split('\n')
    const i = Math.max(0, Math.min(lines.length - 1, j.line - 1))
    const start = lines.slice(0, i).reduce((a, l) => a + l.length + 1, 0)
    const lh = parseFloat(getComputedStyle(ta.value).lineHeight) || 22.1
    ta.value.scrollTop = Math.max(0, i * lh - ta.value.clientHeight / 3)
    ta.value.focus()
    ta.value.setSelectionRange(start, start + lines[i].length)
    sync()
    flash.value = i
    setTimeout(() => (flash.value = -1), 2200)
  })
}
watch(() => state.jump, applyJump)
async function save(restart) {
  saving.value = true
  try {
    await backupBeforeWrite(loc.value.root, file.value)
    await api.upload(new Blob([text.value], { type: 'text/plain' }), { root: loc.value.root, path: file.value.split('/').slice(0, -1).join('/'), name: file.value.split('/').pop() })
    orig.value = text.value
    toast(file.value + ' saved')
    if (restart) {
      if (file.value === 'moonraker.conf') await api.call('server.restart')
      else if (file.value === 'crowsnest.conf') await api.call('machine.services.restart', { service: 'crowsnest' })
      else await gcode('FIRMWARE_RESTART')
    }
  } catch (e) { toast('Save failed: ' + e.message, 'error') }
  saving.value = false
}
function key(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(false) }
  if (e.key === 'Tab') {
    e.preventDefault()
    const t = e.target, s = t.selectionStart
    text.value = text.value.slice(0, s) + '  ' + text.value.slice(t.selectionEnd)
    requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2 })
  }
}
function sync() { pre.value.scrollTop = ta.value.scrollTop; pre.value.scrollLeft = ta.value.scrollLeft; gut.value.scrollTop = ta.value.scrollTop }
const escH = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MK = '\u0002', ME = '\u0003'
const marked = computed(() => {
  if (!matches.value.length) return text.value
  let out = '', last = 0
  const L = q.value.length
  matches.value.forEach((m, k) => { out += text.value.slice(last, m) + (k === qi.value ? '\u0004' : MK) + text.value.slice(m, m + L) + ME; last = m + L })
  return out + text.value.slice(last)
})
const html = computed(() => marked.value.split('\n').map((l, i) => i === flash.value ? '\u0005' + hlLine(l) + '\u0006' : hlLine(l)).join('\n').replace(/\u0005/g, '<span class="fl">').replace(/\u0006/g, '</span>').replace(/\u0004/g, '<mark class="cur">').replace(/\u0002/g, '<mark>').replace(/\u0003/g, '</mark>') + '\n')
function hlLine(l) {
  let m
  if ((m = l.match(/^(\s*)(\[[^\]]*\])(.*)$/))) return `${escH(m[1])}<span class="s">${escH(m[2])}</span><span class="c">${escH(m[3])}</span>`
  if (/^\s*[#;]/.test(l)) return `<span class="c">${escH(l)}</span>`
  if ((m = l.match(/^([A-Za-z0-9_.\-]+)(\s*[:=])(.*?)(\s[#;].*)?$/))) return `<span class="k">${escH(m[1])}</span><span class="p">${escH(m[2])}</span>${escH(m[3])}${m[4] ? `<span class="c">${escH(m[4])}</span>` : ''}`
  if (/^\s+/.test(l)) return l.replace(/(\{[%{].*?[%}]\})/g, '\u0000$1\u0001').split(/[\u0000\u0001]/).map((x) => /^\{[%{]/.test(x) ? `<span class="j">${escH(x)}</span>` : `<span class="g">${escH(x)}</span>`).join('')
  return escH(l)
}
const lineCount = computed(() => text.value.split('\n').length)
const sections = computed(() => text.value.split('\n').map((l, i) => [l.match(/^\[([^\]]+)\]/)?.[1], i]).filter(([s]) => s))
function jump(i) {
  const lh = 22.1
  ta.value.scrollTop = Math.max(0, i * lh - 40)
  sync()
}
// ---- search ----
const q = ref('')
const qi = ref(0)
const qin = ref(null)
const matches = computed(() => {
  const t = q.value.toLowerCase()
  if (!t) return []
  const out = [], hay = text.value.toLowerCase()
  let i = hay.indexOf(t)
  while (i >= 0 && out.length < 2000) { out.push(i); i = hay.indexOf(t, i + t.length) }
  return out
})
function showMatch(focusEditor = false) {
  const m = matches.value[qi.value]
  if (m == null || !ta.value) return
  const line = text.value.slice(0, m).split('\n').length - 1
  const lh = parseFloat(getComputedStyle(ta.value).lineHeight) || 22.1
  ta.value.scrollTop = Math.max(0, line * lh - ta.value.clientHeight / 3)
  ta.value.setSelectionRange(m, m + q.value.length)
  if (focusEditor) ta.value.focus()
  sync()
}
watch(q, () => { qi.value = 0; showMatch() })
function nextMatch(d) {
  if (!matches.value.length) return
  qi.value = (qi.value + d + matches.value.length) % matches.value.length
  showMatch()
}
function globalKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); qin.value?.focus(); qin.value?.select() }
}
onMounted(() => window.addEventListener('keydown', globalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', globalKey))
function beforeUnload(e) { if (dirty.value) { e.preventDefault(); e.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>
<template>
  <div class="split" style="height:calc(100vh - 208px)">
    <div class="col grow" style="gap:0;min-height:0">
      <div class="row" style="padding-bottom:10px">
        <b class="mono" style="font-size:15px">{{ file }}</b><span v-if="dirty" class="chip" style="color:var(--ac)"><i></i>unsaved</span>
        <div class="grow"></div>
        <label class="sb"><input ref="qin" v-model="q" placeholder="Search" aria-label="Search in file" @keydown.enter.prevent="nextMatch($event.shiftKey ? -1 : 1)" @keydown.esc="q = ''" />
          <span class="mono cnt">{{ q ? (matches.length ? qi + 1 + '/' + matches.length : '0/0') : '' }}</span>
          <button class="btn clear ibtn sm" aria-label="Previous match" :disabled="!matches.length" @click="nextMatch(-1)"><Icon name="up" :size="14" /></button>
          <button class="btn clear ibtn sm" aria-label="Next match" :disabled="!matches.length" @click="nextMatch(1)"><Icon name="down" :size="14" /></button>
        </label>
        <button class="btn" :disabled="!dirty" @click="text = orig">Revert</button>
        <button class="btn" :disabled="!dirty || saving" @click="save(false)"><Icon name="save" :size="16" />Save</button>
        <button class="btn acc" :disabled="saving || isPrinting" @click="save(true)"><Icon name="restart" :size="16" :stroke="2.4" />Save &amp; Restart</button>
      </div>
      <div class="ed">
        <div ref="gut" class="gut code"><div v-for="n in lineCount" :key="n">{{ n }}</div></div>
        <div class="area">
          <pre ref="pre" class="hl code" aria-hidden="true" v-html="html"></pre>
          <textarea ref="ta" v-model="text" class="code" spellcheck="false" wrap="off" :aria-label="file" :disabled="loading" @scroll="sync" @keydown="key"></textarea>
        </div>
      </div>
    </div>
    <section class="card side-col" style="width:260px;overflow:auto">
      <div class="card-h"><h2>Outline</h2></div>
      <button v-for="[s, i] in sections" :key="i" class="ol code" @click="jump(i)">[{{ s }}]</button>
    </section>
  </div>
</template>
<style scoped>
.ed { flex: 1; min-height: 0; display: flex; background: var(--s1); border: 1px solid var(--bd); border-radius: 12px; overflow: hidden; }
.gut { width: 56px; flex-shrink: 0; overflow: hidden; padding: 14px 12px 14px 0; text-align: right; color: var(--mu2); font-size: 13px; line-height: 1.7; user-select: none; border-right: 1px solid var(--bd); }
.area { position: relative; flex: 1; min-width: 0; }
.hl, textarea { position: absolute; inset: 0; margin: 0; padding: 14px 16px; font-size: 13px; line-height: 1.7; white-space: pre; overflow: auto; tab-size: 2; border: none; }
.hl { color: var(--tx); pointer-events: none; overflow: hidden; }
textarea { background: transparent; color: transparent; caret-color: var(--ac); outline: none; resize: none; }
textarea::selection { background: rgba(255, 107, 26, .3); color: transparent; }
.hl :deep(.s) { color: var(--ac); font-weight: 700; }
.hl :deep(.k) { color: #5aa9ff; }
.hl :deep(.p) { color: var(--mu); }
.hl :deep(.c) { color: #6b7079; font-style: italic; }
.hl :deep(.g) { color: #d9d4c7; }
.hl :deep(.j) { color: #c38bff; }
.sb { display: flex; align-items: center; gap: 2px; height: 34px; padding: 0 4px 0 10px; background: var(--s2); border: 1px solid var(--bd); border-radius: 10px; }
.sb:focus-within { border-color: var(--ac); }
.sb input { width: 180px; background: transparent; border: none; outline: none; font-size: 13px; }
.sb .ibtn.sm { width: 26px; height: 26px; }
.cnt { font-size: 11px; color: var(--mu); min-width: 44px; text-align: right; }
.hl :deep(mark) { background: rgba(245, 196, 81, .28); color: inherit; border-radius: 2px; }
.hl :deep(mark.cur) { background: var(--ac); color: var(--oa); }
.hl :deep(.fl) { background: rgba(255,107,26,.22); box-shadow: -4px 0 0 var(--ac); display: inline-block; min-width: 100%; animation: flfade 2.2s ease-out forwards; }
@keyframes flfade { 70% { background: rgba(255,107,26,.22); } 100% { background: transparent; box-shadow: none; } }
.ol { height: 28px; padding: 0 8px; background: transparent; border: none; border-radius: 6px; text-align: left; font-size: 12px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ol:hover { background: var(--s2); color: var(--ac); }
</style>
