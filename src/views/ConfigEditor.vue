<script setup>
// Config editor: file tree, tabs, CodeMirror with Klipper syntax, search and replace,
// folding, autocomplete, checks, diff against the saved file or a backup, docs links.
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount, nextTick, markRaw } from 'vue'
import { EditorState, Compartment, StateEffect, StateField, RangeSetBuilder } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars, Decoration } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches, openSearchPanel, gotoLine } from '@codemirror/search'
import { foldGutter, foldKeymap, indentOnInput, bracketMatching, indentUnit } from '@codemirror/language'
import { autocompletion, completionKeymap, closeBrackets } from '@codemirror/autocomplete'
import { linter, lintGutter, lintKeymap, forEachDiagnostic } from '@codemirror/lint'
import { MergeView } from '@codemirror/merge'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import { state, S, toast, gcode, isPrinting, backupBeforeWrite, useApiEvent } from '../store'
import { route, go } from '../router'
import { api } from '../api/moonraker'
import { t } from '../i18n'
import { klipper } from '../editor/klipperLang'
import { lintKlipper } from '../editor/lint'
import { sectionLinks } from '../editor/sectionLinks'
import { SECTION_NAMES, optionsFor, docUrl, sectionType } from '../editor/klipperDocs'

const ROOTS = ['config', 'gcodes', 'logs', 'config_examples', 'docs', 'timelapse']
const loc = computed(() => {
  const a = route.arg || ''
  const i = a.indexOf('/')
  if (i > 0 && ROOTS.includes(a.slice(0, i))) return { root: a.slice(0, i), path: a.slice(i + 1) }
  return { root: 'config', path: a || 'printer.cfg' }
})
const keyOf = (l) => l.root + '/' + l.path

// ---------------------------------------------------------------- tabs (kept while the app is open)
const TABS = (state.cache.editorTabs ||= { list: [], states: {} })
const tabs = ref(TABS.list)
const active = computed(() => tabs.value.find((x) => x.key === keyOf(loc.value)))
const host = ref(null)
const view = shallowRef(null)
const lang = new Compartment(), ro = new Compartment()
const cursor = ref({ line: 1, col: 1, section: '' })
const counts = ref({ error: 0, warning: 0, info: 0 })
const problems = ref([]) // { line, severity, message } for the list behind the counters
const showProblems = ref(false)

// ---------------------------------------------------------------- files
const files = ref([])
async function loadFiles() {
  try { files.value = (await api.call('server.files.list', { root: 'config' })).map((f) => f.path).filter((p, i, a) => !p.includes('::TMPNAME') && a.indexOf(p) === i).sort() } catch {}
}
useApiEvent('notify_filelist_changed', ([p]) => { if (p?.item?.root === 'config') loadFiles() })
const treeQ = ref('')
const openDirs = ref(new Set(['']))
const tree = computed(() => {
  const q = treeQ.value.toLowerCase()
  const list = files.value.filter((f) => !q || f.toLowerCase().includes(q))
  const rows = [], dirsSeen = new Set()
  const pri = (f) => (f === 'printer.cfg' ? 0 : f === 'moonraker.conf' ? 1 : 2)
  const sorted = [...list].sort((a, b) => {
    const da = a.includes('/'), db = b.includes('/')
    if (da !== db) return da ? 1 : -1
    return pri(a) - pri(b) || a.localeCompare(b)
  })
  for (const f of sorted) {
    const parts = f.split('/')
    for (let d = 1; d < parts.length; d++) {
      const dir = parts.slice(0, d).join('/')
      if (!dirsSeen.has(dir)) { dirsSeen.add(dir); rows.push({ dir: true, path: dir, name: parts[d - 1], depth: d - 1 }) }
    }
    rows.push({ dir: false, path: f, name: parts[parts.length - 1], depth: parts.length - 1 })
  }
  // hide rows inside closed folders (a search opens everything)
  return rows.filter((r) => {
    if (q) return true
    const parent = r.path.split('/').slice(0, -1)
    for (let d = 1; d <= parent.length; d++) if (!openDirs.value.has(parent.slice(0, d).join('/'))) return false
    return true
  })
})
function toggleDir(p) { const s = new Set(openDirs.value); s.has(p) ? s.delete(p) : s.add(p); openDirs.value = s }
const editable = (p) => /\.(cfg|conf|txt|py|sh|json|md|ini|yaml|yml|log|gcode_macro)$/i.test(p) || !/\.[a-z0-9]+$/i.test(p)
function openFile(p, root = 'config') { go('config', root === 'config' ? p : root + '/' + p) }

