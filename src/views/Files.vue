<script setup>
// G-code files page: folders, thumbnails, metadata, search, print, add to queue, upload, rename,
// delete and the edit button (opens small files in the config editor).
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { isGcodeFile, UPLOAD_ACCEPT } from '../gcode3mf';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import QueueCard from '../components/QueueCard.vue';
import { queueApi, downloadMany } from '../features';
import {
  state,
  fmtTime,
  fmtBytes,
  fmtDate,
  toast,
  isPrinting,
  gcode,
  useApiEvent,
  setHeater,
  expectedTime,
} from '../store';
import { api } from '../api/moonraker';
import { go } from '../router';
import { t } from '../i18n';
import { startPrint, uploadName } from '../preprint';
import { undoable, isHidden, stillSame } from '../undo';
const path = ref('gcodes');
const grid = ref(state.settings.filesView === 'grid');
watch(grid, (value) => {
  state.settings.filesView = value ? 'grid' : 'table';
});
// a file's print time on this printer (path from the gcodes root, as history keeps it)
const fileTime = (f) =>
  f.estimated_time
    ? expectedTime((path.value === 'gcodes' ? '' : path.value.slice(7) + '/') + f.filename, f.estimated_time)
    : 0;
const cached = state.cache.files;
const dirs = ref(cached?.dirs || []),
  files = ref(cached?.files || []),
  disk = ref(cached?.disk || null);
const loading = ref(false);
const q = ref('');
const sel = ref(null);
const picked = ref(new Set());
function togglePick(n) {
  const s = new Set(picked.value);
  s.has(n) ? s.delete(n) : s.add(n);
  picked.value = s;
}
const allPicked = computed(() => list.value.length > 0 && list.value.every((f) => picked.value.has(f.filename)));
function toggleAll() {
  picked.value = allPicked.value ? new Set() : new Set(list.value.map((f) => f.filename));
}
const sort = ref({ k: 'modified', d: -1 });
const fileInput = ref(null);
const up = ref(null);
const del = ref(null);
const newDir = ref(null);
let directoryRequest = 0;
watch(
  path,
  () => {
    picked.value = new Set();
    sel.value = null;
    del.value = null;
    dirs.value = [];
    files.value = [];
  },
  { flush: 'sync' },
);
async function load() {
  const request = ++directoryRequest;
  loading.value = true;
  try {
    const directory = path.value;
    const r = await api.call('server.files.get_directory', { path: directory, extended: true });
    if (request !== directoryRequest || directory !== path.value) return;
    dirs.value = r.dirs.filter((d) => !d.dirname.startsWith('.'));
    files.value = r.files.filter((f) => isGcodeFile(f.filename));
    disk.value = r.disk_usage;
    if (path.value === 'gcodes') state.cache.files = { dirs: dirs.value, files: files.value, disk: disk.value };
  } catch (e) {
    if (request === directoryRequest) toast(e.message, 'error');
  } finally {
    if (request === directoryRequest) loading.value = false;
  }
}
// opened from Ctrl+K search: jump to the file (also when this page is already showing)
function takeAnchor() {
  if (!state.anchor?.startsWith('file:')) return false;
  const f = state.anchor.slice(5);
  state.anchor = '';
  const dir = f.split('/').slice(0, -1).join('/');
  path.value = 'gcodes' + (dir ? '/' + dir : '');
  q.value = f.split('/').pop();
  sel.value = q.value;
  return true;
}
onMounted(() => {
  takeAnchor();
  load();
});
watch(
  () => state.anchor,
  () => {
    if (takeAnchor()) load();
  },
);
// G-code can be opened in the editor; very large files would make the browser tab crawl
const EDIT_MAX = 8 * 1024 * 1024;
const editBlocked = (f) =>
  f.size > EDIT_MAX
    ? t('Too large to edit here ({size})', { size: fmtBytes(f.size) })
    : isPrinting.value && state.status.print_stats?.filename === rel(f)
      ? t('This file is printing')
      : '';
