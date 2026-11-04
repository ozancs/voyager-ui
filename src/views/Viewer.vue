<script setup>
// G-code viewer (gcode-preview, three.js): loads a file from the printer and shows it in 3D or as
// layers, can follow the running print and exclude objects. Following the print shows what is printed so far
// down to the line being printed, the rest of the model faded, and a cone where the nozzle is.
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, shallowRef } from 'vue';
import { readGcodeText, is3mf } from '../gcode3mf';
import { colorByFeature, colorBySpeed, objectAt } from '../gcodeColor';
import Icon from '../components/Icon.vue';
import ObjectMap from '../components/ObjectMap.vue';
import RangeSlider from '../components/RangeSlider.vue';
import Toggle from '../components/Toggle.vue';
import { state, S, layerInfo, printState, toast, askConfirm, fmtBytes } from '../store';
import { api } from '../api/moonraker';
import { t } from '../i18n';
const emit = defineEmits(['exclude']);
const eo = computed(() => S('exclude_object'));
const canvas = ref(null);
const wrap = ref(null);
const preview = shallowRef(null);
const cubeTransform = ref('');
const layerWindow = ref(0);
const axes = [
  ['Front', [0, 0, 1], 'translateZ(22px)'],
  ['Rear', [0, 0, -1], 'rotateY(180deg) translateZ(22px)'],
  ['Right', [1, 0, 0], 'rotateY(90deg) translateZ(22px)'],
  ['Left', [-1, 0, 0], 'rotateY(-90deg) translateZ(22px)'],
  ['Top', [0, 1, 0], 'rotateX(90deg) translateZ(22px)'],
  ['Bottom', [0, -1, 0], 'rotateX(-90deg) translateZ(22px)'],
];
let three;
let loadRequest = 0;
let parseRequest = 0;
function syncCube() {
  const q = preview.value.camera.quaternion;
  // CSS uses a downward Y axis. Invert the camera rotation and reflect that axis.
  const angle = 2 * Math.acos(Math.max(-1, Math.min(1, q.w)));
  cubeTransform.value = Math.abs(angle) < 1e-6 ? 'none' : `rotate3d(${q.x}, ${-q.y}, ${q.z}, ${angle}rad)`;
}
function viewFrom([x, y, z]) {
  const { camera, controls } = preview.value;
  const distance = camera.position.distanceTo(controls.target);
  camera.position.copy(controls.target).addScaledVector(new three.Vector3(x, y, z || (y ? 0.000001 : 0)), distance);
  controls.update();
  syncCube();
}

const file = ref('');
const loading = ref('');
const layers = ref(0);
const layer = ref(0);
const follow = ref(true);
// the nozzle at the toolhead position while the loaded file prints (remembered in this browser)
let nozzlePref = '1';
try {
  nozzlePref = localStorage.getItem('voyager-ui-viewer-nozzle') ?? '1';
} catch {}
const showNozzle = ref(nozzlePref !== '0');
const travel = ref(false);
const tab = ref('3d');
// colour: one colour with a height gradient (as before), by feature type (;TYPE: comments) or by speed
const colorMode = ref(state.settings.viewerColor || 'single');
const legend = ref([]);
let rawText = ''; // the file as loaded, recoloured again when the mode changes
watch(colorMode, (m) => {
  state.settings.viewerColor = m;
  if (rawText) parse(rawText);
});
let offsets = null;
let lineLayer = null;
let showMap = null; // the colour modes rewrite the text: map[shown line] = original line
const parsed = ref(0); // bumped when a file is parsed: offsets/lineLayer are plain variables, not reactive
const files = ref([]);

