<script setup>
// G-code viewer, drawn by @sindarius/gcodeviewer (Babylon.js, the engine Mainsail uses): solid extrusions with
// light and shade, colour by feature, speed or extruder. A file plays back at 1x to 20x, and the lines that were
// just drawn start light and cool down into their colour. The bar under the model moves through the file by
// position, the layer slider by layer. Following the running print draws it up to where the printer is, with the
// nozzle at the toolhead position. Clicking an object of the running print picks it for exclusion.
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { readGcodeText, is3mf, isGcodeFile } from '../gcode3mf';
import Icon from '../components/Icon.vue';
import ObjectMap from '../components/ObjectMap.vue';
import RangeSlider from '../components/RangeSlider.vue';
import Rng from '../components/Rng.vue';
import Toggle from '../components/Toggle.vue';
import { state, S, layerInfo, printState, toast, askConfirm, fmtBytes, fmtTime, fmtDate } from '../store';
import { api } from '../api/moonraker';
import { route } from '../router';
import { t } from '../i18n';
const emit = defineEmits(['exclude']);
const eo = computed(() => S('exclude_object'));
const wrap = ref(null);
let viewer = null; // the GCodeViewer, kept out of Vue's reactivity (it is large and changes on its own)
const ready = ref(false);

const file = ref('');
const loading = ref('');
const pct = ref(0);
// the file list in the side column: newest first, searchable, with thumbnails read for the rows shown
const files = ref([]);
const fq = ref('');
const meta = ref({});
const shownFiles = computed(() => {
  const words = fq.value.toLowerCase().split(/\s+/).filter(Boolean);
  return files.value.filter((f) => words.every((w) => f.path.toLowerCase().includes(w))).slice(0, 40);
});
watch(shownFiles, (list) => {
  for (const f of list)
    if (!(f.path in meta.value)) {
      meta.value[f.path] = null;
      api
        .call('server.files.metadata', { filename: f.path })
        .then((m) => (meta.value[f.path] = m))
        .catch(() => {});
    }
});
function thumbOf(path, big = false) {
  const th = [...(meta.value[path]?.thumbnails || [])]
    .sort((a, b) => (big ? b.width - a.width : a.width - b.width))
    .find((x) => x.width >= 32);
  if (!th) return null;
  const dir = path.split('/').slice(0, -1).join('/');
  return api.fileUrl('gcodes', (dir ? dir + '/' : '') + th.relative_path);
}
// remembered in this browser's settings
const set = state.settings;
const colorMode = ref(set.viewerColorMode ?? 2); // 0 extruder, 1 feed rate, 2 feature
const quality = ref(set.viewerQuality ?? 4); // 2 low ... 6 max
const hd = ref(!!set.viewerHd);
const showNozzle = ref(set.viewerNozzle !== false);
const travel = ref(!!set.viewerTravel);
const layerWindow = ref(0); // 0 all, 1 the layer only, 5 the last five
const follow = ref(true);
const tab = ref('3d');

// file position: the bar under the model, and the layers found in the file (where each starts, its height)
const size = ref(0);
const pos = ref(0);
let layerStart = new Uint32Array(0);
let layerZ = new Float32Array(0);
const layers = ref(0);
let box = null; // where the model is: [minX, maxX, minY, maxY, topZ] of the extruding moves
const firstAtOrAbove = (arr, v) => {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < v) lo = m + 1;
    else hi = m;
  }
  return lo;
};
// the layer the position is in, 1-based
const layer = computed(() => (layers.value ? Math.max(1, firstAtOrAbove(layerStart, pos.value + 1)) : 0));
const layerEnd = (n) => (n < layers.value ? layerStart[n] : size.value);