// ---------------------------------------------------------------- completion
function complete(ctx) {
  const line = ctx.state.doc.lineAt(ctx.pos)
  const before = line.text.slice(0, ctx.pos - line.from)
  // [section
  let m = before.match(/^\[([\w ]*)$/)
  if (m) return { from: line.from + 1, options: SECTION_NAMES.map((s) => ({ label: s, type: 'class', apply: s + ']' })), validFor: /^[\w ]*$/ }
  const sec = sectionAt(ctx.state, line.number)
  // option name at column 0
  m = before.match(/^([A-Za-z0-9_]*)$/)
  if (m && sec) {
    const used = Object.keys(S('configfile').settings?.[sec.toLowerCase()] || {})
    const opts = [...new Set([...optionsFor(sec), ...used])]
    return { from: line.from, options: opts.map((o) => ({ label: o, type: 'property', apply: o + ': ' })), validFor: /^[\w]*$/ }
  }
  // G-code command at the start of an indented macro line
  m = before.match(/^\s+([A-Z_0-9]*)$/i)
  if (m && sec && /gcode|macro/i.test(sectionType(sec) + ' ' + sec)) {
    const cmds = Object.entries(state.commands || {}).map(([k, d]) => ({ label: k, type: 'function', info: d }))
    return { from: ctx.pos - m[1].length, options: cmds, validFor: /^[\w]*$/ }
  }
  return null
}
function sectionAt(st, lineNo) {
  for (let n = lineNo; n >= 1; n--) { const mm = st.doc.line(n).text.match(/^\[([^\]]+)\]/); if (mm) return mm[1].trim() }
  return ''
}

// ---------------------------------------------------------------- checks
const lintExt = linter((v) => {
  const a = active.value
  if (!a || a.root !== 'config' || !/\.(cfg|conf)$/i.test(a.path)) return []
  const isKlipper = !/moonraker\.conf$|crowsnest\.conf$|sonar\.conf$/i.test(a.path)
  if (!isKlipper) return []
  return lintKlipper(v.state.doc.toString(), {
    files: files.value.length ? files.value : null, dir: a.path.split('/').slice(0, -1).join('/'),
    warnings: S('configfile').warnings || [], klippyError: state.klippy === 'error' ? state.klippyMessage : '',
  })
}, { delay: 400 })

// ---------------------------------------------------------------- flash a line after a jump
const flashFx = StateEffect.define()
const flashField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) if (e.is(flashFx)) {
      if (e.value == null) return Decoration.none
      const b = new RangeSetBuilder(); const l = tr.state.doc.line(e.value); b.add(l.from, l.from, Decoration.line({ class: 'cm-flash' })); return b.finish()
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

// ---------------------------------------------------------------- editor setup
function extensions(tab) {
  return [
    lineNumbers(), foldGutter(), lintGutter(), highlightSpecialChars(), history(), drawSelection(), EditorState.allowMultipleSelections.of(true),
    indentOnInput(), bracketMatching(), closeBrackets(), rectangularSelection(), crosshairCursor(), highlightActiveLine(), highlightActiveLineGutter(),
    highlightSelectionMatches(), indentUnit.of('  '), autocompletion({ override: [complete], activateOnTyping: true }), lintExt, flashField, sectionLinks(docUrl, t('Ctrl+click: Klipper documentation for this section')),
    lang.of(/\.(cfg|conf)$/i.test(tab.path) ? klipper : []), ro.of(EditorState.readOnly.of(tab.root === 'logs')),
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => (save(false), true) },
      { key: 'Mod-Shift-s', preventDefault: true, run: () => (save(true), true) },
      { key: 'Mod-/', run: toggleComment }, { key: 'Mod-g', run: gotoLine }, { key: 'Mod-h', run: openSearchPanel },
      indentWithTab, ...completionKeymap, ...searchKeymap, ...foldKeymap, ...lintKeymap, ...historyKeymap, ...defaultKeymap,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) { tab.dirty = u.state.doc.toString() !== tab.orig; tabs.value = [...tabs.value] }
      if (u.selectionSet || u.docChanged) {
        const h = u.state.selection.main.head, l = u.state.doc.lineAt(h)
        cursor.value = { line: l.number, col: h - l.from + 1, section: sectionAt(u.state, l.number) }
      }
      const c = { error: 0, warning: 0, info: 0 }
      const list = []
      forEachDiagnostic(u.state, (d) => { c[d.severity] = (c[d.severity] || 0) + 1; list.push({ line: u.state.doc.lineAt(d.from).number, severity: d.severity, message: d.message }) })
      counts.value = c
      problems.value = list.sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.severity] - { error: 0, warning: 1, info: 2 }[b.severity]) || a.line - b.line)
    }),
    EditorView.theme({}, { dark: true }),
    EditorState.phrases.of(Object.fromEntries(['Find', 'Replace', 'next', 'previous', 'all', 'match case', 'regexp', 'by word', 'replace', 'replace all', 'close', 'Go to line', 'go', 'Folded lines', 'Unfolded lines', 'Fold line', 'Unfold line', 'Diagnostics', 'No diagnostics'].map((k) => [k, t(k)]))),
  ]
}
function makeState(tab, doc) { return EditorState.create({ doc, extensions: extensions(tab) }) }