function editFile(f) {
  if (!editBlocked(f)) go('config', 'gcodes/' + rel(f));
}
const addQ = (fs) => queueApi.add(fs.map(rel)).catch((e) => toast(e.message, 'error'));
let rt;
useApiEvent('notify_filelist_changed', ([p]) => {
  if (p?.item?.root !== 'gcodes') return;
  clearTimeout(rt);
  rt = setTimeout(load, 300);
});
const rel = (f) => (path.value === 'gcodes' ? '' : path.value.slice(7) + '/') + f.filename;
const list = computed(() => {
  const f = q.value.toLowerCase();
  const k = sort.value.k,
    d = sort.value.d;
  return files.value
    .filter((x) => !isHidden('g:' + path.value + '/' + x.filename))
    .filter((x) => !f || x.filename.toLowerCase().includes(f))
    .sort((a, b) => ((a[k] ?? 0) > (b[k] ?? 0) ? d : -d));
});
function thumb(f, large = false) {
  const t = [...(f.thumbnails || [])]
    .sort((a, b) => (large ? b.width - a.width : a.width - b.width))
    .find((t) => t.width >= 32);
  if (!t) return null;
  const dir = path.value === 'gcodes' ? '' : path.value.slice(7) + '/';
  return api.fileUrl('gcodes', dir + t.relative_path);
}
const view = (f) => go('viewer', rel(f)); // the G-code viewer opens with this file
function open(d) {
  path.value = path.value + '/' + d.dirname;
  sel.value = null;
  picked.value = new Set();
  load();
}
function upDir() {
  path.value = path.value.split('/').slice(0, -1).join('/') || 'gcodes';
  load();
}
function sortBy(k) {
  sort.value = { k, d: sort.value.k === k ? -sort.value.d : -1 };
}
async function print(f) {
  await startPrint(rel(f));
}
async function preheat(f) {
  const e = f.first_layer_extr_temp,
    b = f.first_layer_bed_temp;
  // through setHeater (max_temp check), and only heaters this printer has
  const has = (h) => (state.objects || []).includes(h);
  if (e && has('extruder')) await setHeater('extruder', e).catch(() => {});
  if (b && has('heater_bed')) await setHeater('heater_bed', b).catch(() => {});
  if (!e && !b) toast(t('No temperatures in file metadata'));
}
// right-click menu on a file or folder (or Shift+F10 on the focused row): the row's own actions in one list
const ctx = ref(null); // { f, dir, x, y }
const ctxEl = ref(null);
async function showCtx(e, f, dir = false) {
  const r = e.currentTarget?.getBoundingClientRect?.();
  const x = e.clientX ?? r?.left ?? 0,
    y = e.clientY ?? r?.bottom ?? 0;
  ctx.value = { f, dir, x, y };
  if (!dir) sel.value = f.filename;
  await nextTick();
  // near the bottom of the window the menu opens upwards (measured, the zoomed page included)
  const el = ctxEl.value;
  if (el) {
    const z = window.__uiZoom || 1;
    const h = el.getBoundingClientRect().height;
    if (y + h > innerHeight - 8) ctx.value.y = Math.max(8, (y - h) / z);
    else ctx.value.y = y / z;
    ctx.value.x = Math.min(x, innerWidth - el.getBoundingClientRect().width - 8) / z;
  }
  el?.querySelector('button:not(:disabled)')?.focus();
}
watch(path, () => (ctx.value = null));
function ctxDo(action) {
  const { f, dir } = ctx.value;
  ctx.value = null;
  if (dir) {
    if (action === 'open') open(f);
    else if (action === 'rename') ren.value = { f, dir: true, value: f.dirname };
    return;
  }
  if (action === 'print') print(f);
  else if (action === 'queue') addQ([f]);
  else if (action === 'preheat') preheat(f);
  else if (action === 'view') view(f);
  else if (action === 'edit') editFile(f);
  else if (action === 'rename') ren.value = { f, dir: false, value: f.filename.split('/').pop() };
  else if (action === 'delete') del.value = [f];
  else if (action === 'download') {
    const a = document.createElement('a');
    a.href = api.fileUrl('gcodes', rel(f));
    a.download = f.filename.split('/').pop();
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
// rename a file or folder in the folder shown
const ren = ref(null); // { f, dir, value }
async function doRename() {
  const r = ren.value;
  const name = (r?.value || '').trim();
  const old = r.dir ? r.f.dirname : r.f.filename.split('/').pop();
  if (!name || name === old || /[/\\]/.test(name)) {
    ren.value = null;
    return;
  }
  const base = path.value;
  ren.value = null;
  try {
    await api.call('server.files.move', { source: `${base}/${old}`, dest: `${base}/${name}` });
    toast(t('Renamed to {name}', { name }));
  } catch (e) {
    toast(e.message, 'error');
  }
  load();
}
function doDelete() {
  const fs = del.value;
  const base = path.value;
  del.value = null;
  picked.value = new Set();
  undoable(fs.length === 1 ? t('{f} deleted', { f: fs[0].filename }) : t('{n} files deleted', { n: fs.length }), {
    hideKeys: fs.map((f) => 'g:' + base + '/' + f.filename),
    commit: async () => {
      let fail = 0;
      const same = await stillSame(
        base,
        fs.map((f) => ({ name: f.filename.split('/').pop(), path: f.filename, modified: f.modified, size: f.size })),
      );
      for (const f of fs.filter((x) => same.some((y) => y.path === x.filename))) {
        try {
          await api.call('server.files.delete_file', { path: `${base}/${f.filename}` });
        } catch {
          fail++;
        }
      }
      if (fail) toast(t('{n} file(s) could not be deleted', { n: fail }), 'error');
    },
  });
}
async function upload(e) {
  const fs = [...e.target.files];
  e.target.value = '';
  for (const f of fs) {
    const dir = path.value === 'gcodes' ? '' : path.value.slice(7);
    const name = await uploadName(f.name, dir);
    if (!name) continue;
    up.value = { name, p: 0 };
    try {
      await api.upload(f, {
        name,
        path: dir,
        onProgress: (p) => (up.value.p = p),
      });
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  up.value = null;
}
async function mkdir() {
  const n = newDir.value;
  newDir.value = null;
  if (n)
    try {
      await api.call('server.files.post_directory', { path: `${path.value}/${n}` });
    } catch (e) {
      toast(e.message, 'error');
    }
}
// files dragged from the computer onto the list: a large drop target says where they will go (as on the
// Machine page's config files)
const over = ref(false);
let depth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
function dEnter(e) {
  if (!hasFiles(e)) return;
  depth++;
  over.value = true;
}
function dLeave(e) {
  if (!hasFiles(e)) return;
  if (--depth <= 0) {
    depth = 0;
    over.value = false;
  }
}
function onDrop(e) {
  e.preventDefault();
  depth = 0;
  over.value = false;
  if (e.dataTransfer?.files?.length) upload({ target: { files: e.dataTransfer.files, value: '' } });
}
</script>
<template>
  <div class="split">
    <section
      class="card grow drop"
      style="flex: 1 1 auto"
      @dragenter="dEnter"
      @dragleave="dLeave"
      @dragover.prevent
      @drop="onDrop"
    >
      <div v-if="over" class="dz">
        <div class="big">
          <span class="ring"><Icon name="upload" :size="34" :stroke="2.2" /></span>
          <b>{{ t('Drop to upload to /{p}', { p: path }) }}</b>
        </div>
      </div>
      <div class="row" style="gap: 10px; flex-wrap: wrap">
        <button class="btn clear" :disabled="path === 'gcodes'" :aria-label="t('Up one folder')" @click="upDir">
          <Icon name="left" :size="16" />
        </button>
        <b class="mono">{{ path }} /</b>
        <div class="grow"></div>
        <label class="row input" style="width: 280px"
          ><Icon name="search" :size="16" /><input
            v-model="q"
            :placeholder="t('Search files')"
            :aria-label="t('Search files')"
            style="flex: 1; background: transparent; border: none; outline: none"
        /></label>
        <button
          v-if="picked.size && state.queue.enabled"
          class="btn"
          style="height: 40px"
          @click="addQ(list.filter((f) => picked.has(f.filename)))"
        >
          <Icon name="queue" :size="16" />{{ t('Queue ({n})', { n: picked.size }) }}
        </button>
        <button
          v-if="picked.size"
          class="btn"
          style="height: 40px"
          @click="
            downloadMany(
              'gcodes',
              list.filter((f) => picked.has(f.filename)).map((f) => ({ path: rel(f) })),
              'gcodes',
            )
          "
        >
          <Icon name="download" :size="16" />{{ t('Download ({n})', { n: picked.size }) }}
        </button>
        <button
          v-if="picked.size"
          class="btn dg"
          style="height: 40px"
          @click="del = list.filter((f) => picked.has(f.filename))"
        >
          <Icon name="trash" :size="16" />{{ t('Delete ({n})', { n: picked.size }) }}
        </button>
        <button class="btn" style="height: 40px" @click="newDir = ''">
          <Icon name="folder" :size="16" />{{ t('New folder') }}
        </button>
        <button class="btn ibtn" style="width: 40px; height: 40px" :aria-label="t('Refresh')" @click="load">
          <Icon name="refresh" :size="18" />
        </button>
        <button class="btn acc" style="height: 40px" :disabled="!!up" @click="fileInput.click()">
          <Icon name="upload" :size="16" :stroke="2.4" />{{ up ? Math.round(up.p * 100) + '%' : t('Upload') }}
        </button>
        <input ref="fileInput" type="file" multiple :accept="UPLOAD_ACCEPT" hidden @change="upload" />
      </div>
      <div class="row" style="justify-content: space-between">
        <div class="seg">
          <button :class="{ on: !grid }" :aria-pressed="!grid" @click="grid = false">{{ t('Table') }}</button>
          <button :class="{ on: grid }" :aria-pressed="grid" @click="grid = true">{{ t('Thumbnail grid') }}</button>
        </div>
        <label v-if="grid" class="row">
          <input
            type="checkbox"
            class="cb"
            :checked="allPicked"
            :indeterminate="picked.size > 0 && !allPicked"
            @change="toggleAll"
          />
          {{ t('Select all') }}
        </label>
      </div>
      <div v-if="grid" class="file-grid">
        <button
          v-for="d in dirs"
          :key="d.dirname"
          class="btn file-tile"
          @click="open(d)"
          @contextmenu.prevent="showCtx($event, d, true)"
        >
          <Icon name="folder" :size="32" /><span>{{ d.dirname }}</span>
        </button>
        <article
          v-for="f in list"
          :key="f.filename"
          class="file-tile"
          :class="{ selected: picked.has(f.filename) }"
          @contextmenu.prevent="showCtx($event, f)"
        >
          <div class="file-image">
            <img v-if="thumb(f, true)" :src="thumb(f, true)" alt="" loading="lazy" />
            <Icon v-else name="cube" :size="42" />
            <input
              type="checkbox"
              class="cb"
              :aria-label="t('Select file')"
              :checked="picked.has(f.filename)"
              @change="togglePick(f.filename)"
            />
          </div>
          <b>{{ f.filename }}</b>
          <span class="mono mu">{{ fmtTime(fileTime(f) || f.estimated_time) }} · {{ fmtBytes(f.size) }}</span>
          <div class="row">
            <button class="btn acc" :disabled="isPrinting" @click="print(f)">{{ t('Print') }}</button>
            <button v-if="state.queue.enabled" class="btn ibtn" :aria-label="t('Add to queue')" @click="addQ([f])">
              <Icon name="queue" :size="16" />
            </button>
            <button class="btn ibtn" :aria-label="t('Preheat')" @click="preheat(f)">
              <Icon name="flame" :size="16" />
            </button>
            <button
              class="btn ibtn"
              :aria-label="t('Open in the G-code viewer')"
              :data-tip="t('Open in the G-code viewer')"
              @click="view(f)"
            >
              <Icon name="cube" :size="16" />
            </button>
            <button class="btn ibtn" :aria-label="t('Edit')" :disabled="!!editBlocked(f)" @click="editFile(f)">
              <Icon name="pencil" :size="16" />
            </button>
            <a class="btn ibtn" :aria-label="t('Download')" :href="api.fileUrl('gcodes', rel(f))" download
              ><Icon name="download" :size="16"
            /></a>
            <button class="btn ibtn" :aria-label="t('Delete')" @click="del = [f]">
              <Icon name="trash" :size="16" />
            </button>
          </div>
        </article>
      </div>
      <div v-else style="overflow: auto; flex: 1">
        <table class="tbl">
          <thead>
            <tr>
              <th style="width: 36px">
                <input
                  type="checkbox"
                  class="cb"
                  :checked="allPicked"
                  :indeterminate="picked.size > 0 && !allPicked"
                  :aria-label="t('Select all')"
                  @change="toggleAll"
                />
              </th>
              <th style="width: 60px"></th>
              <th class="s" @click="sortBy('filename')">{{ t('Name') }}</th>
              <th class="s" @click="sortBy('size')">{{ t('Size') }}</th>
              <th class="s" @click="sortBy('estimated_time')">{{ t('Print time') }}</th>
              <th class="s" @click="sortBy('filament_total')">{{ t('Filament') }}</th>
              <th>{{ t('Layer') }}</th>
              <th class="s" @click="sortBy('modified')">{{ t('Modified') }}</th>
              <th style="width: 190px"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in dirs"
              :key="'d' + d.dirname"
              class="click"
              tabindex="0"
              @click="open(d)"
              @contextmenu.prevent="showCtx($event, d, true)"
              @keydown.shift.f10.prevent="showCtx($event, d, true)"
            >
              <td></td>
              <td>
                <div class="th fo"><Icon name="folder" :size="22" /></div>
              </td>
              <td class="nm">{{ d.dirname }}</td>
              <td class="mono mu">{{ fmtBytes(d.size) }}</td>
              <td></td>
              <td></td>
              <td></td>
              <td class="mono mu">{{ fmtDate(d.modified) }}</td>
              <td></td>
            </tr>
            <tr
              v-for="f in list"
              :key="f.filename"
              class="click"
              :class="{ sel: sel === f.filename || picked.has(f.filename) }"
              tabindex="0"
              @click="sel = f.filename"
              @dblclick="!isPrinting && print(f)"
              @contextmenu.prevent="showCtx($event, f)"
              @keydown.shift.f10.prevent="showCtx($event, f)"
            >
              <td @click.stop>
                <input
                  type="checkbox"
                  class="cb"
                  :checked="picked.has(f.filename)"
                  :aria-label="t('Select file')"
                  @change="togglePick(f.filename)"
                />
              </td>
              <td>
                <div class="th">
                  <img v-if="thumb(f)" v-zoom="thumb(f, true)" :src="thumb(f)" alt="" loading="lazy" /><Icon
                    v-else
                    name="cube"
                    :size="22"
                    :stroke="1.8"
                  />
                </div>
              </td>
              <td class="nm">{{ f.filename }}</td>
              <td class="mono mu">{{ fmtBytes(f.size) }}</td>
              <td
                class="mono"
                :data-tip="
                  f.estimated_time && Math.abs(fileTime(f) - f.estimated_time) > 60
                    ? t('Slicer: {time}. Shown: what it takes on this printer.', { time: fmtTime(f.estimated_time) })
                    : null
                "
              >
                {{ fmtTime(fileTime(f) || f.estimated_time) }}
              </td>
              <td class="mono mu">{{ f.filament_total ? (f.filament_total / 1000).toFixed(1) + ' m' : '--' }}</td>
              <td class="mono mu">{{ f.layer_height ?? '--' }}</td>
              <td class="mono mu">{{ fmtDate(f.modified) }}</td>
              <td>
                <div class="row" style="gap: 6px">
                  <button
                    class="btn acc ibtn sm"
                    :aria-label="t('Print')"
                    :disabled="isPrinting"
                    @click.stop="print(f)"
                  >
                    <Icon name="play" :size="16" :stroke="2.4" />
                  </button>
                  <button
                    v-if="state.queue.enabled"
                    class="btn ibtn sm"
                    :aria-label="t('Add to queue')"
                    :title="t('Add to queue')"
                    @click.stop="addQ([f])"
                  >
                    <Icon name="queue" :size="16" />
                  </button>
                  <button class="btn ibtn sm" :aria-label="t('Preheat')" @click.stop="preheat(f)">
                    <Icon name="flame" :size="16" />
                  </button>
                  <button
                    class="btn ibtn sm"
                    :aria-label="t('Open in the G-code viewer')"
                    :data-tip="t('Open in the G-code viewer')"
                    @click.stop="view(f)"
                  >
                    <Icon name="cube" :size="16" />
                  </button>
                  <button
                    class="btn ibtn sm"
                    :aria-label="t('Edit')"
                    :data-tip="editBlocked(f) || t('Edit')"
                    :disabled="!!editBlocked(f)"
                    @click.stop="editFile(f)"
                  >
                    <Icon name="pencil" :size="16" />
                  </button>
                  <a
                    class="btn ibtn sm"
                    :aria-label="t('Download')"
                    :href="api.fileUrl(path.split('/')[0], path.split('/').slice(1).concat(f.filename).join('/'))"
                    download
                    @click.stop
                    ><Icon name="download" :size="16"
                  /></a>
                  <button class="btn ibtn sm" :aria-label="t('Delete')" @click.stop="del = [f]">
                    <Icon name="trash" :size="16" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !dirs.length && !list.length" class="empty">
          {{ t('No G-code files here. Drop files on this card to upload.') }}
        </div>
      </div>
      <div class="row mono mu" style="justify-content: space-between; font-size: 12px">
        <span>{{ t('{n} files · {d} folders', { n: list.length, d: dirs.length }) }}</span
        ><span v-if="disk">{{
          t('Disk: {free} free of {total}', { free: fmtBytes(disk.free), total: fmtBytes(disk.total) })
        }}</span>
      </div>
    </section>
    <div class="side-col"><QueueCard /></div>
  </div>
  <Teleport to="body">
    <div
      v-if="ctx"
      ref="ctxEl"
      v-away="() => (ctx = null)"
      class="fctx card"
      role="menu"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
    >
      <span class="mu">{{ ctx.dir ? ctx.f.dirname : ctx.f.filename.split('/').pop() }}</span>
      <template v-if="ctx.dir">
        <button class="btn clear" role="menuitem" @click="ctxDo('open')">
          <Icon name="folder" :size="16" />{{ t('Open folder') }}
        </button>
        <button class="btn clear" role="menuitem" @click="ctxDo('rename')">
          <Icon name="pencil" :size="16" />{{ t('Rename') }}
        </button>
      </template>
      <template v-else>
        <button class="btn clear" role="menuitem" :disabled="isPrinting" @click="ctxDo('print')">
          <Icon name="play" :size="16" />{{ t('Print') }}
        </button>
        <button v-if="state.queue.enabled" class="btn clear" role="menuitem" @click="ctxDo('queue')">
          <Icon name="list" :size="16" />{{ t('Add to queue') }}
        </button>
        <button class="btn clear" role="menuitem" @click="ctxDo('preheat')">
          <Icon name="flame" :size="16" />{{ t('Preheat') }}
        </button>
        <button class="btn clear" role="menuitem" @click="ctxDo('view')">
          <Icon name="cube" :size="16" />{{ t('Open in the G-code viewer') }}
        </button>
        <button class="btn clear" role="menuitem" :disabled="!!editBlocked(ctx.f)" @click="ctxDo('edit')">
          <Icon name="code" :size="16" />{{ t('Edit') }}
        </button>
        <button class="btn clear" role="menuitem" @click="ctxDo('download')">
          <Icon name="download" :size="16" />{{ t('Download') }}
        </button>
        <button class="btn clear" role="menuitem" @click="ctxDo('rename')">
          <Icon name="pencil" :size="16" />{{ t('Rename') }}
        </button>
        <button class="btn clear dgf" role="menuitem" @click="ctxDo('delete')">
          <Icon name="trash" :size="16" />{{ t('Delete') }}
        </button>
      </template>
    </div>
  </Teleport>
  <Modal v-if="ren" :title="t('Rename')" @close="ren = null">
    <input v-model="ren.value" class="input mono" :aria-label="t('New name')" autofocus @keydown.enter="doRename" />
    <template #foot
      ><button class="btn lg" @click="ren = null">{{ t('Cancel') }}</button
      ><button class="btn lg acc" @click="doRename">{{ t('Rename') }}</button></template
    >
  </Modal>
  <Modal
    v-if="del"
    :title="del.length > 1 ? t('Delete {n} files?', { n: del.length }) : t('Delete file?')"
    @close="del = null"
  >
    <div class="mono" style="max-height: 220px; overflow: auto; font-size: 12px">
      <div v-for="f in del" :key="f.filename">{{ f.filename }}</div>
    </div>
    <template #foot
      ><button class="btn lg" @click="del = null">{{ t('Cancel') }}</button
      ><button class="btn lg dgf" @click="doDelete">{{ t('Delete') }}</button></template
    >
  </Modal>
  <Modal v-if="newDir !== null" :title="t('New folder')" @close="newDir = null">
    <input
      v-model="newDir"
      class="input"
      :placeholder="t('folder name')"
      :aria-label="t('Folder name')"
      @keydown.enter="mkdir"
    />
    <template #foot
      ><button class="btn lg" @click="newDir = null">{{ t('Cancel') }}</button
      ><button class="btn lg acc" @click="mkdir">{{ t('Create') }}</button></template
    >
  </Modal>
</template>
<style scoped>
/* right-click menu (teleported to the page, so it is not cut by the card) */
.fctx.card {
  position: fixed;
  z-index: 10000;
  width: 240px;
  max-width: calc(100vw - 16px);
  padding: 6px;
  gap: 0;
  box-shadow: 0 8px 30px #0006;
}
.fctx > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 8px 6px;
  font-size: 12px;
}
.fctx.card button.btn {
  justify-content: flex-start;
  height: 32px;
  min-height: 32px;
  min-height: 0;
  padding: 0 10px;
  gap: 10px;
  font-size: 13px;
}
.fctx button.dgf {
  color: var(--dg);
}
.drop {
  position: relative;
}
/* the drop target: over the whole list, its card in the middle of what is on screen (sticky, the list can be long) */
.dz {
  position: absolute;
  inset: 0;
  z-index: 5;
  border-radius: inherit;
  border: 2px dashed var(--ac);
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  backdrop-filter: blur(2px);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  pointer-events: none;
}
.dz .big {
  position: sticky;
  top: calc(50vh - 110px);
  margin: 60px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 28px 36px;
  border-radius: 20px;
  background: var(--s1);
  border: 1px solid color-mix(in srgb, var(--ac) 45%, var(--bd));
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  font-size: 15px;
}
.dz .ring {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--ac);
  color: var(--oa);
}
.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
  gap: 12px;
}
.file-tile {
  display: grid;
  align-content: start;
  gap: 8px;
  height: auto;
  min-width: 0;
  padding: 10px;
  border-radius: var(--r);
  background: var(--s2);
  border: 1px solid var(--bd);
  overflow-wrap: anywhere;
}
.file-tile.selected {
  border-color: var(--ac);
}
.file-tile .row {
  flex-wrap: wrap;
  gap: 5px;
}
.file-image {
  display: grid;
  place-items: center;
  position: relative;
  aspect-ratio: 4 / 3;
  background: var(--s1);
  border-radius: var(--rb);
}
.file-image img {
  width: 100%;
  height: 100%;
  position: absolute;
  object-fit: contain;
}
.file-image input {
  position: absolute;
  top: 8px;
  left: 8px;
}

.th {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: var(--s2);
  border: 1px solid var(--bd);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mu);
  overflow: hidden;
}
.th img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.th.fo {
  color: var(--ac);
}
.nm {
  font-weight: 600;
  overflow-wrap: anywhere;
  min-width: 200px;
}
.mu {
  color: var(--mu);
}
td.mono {
  font-size: 13px;
  white-space: nowrap;
}
th.s {
  cursor: pointer;
}
th.s:hover {
  color: var(--tx);
}
</style>
