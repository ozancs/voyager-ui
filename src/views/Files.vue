<script setup>
// G-code files page: folders, thumbnails, metadata, search, print, add to queue, upload, rename,
// delete and the edit button (opens small files in the config editor).
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
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
import { nameTaken } from '../fileNames';
import { droppedFiles, pickedFolderFiles, moveItems, DRAG_TYPE, isRowDrag } from '../fileMove';
import FolderPicker from '../components/FolderPicker.vue';
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
  allFiles.value = null;
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
    .sort((a, b) => pinned(b) - pinned(a) || ((a[k] ?? 0) > (b[k] ?? 0) ? d : -d));
});
// search reaches every folder: the matches outside this one are listed under the table and open their folder
const allFiles = ref(null);
let allReq = null;
watch(q, (v) => {
  if (v && !allFiles.value && !allReq)
    allReq = api
      .call('server.files.list', { root: 'gcodes' })
      .then((r) => (allFiles.value = r.filter((f) => isGcodeFile(f.path) && !/(^|\/)\./.test(f.path))))
      .catch(() => {})
      .finally(() => (allReq = null));
});
const elsewhere = computed(() => {
  const f = q.value.toLowerCase();
  if (!f || !allFiles.value) return [];
  const here = path.value === 'gcodes' ? '' : path.value.slice(7);
  return allFiles.value
    .filter((x) => x.path.toLowerCase().split('/').pop().includes(f))
    .filter((x) => x.path.split('/').slice(0, -1).join('/') !== here)
    .sort((a, b) => b.modified - a.modified)
    .slice(0, 50);
});
function openElsewhere(x) {
  state.anchor = 'file:' + x.path;
  takeAnchor();
  load();
}
// files pinned to the top of their folder (right-click > Pin to top), kept by their path from the gcodes root
const pinned = (f) => +(state.settings.pinnedFiles || []).includes(rel(f));
function togglePin(f) {
  const l = [...(state.settings.pinnedFiles || [])];
  const i = l.indexOf(rel(f));
  i >= 0 ? l.splice(i, 1) : l.push(rel(f));
  state.settings.pinnedFiles = l;
}
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
// the menu belongs to the row it was opened on: scrolling the list, resizing the window or a right-click
// somewhere else (the browser's own menu opens there) closes it
const ctxOff = (e) => {
  if (e?.type === 'contextmenu' && e.target?.closest?.('.fctx')) return;
  if (e?.type === 'scroll' && ctxEl.value?.contains(e.target)) return;
  ctx.value = null;
};
watch(
  () => !!ctx.value,
  (on) => {
    for (const ev of ['scroll', 'resize', 'contextmenu']) {
      window.removeEventListener(ev, ctxOff, true);
      if (on) window.addEventListener(ev, ctxOff, true);
    }
  },
);
onBeforeUnmount(() =>
  ['scroll', 'resize', 'contextmenu'].forEach((ev) => window.removeEventListener(ev, ctxOff, true)),
);
function ctxDo(action) {
  const { f, dir } = ctx.value;
  ctx.value = null;
  if (dir) {
    if (action === 'open') open(f);
    else if (action === 'move') moveOf.value = [f.dirname];
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
  else if (action === 'move') moveOf.value = picked.value.has(f.filename) ? [...picked.value] : [f.filename];
  else if (action === 'pin') togglePin(f);
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
const renEl = ref(null);
let renBusy = false;
// the name is ready to type over: the part before the extension is selected
watch(ren, async (r) => {
  if (!r) return;
  await nextTick();
  const el = renEl.value;
  if (!el || !window.matchMedia?.('(pointer: fine)').matches) return;
  el.focus({ preventScroll: true });
  const dot = r.dir ? -1 : r.value.search(/(\.gcode)?\.[^.]+$/i);
  el.setSelectionRange(0, dot > 0 ? dot : r.value.length);
});
async function doRename() {
  const r = ren.value;
  if (!r || renBusy) return;
  let name = (r.value || '').trim();
  const old = r.dir ? r.f.dirname : r.f.filename.split('/').pop();
  if (!name || name === old || /[/\\]/.test(name)) {
    ren.value = null;
    return;
  }
  // a file keeps its extension when the new name has none: without it the printer no longer lists it
  const ext = r.dir ? '' : (/(\.gcode\.3mf|\.[^.]+)$/i.exec(old) || [''])[0];
  if (ext && !isGcodeFile(name)) name += ext;
  const base = path.value;
  renBusy = true;
  try {
    // Moonraker would put it over a file of that name without asking (or into a folder of that name)
    if (name !== old && (await nameTaken(base, name)))
      return toast(t('{name} already exists in this folder.', { name }), 'error');
    ren.value = null;
    await api.call('server.files.move', { source: `${base}/${old}`, dest: `${base}/${name}` });
    toast(t('Renamed to {name}', { name }));
    // the selection follows the file to its new name
    if (!r.dir) {
      if (sel.value === old) sel.value = name;
      if (picked.value.has(old)) {
        const p = new Set(picked.value);
        p.delete(old);
        p.add(name);
        picked.value = p;
      }
    }
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    renBusy = false;
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
  const fs = [...e.target.files].map((file) => ({ file, dir: '' }));
  e.target.value = '';
  return uploadList(fs);
}
// a whole folder from the computer: everything printable in it, its folders kept
function uploadFolder(e) {
  const list = pickedFolderFiles(e.target.files);
  e.target.value = '';
  return uploadList(list);
}
async function uploadList(fs) {
  let skipped = 0;
  for (const { file: f, dir: sub } of fs) {
    // only files the printer can print: anything else would sit in the folder unseen (this list does not show it)
    if (!isGcodeFile(f.name)) {
      if (!sub) toast(t('{name} is not a G-code file, so it was not uploaded.', { name: f.name }), 'warn');
      else skipped++;
      continue;
    }
    const here = path.value === 'gcodes' ? '' : path.value.slice(7);
    const dir = [here, sub].filter(Boolean).join('/');
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
  if (skipped) toast(t('{n} file(s) in the folder are not G-code and were left out.', { n: skipped }), 'warn');
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
async function onDrop(e) {
  e.preventDefault();
  depth = 0;
  over.value = false;
  if (isRowDrag(e)) return; // a row let go somewhere that is not a folder
  if (e.dataTransfer?.files?.length) uploadList(await droppedFiles(e.dataTransfer)); // folders too
}
// ---- moving: rows dragged onto a folder (or the Up button), or "Move to…" ----
const folderInput = ref(null);
const moveOf = ref(null); // names waiting for the folder picker
const dragOver = ref(null); // folder name (or '..') the rows are over
function dragStart(e, name) {
  // the picked files go together when the dragged one is among them
  const names = picked.value.has(name) && picked.value.size > 1 ? [...picked.value] : [name];
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(names));
  e.dataTransfer.effectAllowed = 'move';
}
function dragOn(e, target) {
  if (!isRowDrag(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  dragOver.value = target;
}
async function dropOn(e, target) {
  dragOver.value = null;
  if (!isRowDrag(e)) return;
  e.preventDefault();
  e.stopPropagation();
  let names = [];
  try {
    names = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || '[]');
  } catch {}
  const to = target === '..' ? path.value.split('/').slice(0, -1).join('/') || 'gcodes' : path.value + '/' + target;
  names = names.filter((n) => n !== target);
  if (await moveItems(path.value, names, to)) {
    picked.value = new Set();
    load();
  }
}
async function moveTo(dest) {
  const names = moveOf.value || [];
  moveOf.value = null;
  if (await moveItems(path.value, names, dest)) {
    picked.value = new Set();
    load();
  }
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
        <button
          class="btn clear"
          :class="{ dropto: dragOver === '..' }"
          :disabled="path === 'gcodes'"
          :aria-label="t('Up one folder')"
          @click="upDir"
          @dragover="path !== 'gcodes' && dragOn($event, '..')"
          @dragleave="dragOver = null"
          @drop="dropOn($event, '..')"
        >
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
        <button v-if="picked.size" class="btn" style="height: 40px" @click="moveOf = [...picked]">
          <Icon name="folder" :size="16" />{{ t('Move ({n})', { n: picked.size }) }}
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
        <button
          class="btn ibtn"
          style="width: 40px; height: 40px"
          :disabled="!!up"
          :aria-label="t('Upload a folder')"
          :data-tip="t('Upload a folder')"
          @click="folderInput.click()"
        >
          <Icon name="folder" :size="18" />
        </button>
        <input ref="fileInput" type="file" multiple :accept="UPLOAD_ACCEPT" hidden @change="upload" />
        <input ref="folderInput" type="file" webkitdirectory multiple hidden @change="uploadFolder" />
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
          :class="{ dropto: dragOver === d.dirname }"
          draggable="true"
          @click="open(d)"
          @contextmenu.prevent="showCtx($event, d, true)"
          @dragstart="dragStart($event, d.dirname)"
          @dragover="dragOn($event, d.dirname)"
          @dragleave="dragOver = null"
          @drop="dropOn($event, d.dirname)"
        >
          <Icon name="folder" :size="32" /><span>{{ d.dirname }}</span>
        </button>
        <article
          v-for="f in list"
          :key="f.filename"
          class="file-tile"
          :class="{ selected: picked.has(f.filename) }"
          draggable="true"
          @contextmenu.prevent="showCtx($event, f)"
          @dragstart="dragStart($event, f.filename)"
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
          <b><Icon v-if="pinned(f)" name="bookmark" :size="13" class="pinm" />{{ f.filename }}</b>
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
              :class="{ dropto: dragOver === d.dirname }"
              tabindex="0"
              draggable="true"
              @click="open(d)"
              @dragstart="dragStart($event, d.dirname)"
              @dragover="dragOn($event, d.dirname)"
              @dragleave="dragOver = null"
              @drop="dropOn($event, d.dirname)"
              @keydown.enter.self="open(d)"
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
              draggable="true"
              @dragstart="dragStart($event, f.filename)"
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
              <td class="nm"><Icon v-if="pinned(f)" name="bookmark" :size="13" class="pinm" />{{ f.filename }}</td>
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
        <div v-if="!loading && !q && !dirs.length && !list.length" class="empty">
          {{ t('No G-code files here. Drop files on this card to upload.') }}
        </div>
        <div v-if="q && !list.length && !elsewhere.length" class="empty">{{ t('No files match “{q}”.', { q }) }}</div>
        <div v-if="elsewhere.length" class="elsewhere">
          <h3>{{ t('In other folders') }}</h3>
          <button v-for="x in elsewhere" :key="x.path" class="ew" @click="openElsewhere(x)">
            <Icon name="file" :size="15" /><span class="nm">{{ x.path.split('/').pop() }}</span
            ><span class="mono mu dir">/{{ x.path.split('/').slice(0, -1).join('/') }}</span>
          </button>
        </div>
      </div>
      <div class="row mono mu" style="justify-content: space-between; font-size: 12px">
        <span>{{ t('{n} files · {d} folders', { n: list.length, d: dirs.length }) }}</span
        ><span v-if="disk">{{
          t('Disk: {free} free of {total}', { free: fmtBytes(disk.free), total: fmtBytes(disk.total) })
        }}</span>
      </div>
    </section>
    <!-- an empty queue takes no room: jobs added from a row bring it back -->
    <div v-if="!state.queue.enabled || state.queue.jobs?.length" class="side-col"><QueueCard /></div>
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
        <button class="btn clear" role="menuitem" @click="ctxDo('move')">
          <Icon name="folder" :size="16" />{{ t('Move to…') }}
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
        <button class="btn clear" role="menuitem" @click="ctxDo('pin')">
          <Icon name="bookmark" :size="16" />{{ pinned(ctx.f) ? t('Unpin') : t('Pin to top') }}
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
        <button class="btn clear" role="menuitem" @click="ctxDo('move')">
          <Icon name="folder" :size="16" />{{ t('Move to…') }}
        </button>
        <button class="btn clear dgf" role="menuitem" @click="ctxDo('delete')">
          <Icon name="trash" :size="16" />{{ t('Delete') }}
        </button>
      </template>
    </div>
  </Teleport>
  <FolderPicker
    v-if="moveOf"
    root="gcodes"
    :start="path"
    :count="moveOf.length"
    @pick="moveTo"
    @close="moveOf = null"
  />
  <Modal v-if="ren" :title="t('Rename')" @close="ren = null">
    <input
      ref="renEl"
      v-model="ren.value"
      class="input mono"
      :aria-label="t('New name')"
      autofocus
      @keydown.enter="doRename"
    />
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
      autofocus
      @keydown.enter="mkdir"
    />
    <template #foot
      ><button class="btn lg" @click="newDir = null">{{ t('Cancel') }}</button
      ><button class="btn lg acc" @click="mkdir">{{ t('Create') }}</button></template
    >
  </Modal>
</template>
<style scoped>
.pinm {
  color: var(--ac);
  margin-right: 6px;
  vertical-align: -1px;
}
/* a folder that dragged rows would go into */
.dropto,
tr.dropto td {
  outline: 2px dashed var(--ac);
  outline-offset: -2px;
  background: color-mix(in srgb, var(--ac) 12%, transparent) !important;
}
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
.elsewhere {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 10px;
}
.elsewhere h3 {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--mu);
}
.ew {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 9px;
  text-align: left;
  color: var(--tx);
}
.ew:hover {
  background: var(--s2);
}
.ew .nm {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ew .dir {
  margin-left: auto;
  font-size: 12px;
  white-space: nowrap;
}
</style>