async function openTab(l) {
  const key = keyOf(l)
  let tab = tabs.value.find((x) => x.key === key)
  if (!tab) {
    tab = { key, root: l.root, path: l.path, orig: '', crlf: false, dirty: false, loading: true }
    tabs.value = [...tabs.value, tab]; TABS.list = tabs.value
    try {
      const raw = await api.getText(`/server/files/${l.root}/${l.path.split('/').map(encodeURIComponent).join('/')}`)
      tab.crlf = raw.includes('\r\n'); tab.orig = raw.replace(/\r\n/g, '\n')
    } catch (e) { toast(e.message, 'error'); tab.orig = '' }
    tab.loading = false
    TABS.states[key] = markRaw(makeState(tab, tab.orig))
  }
  if (!TABS.states[key]) TABS.states[key] = markRaw(makeState(tab, tab.orig))
  state.lastCfg = l.root === 'config' ? l.path : state.lastCfg
  await nextTick()
  if (keyOf(loc.value) !== key) return // the user opened another file while this one was loading
  if (!view.value) view.value = markRaw(new EditorView({ state: TABS.states[key], parent: host.value }))
  else if (view.value.state !== TABS.states[key]) view.value.setState(TABS.states[key])
  applyJump()
}
function remember() { const a = active.value; if (a && view.value) TABS.states[a.key] = markRaw(view.value.state) }
function closeTab(tab) {
  if (tab.dirty && !confirm(t('{f} has unsaved changes. Close anyway?', { f: tab.path }))) return
  const i = tabs.value.indexOf(tab)
  tabs.value = tabs.value.filter((x) => x !== tab); TABS.list = tabs.value
  delete TABS.states[tab.key]
  if (active.value === undefined || tab.key === keyOf(loc.value)) {
    const next = tabs.value[Math.max(0, i - 1)]
    const target = next ? { root: next.root, path: next.path } : { root: 'config', path: 'printer.cfg' }
    if (keyOf(target) === keyOf(loc.value)) openTab(target) // same hash: no hashchange, open it directly
    else go('config', target.root === 'config' ? target.path : target.root + '/' + target.path)
  }
}
watch(() => keyOf(loc.value), (n, o) => { if (o) { const ot = tabs.value.find((x) => x.key === o); if (ot && !ot.loading && view.value && view.value.state === TABS.states[o]) TABS.states[o] = markRaw(view.value.state) } openTab(loc.value) })
// EditorStates carry closures (save, cursor, lint) of the component instance that built them; after a remount
// they are rebuilt from their document so Ctrl+S and the status bar keep working
const OWNER = Symbol('editor')
TABS.owner = OWNER
TABS.states = Object.fromEntries(Object.entries(TABS.states).map(([k, st]) => [k, markRaw(EditorState.create({ doc: st.doc, selection: st.selection.main.empty ? undefined : st.selection, extensions: extensions(TABS.list.find((x) => x.key === k) || { key: k, root: 'config', path: k.split('/').slice(1).join('/') }) }))]))
onMounted(() => { loadFiles(); openTab(loc.value) })
watch(() => state.connected, (c) => { if (c) { loadFiles(); const a = active.value; if (a && !a.orig && !a.dirty) { delete TABS.states[a.key]; tabs.value = tabs.value.filter((x) => x !== a); TABS.list = tabs.value; openTab(loc.value) } } })
onBeforeUnmount(() => { remember(); view.value?.destroy() })

