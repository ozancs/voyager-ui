<script setup>
// Shake&Tune page (Klippain Shake&Tune, a Klipper plugin): run its tests with their parameters, browse the
// graphs it saves in the config folder, put two graphs side by side, and for the input shaper test apply the
// recommended shaper right away (SET_INPUT_SHAPER) or write it into the config.
// The recommendation is read from the console lines the test prints ("Recommended filters: ... MZV @ 48.2 Hz").
import { ref, computed, watch, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import ImageViewer from '../components/ImageViewer.vue';
import { state, gcode, toast, isPrinting, useApiEvent, fmtDate } from '../store';
import { api } from '../api/moonraker';
import { writeOptions } from '../cfgwrite';
import { t } from '../i18n';

// the tests and their parameters (names and defaults from the Shake&Tune docs)
const TESTS = [
  {
    cmd: 'AXES_SHAPER_CALIBRATION',
    name: 'Input shaper',
    folder: 'input_shaper',
    desc: 'Measures the resonances of X and Y and recommends an input shaper.',
    params: [
      ['AXIS', 'all', 'all, X or Y'],
      ['FREQ_START', '', 'Hz'],
      ['FREQ_END', '', 'Hz'],
      ['HZ_PER_SEC', '1', ''],
      ['SCV', '', 'mm/s'],
      ['MAX_SMOOTHING', '', ''],
      ['Z_HEIGHT', '', 'mm'],
    ],
  },
  {
    cmd: 'COMPARE_BELTS_RESPONSES',
    name: 'Belts',
    folder: 'belts',
    desc: 'Compares the two belts of a CoreXY to check their tension.',
    params: [
      ['FREQ_START', '', 'Hz'],
      ['FREQ_END', '', 'Hz'],
      ['HZ_PER_SEC', '1', ''],
      ['Z_HEIGHT', '', 'mm'],
    ],
  },
  {
    cmd: 'CREATE_VIBRATIONS_PROFILE',
    name: 'Vibrations profile',
    folder: 'vibrations',
    desc: 'Records vibrations over speeds and directions to find the smoothest print speeds.',
    params: [
      ['SIZE', '100', 'mm'],
      ['Z_HEIGHT', '20', 'mm'],
      ['MAX_SPEED', '200', 'mm/s'],
      ['SPEED_INCREMENT', '2', 'mm/s'],
      ['ACCEL', '3000', 'mm/s²'],
    ],
  },
  {
    cmd: 'AXES_MAP_CALIBRATION',
    name: 'Axes map',
    folder: 'axes_map',
    desc: 'Finds the axes_map of the accelerometer.',
    params: [
      ['Z_HEIGHT', '20', 'mm'],
      ['SPEED', '80', 'mm/s'],
      ['ACCEL', '1500', 'mm/s²'],
    ],
  },
  {
    cmd: 'EXCITATE_AXIS_AT_FREQ',
    name: 'Excitate at frequency',
    folder: 'static_freq',
    desc: 'Shakes an axis at one frequency, to find what rattles at a peak of a graph.',
    params: [
      ['FREQUENCY', '25', 'Hz'],
      ['DURATION', '30', 's'],
      ['AXIS', 'x', 'x, y, a or b'],
      ['CREATE_GRAPH', '0', '0 or 1'],
    ],
  },
];
const installed = computed(() => Object.keys(state.commands || {}).some((c) => /^_?AXES_SHAPER_CALIBRATION$/i.test(c)));
const test = ref(TESTS[0]);
const vals = ref({});
const cmdLine = computed(() => {
  const p = test.value.params
    .map(([k]) => [k, String(vals.value[k] ?? '').trim()])
    .filter(([, v]) => v && /^[A-Za-z0-9._-]+$/.test(v))
    .map(([k, v]) => `${k}=${v}`);
  return [test.value.cmd, ...p].join(' ');
});

// ---- running a test and reading its result from the console ----
const run = ref(null); // { cmd, since, running }
async function start() {
  const since = state.console.length ? state.console[state.console.length - 1].id : 0;
  run.value = { cmd: test.value.cmd, since, running: true };
  try {
    await gcode(cmdLine.value);
  } catch (e) {
    toast(e.message, 'error');
  }
  if (run.value) run.value.running = false;
  loadImages();
}
const runLines = computed(() =>
  run.value
    ? state.console.filter((l) => l.id > run.value.since && l.type !== 'command').map((l) => strip(l.message))
    : [],
);
const strip = (m) => String(m || '').replace(/^\/\/\s?/gm, '');
// "X axis frequency profile generation..." tells which axis the next "Recommended filters" block is for
const recs = computed(() => {
  const out = [];
  let axis = run.value?.cmd === 'AXES_SHAPER_CALIBRATION' ? String(vals.value.AXIS || 'all').toLowerCase() : null;
  for (const text of runLines.value)
    for (const line of text.split('\n')) {
      const a = /^\s*([XY]) axis frequency profile/i.exec(line) || /^\s*Measuring ([XY])\b/i.exec(line);
      if (a) axis = a[1].toLowerCase();
      const m = /->\s*(For performance|For low vibrations|Best shaper):\s*([A-Z0-9]+)\s*@\s*([\d.]+)\s*Hz/i.exec(line);
      if (m && (axis === 'x' || axis === 'y')) out.push({ axis, kind: m[1], type: m[2].toLowerCase(), freq: +m[3] });
    }
  return out;
});
const axesMap = computed(() => {
  for (const text of runLines.value) {
    const m = /Detected axes_map:\s*([-xyz, ]+)/i.exec(text);
    if (m) return m[1].trim();
  }
  return null;
});
function applyNow(r) {
  const A = r.axis.toUpperCase();
  gcode(`SET_INPUT_SHAPER SHAPER_TYPE_${A}=${r.type} SHAPER_FREQ_${A}=${r.freq}`);
  toast(t('Input shaper {axis} set until Klipper restarts', { axis: A }));
}
const saveAsk = ref(null); // [{ section, key, value }]
const saving = ref(false);
const saveLog = ref(null);
function askSave(r) {
  saveLog.value = null;
  saveAsk.value = [
    { section: 'input_shaper', key: 'shaper_type_' + r.axis, value: r.type },
    { section: 'input_shaper', key: 'shaper_freq_' + r.axis, value: String(r.freq) },
  ];
}
async function doSave() {
  saving.value = true;
  try {
    saveLog.value = await writeOptions(saveAsk.value);
  } catch (e) {
    toast(e.message, 'error');
  }
  saving.value = false;
}

// ---- graphs saved by Shake&Tune (config/K-ShakeTune_results, older versions config/ShakeTune_results) ----
const images = ref([]); // { path, name, folder, modified }
async function loadImages() {
  try {
    const r = await api.call('server.files.list', { root: 'config' });
    images.value = r
      .filter((f) => /ShakeTune_results\//i.test(f.path) && /\.png$/i.test(f.path))
      .map((f) => {
        const parts = f.path.split('/');
        return { path: f.path, name: parts[parts.length - 1], folder: parts[parts.length - 2], modified: f.modified };
      })
      .sort((a, b) => b.modified - a.modified);
  } catch {
    images.value = [];
  }
}
onMounted(loadImages);
useApiEvent('notify_filelist_changed', ([p]) => {
  if (p?.item?.root === 'config' && /ShakeTune_results/i.test(p.item.path || '')) loadImages();
});
const folder = ref('input_shaper');
watch(test, (x) => (folder.value = x.folder));
const FOLDERS = computed(() => {
  const known = TESTS.map((x) => [x.folder, x.name]);
  const extra = [...new Set(images.value.map((i) => i.folder))].filter((f) => !known.some(([k]) => k === f));
  return [...known, ...extra.map((f) => [f, f])].map(([k, n]) => ({
    k,
    n,
    count: images.value.filter((i) => i.folder === k).length,
  }));
});
const list = computed(() => images.value.filter((i) => i.folder === folder.value));
const sel = ref(null); // path of the main image
const cmp = ref(null); // path of the image to compare with
const comparing = ref(false);
watch(list, (l) => {
  if (!l.some((i) => i.path === sel.value)) sel.value = l[0]?.path || null;
  if (cmp.value && !l.some((i) => i.path === cmp.value)) cmp.value = null;
});
// a new graph after a run: show it
watch(
  () => images.value[0]?.path,
  (p, old) => {
    if (old && p && p !== old) {
      folder.value = images.value[0].folder;
      sel.value = p;
    }
  },
);
function pick(i) {
  if (comparing.value && sel.value && i.path !== sel.value) cmp.value = i.path;
  else sel.value = i.path;
}
const url = (p) => api.fileUrl('config', p);
const viewer = ref(null);
const shortName = (n) => n.replace(/\.png$/i, '');
</script>

<template>
  <div class="split st">
    <section class="card grow res">
      <div class="card-h">
        <h2>{{ t('Graphs') }}</h2>
        <div class="acts">
          <button class="btn" :class="{ on: comparing }" :aria-pressed="comparing" @click="comparing = !comparing">
            <Icon name="diff" :size="16" />{{ t('Compare') }}
          </button>
          <button class="btn ibtn" :aria-label="t('Refresh')" @click="loadImages">
            <Icon name="refresh" :size="16" />
          </button>
        </div>
      </div>
      <div class="seg fold">
        <button v-for="f in FOLDERS" :key="f.k" :class="{ on: folder === f.k }" @click="folder = f.k">
          {{ t(f.n) }} <span class="mu">{{ f.count }}</span>
        </button>
      </div>
      <div v-if="!list.length" class="empty">{{ t('No graphs yet. Run a test and it shows up here.') }}</div>
      <div v-else class="body">
        <div class="thumbs">
          <button
            v-for="i in list"
            :key="i.path"
            class="th"
            :class="{ on: i.path === sel, cmp: i.path === cmp }"
            @click="pick(i)"
          >
            <b class="mono">{{ shortName(i.name) }}</b>
            <span class="mu">{{ fmtDate(i.modified) }}</span>
            <span v-if="i.path === cmp" class="tag">{{ t('Compare') }}</span>
          </button>
        </div>
        <div class="imgs" :class="{ two: comparing && cmp }">
          <figure v-if="sel">
            <img :src="url(sel)" alt="" @click="viewer = sel" />
            <figcaption class="mono">{{ sel.split('/').pop() }}</figcaption>
          </figure>
          <figure v-if="comparing && cmp">
            <img :src="url(cmp)" alt="" @click="viewer = cmp" />
            <figcaption class="mono">{{ cmp.split('/').pop() }}</figcaption>
          </figure>
          <div v-else-if="comparing" class="hint mu">{{ t('Pick a second graph in the list to compare.') }}</div>
        </div>
      </div>
    </section>

    <div class="side-col">
      <section class="card">
        <div class="card-h"><h2>Shake&amp;Tune</h2></div>
        <div v-if="!installed" class="empty">
          {{ t('Shake&Tune is not installed on this printer.') }}
          <a href="https://github.com/Frix-x/klippain-shaketune" target="_blank" rel="noopener">GitHub</a>
        </div>
        <template v-else>
          <select v-model="test" class="input" :aria-label="t('Test')">
            <option v-for="x in TESTS" :key="x.cmd" :value="x">{{ t(x.name) }}</option>
          </select>
          <p class="mu sm" style="margin: 0">{{ t(test.desc) }}</p>
          <div class="params">
            <label v-for="[k, def, hint] in test.params" :key="test.cmd + k" class="pr">
              <span class="mono">{{ k }}</span>
              <input
                v-model="vals[k]"
                class="input mono"
                :placeholder="def || t('default')"
                spellcheck="false"
                :aria-label="k"
              /><span class="mu sm">{{ hint }}</span>
            </label>
          </div>
          <code class="cl">{{ cmdLine }}</code>
          <button class="btn lg acc" :disabled="isPrinting || run?.running" @click="start">
            <Icon :name="run?.running ? 'refresh' : 'play'" :class="{ spin: run?.running }" :size="18" />{{
              run?.running ? t('Running…') : t('Run test')
            }}
          </button>
          <p class="mu sm" style="margin: 0">{{ t('The toolhead moves and shakes. Keep the bed clear.') }}</p>
        </template>
      </section>

      <section v-if="run" class="card">
        <div class="card-h">
          <h2>{{ t('Result') }}</h2>
          <span class="mono mu sm">{{ run.cmd }}</span>
        </div>
        <template v-if="recs.length">
          <div v-for="(r, i) in recs" :key="i" class="rec">
            <div class="grow">
              <b class="mono">{{ r.axis.toUpperCase() }} · {{ r.type.toUpperCase() }} @ {{ r.freq }} Hz</b>
              <span class="mu sm">{{ r.kind }}</span>
            </div>
            <button class="btn" :data-tip="t('SET_INPUT_SHAPER, until Klipper restarts')" @click="applyNow(r)">
              {{ t('Apply') }}
            </button>
            <button class="btn" :disabled="isPrinting" @click="askSave(r)">{{ t('Save to config') }}</button>
          </div>
        </template>
        <div v-if="axesMap" class="rec">
          <div class="grow">
            <b class="mono">axes_map: {{ axesMap }}</b
            ><span class="mu sm">{{ t('Set it in your accelerometer section.') }}</span>
          </div>
        </div>
        <pre class="log">{{ runLines.slice(-12).join('\n') || (run.running ? t('Waiting for output…') : '') }}</pre>
      </section>
    </div>
  </div>

  <Modal v-if="saveAsk" :title="t('Save to config')" @close="saveAsk = null">
    <template v-if="!saveLog">
      <p class="mu" style="margin: 0">
        {{ t('These lines are written into [input_shaper] in your config (a backup is saved first):') }}
      </p>
      <code v-for="c in saveAsk" :key="c.key" class="cl">{{ c.key }}: {{ c.value }}</code>
      <p class="mu sm" style="margin: 0">{{ t('Klipper uses them after a restart.') }}</p>
    </template>
    <template v-else>
      <div v-for="l in saveLog" :key="l.key" class="mono sm">
        {{ l.key }}: {{ l.value }} ·
        <span :style="{ color: l.error ? 'var(--dg)' : null }">{{
          l.error ? t('No [input_shaper] section found') : l.file + ', ' + l.where
        }}</span>
      </div>
    </template>
    <template #foot>
      <button class="btn lg" @click="saveAsk = null">{{ saveLog ? t('Close') : t('Cancel') }}</button>
      <button v-if="!saveLog" class="btn lg acc" :disabled="saving" @click="doSave">{{ t('Save') }}</button>
      <button
        v-else-if="!saveLog.some((l) => l.error)"
        class="btn lg acc"
        :disabled="isPrinting"
        @click="
          gcode('RESTART');
          saveAsk = null;
        "
      >
        {{ t('Restart Klipper') }}
      </button>
    </template>
  </Modal>
  <ImageViewer v-if="viewer" :list="list.map((i) => i.path)" :start="viewer" @close="viewer = null" />
</template>

<style scoped>
.st {
  min-height: calc(100vh / var(--zoom, 1) - 208px);
}
.res {
  min-width: 0;
}
.fold {
  flex-wrap: wrap;
  align-self: flex-start;
}
.fold .mu {
  font-weight: 400;
  margin-left: 4px;
}
.body {
  display: flex;
  gap: 14px;
  min-height: 0;
  flex: 1;
}
.thumbs {
  width: 230px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
  max-height: calc(80vh / var(--zoom, 1));
}
.th {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--s2);
  color: var(--tx);
  font-size: 12px;
}
.th b {
  font-size: 11.5px;
  word-break: break-all;
}
.th.on {
  border-color: var(--ac);
}
.th.cmp {
  border-color: var(--mu2);
  border-style: dashed;
}
.tag {
  font-size: 10.5px;
  color: var(--mu2);
}
.imgs {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  align-content: start;
}
.imgs.two {
  grid-template-columns: 1fr 1fr;
}
figure {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
figure img {
  width: 100%;
  height: auto;
  background: #fff;
  border-radius: 8px;
  cursor: zoom-in;
}
figcaption {
  font-size: 11px;
  color: var(--mu);
}
.hint {
  padding: 24px;
  font-size: 13px;
}
.params {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pr {
  display: grid;
  grid-template-columns: 140px 1fr 70px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.cl {
  font-family: var(--fm);
  font-size: 11.5px;
  background: var(--s2);
  padding: 8px 10px;
  border-radius: 8px;
  word-break: break-all;
}
.rec {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--bd);
}
.rec .grow {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.log {
  margin: 0;
  font-family: var(--fm);
  font-size: 11px;
  color: var(--mu);
  white-space: pre-wrap;
  max-height: 200px;
  overflow: auto;
}
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12px;
}
@media (max-width: 900px) {
  .body {
    flex-direction: column;
  }
  .thumbs {
    width: auto;
    max-height: 200px;
  }
  .imgs.two {
    grid-template-columns: 1fr;
  }
}
</style>
