<script setup>
import { ref, computed, onMounted } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { fmtBytes, fmtDate, toast, useApiEvent } from '../store'
import { api } from '../api/moonraker'
import { go } from '../router'
import { downloadMany } from '../features'
import { t } from '../i18n'
const roots = ref(['config'])
const root = ref('config')
const path = ref('')
const dirs = ref([]), files = ref([]), disk = ref(null)
const sort = ref({ k: 'filename', d: 1 })
const up = ref(null)
const fileInput = ref(null)
const modal = ref(null) // { kind: 'newfile'|'newdir'|'rename'|'delete', item, value }
const EDITABLE = /\.(cfg|conf|txt|py|json|md|sh|log|ini|yaml|yml|gcode_macro)$/i
const full = computed(() => root.value + (path.value ? '/' + path.value : ''))
async function load() {
  try {
    const r = await api.call('server.files.get_directory', { path: full.value, extended: false })
    const ok = (n) => !n.startsWith('.') && !n.includes('::TMPNAME')
    dirs.value = r.dirs.filter((d) => ok(d.dirname))
    files.value = r.files.filter((f) => ok(f.filename))
    disk.value = r.disk_usage
  } catch (e) { toast(e.message, 'error') }
}
onMounted(async () => {
  try { roots.value = (await api.call('server.files.roots')).map((r) => r.name) } catch {}
  load()
})
let rt
useApiEvent('notify_filelist_changed', () => { clearTimeout(rt); rt = setTimeout(load, 300) })
const rows = computed(() => {
  const { k, d } = sort.value
  const cmp = (a, b) => (k === 'filename' ? String(a.name).localeCompare(b.name) : (a[k] ?? 0) - (b[k] ?? 0)) * d
  const ds = dirs.value.map((x) => ({ ...x, name: x.dirname, dir: true })).sort(cmp)
  const fs = files.value.map((x) => ({ ...x, name: x.filename })).sort(cmp)
  return [...ds, ...fs]
})
function sortBy(k) { sort.value = { k, d: sort.value.k === k ? -sort.value.d : k === 'filename' ? 1 : -1 } }
function changeRoot(r) { root.value = r; path.value = ''; picked.value = new Set(); load() }
function open(it) {
  if (it.dir) { path.value = path.value ? path.value + '/' + it.name : it.name; picked.value = new Set(); load(); return }
  const rel = (path.value ? path.value + '/' : '') + it.name
  if (EDITABLE.test(it.name)) go('config', root.value + '/' + rel)
  else window.open(api.url(`/server/files/${root.value}/${rel}`), '_blank')
}
function upDir() { path.value = path.value.split('/').slice(0, -1).join('/'); picked.value = new Set(); load() }
async function upload(e, sub = '') {
  const fs = [...e.target.files]; e.target.value = ''
  const dest = [path.value, sub].filter(Boolean).join('/')
  let ok = 0
  for (const f of fs) {
    up.value = 0
    try { await api.upload(f, { root: root.value, path: dest, onProgress: (p) => (up.value = p) }); ok++ } catch (err) { toast(err.message, 'error') }
  }
  up.value = null
  if (ok) { toast(ok === 1 ? t('Uploaded {name}', { name: fs[0].name }) : t('Uploaded {n} files', { n: ok })); load() }
}
// drag files from the computer onto the card (or onto a folder row to put them inside it)
const over = ref(false), overDir = ref(null)
let depth = 0
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
function dEnter(e) { if (!hasFiles(e)) return; depth++; over.value = true }
function dLeave(e) { if (!hasFiles(e)) return; if (--depth <= 0) { depth = 0; over.value = false; overDir.value = null } }
function dDrop(e, dir = '') {
  depth = 0; over.value = false; overDir.value = null
  if (e.dataTransfer?.files?.length) upload({ target: { files: e.dataTransfer.files, value: '' } }, dir)
}
async function confirmModal() {
  const m = modal.value
  modal.value = null
  const base = full.value
  try {
    if (m.kind === 'newdir') await api.call('server.files.post_directory', { path: `${base}/${m.value}` })
    else if (m.kind === 'newfile') await api.upload(new Blob([''], { type: 'text/plain' }), { root: root.value, path: path.value, name: m.value })
    else if (m.kind === 'rename') await api.call('server.files.move', { source: `${base}/${m.item.name}`, dest: `${base}/${m.value}` })
    else if (m.kind === 'delete') {
      if (m.item.dir) await api.call('server.files.delete_directory', { path: `${base}/${m.item.name}`, force: true })
      else await api.call('server.files.delete_file', { path: `${base}/${m.item.name}` })
    }
  } catch (e) { toast(e.message, 'error') }
}
// multi select for download / delete
const picked = ref(new Set())
const key = (it) => (it.dir ? 'd:' : 'f:') + it.name
function togglePick(it) { const s = new Set(picked.value); s.has(key(it)) ? s.delete(key(it)) : s.add(key(it)); picked.value = s }
const pickedRows = computed(() => rows.value.filter((it) => picked.value.has(key(it))))
const allPicked = computed(() => rows.value.length > 0 && rows.value.every((it) => picked.value.has(key(it))))
function toggleAll() { picked.value = allPicked.value ? new Set() : new Set(rows.value.map(key)) }
function dlPicked() {
  const its = pickedRows.value
  if (its.length === 1 && !its[0].dir) { const a = document.createElement('a'); a.href = api.url(`/server/files/${full.value}/${its[0].name}`); a.download = its[0].name; a.click(); return }
  downloadMany(root.value, its.map((it) => ({ path: (path.value ? path.value + '/' : '') + it.name, dir: it.dir })), root.value)
}
async function deletePicked() {
  const its = pickedRows.value
  modal.value = null
  let fail = 0
  for (const it of its) {
    try {
      if (it.dir) await api.call('server.files.delete_directory', { path: `${full.value}/${it.name}`, force: true })
      else await api.call('server.files.delete_file', { path: `${full.value}/${it.name}` })
    } catch { fail++ }
  }
  picked.value = new Set()
  if (fail) toast(t('{n} file(s) could not be deleted', { n: fail }), 'error')
  load()
}
const TITLES = { newdir: 'New folder', newfile: 'New file', rename: 'Rename', delete: 'Delete', bulkdelete: 'Delete' }
</script>
<template>
  <section class="card drop" :class="{ over }" @dragenter="dEnter" @dragleave="dLeave" @dragover.prevent @drop.prevent="dDrop($event)">
    <div v-if="over" class="dz"><div class="pill"><Icon name="upload" :size="20" :stroke="2.4" /><b>{{ overDir ? t('Drop to upload into {dir}', { dir: overDir }) : t('Drop to upload to /{p}', { p: full }) }}</b></div></div>
    <div class="card-h"><h2 class="row"><Icon name="folder" :size="18" />{{ t('Config Files') }}</h2></div>
    <div class="row" style="flex-wrap:wrap">
      <select class="input" style="flex:1;min-width:160px" :value="root" :aria-label="t('Root')" @change="changeRoot($event.target.value)"><option v-for="r in roots" :key="r" :value="r">{{ r }}</option></select>
      <button class="btn ibtn" style="width:40px;height:40px" :aria-label="t('Upload file')" @click="fileInput.click()"><Icon name="upload" :size="18" /></button>
      <button class="btn ibtn" style="width:40px;height:40px" :aria-label="t('New file')" @click="modal = { kind: 'newfile', value: '' }"><Icon name="file" :size="18" /></button>
      <button class="btn ibtn" style="width:40px;height:40px" :aria-label="t('New folder')" @click="modal = { kind: 'newdir', value: '' }"><Icon name="folder" :size="18" /></button>
      <button class="btn ibtn" style="width:40px;height:40px" :aria-label="t('Refresh')" @click="load"><Icon name="refresh" :size="18" /></button>
      <input ref="fileInput" type="file" multiple hidden @change="upload" />
    </div>
    <div v-if="picked.size" class="bulk row">
      <b>{{ t('{n} selected', { n: picked.size }) }}</b>
      <span class="grow"></span>
      <button class="btn" @click="dlPicked"><Icon name="download" :size="16" />{{ t('Download') }}</button>
      <button class="btn dg" @click="modal = { kind: 'bulkdelete' }"><Icon name="trash" :size="16" />{{ t('Delete') }}</button>
      <button class="btn clear" @click="picked = new Set()">{{ t('Cancel') }}</button>
    </div>
    <div class="row mono" style="justify-content:space-between;font-size:12px"><b>{{ t('Current path: /{p}', { p: full }) }}</b><span class="mu" v-if="disk">{{ up != null ? t('Uploading {n}%', { n: Math.round(up * 100) }) : t('Free disk: {free}', { free: fmtBytes(disk.free) }) }}</span></div>
    <div style="overflow:auto;flex:1;min-height:0">
      <table class="tbl">
        <thead><tr><th style="width:34px"><input type="checkbox" class="cb" :checked="allPicked" :indeterminate="picked.size > 0 && !allPicked" :aria-label="t('Select all')" @change="toggleAll" /></th><th style="width:36px"></th><th class="s" @click="sortBy('filename')">{{ t('Name') }}</th><th class="s" @click="sortBy('size')" style="text-align:right">{{ t('Filesize') }}</th><th class="s" @click="sortBy('modified')" style="text-align:right">{{ t('Last modified') }}</th><th style="width:110px"></th></tr></thead>
        <tbody>
          <tr v-if="path" class="click" @click="upDir"><td></td><td><Icon name="folder" :size="18" style="color:var(--mu)" /></td><td colspan="4" class="mono">..</td></tr>
          <tr v-for="it in rows" :key="(it.dir ? 'd' : 'f') + it.name" class="click fr" :class="{ tgt: it.dir && overDir === it.name, sel: picked.has(key(it)) }" @click="open(it)"
            @dragover="it.dir && (overDir = it.name)" @dragleave="it.dir && overDir === it.name && (overDir = null)" @drop.prevent.stop="dDrop($event, it.dir ? it.name : '')">
            <td @click.stop><input type="checkbox" class="cb" :checked="picked.has(key(it))" :aria-label="t('Select {name}', { name: it.name })" @change="togglePick(it)" /></td>
            <td><Icon :name="it.dir ? 'folder' : 'file'" :size="18" :style="{ color: it.dir ? 'var(--ac)' : 'var(--mu)' }" /></td>
            <td class="nm">{{ it.name }}</td>
            <td class="mono mu r">{{ it.dir ? '--' : fmtBytes(it.size) }}</td>
            <td class="mono mu r">{{ fmtDate(it.modified) }}</td>
            <td><div class="acts">
              <a v-if="!it.dir" class="btn clear ibtn sm" :href="api.url(`/server/files/${full}/${it.name}`)" download :aria-label="t('Download')" @click.stop><Icon name="download" :size="16" /></a>
              <button class="btn clear ibtn sm" :aria-label="t('Rename')" @click.stop="modal = { kind: 'rename', item: it, value: it.name }"><Icon name="pencil" :size="16" /></button>
              <button class="btn clear ibtn sm" :aria-label="t('Delete')" @click.stop="modal = { kind: 'delete', item: it }"><Icon name="trash" :size="16" /></button>
            </div></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <Modal v-if="modal" :title="t(TITLES[modal.kind])" @close="modal = null">
    <template v-if="modal.kind === 'bulkdelete'">
      <p style="margin:0">{{ t('Delete {n} items? Folders are deleted with everything inside.', { n: pickedRows.length }) }}</p>
      <div class="mono mu" style="font-size:12px;max-height:160px;overflow:auto">{{ pickedRows.map((it) => it.name + (it.dir ? '/' : '')).join(', ') }}</div>
    </template>
    <p v-else-if="modal.kind === 'delete'" style="margin:0">{{ t('Delete') }} <b class="mono">{{ modal.item.name }}</b>{{ modal.item.dir ? t(' and everything inside it') : '' }}?</p>
    <input v-else v-model="modal.value" class="input mono" :aria-label="t(TITLES[modal.kind])" @keydown.enter="confirmModal" />
    <template #foot><button class="btn lg" @click="modal = null">{{ t('Cancel') }}</button><button class="btn lg" :class="modal.kind.endsWith('delete') ? 'dgf' : 'acc'" :disabled="!modal.kind.endsWith('delete') && !modal.value" @click="modal.kind === 'bulkdelete' ? deletePicked() : confirmModal()">{{ modal.kind.endsWith('delete') ? t('Delete') : t('OK') }}</button></template>
  </Modal>
</template>
<style scoped>
.drop { position: relative; }
.bulk { padding: 8px 8px 8px 14px; border-radius: 12px; background: color-mix(in srgb, var(--ac) 12%, var(--s2)); flex-wrap: wrap; }
tr.sel td { background: color-mix(in srgb, var(--ac) 8%, transparent); }
.dz { position: absolute; inset: 0; z-index: 5; border-radius: inherit; border: 2px dashed var(--ac); background: color-mix(in srgb, var(--ac) 7%, transparent); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 22px; pointer-events: none; }
.dz .pill { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: 14px; background: var(--ac); color: var(--oa); font-size: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.4); }
tr.tgt td { background: color-mix(in srgb, var(--ac) 18%, transparent) !important; }
.nm { font-weight: 600; word-break: break-all; }
.mu { color: var(--mu); }
.r { text-align: right; white-space: nowrap; font-size: 12px; }
th.s { cursor: pointer; }
.acts { display: flex; gap: 2px; justify-content: flex-end; opacity: 0; }
.fr:hover .acts { opacity: 1; }
</style>