// layers: a new one starts where the nozzle first extrudes at a new, higher Z (a z-hop moves up without
// extruding, so it does not count). Its start is the move that went to that Z.
function findLayers(text) {
  const starts = [],
    zs = [];
  let z = 0,
    zAt = 0,
    top = -Infinity,
    x = 0,
    y = 0,
    i = 0;
  const b = [Infinity, -Infinity, Infinity, -Infinity, 0];
  const n = text.length;
  while (i < n) {
    let e = text.indexOf('\n', i);
    if (e < 0) e = n;
    const c0 = text.charCodeAt(i),
      c1 = text.charCodeAt(i + 1);
    // G0 / G1 / G2 / G3
    if ((c0 === 71 || c0 === 103) && c1 >= 48 && c1 <= 51 && (e - i < 3 || text.charCodeAt(i + 2) <= 32)) {
      let s = text.slice(i, e);
      const cm = s.indexOf(';');
      if (cm >= 0) s = s.slice(0, cm);
      const mz = /\bZ(-?[\d.]+)/i.exec(s);
      if (mz) {
        const nz = parseFloat(mz[1]);
        if (nz !== z) {
          z = nz;
          zAt = i;
        }
      }
      const mx = /\bX(-?[\d.]+)/i.exec(s),
        my = /\bY(-?[\d.]+)/i.exec(s);
      if (mx) x = parseFloat(mx[1]);
      if (my) y = parseFloat(my[1]);
      if (c1 !== 48 && (mx || my) && /\bE[\d.]*[1-9]/i.test(s)) {
        if (x < b[0]) b[0] = x;
        if (x > b[1]) b[1] = x;
        if (y < b[2]) b[2] = y;
        if (y > b[3]) b[3] = y;
        if (z > b[4]) b[4] = z;
        if (z > top + 1e-4) {
          top = z;
          starts.push(zAt);
          zs.push(z);
        }
      }
    }
    i = e + 1;
  }
  layerStart = Uint32Array.from(starts);
  layerZ = Float32Array.from(zs);
  if (layerStart.length) layerStart[0] = 0; // everything before the first layer (start G-code) belongs to it
  layers.value = layerStart.length;
  box = b[0] <= b[1] ? b : null;
}
// the camera on the model, from the front left and above (the whole bed when the model is not known)
function focusModel() {
  if (!viewer) return;
  if (!box) return viewer.resetCamera();
  const [x0, x1, y0, y1, zt] = box;
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2,
    d = Math.max(x1 - x0, y1 - y0, zt, 40) * 1.3;
  viewer.setCameraTarget(cx, cy, zt / 3);
  viewer.setCameraPosition(cx - d * 0.8, cy - d * 1.1, zt + d * 0.9);
}