async function ensurePreview() {
  if (preview.value) return preview.value;
  const GP = await import('gcode-preview');
  three = await import('three');
  const th = S('toolhead');
  const max = th.axis_maximum || [300, 300, 300];
  preview.value = GP.init({
    canvas: canvas.value,
    buildVolume: { x: max[0], y: max[1], z: Math.min(max[2], 400) },
    backgroundColor: '#0b0c0e',
    extrusionColor: state.settings.accent || '#ff6b1a',
    travelColor: '#5aa9ff',
    renderTravel: false,
    renderTubes: true,
    extrusionWidth: Number(S('configfile').settings?.extruder?.nozzle_diameter) || 0.4,
    initialCameraPosition: [0, max[1] * 1.6, max[1] * 1.4],
  });
  // The batch copies each source geometry. Free the temporary geometry once it has been copied.
  const createBatch = preview.value.createBatchMesh.bind(preview.value);
  preview.value.createBatchMesh = (color) => {
    const batch = createBatch(color);
    const addGeometry = batch.addGeometry.bind(batch);
    batch.addGeometry = (geometry) => {
      try {
        const id = addGeometry(geometry);
        batch.addInstance?.(id);
        return id;
      } finally {
        geometry.dispose();
      }
    };
    return batch;
  };
  preview.value.controls.addEventListener('change', syncCube);
  syncCube();
  return preview.value;
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
async function load(fn) {
  if (!fn) return;
  const request = ++loadRequest;
  ++parseRequest;
  // a .gcode.3mf is compressed: the G-code inside is several times the file size
  const size = await sizeOf(fn);
  if (
    size * (is3mf(fn) ? 6 : 1) > BIG &&
    !(await askConfirm({
      title: t('Large file'),
      text: t('{file} is {size}. Loading it can make this tab slow, or crash it on a phone or tablet.', {
        file: fn.split('/').pop(),
        size: fmtBytes(size),
      }),
      ok: t('Open anyway'),
    }))
  ) {
    if (request === loadRequest) loading.value = '';
    return;
  }
  if (request !== loadRequest) return;
  loading.value = t('Downloading…');
  try {
    const text = await readGcodeText(api, fn);
    if (request !== loadRequest) return;
    file.value = fn;
    rawText = text;
    await parse(rawText);
  } catch (e) {
    if (request !== loadRequest) return;
    toast(t('Viewer: {err}', { err: e.message }), 'error');
  }
  loading.value = '';
}
async function parse(text) {
  const request = ++parseRequest;
  loading.value = t('Parsing…');
  await nextTick();
  await new Promise((r) => setTimeout(r, 30));
  if (request !== parseRequest) return;
  const p = await ensurePreview();
  if (request !== parseRequest) return;
  p.clear?.();
  let shown = text,
    map = null;
  if (['feature', 'speed', 'flow'].includes(colorMode.value)) {
    const r =
      colorMode.value === 'feature'
        ? colorByFeature(text)
        : colorBySpeed(text, {
            flow: colorMode.value === 'flow',
            diameter: Number(S('configfile').settings?.extruder?.filament_diameter) || 1.75,
          });
    shown = r.text;
    map = r.map;
    legend.value = r.legend.filter((l) => l.used);
    p.extrusionColor = r.colors;
    p.disableGradient = true;
  } else {
    legend.value = [];
    p.extrusionColor = state.settings.accent || '#ff6b1a';
    p.disableGradient = false;
  }
  p.processGCode(shown);
  // byte offset of each line of the original file, for following the print by file position
  let n = 1;
  for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) n++;
  offsets = new Uint32Array(n);
  let i = 0;
  for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) offsets[++i] = k + 1;
  lineLayer = p.layers.map((l) => (map ? (map[l.lineNumber] ?? l.lineNumber) : l.lineNumber));
  showMap = map;
  parsed.value++;
  layers.value = p.layers.length;
  layer.value = layers.value;
  update();
  loading.value = '';
}
// click on the model: the bed point under the pointer picks the object there (exclude_object polygons)
let downAt = null;
function cvDown(e) {
  downAt = [e.clientX, e.clientY];
}
async function cvClick(e) {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return; // a drag, not a click
  const p = preview.value;
  if (!p || loading.value || file.value !== curPrint.value || !eo.value.objects?.length || !active.value) return;
  const { Raycaster, Vector2, Plane, Vector3 } = await import('three');
  const r = canvas.value.getBoundingClientRect();
  const nd = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const ray = new Raycaster();
  ray.setFromCamera(nd, p.camera);
  // gcode-preview draws the bed in the X/Z plane with Y up and the print's Y along -Z, centred on the bed
  const hit = new Vector3();
  if (!ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), hit)) return;
  const th = S('toolhead');
  const max = th.axis_maximum || [300, 300, 300];
  const x = hit.x + max[0] / 2,
    y = -hit.z + max[1] / 2;
  const name = objectAt(x, y, eo.value.objects);
  if (!name) return;
  if (eo.value.excluded_objects?.includes(name)) return toast(t('{name} is already excluded', { name }), 'info');
  state.excludePick = name;
  emit('exclude');
}
// Only deposited extrusion is drawn during live follow.
let marker = null;
function ensureMarker() {
  if (marker) return marker;
  const material = new three.MeshLambertMaterial({ color: 0xffa53d });
  marker = new three.Group();
  const tip = new three.Mesh(new three.CylinderGeometry(2.8, 0.35, 5, 12), material);
  tip.position.y = 2.5;
  const hex = new three.Mesh(new three.CylinderGeometry(4, 4, 4, 6), material);
  hex.position.y = 7;
  marker.add(tip, hex);
  return marker;
}
function placeMarker() {
  if (!marker) return;
  const [x = 0, y = 0, z = 0] = S('gcode_move').gcode_position || [];
  const max = S('toolhead').axis_maximum || [300, 300, 300];
  // the same mapping as gcode-preview's group: print X along X, print Y along -Z, print Z up
  marker.position.set(x - max[0] / 2, z, -y + max[1] / 2);
}
function renderLive(p, at) {
  const { li, line } = at;
  // the layer being printed only up to the current line
  const l = p.layers[li];
  const all = l.commands;
  l.commands = all.slice(0, Math.max(0, line - l.lineNumber + 1));
  p.startLayer = layerWindow.value ? Math.max(1, li + 2 - layerWindow.value) : undefined;
  p.endLayer = li + 1;
  try {
    p.render();
  } finally {
    l.commands = all;
  }
  const m = showNozzle.value && ensureMarker();
  if (m) p.scene.add(m);
  else if (marker) p.scene.remove(marker);
  placeMarker();
  p.renderer.render(p.scene, p.camera);
}
const live = computed(() => follow.value && active.value && printAt.value);
async function update() {
  const p = preview.value;
  if (!p) return;
  p.renderTravel = travel.value;
  if (live.value) return renderLive(p, printAt.value);
  if (marker) p.scene.remove(marker);
  p.startLayer = layerWindow.value ? Math.max(1, layer.value + 1 - layerWindow.value) : undefined;
  p.endLayer = Math.max(1, layer.value);
  p.render();
  // not following, the nozzle still shows where it is, on the file being printed
  if (showNozzle.value && active.value && file.value === curPrint.value) {
    const m = ensureMarker();
    if (m) {
      p.scene.add(m);
      placeMarker();
    }
  }
}
const curPrint = computed(() => S('print_stats').filename);
const active = computed(() => ['printing', 'paused'].includes(printState.value));
// where the print is in the loaded file: li is the index in gcode-preview's layers, line the line of the text
// it shows (the rewritten one in the colour modes)
const lastAtOrBelow = (arr, v) => {
  let lo = 0,
    hi = arr.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (arr[m] <= v) lo = m;
    else hi = m - 1;
  }
  return lo;
};
const printAt = computed(() => {
  // read the reactive inputs first, so the computed keeps tracking them even while nothing is loaded yet
  const pos = S('virtual_sdcard').file_position || 0;
  if (!parsed.value || !offsets || !lineLayer || file.value !== curPrint.value) return null;
  const lo = lastAtOrBelow(offsets, pos);
  let li = 0;
  for (let k = 0; k < lineLayer.length; k++)
    if (lineLayer[k] <= lo) li = k;
    else break;
  return { li, line: showMap ? lastAtOrBelow(showMap, lo) : lo };
});
const printLayer = computed(() => (printAt.value ? printAt.value.li + 1 : null));
// a new layer is drawn at once, progress inside a layer at most every 1.5 s (a large file takes a moment)
let liveTm = null,
  liveLast = 0;