function goLine(n) {
  const v = view.value
  if (!v) return
  const l = v.state.doc.line(Math.max(1, Math.min(v.state.doc.lines, n)))
  v.dispatch({ selection: { anchor: l.from, head: l.to }, effects: [EditorView.scrollIntoView(l.from, { y: 'center' }), flashFx.of(l.number)] })
  v.focus()
  setTimeout(() => view.value?.dispatch({ effects: flashFx.of(null) }), 2200)
}
// ---------------------------------------------------------------- jump from Ctrl+K
function applyJump() {
  const j = state.jump, v = view.value, a = active.value
  if (!j || !v || !a || j.file !== a.path) return
  state.jump = null
  const n = Math.max(1, Math.min(v.state.doc.lines, j.line))
  const l = v.state.doc.line(n)
  v.dispatch({ selection: { anchor: l.from, head: l.to }, effects: [EditorView.scrollIntoView(l.from, { y: 'center' }), flashFx.of(n)] })
  v.focus()
  setTimeout(() => view.value?.dispatch({ effects: flashFx.of(null) }), 2200)
}
watch(() => state.jump, applyJump)

// ---------------------------------------------------------------- save
const saving = ref(false)
async function save(restart) {
  const a = active.value, v = view.value
  if (!a || !v || a.root === 'logs') return
  saving.value = true
  const text = v.state.doc.toString()
  try {
    await backupBeforeWrite(a.root, a.path)
    await api.upload(new Blob([a.crlf ? text.replace(/\n/g, '\r\n') : text], { type: 'text/plain' }), { root: a.root, path: a.path.split('/').slice(0, -1).join('/'), name: a.path.split('/').pop() })
    a.orig = text; a.dirty = false; tabs.value = [...tabs.value]
    toast(t('{f} saved', { f: a.path }))
    if (restart) {
      if (a.path === 'moonraker.conf') await api.call('server.restart')
      else if (a.path === 'crowsnest.conf') await api.call('machine.services.restart', { service: 'crowsnest' })
      else await gcode('FIRMWARE_RESTART')
    }
  } catch (e) { toast(t('Save failed: {e}', { e: e.message }), 'error') }
  saving.value = false
}
function revert() { const a = active.value; if (!a) return; view.value.dispatch({ changes: { from: 0, to: view.value.state.doc.length, insert: a.orig } }) }
const dirtyCount = computed(() => tabs.value.filter((x) => x.dirty).length)
function beforeUnload(e) { if (dirtyCount.value) { e.preventDefault(); e.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

// ---------------------------------------------------------------- outline
const outlineQ = ref('')
const outline = computed(() => {
  tabs.value // refresh on edits
  const v = view.value
  if (!v || !active.value) return []
  const out = []
  const doc = v.state.doc
  for (let n = 1; n <= doc.lines; n++) { const m = doc.line(n).text.match(/^\[([^\]]+)\]/); if (m) out.push({ name: m[1].trim(), line: n }) }
  const q = outlineQ.value.toLowerCase()
  return q ? out.filter((o) => o.name.toLowerCase().includes(q)) : out
})
function toLine(n) {
  const v = view.value; const l = v.state.doc.line(n)
  v.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: 'start', yMargin: 40 }) }); v.focus()
}
const showOutline = ref(true)

// ---------------------------------------------------------------- diff and backups
const diff = ref(null) // { title, a, b, from }
const diffHost = ref(null)
let mv = null
const backups = computed(() => {
  const a = active.value
  if (!a || a.root !== 'config') return []
  const base = a.path.replace(/\.(cfg|conf)$/, '').split('/').join('__'), oldBase = a.path.split('/').pop().replace(/\.(cfg|conf)$/, '')
  const list = files.value.filter((f) => f.startsWith('backups/' + base + '-klipperui-') || f.startsWith('backups/' + oldBase + '-klipperui-') || (a.path === 'printer.cfg' && /^(backups\/)?printer-\d{8}_\d{6}\.cfg$/.test(f)))
  return list.sort().reverse().slice(0, 30).map((f) => {
    const m = f.match(/(\d{8})_(\d{4,6})/)
    const when = m ? `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)} ${m[2].slice(0, 2)}:${m[2].slice(2, 4)}` : f
    return { f, when, klipper: !f.includes('-klipperui-') }
  })
})
async function showDiff(backup) {
  const cur = view.value.state.doc.toString()
  let a = active.value.orig, title = t('Changes since the last save')
  if (backup) {
    try { a = (await api.getText('/server/files/config/' + backup.f.split('/').map(encodeURIComponent).join('/'))).replace(/\r\n/g, '\n') } catch (e) { return toast(e.message, 'error') }
    title = t('Backup from {when} compared to the editor', { when: backup.when })
  }
  diff.value = { title, a, b: cur, from: backup || null }
  await nextTick()
  mv?.destroy()
  const ext = [EditorView.editable.of(false), EditorState.readOnly.of(true), lineNumbers(), klipper, EditorView.theme({}, { dark: true })]
  mv = new MergeView({ a: { doc: a, extensions: ext }, b: { doc: cur, extensions: ext }, parent: diffHost.value, collapseUnchanged: { margin: 3, minSize: 6 }, highlightChanges: true, gutter: true })
}
function closeDiff() { mv?.destroy(); mv = null; diff.value = null }
function loadBackup() {
  const d = diff.value
  view.value.dispatch({ changes: { from: 0, to: view.value.state.doc.length, insert: d.a } })
  closeDiff(); toast(t('Backup loaded into the editor. Save to keep it.'))
}

