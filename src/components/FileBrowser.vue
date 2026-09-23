<script setup>
import { ref, computed, onMounted } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { fmtBytes, fmtDate, toast, useApiEvent } from '../store'
import { api } from '../api/moonraker'
import { go } from '../router'
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
function changeRoot(r) { root.value = r; path.value = ''; load() }
function open(it) {
  if (it.dir) { path.value = path.value ? path.value + '/' + it.name : it.name; load(); return }
  const rel = (path.value ? path.value + '/' : '') + it.name
  if (EDITABLE.test(it.name)) go('config', root.value + '/' + rel)
  else window.open(api.url(`/server/files/${root.value}/${rel}`), '_blank')
}
function upDir() { path.value = path.value.split('/').slice(0, -1).join('/'); load() }
async function upload(e) {
  const fs = [...e.target.files]; e.target.value = ''
  for (const f of fs) {
    up.value = 0
    try { await api.upload(f, { root: root.value, path: path.value, onProgress: (p) => (up.value = p) }) } catch (err) { toast(err.message, 'error') }
  }
  up.value = null
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
const TITLES = { newdir: 'New folder', newfile: 'New file', rename: 'Rename', delete: 'Delete' }
</script>
<template>
  <section class="card">
    <div class="card-h"><h2 class="row"><Icon name="folder" :size="18" />Config Files</h2></div>
    <div class="row" style="flex-wrap:wrap">
      <select class="input" style="flex:1;min-width:160px" :value="root" aria-label="Root" @change="changeRoot($event.target.value)"><option v-for="r in roots" :key="r" :value="r">{{ r }}</option></select>
      <button class="btn ibtn" style="width:40px;height:40px" aria-label="Upload file" @click="fileInput.click()"><Icon name="upload" :size="18" /></button>
      <button class="btn ibtn" style="width:40px;height:40px" aria-label="New file" @click="modal = { kind: 'newfile', value: '' }"><Icon name="file" :size="18" /></button>
      <button class="btn ibtn" style="width:40px;height:40px" aria-label="New folder" @click="modal = { kind: 'newdir', value: '' }"><Icon name="folder" :size="18" /></button>
      <button class="btn ibtn" style="width:40px;height:40px" aria-label="Refresh" @click="load"><Icon name="refresh" :size="18" /></button>
      <input ref="fileInput" type="file" multiple hidden @change="upload" />
    </div>
    <div class="row mono" style="justify-content:space-between;font-size:12px"><b>Current path: /{{ full }}</b><span class="mu" v-if="disk">{{ up != null ? 'Uploading ' + Math.round(up * 100) + '%' : 'Free disk: ' + fmtBytes(disk.free) }}</span></div>
    <div style="overflow:auto;flex:1;min-height:0">
      <table class="tbl">
        <thead><tr><th style="width:36px"></th><th class="s" @click="sortBy('filename')">Name</th><th class="s" @click="sortBy('size')" style="text-align:right">Filesize</th><th class="s" @click="sortBy('modified')" style="text-align:right">Last modified</th><th style="width:110px"></th></tr></thead>
        <tbody>
          <tr v-if="path" class="click" @click="upDir"><td><Icon name="folder" :size="18" style="color:var(--mu)" /></td><td colspan="4" class="mono">..</td></tr>
          <tr v-for="it in rows" :key="(it.dir ? 'd' : 'f') + it.name" class="click fr" @click="open(it)">
            <td><Icon :name="it.dir ? 'folder' : 'file'" :size="18" :style="{ color: it.dir ? 'var(--ac)' : 'var(--mu)' }" /></td>
            <td class="nm">{{ it.name }}</td>
            <td class="mono mu r">{{ it.dir ? '--' : fmtBytes(it.size) }}</td>
            <td class="mono mu r">{{ fmtDate(it.modified) }}</td>
            <td><div class="acts">
              <a v-if="!it.dir" class="btn clear ibtn sm" :href="api.url(`/server/files/${full}/${it.name}`)" download aria-label="Download" @click.stop><Icon name="download" :size="16" /></a>
              <button class="btn clear ibtn sm" aria-label="Rename" @click.stop="modal = { kind: 'rename', item: it, value: it.name }"><Icon name="pencil" :size="16" /></button>
              <button class="btn clear ibtn sm" aria-label="Delete" @click.stop="modal = { kind: 'delete', item: it }"><Icon name="trash" :size="16" /></button>
            </div></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <Modal v-if="modal" :title="TITLES[modal.kind]" @close="modal = null">
    <p v-if="modal.kind === 'delete'" style="margin:0">Delete <b class="mono">{{ modal.item.name }}</b>{{ modal.item.dir ? ' and everything inside it' : '' }}?</p>
    <input v-else v-model="modal.value" class="input mono" :aria-label="TITLES[modal.kind]" @keydown.enter="confirmModal" />
    <template #foot><button class="btn lg" @click="modal = null">Cancel</button><button class="btn lg" :class="modal.kind === 'delete' ? 'dgf' : 'acc'" :disabled="modal.kind !== 'delete' && !modal.value" @click="confirmModal">{{ modal.kind === 'delete' ? 'Delete' : 'OK' }}</button></template>
  </Modal>
</template>
<style scoped>
.nm { font-weight: 600; word-break: break-all; }
.mu { color: var(--mu); }
.r { text-align: right; white-space: nowrap; font-size: 12px; }
th.s { cursor: pointer; }
.acts { display: flex; gap: 2px; justify-content: flex-end; opacity: 0; }
.fr:hover .acts { opacity: 1; }
</style>