watch(
  [printAt, follow, active],
  ([at], old) => {
    // follow turned off or the print ended: back to the plain view of the chosen layers
    if (!follow.value || !active.value) {
      if (old?.[1] && old?.[2]) update();
      return;
    }
    if (!at) return;
    const newLayer = at.li + 1 !== layer.value || !old?.[1] || old?.[2] !== active.value;
    layer.value = at.li + 1;
    clearTimeout(liveTm);
    const wait = newLayer ? 0 : Math.max(0, 1500 - (Date.now() - liveLast));
    liveTm = setTimeout(() => {
      liveLast = Date.now();
      update();
    }, wait);
  },
  { deep: true },
);
// the nozzle cone moves with every position report, without drawing the model again
watch(
  () => S('gcode_move').gcode_position,
  () => marker?.parent && placeMarker(),
);
watch(travel, update);
watch(showNozzle, () => {
  try {
    localStorage.setItem('voyager-ui-viewer-nozzle', showNozzle.value ? '1' : '0');
  } catch {}
  update();
});
function onResize() {
  preview.value?.resize();
}
let ro;
onMounted(async () => {
  ro = new ResizeObserver(onResize);
  ro.observe(wrap.value);
  try {
    const all = await api.call('server.files.list', { root: 'gcodes' });
    for (const f of all) sizes[f.path] = f.size;
    files.value = all
      .sort((a, b) => b.modified - a.modified)
      .slice(0, 60)
      .map((f) => f.path);
  } catch {}
  if (curPrint.value) load(curPrint.value);
});
// opened before the printer answered (a direct link to the page): load the running job once it is known
watch(curPrint, (f) => f && !file.value && !loading.value && load(f));
onBeforeUnmount(() => {
  clearTimeout(liveTm);
  marker?.traverse((o) => o.geometry?.dispose());
  marker?.children[0]?.material.dispose();
  ro?.disconnect();
  preview.value?.dispose?.();
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
          <select
            class="input"
            style="height: 34px; max-width: 260px"
            :value="file"
            @change="load($event.target.value)"
            :aria-label="t('Open file')"
          >
            <option value="" disabled>{{ t('Open file…') }}</option>
            <option v-for="f in files" :key="f" :value="f">{{ f }}</option>
          </select>
        </div>
      </div>
      <div v-show="tab === '3d'" ref="wrap" class="cv" @pointerdown="cvDown" @click="cvClick">
        <canvas ref="canvas"></canvas>
        <div v-if="preview && file" class="orientation" @pointerdown.stop @click.stop>
          <div class="orientation-cube" :style="{ transform: cubeTransform }">
            <button
              v-for="[name, direction, face] in axes"
              :key="name"
              type="button"
              :style="{ transform: face }"
              :aria-label="t(name)"
              @click="viewFrom(direction)"
            >
              {{ t(name) }}
            </button>
          </div>
        </div>
        <div v-if="legend.length" class="vlegend">
          <span v-for="l in legend" :key="l.label"><i :style="{ background: l.color }"></i>{{ t(l.label) }}</span>
        </div>
        <span v-if="file && file === curPrint && active && eo.objects?.length" class="hint mono">{{
          t('Click an object to exclude it')
        }}</span>
        <div v-if="loading" class="ld"><Icon name="refresh" :size="20" class="spin" />{{ loading }}</div>
        <div v-else-if="!file" class="ld">{{ t('Load the current job or pick a file') }}</div>
        <span v-if="file" class="fn mono">{{ file }}</span>
      </div>
      <ObjectMap v-if="tab === 'map'" style="flex: 1; min-height: 400px" @pick="emit('exclude')" />
      <div v-if="layers && tab === '3d'" class="row" style="gap: 12px">
        <div class="grow">
          <RangeSlider
            :label="t('Layer')"
            :min="1"
            :max="layers"
            :model-value="layer"
            :display="layer + ' / ' + layers"
            @update:model-value="
              layer = $event;
              follow = false;
              update();
            "
          />
        </div>
      </div>
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
          ><Toggle
            v-model="follow"
            :label="t('Follow print')"
            @update:model-value="$event && printLayer && ((layer = printLayer), update())"
          />
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
            <select v-model.number="layerWindow" class="input" @change="update">
              <option :value="0">{{ t('All') }}</option>
              <option :value="1">{{ t('Active layer only') }}</option>
              <option :value="5">{{ t('Last five layers') }}</option>
            </select>
          </label>
          <span>{{ t('Colour') }}</span>
          <div class="seg">
            <button :class="{ on: colorMode === 'single' }" @click="colorMode = 'single'">{{ t('Solid') }}</button>
            <button :class="{ on: colorMode === 'feature' }" @click="colorMode = 'feature'">{{ t('Feature') }}</button>
            <button :class="{ on: colorMode === 'speed' }" @click="colorMode = 'speed'">{{ t('Speed') }}</button>
            <button :class="{ on: colorMode === 'flow' }" @click="colorMode = 'flow'">{{ t('Flow') }}</button>
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
    </div>
  </div>
</template>
<style scoped>
.orientation {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 82px;
  height: 82px;
  display: grid;
  place-items: center;
  perspective: 230px;
}
.orientation-cube {
  position: relative;
  width: 44px;
  height: 44px;
  transform-style: preserve-3d;
}
.orientation button {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border: 1px solid var(--mu);
  border-radius: 4px;
  background: var(--s2);
  color: var(--tx);
  font-size: 10px;
  padding: 0;
}
.orientation button:hover,
.orientation button:focus-visible {
  background: var(--ac);
  color: var(--oa);
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
.cv canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
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
}
.hint {
  position: absolute;
  top: 94px;
  right: 12px;
  font-size: 11px;
  color: var(--mu);
}
.vlegend {
  position: absolute;
  left: 12px;
  bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 11.5px;
  color: #cfd3d8;
  pointer-events: none;
}
.vlegend i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 5px;
  vertical-align: -1px;
}
</style>