// The cube turns with the camera: where the camera is seen from the model (Babylon: y up, the printer's front
// towards -z) gives the turn around the bed and the tilt from above. A face click moves the camera there with the
// engine's own view positions (the ones Mainsail's cube uses).
const cubeTf = ref('');
const deg = (r) => (r * 180) / Math.PI;
function syncCube(cam) {
  const p = cam.position,
    t = cam.target;
  const dx = p.x - t.x,
    dy = p.y - t.y,
    dz = p.z - t.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const yaw = Math.atan2(dx, -dz),
    pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  cubeTf.value = `rotateX(${(-deg(pitch)).toFixed(1)}deg) rotateY(${(-deg(yaw)).toFixed(1)}deg)`;
}
const FACES = [
  ['Front', 'translateZ(23px)', { x: 0, y: 0, z: 1 }],
  ['Back', 'rotateY(180deg) translateZ(23px)', { x: 0, y: 0, z: -1 }],
  ['Right', 'rotateY(90deg) translateZ(23px)', { x: -1, y: 0, z: 0 }],
  ['Left', 'rotateY(-90deg) translateZ(23px)', { x: 1, y: 0, z: 0 }],
  ['Top', 'rotateX(90deg) translateZ(23px)', { x: 0, y: -1, z: 0 }],
  ['Bottom', 'rotateX(-90deg) translateZ(23px)', { x: 0, y: 1, z: 0 }],
];
function lookFrom(v) {
  if (!viewer) return;
  viewer.setViewboxCameraPosition(v);
  syncCube(viewer.scene.activeCamera);
}
async function ensureViewer() {
  if (viewer) return viewer;
  const { default: GCodeViewer } = await import('@sindarius/gcodeviewer');
  const canvas = document.createElement('canvas');
  canvas.className = 'gv';
  wrap.value.prepend(canvas);
  const v = new GCodeViewer(canvas);
  await v.init();
  v.setBackgroundColor('#0b0c0e');
  v.bed.setBedColor('#6b7077');
  v.setZClipPlane(1000000, -1000000);
  v.axes.show(true);
  // our own orientation cube instead of the engine's: it turns with the camera, a face click looks from there
  v.displayViewBox(false);
  const cam = v.scene.activeCamera;
  cam.onViewMatrixChangedObservable.add(() => syncCube(cam));
  syncCube(cam);
  const th = S('toolhead');
  const kin = S('configfile').settings?.printer?.kinematics || '';
  v.bed.setDelta(kin.includes('delta'));
  const max = th.axis_maximum,
    min = th.axis_minimum;
  if (max) {
    v.bed.buildVolume.x.max = max[0];
    v.bed.buildVolume.y.max = max[1];
    v.bed.buildVolume.z.max = max[2];
  }
  if (min) {
    v.bed.buildVolume.x.min = min[0];
    v.bed.buildVolume.y.min = min[1];
    v.bed.buildVolume.z.min = min[2];
  }
  const gp = v.gcodeProcessor;
  gp.setLiveTracking(false);
  gp.useHighQualityExtrusion(hd.value);
  gp.updateForceWireMode(false);
  gp.setAlpha(false);
  gp.useSpecularColor(false);
  gp.setColorMode(colorMode.value);
  gp.updateColorRate(20 * 60, 100 * 60); // feed rate colours: 20 mm/s blue ... 100 mm/s red
  gp.updateMinFeedColor('#2196f3');
  gp.updateMaxFeedColor('#d41216');
  toolColors(v);
  v.buildObjects.objectCallback = (o) => {
    if (!o?.name || o.cancelled) return;
    state.excludePick = o.name;
    emit('exclude');
  };
  gp.loadingProgressCallback = (p) => (pct.value = Math.min(100, Math.ceil(p * 100)));
  if (v.lastLoadFailed()) {
    // the last file crashed the tab at this quality: start low (the engine remembers it)
    quality.value = 2;
    v.clearLoadFlag();
  }
  v.updateRenderQuality(quality.value);
  viewer = v;
  ready.value = true;
  return v;
}
// colours per extruder (the extruder colour mode): the accent first
function toolColors(v) {
  const nd = Number(S('configfile').settings?.extruder?.nozzle_diameter) || 0.4;
  v.gcodeProcessor.resetTools();
  for (const c of [set.accent || '#ff6b1a', '#2a9d8f', '#e9c46a', '#4f8ef7', '#c86bfa'])
    v.gcodeProcessor.addTool(c, nd);
}

// the whole file is read into memory: above this size ask first (a phone or tablet tab can run out of memory)
const BIG = 50 * 1024 * 1024;
const sizes = {};
async function sizeOf(fn) {
  if (sizes[fn] != null) return sizes[fn];
  try {
    return (await api.call('server.files.metadata', { filename: fn })).size ?? 0;
  } catch {
    return 0;
  }
}
let loadRequest = 0;
async function load(fn) {
  if (!fn) return;
  const request = ++loadRequest;
  const sz = await sizeOf(fn);
  if (
    sz * (is3mf(fn) ? 6 : 1) > BIG &&
    !(await askConfirm({
      title: t('Large file'),
      text: t('{file} is {size}. Loading it can make this tab slow, or crash it on a phone or tablet.', {
        file: fn.split('/').pop(),
        size: fmtBytes(sz),
      }),
      ok: t('Open anyway'),
    }))
  )
    return;
  if (request !== loadRequest) return;
  stop();
  loading.value = t('Downloading…');
  pct.value = 0;
  try {
    const text = await readGcodeText(api, fn);
    if (request !== loadRequest) return;
    const v = await ensureViewer();
    if (request !== loadRequest) return;
    file.value = fn;
    loading.value = t('Parsing…');
    await nextTick();
    if (viewer.loading) {
      v.gcodeProcessor.cancelLoad = true;
      await new Promise((r) => setTimeout(r, 300));
    }
    findLayers(text);
    v.updateRenderQuality(quality.value);
    await v.processFile(text);
    if (request !== loadRequest) return;
    finish();
    focusModel();
  } catch (e) {
    if (request === loadRequest) toast(t('Viewer: {err}', { err: e.message }), 'error');
  }
  if (request === loadRequest) loading.value = '';
}
// after a load or a reload: the whole file shown, or where the print is
function finish() {
  const v = viewer;
  size.value = v.fileSize;
  v.setCursorVisiblity(showNozzle.value);
  v.toggleTravels(travel.value);
  refreshObjects();
  if (tracking.value) return track();
  pos.value = size.value;
  v.gcodeProcessor.updateFilePosition(size.value);
  clip();
}
async function reload() {
  if (!viewer || !file.value) return;
  stop();
  loading.value = t('Parsing…');
  pct.value = 0;
  try {
    await viewer.reload();
    finish();
  } catch (e) {
    toast(t('Viewer: {err}', { err: e.message }), 'error');
  }
  loading.value = '';
}