const curDoc = computed(() => cursor.value.section ? docUrl(cursor.value.section) : '')
const isLog = computed(() => active.value?.root === 'logs')
function openSearch() { if (view.value) { openSearchPanel(view.value); } }
</script>

<template>
  <div class="ce">
    <!-- files -->
    <aside class="tree card">
      <div class="th"><Icon name="folder" :size="16" /><b>{{ t('Config files') }}</b></div>
      <input v-model="treeQ" class="input tq" :placeholder="t('Filter')" :aria-label="t('Filter files')" />
      <div class="tl">
        <template v-for="r in tree" :key="(r.dir ? 'd:' : 'f:') + r.path">
          <button v-if="r.dir" class="tr dir" :style="{ paddingLeft: 10 + r.depth * 14 + 'px' }" @click="toggleDir(r.path)"><Icon :name="openDirs.has(r.path) || treeQ ? 'down' : 'right'" :size="13" /><Icon name="folder" :size="15" /><span>{{ r.name }}</span></button>
          <button v-else class="tr" :class="{ on: active?.root === 'config' && active?.path === r.path, dim: !editable(r.path) }" :style="{ paddingLeft: 10 + r.depth * 14 + 'px' }" :disabled="!editable(r.path)" @click="openFile(r.path)">
            <Icon name="file" :size="15" /><span>{{ r.name }}</span><i v-if="tabs.find((x) => x.key === 'config/' + r.path)?.dirty" class="dd"></i>
          </button>
        </template>
      </div>
    </aside>

    <!-- editor -->
    <div class="main-col">
      <div class="tabs" role="tablist">
        <div v-for="x in tabs" :key="x.key" class="tab" :class="{ on: x.key === active?.key }" role="tab" :aria-selected="x.key === active?.key" @click="openFile(x.path, x.root)">
          <span class="tn">{{ x.path.split('/').pop() }}</span><i v-if="x.dirty" class="dd"></i>
          <button class="tx" :aria-label="t('Close {name}', { name: x.path })" @click.stop="closeTab(x)"><Icon name="x" :size="12" /></button>
        </div>
      </div>
      <div class="tbar">
        <button class="btn" :aria-label="t('Search and replace')" data-tip="Ctrl+F / Ctrl+H" @click="openSearch"><Icon name="search" :size="15" />{{ t('Find') }}</button>
        <button class="btn" :disabled="!active?.dirty" @click="showDiff()"><Icon name="diff" :size="15" />{{ t('Changes') }}</button>
        <div v-if="backups.length" class="dropdown">
          <button class="btn"><Icon name="clock" :size="15" />{{ t('Backups') }}<Icon name="down" :size="12" /></button>
          <div class="menu card"><button v-for="b in backups" :key="b.f" class="mi" @click="showDiff(b)"><span>{{ b.when }}</span><span class="mu">{{ b.klipper ? 'SAVE_CONFIG' : t('before save') }}</span></button></div>
        </div>
        <a v-if="curDoc" class="btn clear" :href="curDoc" target="_blank" rel="noopener" :data-tip="t('Klipper documentation for this section')"><Icon name="info" :size="15" />[{{ cursor.section }}]</a>
        <span class="grow"></span>
        <button class="btn" :disabled="!active?.dirty" @click="revert">{{ t('Revert') }}</button>
        <button class="btn" :disabled="!active?.dirty || saving || isLog" data-tip="Ctrl+S" @click="save(false)"><Icon name="save" :size="16" />{{ t('Save') }}</button>
        <button class="btn acc" :disabled="saving || isPrinting || isLog || active?.root === 'gcodes'" data-tip="Ctrl+Shift+S" @click="save(true)"><Icon name="restart" :size="16" :stroke="2.4" />{{ t('Save & Restart') }}</button>
        <button class="btn clear ibtn sm" :aria-label="t('Outline')" @click="showOutline = !showOutline"><Icon name="sidebar" :size="16" /></button>
      </div>
      <div ref="host" class="cm-host" :class="{ loading: active?.loading }"></div>
      <div class="status">
        <span>{{ t('Line {l}, column {c}', { l: cursor.line, c: cursor.col }) }}</span>
        <span v-if="problems.length" class="pb">
          <button class="pbb" :aria-label="t('Problems')" :aria-expanded="showProblems" @click.stop="showProblems = !showProblems">
            <span v-if="counts.error" class="e"><Icon name="warn" :size="12" />{{ counts.error }}</span>
            <span v-if="counts.warning" class="w"><Icon name="warn" :size="12" />{{ counts.warning }}</span>
            <span v-if="counts.info" class="i">{{ counts.info }} {{ t('notes') }}</span>
          </button>
          <div v-if="showProblems" class="pl card" v-away="() => (showProblems = false)">
            <button v-for="(p, k) in problems" :key="k" class="pli" :class="p.severity" @click="goLine(p.line); showProblems = false"><b class="mono">{{ p.line }}</b><span>{{ p.message }}</span></button>
          </div>
        </span>
        <span class="grow"></span>
        <span v-if="isLog">{{ t('read only') }}</span>
        <span>{{ active?.crlf ? 'CRLF' : 'LF' }}</span>
        <span class="kb">Ctrl+F {{ t('find') }} · Ctrl+H {{ t('replace') }} · Ctrl+G {{ t('line') }} · Ctrl+/ {{ t('comment') }} · Ctrl+Space {{ t('suggest') }}</span>
      </div>
    </div>

    <!-- outline -->
    <aside v-if="showOutline" class="ol card">
      <div class="th"><Icon name="list" :size="16" /><b>{{ t('Outline') }}</b><span class="mu">{{ outline.length }}</span></div>
      <input v-model="outlineQ" class="input tq" :placeholder="t('Filter')" :aria-label="t('Filter sections')" />
      <div class="tl">
        <div v-for="o in outline" :key="o.line" class="oi" :class="{ on: o.name === cursor.section }">
          <button class="on-l" @click="toLine(o.line)">[{{ o.name }}]</button>
          <a class="doc" :href="docUrl(o.name)" target="_blank" rel="noopener" :aria-label="t('Klipper documentation for this section')"><Icon name="info" :size="13" /></a>
        </div>
        <div v-if="!outline.length" class="mu" style="padding:8px 10px;font-size:12px">{{ t('No sections') }}</div>
      </div>
    </aside>
  </div>

  <Modal v-if="diff" :title="diff.title" width="1100px" @close="closeDiff">
    <div class="dlg mu"><span>{{ diff.from ? t('Left: backup') : t('Left: saved file') }}</span><span>{{ t('Right: editor') }}</span></div>
    <div ref="diffHost" class="diff"></div>
    <template #foot>
      <button v-if="diff.from" class="btn lg" @click="loadBackup"><Icon name="restart" :size="16" />{{ t('Load this backup') }}</button>
      <button class="btn lg acc" @click="closeDiff">{{ t('Close') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.ce { display: flex; gap: 16px; height: calc(100vh / var(--zoom, 1) - 208px); min-height: 480px; }
.tree, .ol { width: 230px; flex-shrink: 0; padding: 12px; gap: 8px; min-height: 0; }
.ol { width: 240px; }
.th { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.th .mu { margin-left: auto; font-size: 12px; }
.tq { height: 32px; font-size: 13px; }
.tl { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; margin: 0 -4px; }
.tr { display: flex; align-items: center; gap: 7px; height: 30px; padding-right: 8px; border: none; background: transparent; color: var(--tx); border-radius: 8px; font-size: 13px; text-align: left; flex-shrink: 0; }
.tr span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr :deep(svg) { color: var(--mu); flex-shrink: 0; }
.tr:hover:not(:disabled) { background: var(--s2); }
.tr.on { background: var(--s2); box-shadow: inset 3px 0 0 var(--ac); font-weight: 600; }
.tr.dir { color: var(--mu); }
.tr.dim { opacity: .45; }
.dd { width: 7px; height: 7px; border-radius: 4px; background: var(--wn); display: inline-block; flex-shrink: 0; margin-left: auto; }
.main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.tabs { display: flex; gap: 2px; overflow-x: auto; flex-shrink: 0; }
.tab { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 6px 0 12px; border-radius: 10px 10px 0 0; background: transparent; color: var(--mu); font-size: 13px; cursor: pointer; white-space: nowrap; }
.tab:hover { color: var(--tx); }
.tab.on { background: var(--s1); color: var(--tx); font-weight: 600; }
.tab .dd { margin-left: 0; }
.tx { width: 22px; height: 22px; border: none; background: transparent; color: var(--mu); border-radius: 6px; display: flex; align-items: center; justify-content: center; }
.tx:hover { background: var(--s3); color: var(--tx); }
.tbar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--s1); border-radius: 0 12px 0 0; flex-wrap: wrap; }
.dropdown { position: relative; }
.dropdown .menu { position: absolute; top: 38px; left: 0; z-index: 20; width: 280px; max-height: 360px; overflow: auto; padding: 6px; gap: 2px; display: none; box-shadow: 0 12px 40px rgba(0,0,0,.45); }
.dropdown:hover .menu, .dropdown:focus-within .menu { display: flex; }
.mi { display: flex; justify-content: space-between; gap: 10px; height: 32px; padding: 0 10px; border: none; background: transparent; color: var(--tx); border-radius: 8px; font-size: 13px; font-variant-numeric: tabular-nums; }
.mi:hover { background: var(--s2); }
.mi .mu { color: var(--mu); font-size: 12px; }
.cm-host { flex: 1; min-height: 0; background: var(--s1); overflow: hidden; }
.cm-host.loading { opacity: .5; }
.status { display: flex; align-items: center; gap: 14px; padding: 6px 12px; background: var(--s1); border-top: 1px solid var(--bd); border-radius: 0 0 12px 12px; font-size: 12px; color: var(--mu); font-variant-numeric: tabular-nums; }
.status span { display: inline-flex; align-items: center; gap: 4px; }
.status .e { color: var(--dg); } .status .w { color: var(--wn); } .status .i { color: var(--bl); }
.status .kb { color: var(--mu2); }
.pb { position: relative; }
.pbb { display: inline-flex; gap: 10px; align-items: center; background: transparent; border: none; padding: 2px 6px; margin: -2px -6px; border-radius: 6px; font: inherit; cursor: pointer; }
.pbb:hover { background: var(--s2); }
.pl { position: absolute; left: 0; bottom: calc(100% + 8px); width: min(560px, 80vw); max-height: 320px; overflow: auto; padding: 6px; gap: 2px; z-index: 40; box-shadow: 0 12px 40px rgba(0,0,0,.5); }
.pli { display: flex; gap: 10px; align-items: baseline; text-align: left; background: transparent; border: none; border-left: 3px solid var(--bl); border-radius: 4px; padding: 6px 8px; color: var(--tx); font-size: 12.5px; cursor: pointer; }
.pli:hover { background: var(--s2); }
.pli.error { border-left-color: var(--dg); } .pli.warning { border-left-color: var(--wn); }
.pli b { color: var(--mu); min-width: 32px; }
.oi { display: flex; align-items: center; border-radius: 8px; flex-shrink: 0; }
.oi:hover { background: var(--s2); }
.oi.on { background: var(--s2); box-shadow: inset 3px 0 0 var(--ac); }
.on-l { flex: 1; min-width: 0; height: 28px; padding: 0 10px; border: none; background: transparent; color: var(--tx); text-align: left; font-family: var(--fm); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; color: var(--mu2); opacity: 0; }
.oi:hover .doc { opacity: 1; }
.doc:hover { color: var(--ac); }
.dlg { display: flex; justify-content: space-between; font-size: 12px; }
.diff { height: calc(60vh / var(--zoom, 1)); overflow: auto; border-radius: 10px; background: var(--s2); }
@media (max-width: 1100px) { .ce { flex-direction: column; height: auto; } .tree, .ol { width: auto; max-height: 220px; } .cm-host { height: calc(70vh / var(--zoom, 1)); flex: none; } .status .kb { display: none; } }
</style>

<style>
/* CodeMirror theme from the app tokens (works for dark and light) */
:root { --cm-key: #6fb0ec; --cm-num: #e8b86a; --cm-pin: #56d39a; --cm-kw: #c38bff; --cm-fn: #6fd6c6; --cm-var: #f0a0c0; --cm-attr: #9ec7f0; }
:root[data-theme="light"] { --cm-key: #1f63a8; --cm-num: #a0620a; --cm-pin: #1d8656; --cm-kw: #7a3fc4; --cm-fn: #0f7f73; --cm-var: #b03a6c; --cm-attr: #2b5f94; }
.cm-host .cm-editor, .diff .cm-editor { height: 100%; font-size: 13px; background: var(--s1); color: var(--tx); }
.diff .cm-editor { background: var(--s2); height: auto; }
.cm-editor .cm-scroller { font-family: var(--fm); line-height: 1.65; }
.cm-editor.cm-focused { outline: none; }
.cm-editor .cm-gutters { background: var(--s1); border-right: 1px solid var(--bd); color: var(--mu2); }
.cm-editor .cm-activeLine { background: color-mix(in srgb, var(--tx) 4%, transparent); }
.cm-editor .cm-activeLineGutter { background: transparent; color: var(--tx); }
.cm-editor .cm-cursor { border-left-color: var(--ac); border-left-width: 2px; }
.cm-editor .cm-selectionBackground, .cm-editor.cm-focused .cm-selectionBackground, .cm-editor ::selection { background: color-mix(in srgb, var(--ac) 28%, transparent) !important; }
.cm-editor .cm-selectionMatch { background: color-mix(in srgb, var(--wn) 18%, transparent); }
/* search hits: a soft tint plus underline so the coloured text stays readable, the current hit gets a ring */
.cm-editor .cm-searchMatch { background: color-mix(in srgb, var(--wn) 18%, transparent); border-radius: 3px; box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--wn) 70%, transparent); }
.cm-editor .cm-searchMatch-selected { background: color-mix(in srgb, var(--ac) 20%, transparent); box-shadow: 0 0 0 1.5px var(--ac), inset 0 -2px 0 var(--ac); }
.cm-editor .cm-matchingBracket { background: color-mix(in srgb, var(--ok) 25%, transparent); outline: none; }
.cm-editor .cm-foldPlaceholder { background: var(--s3); border: none; color: var(--mu); padding: 0 6px; border-radius: 4px; }
.cm-editor .cm-foldGutter span { color: var(--mu2); }
.cm-editor .cm-panels { background: var(--s2); color: var(--tx); border-top: 1px solid var(--bd); }
.cm-editor .cm-panels-bottom { border-top: 1px solid var(--bd); }
.cm-editor .cm-panel.cm-search { padding: 8px 10px; font-family: var(--fd); font-size: 13px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cm-editor .cm-panel.cm-search input.cm-textfield { background: var(--s1); border: 1px solid var(--bd); color: var(--tx); border-radius: 8px; height: 30px; padding: 0 10px; font-size: 13px; }
.cm-editor .cm-panel.cm-search input.cm-textfield:focus { border-color: var(--ac); outline: none; }
.cm-editor .cm-panel.cm-search button.cm-button { background: var(--s3); background-image: none; border: none; color: var(--tx); border-radius: 8px; height: 30px; padding: 0 10px; font-size: 12.5px; font-weight: 600; text-transform: none; }
.cm-editor .cm-panel.cm-search button.cm-button:hover { background: var(--hover); }
.cm-editor .cm-panel.cm-search label { color: var(--mu); font-size: 12.5px; display: inline-flex; gap: 4px; align-items: center; }
.cm-editor .cm-panel.cm-search [name=close] { color: var(--mu); font-size: 18px; }
.cm-editor .cm-tooltip { background: var(--s2); border: 1px solid var(--bd); color: var(--tx); border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.cm-editor .cm-tooltip-autocomplete ul li[aria-selected] { background: color-mix(in srgb, var(--ac) 22%, transparent); color: var(--tx); }
.cm-editor .cm-completionInfo { background: var(--s2); border: 1px solid var(--bd); color: var(--mu); }
.cm-editor .cm-diagnostic { padding: 6px 10px; }
.cm-editor.cm-ctrl .cm-sec { text-decoration: underline; text-underline-offset: 3px; cursor: pointer; color: var(--ac); }
.cm-editor .cm-diagnostic-error { border-left: 3px solid var(--dg); }
.cm-editor .cm-diagnostic-warning { border-left: 3px solid var(--wn); }
.cm-editor .cm-diagnostic-info { border-left: 3px solid var(--bl); }
.cm-editor .cm-lintRange-error { background-image: none; text-decoration: underline wavy var(--dg); text-underline-offset: 3px; }
.cm-editor .cm-lintRange-warning { background-image: none; text-decoration: underline wavy var(--wn); text-underline-offset: 3px; }
.cm-editor .cm-lintRange-info { background-image: none; text-decoration: underline dotted var(--bl); text-underline-offset: 3px; }
.cm-editor .cm-flash { background: color-mix(in srgb, var(--ac) 22%, transparent); box-shadow: inset 3px 0 0 var(--ac); }
.cm-mergeView .cm-changedLine, .cm-merge-b .cm-changedLine { background: color-mix(in srgb, var(--ok) 12%, transparent); }
.cm-merge-a .cm-changedLine { background: color-mix(in srgb, var(--dg) 12%, transparent); }
.cm-merge-a .cm-changedText { background: color-mix(in srgb, var(--dg) 35%, transparent); }
.cm-merge-b .cm-changedText { background: color-mix(in srgb, var(--ok) 35%, transparent); }
.cm-merge-spacer, .cm-collapsedLines { background: var(--s3) !important; color: var(--mu) !important; }
</style>
