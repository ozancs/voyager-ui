<script setup>
import { ref, computed, onMounted } from 'vue'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import QueueCard from '../components/QueueCard.vue'
import { queueApi, downloadMany } from '../features'
import { state, fmtTime, fmtBytes, fmtDate, toast, isPrinting, gcode, useApiEvent } from '../store'
import { api } from '../api/moonraker'
import { t } from '../i18n'
const path = ref('gcodes')
const cached = state.cache.files
const dirs = ref(cached?.dirs || []), files = ref(cached?.files || []), disk = ref(cached?.disk || null)
const loading = ref(false)
const q = ref('')
const sel = ref(null)
const picked = ref(new Set())
function togglePick(n) { const s = new Set(picked.value); s.has(n) ? s.delete(n) : s.add(n); picked.value = s }
const allPicked = computed(() => list.value.length > 0 && list.value.every((f) => picked.value.has(f.filename)))
function toggleAll() { picked.value = allPicked.value ? new Set() : new Set(list.value.map((f) => f.filename)) }
const sort = ref({ k: 'modified', d: -1 })
const fileInput = ref(null)
const up = ref(null)
const del = ref(null)
const newDir = ref(null)
async function load() {
  loading.value = true
  try {
    const r = await api.call('server.files.get_directory', { path: path.value, extended: true })
    dirs.value = r.dirs.filter((d) => !d.dirname.startsWith('.'))
    files.value = r.files.filter((f) => /\.(gcode|g|gco|ufp|nc)$/i.test(f.filename))
    disk.value = r.disk_usage
    if (path.value === 'gcodes') state.cache.files = { dirs: dirs.value, files: files.value, disk: disk.value }
  } catch (e) { toast(e.message, 'error') }
  loading.value = false
}
onMounted(() => {
  // opened from Ctrl+K search: jump to the file
  if (state.anchor?.startsWith('file:')) {
    const f = state.anchor.slice(5); state.anchor = ''
    const dir = f.split('/').slice(0, -1).join('/')
    if (dir) path.value = 'gcodes/' + dir
    q.value = f.split('/').pop(); sel.value = q.value
  }
  load()
})
const addQ = (fs) => queueApi.add(fs.map(rel)).catch((e) => toast(e.message, 'error'))
let rt
useApiEvent('notify_filelist_changed', ([p]) => { if (p?.item?.root !== 'gcodes') return; clearTimeout(rt); rt = setTimeout(load, 300) })
const rel = (f) => (path.value === 'gcodes' ? '' : path.value.slice(7) + '/') + f.filename
const list = computed(() => {
  const f = q.value.toLowerCase()
  const k = sort.value.k, d = sort.value.d
  return files.value.filter((x) => !f || x.filename.toLowerCase().includes(f)).sort((a, b) => ((a[k] ?? 0) > (b[k] ?? 0) ? d : -d))
})
function thumb(f) {
  const t = (f.thumbnails || []).sort((a, b) => a.width - b.width).find((t) => t.width >= 32)
  if (!t) return null
  const dir = path.value === 'gcodes' ? '' : path.value.slice(7) + '/'
  return api.url(`/server/files/gcodes/${dir}${encodeURI(t.relative_path)}`)
}
function open(d) { path.value = path.value + '/' + d.dirname; sel.value = null; picked.value = new Set(); load() }
function upDir() { path.value = path.value.split('/').slice(0, -1).join('/') || 'gcodes'; load() }
function sortBy(k) { sort.value = { k, d: sort.value.k === k ? -sort.value.d : -1 } }
async function print(f) { try { await api.call('printer.print.start', { filename: rel(f) }) ; toast(t('Print started')) } catch (e) { toast(e.message, 'error') } }
async function preheat(f) {
  const e = f.first_layer_extr_temp, b = f.first_layer_bed_temp
  if (e) await gcode(`SET_HEATER_TEMPERATURE HEATER=extruder TARGET=${e}`)
  if (b) await gcode(`SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=${b}`)
  if (!e && !b) toast(t('No temperatures in file metadata'))
}
async function doDelete() {
  const fs = del.value
  del.value = null
  let fail = 0
  for (const f of fs) { try { await api.call('server.files.delete_file', { path: `${path.value}/${f.filename}` }) } catch { fail++ } }
  picked.value = new Set()
  if (fail) toast(t('{n} file(s) could not be deleted', { n: fail }), 'error')
}
async function upload(e) {
  const fs = [...e.target.files]
  e.target.value = ''
  for (const f of fs) {
    up.value = { name: f.name, p: 0 }
    try { await api.upload(f, { path: path.value === 'gcodes' ? '' : path.value.slice(7), onProgress: (p) => (up.value.p = p) }) } catch (err) { toast(err.message, 'error') }
  }
  up.value = null
}
async function mkdir() {
  const n = newDir.value
  newDir.value = null
  if (n) try { await api.call('server.files.post_directory', { path: `${path.value}/${n}` }) } catch (e) { toast(e.message, 'error') }
}
function onDrop(e) { e.preventDefault(); upload({ target: { files: e.dataTransfer.files, value: '' } }) }
</script>
<template>
  <div class="split">
  <section class="card grow" style="flex:1 1 auto" @dragover.prevent @drop="onDrop">
    <div class="row" style="gap:10px;flex-wrap:wrap">
      <button class="btn clear" :disabled="path === 'gcodes'" @click="upDir"><Icon name="left" :size="16" /></button>
      <b class="mono">{{ path }} /</b>
      <div class="grow"></div>
      <label class="row input" style="width:280px"><Icon name="search" :size="16" /><input v-model="q" :placeholder="t('Search files')" :aria-label="t('Search files')" style="flex:1;background:transparent;border:none;outline:none" /></label>
      <button v-if="picked.size && state.queue.enabled" class="btn" style="height:40px" @click="addQ(list.filter((f) => picked.has(f.filename)))"><Icon name="queue" :size="16" />{{ t('Queue ({n})', { n: picked.size }) }}</button>
      <button v-if="picked.size" class="btn" style="height:40px" @click="downloadMany('gcodes', list.filter((f) => picked.has(f.filename)).map((f) => ({ path: rel(f) })), 'gcodes')"><Icon name="download" :size="16" />{{ t('Download ({n})', { n: picked.size }) }}</button>
      <button v-if="picked.size" class="btn dg" style="height:40px" @click="del = list.filter((f) => picked.has(f.filename))"><Icon name="trash" :size="16" />{{ t('Delete ({n})', { n: picked.size }) }}</button>
      <button class="btn" style="height:40px" @click="newDir = ''"><Icon name="folder" :size="16" />{{ t('New folder') }}</button>
      <button class="btn ibtn" style="width:40px;height:40px" :aria-label="t('Refresh')" @click="load"><Icon name="refresh" :size="18" /></button>
      <button class="btn acc" style="height:40px" :disabled="!!up" @click="fileInput.click()"><Icon name="upload" :size="16" :stroke="2.4" />{{ up ? Math.round(up.p * 100) + '%' : t('Upload') }}</button>
      <input ref="fileInput" type="file" multiple accept=".gcode,.g,.gco,.ufp,.nc" hidden @change="upload" />
    </div>
    <div style="overflow:auto;flex:1">
      <table class="tbl">
        <thead><tr>
          <th style="width:36px"><input type="checkbox" class="cb" :checked="allPicked" :indeterminate="picked.size > 0 && !allPicked" :aria-label="t('Select all')" @change="toggleAll" /></th>
          <th style="width:60px"></th>
          <th class="s" @click="sortBy('filename')">{{ t('Name') }}</th><th class="s" @click="sortBy('size')">{{ t('Size') }}</th><th class="s" @click="sortBy('estimated_time')">{{ t('Print time') }}</th>
          <th class="s" @click="sortBy('filament_total')">{{ t('Filament') }}</th><th>{{ t('Layer') }}</th><th class="s" @click="sortBy('modified')">{{ t('Modified') }}</th><th style="width:190px"></th>
        </tr></thead>
        <tbody>
          <tr v-for="d in dirs" :key="'d' + d.dirname" class="click" @click="open(d)">
            <td></td><td><div class="th fo"><Icon name="folder" :size="22" /></div></td><td class="nm">{{ d.dirname }}</td><td class="mono mu">{{ fmtBytes(d.size) }}</td><td></td><td></td><td></td><td class="mono mu">{{ fmtDate(d.modified) }}</td><td></td>
          </tr>
          <tr v-for="f in list" :key="f.filename" class="click" :class="{ sel: sel === f.filename || picked.has(f.filename) }" @click="sel = f.filename" @dblclick="!isPrinting && print(f)">
            <td @click.stop><input type="checkbox" class="cb" :checked="picked.has(f.filename)" :aria-label="t('Select file')" @change="togglePick(f.filename)" /></td>
            <td><div class="th"><img v-if="thumb(f)" :src="thumb(f)" alt="" loading="lazy" /><Icon v-else name="cube" :size="22" :stroke="1.8" /></div></td>
            <td class="nm">{{ f.filename }}</td>
            <td class="mono mu">{{ fmtBytes(f.size) }}</td>
            <td class="mono">{{ fmtTime(f.estimated_time) }}</td>
            <td class="mono mu">{{ f.filament_total ? (f.filament_total / 1000).toFixed(1) + ' m' : '--' }}</td>
            <td class="mono mu">{{ f.layer_height ?? '--' }}</td>
            <td class="mono mu">{{ fmtDate(f.modified) }}</td>
            <td><div class="row" style="gap:6px">
              <button class="btn acc ibtn sm" :aria-label="t('Print')" :disabled="isPrinting" @click.stop="print(f)"><Icon name="play" :size="16" :stroke="2.4" /></button>
              <button v-if="state.queue.enabled" class="btn ibtn sm" :aria-label="t('Add to queue')" :title="t('Add to queue')" @click.stop="addQ([f])"><Icon name="queue" :size="16" /></button>
              <button class="btn ibtn sm" :aria-label="t('Preheat')" @click.stop="preheat(f)"><Icon name="flame" :size="16" /></button>
              <a class="btn ibtn sm" :aria-label="t('Download')" :href="api.url(`/server/files/${path}/${f.filename}`)" download @click.stop><Icon name="download" :size="16" /></a>
              <button class="btn ibtn sm" :aria-label="t('Delete')" @click.stop="del = [f]"><Icon name="trash" :size="16" /></button>
            </div></td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && !dirs.length && !list.length" class="empty">{{ t('No G-code files here. Drop files on this card to upload.') }}</div>
    </div>
    <div class="row mono mu" style="justify-content:space-between;font-size:12px"><span>{{ t('{n} files · {d} folders', { n: list.length, d: dirs.length }) }}</span><span v-if="disk">{{ t('Disk: {free} free of {total}', { free: fmtBytes(disk.free), total: fmtBytes(disk.total) }) }}</span></div>
  </section>
  <div class="side-col"><QueueCard /></div>
  </div>
  <Modal v-if="del" :title="del.length > 1 ? t('Delete {n} files?', { n: del.length }) : t('Delete file?')" @close="del = null">
    <div class="mono" style="max-height:220px;overflow:auto;font-size:12px"><div v-for="f in del" :key="f.filename">{{ f.filename }}</div></div>
    <template #foot><button class="btn lg" @click="del = null">{{ t('Cancel') }}</button><button class="btn lg dgf" @click="doDelete">{{ t('Delete') }}</button></template>
  </Modal>
  <Modal v-if="newDir !== null" :title="t('New folder')" @close="newDir = null">
    <input v-model="newDir" class="input" :placeholder="t('folder name')" :aria-label="t('Folder name')" @keydown.enter="mkdir" />
    <template #foot><button class="btn lg" @click="newDir = null">{{ t('Cancel') }}</button><button class="btn lg acc" @click="mkdir">{{ t('Create') }}</button></template>
  </Modal>
</template>
<style scoped>
.th { width: 44px; height: 44px; border-radius: 8px; background: var(--s2); border: 1px solid var(--bd); display: flex; align-items: center; justify-content: center; color: var(--mu); overflow: hidden; }
.th img { width: 100%; height: 100%; object-fit: contain; }
.th.fo { color: var(--ac); }
.nm { font-weight: 700; overflow-wrap: anywhere; min-width: 200px; }
.mu { color: var(--mu); }
td.mono { font-size: 13px; white-space: nowrap; }
th.s { cursor: pointer; }
th.s:hover { color: var(--tx); }
</style>