// moving through the file
let posRaf = 0;
function goTo(p, simulate = true) {
  pos.value = Math.max(0, Math.min(size.value, Math.round(p)));
  cancelAnimationFrame(posRaf);
  posRaf = requestAnimationFrame(() => {
    if (!viewer) return;
    viewer.gcodeProcessor.updateFilePosition(pos.value);
    if (simulate) viewer.simulateToolPosition();
    clip();
  });
}
function scrub(p) {
  follow.value = false;
  stop();
  goTo(p);
}
function toLayer(n) {
  follow.value = false;
  stop();
  goTo(layerEnd(n));
}
// only some layers: cut the model above the shown layer and below the window
function clip() {
  if (!viewer) return;
  const n = layer.value;
  if (!layerWindow.value || !n || !layerZ.length) return viewer.setZClipPlane(1000000, -1000000);
  const top = layerZ[n - 1] + 0.001;
  const k = n - 1 - layerWindow.value;
  viewer.setZClipPlane(top, k >= 0 ? layerZ[k] + 0.001 : -1000000);
}
watch(layerWindow, clip);

// playback: the position moves on by itself, like the printer printing it. Every 50 ms, 2.5 KB a second at 1x
const SPEEDS = [1, 2, 5, 10, 20];
const speed = ref(set.viewerSpeed || 5);
const playing = ref(false);
let playTm = null;
function play() {
  if (!viewer || !size.value) return;
  if (playing.value) return stop();
  follow.value = false;
  if (pos.value >= size.value) goTo(0, false);
  // start a little behind, so the first lines also show their cooling
  viewer.gcodeProcessor.updateFilePosition(Math.max(0, pos.value - 30000));
  playing.value = true;
  playTm = setInterval(() => {
    const next = pos.value + 125 * speed.value;
    goTo(next);
    if (next >= size.value) stop();
  }, 50);
}
function stop() {
  playing.value = false;
  clearInterval(playTm);
  playTm = null;
}
function toEnd() {
  stop();
  follow.value = false;
  goTo(size.value, false);
}
watch(speed, (s) => (set.viewerSpeed = s));

// the running print
const curPrint = computed(() => S('print_stats').filename);
const active = computed(() => state.klippy === 'ready' && ['printing', 'paused'].includes(printState.value));
const tracking = computed(() => follow.value && active.value && !!file.value && file.value === curPrint.value);
function track() {
  if (!viewer || !tracking.value) return;
  const fp = S('virtual_sdcard').file_position || 0;
  // a little behind the printer: the planner is ahead of the move that is happening
  goTo(fp > 350 ? fp - 350 : fp, false);
  const lp = S('motion_report').live_position || S('toolhead').position;
  const off = S('gcode_move').homing_origin || [0, 0, 0];
  if (lp)
    viewer.updateToolPosition([
      { axes: 'X', position: lp[0] - off[0] },
      { axes: 'Y', position: lp[1] - off[1] },
      { axes: 'Z', position: lp[2] - off[2] },
    ]);
}
watch(
  () => [S('virtual_sdcard').file_position, S('motion_report').live_position],
  () => tracking.value && !playing.value && track(),
);
watch(tracking, (on) => {
  if (!viewer || !size.value) return;
  if (on) {
    stop();
    viewer.gcodeProcessor.updateFilePosition(0);
    viewer.forceRender();
    track();
  } else if (pos.value < size.value && !active.value) goTo(size.value, false); // the print ended: all of it
});
// the objects of the running print: click one to exclude it
function refreshObjects() {
  if (!viewer) return;
  const on = file.value === curPrint.value && active.value && eo.value.objects?.length;
  const list = on
    ? eo.value.objects.map((o) => {
        const xs = o.polygon.map((p) => p[0]),
          ys = o.polygon.map((p) => p[1]);
        return {
          name: o.name,
          cancelled: (eo.value.excluded_objects || []).includes(o.name),
          x: [Math.min(...xs), Math.max(...xs)],
          y: [Math.min(...ys), Math.max(...ys)],
        };
      })
    : [];
  viewer.buildObjects.loadObjectBoundaries(list);
  viewer.buildObjects.showObjectSelection(!!on);
}
watch(() => [eo.value.objects, eo.value.excluded_objects, active.value, file.value], refreshObjects, { deep: true });

// settings
watch(showNozzle, (v) => {
  set.viewerNozzle = v;
  viewer?.setCursorVisiblity(v);
});
watch(travel, (v) => {
  set.viewerTravel = v;
  viewer?.toggleTravels(v);
});
watch(colorMode, (m) => {
  set.viewerColorMode = m;
  if (!viewer) return;
  viewer.gcodeProcessor.setColorMode(m);
  reload();
});
watch(quality, (q) => {
  set.viewerQuality = q;
  if (!viewer || viewer.renderQuality === q) return;
  viewer.updateRenderQuality(q);
  reload();
});
watch(hd, (v) => {
  set.viewerHd = v;
  if (!viewer) return;
  viewer.gcodeProcessor.useHighQualityExtrusion(v);
  reload();
});
const QUALITIES = [
  [2, 'Low'],
  [3, 'Medium'],
  [4, 'High'],
  [5, 'Ultra'],
  [6, 'Max'],
];
const pctText = computed(() => (size.value ? Math.round((pos.value / size.value) * 1000) / 10 + '%' : ''));

let ro, rt;
onMounted(async () => {
  ro = new ResizeObserver(() => {
    clearTimeout(rt);
    rt = setTimeout(() => viewer?.resize(), 100);
  });
  ro.observe(wrap.value);
  try {
    const all = await api.call('server.files.list', { root: 'gcodes' });
    for (const f of all) sizes[f.path] = f.size;
    files.value = all.filter((f) => isGcodeFile(f.path)).sort((a, b) => b.modified - a.modified);
  } catch {}
  // opened from the Files page with a file to show, otherwise the running job
  if (route.arg) load(route.arg);
  else if (curPrint.value) load(curPrint.value);
});
// a file sent from the Files page while this page is open
watch(
  () => route.arg,
  (a) => route.name === 'viewer' && a && a !== file.value && load(a),
);
// opened before the printer answered (a direct link to the page): load the running job once it is known
watch(curPrint, (f) => f && !file.value && !loading.value && load(f));
onBeforeUnmount(() => {
  stop();
  cancelAnimationFrame(posRaf);
  clearTimeout(rt);
  ro?.disconnect();
  loadRequest++;
  try {
    if (viewer) viewer.gcodeProcessor.cancelLoad = true;
    viewer?.scene?.dispose?.();
    viewer?.engine?.dispose?.();
  } catch {}
  viewer = null;
});
</script>
<template>
  <div class="split" style="min-height: calc(var(--main-h, 100vh) - 105px)">
    <section class="card grow">
      <div class="card-h">
        <h2>{{ t('G-code Viewer') }}</h2>
        <div class="acts">
          <div class="seg" style="width: 160px">
            <button :class="{ on: tab === '3d' }" @click="tab = '3d'">3D</button
            ><button :class="{ on: tab === 'map' }" @click="tab = 'map'">{{ t('Objects') }}</button>
          </div>
          <button class="btn out" :disabled="!curPrint" @click="load(curPrint)">
            <Icon name="download" :size="16" />{{ t('Load current job') }}
          </button>
          <button
            class="btn ibtn"
            :disabled="!ready"
            :aria-label="t('Reset view')"
            :data-tip="t('Reset view')"
            @click="focusModel"
          >
            <Icon name="refresh" :size="16" />
          </button>
        </div>
      </div>
      <div v-show="tab === '3d'" ref="wrap" class="cv">
        <div v-if="loading" class="ld">
          <Icon name="refresh" :size="20" class="spin" />{{ loading }}<span v-if="pct" class="mono">{{ pct }}%</span>
        </div>
        <div v-else-if="!file" class="ld">{{ t('Load the current job or pick a file') }}</div>
        <span v-if="file" class="fn mono">{{ file }}</span>
        <div v-if="ready" class="ocube" @pointerdown.stop>
          <div class="oc" :style="{ transform: cubeTf }">
            <button
              v-for="[name, tf, dir] in FACES"
              :key="name"
              type="button"
              :style="{ transform: tf }"
              :aria-label="t(name)"
              @click="lookFrom(dir)"
            >
              {{ t(name) }}
            </button>
          </div>
        </div>
        <span v-if="file && file === curPrint && active && eo.objects?.length" class="hint mono">{{
          t('Click an object to exclude it')
        }}</span>
      </div>
      <ObjectMap v-if="tab === 'map'" style="flex: 1; min-height: 400px" @pick="emit('exclude')" />
      <template v-if="size && tab === '3d'">
        <div class="pb">
          <button
            class="btn ibtn acc"
            :aria-label="playing ? t('Pause') : t('Play')"
            :data-tip="playing ? t('Pause') : t('Play')"
            @click="play"
          >
            <Icon :name="playing ? 'pause' : 'play'" :size="16" />
          </button>
          <button class="btn ibtn" :aria-label="t('Show all')" :data-tip="t('Show all')" @click="toEnd">
            <Icon name="skip" :size="16" />
          </button>
          <div class="grow" style="min-width: 0">
            <Rng :value="pos" :min="0" :max="size" :step="1" :label="t('Position in the file')" @input="scrub" />
          </div>
          <span class="mono mu pp">{{ pctText }}</span>
          <div class="seg spd" role="radiogroup" :aria-label="t('Speed')">
            <button
              v-for="s in SPEEDS"
              :key="s"
              role="radio"
              :aria-checked="speed === s"
              :class="{ on: speed === s }"
              @click="speed = s"
            >
              {{ s }}x
            </button>
          </div>
        </div>
        <div v-if="layers" class="row" style="gap: 12px">
          <div class="grow">
            <RangeSlider
              :label="t('Layer')"
              :min="1"
              :max="layers"
              :model-value="layer"
              :display="layer + ' / ' + layers"
              @update:model-value="toLayer"
            />
          </div>
        </div>
      </template>
    </section>
    <div class="side-col">
      <section class="card">
        <div class="card-h">
          <h2>{{ t('Current print') }}</h2>
          <span class="chip" style="text-transform: capitalize"><i></i>{{ t(printState) }}</span>
        </div>
        <div class="row" style="align-items: baseline">
          <b style="font-size: 32px">{{ layerInfo.cur }}</b
          ><span class="mono mu"
            >/ {{ layerInfo.total || '--' }} · Z {{ (S('gcode_move').gcode_position?.[2] ?? 0).toFixed(2) }}</span
          >
        </div>
        <div class="row" style="justify-content: space-between">
          <span>{{ t('Follow print') }}</span
          ><Toggle v-model="follow" :label="t('Follow print')" />
        </div>
        <div class="row" style="justify-content: space-between">
          <span>{{ t('Show nozzle') }}</span
          ><Toggle v-model="showNozzle" :label="t('Show nozzle')" />
        </div>
        <div class="row" style="justify-content: space-between">
          <span>{{ t('Show travel moves') }}</span
          ><Toggle v-model="travel" :label="t('Show travel')" />
        </div>
        <div class="col" style="gap: 6px">
          <label class="row">
            <span class="grow">{{ t('Visible layers') }}</span>
            <select v-model.number="layerWindow" class="input">
              <option :value="0">{{ t('All') }}</option>
              <option :value="1">{{ t('Active layer only') }}</option>
              <option :value="5">{{ t('Last five layers') }}</option>
            </select>
          </label>
          <span>{{ t('Colour') }}</span>
          <div class="seg">
            <button :class="{ on: colorMode === 2 }" @click="colorMode = 2">{{ t('Feature') }}</button>
            <button :class="{ on: colorMode === 1 }" @click="colorMode = 1">{{ t('Speed') }}</button>
            <button :class="{ on: colorMode === 0 }" @click="colorMode = 0">{{ t('Extruder') }}</button>
          </div>
          <label class="row">
            <span class="grow">{{ t('Render quality') }}</span>
            <select v-model.number="quality" class="input">
              <option v-for="[v, l] in QUALITIES" :key="v" :value="v">{{ t(l) }}</option>
            </select>
          </label>
          <div class="row" style="justify-content: space-between">
            <span>{{ t('Round extrusions (slower)') }}</span
            ><Toggle v-model="hd" :label="t('Round extrusions (slower)')" />
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card-h">
          <h2>{{ t('Objects') }}</h2>
          <button class="btn out" :disabled="!eo.objects?.length || !active" @click="emit('exclude')">
            <Icon name="excl" :size="16" />{{ t('Exclude…') }}
          </button>
        </div>
        <div v-if="!eo.objects?.length" class="empty">{{ t('No object labels in this print.') }}</div>
        <div v-for="o in eo.objects" :key="o.name" class="row" style="height: 32px">
          <span
            class="mono grow"
            :style="{
              fontSize: '12px',
              color: eo.excluded_objects?.includes(o.name)
                ? 'var(--mu)'
                : o.name === eo.current_object
                  ? 'var(--ac)'
                  : 'var(--tx)',
              textDecoration: eo.excluded_objects?.includes(o.name) ? 'line-through' : 'none',
            }"
            >{{ o.name }}</span
          >
        </div>
      </section>
      <section class="card fls">
        <div class="card-h">
          <h2>{{ t('G-code Files') }}</h2>
        </div>
        <input
          v-model="fq"
          class="input"
          type="search"
          :placeholder="t('Search files')"
          :aria-label="t('Search files')"
        />
        <div class="fl">
          <button
            v-for="f in shownFiles"
            :key="f.path"
            class="fr"
            :class="{ on: f.path === file }"
            :aria-current="f.path === file || undefined"
            @click="load(f.path)"
          >
            <span class="th"
              ><img
                v-if="thumbOf(f.path)"
                v-zoom="thumbOf(f.path, true)"
                :src="thumbOf(f.path)"
                alt=""
                loading="lazy" /><Icon v-else name="cube" :size="16"
            /></span>
            <span class="col" style="gap: 1px; min-width: 0">
              <b class="ell">{{ f.path }}</b>
              <span class="mono mu ell sm"
                >{{ meta[f.path]?.estimated_time ? fmtTime(meta[f.path].estimated_time) + ' · ' : ''
                }}{{ fmtDate(f.modified) }}</span
              >
            </span>
          </button>
          <div v-if="!shownFiles.length" class="empty">{{ t('No match') }}</div>
        </div>
      </section>
    </div>
  </div>
</template>
<style scoped>
.fls .input {
  width: 100%;
}
.fl {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 420px;
  overflow: auto;
}
.fr {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--tx);
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.fr:hover {
  background: var(--s2);
}
.fr.on {
  background: var(--s3);
}
.fr .th {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: var(--s2);
  display: grid;
  place-items: center;
  color: var(--mu);
  overflow: hidden;
}
.fr .th img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.fr b {
  font-size: 13px;
  font-weight: 600;
}
.ell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm {
  font-size: 11.5px;
}
.mu {
  color: var(--mu);
}
.cv {
  position: relative;
  flex: 1;
  min-height: 460px;
  background: #0b0c0e;
  border-radius: 8px;
  overflow: hidden;
}
.cv :deep(canvas.gv) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
  touch-action: none;
}
.ld {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--mu);
  pointer-events: none;
}
.fn {
  position: absolute;
  top: 10px;
  left: 12px;
  font-size: 12px;
  color: var(--mu);
  pointer-events: none;
}
.hint {
  position: absolute;
  bottom: 10px;
  right: 12px;
  font-size: 11px;
  color: var(--mu);
  pointer-events: none;
}
.pb {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pp {
  width: 48px;
  text-align: right;
  font-size: 12px;
}
.spd button {
  padding: 0 9px;
  font-size: 12px;
}
.ocube {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 84px;
  height: 84px;
  display: grid;
  place-items: center;
  perspective: 260px;
  z-index: 2;
}
.oc {
  position: relative;
  width: 46px;
  height: 46px;
  transform-style: preserve-3d;
}
.oc button {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--tx) 18%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--s2) 88%, transparent);
  color: var(--mu);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  backface-visibility: hidden;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}
.oc button:hover,
.oc button:focus-visible {
  background: var(--ac);
  border-color: var(--ac);
  color: var(--oa, #0d1513);
}
</style>
