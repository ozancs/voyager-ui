<script setup>
// Interface settings as a dialog (like Mainsail's), categories on the left. Opened from the gear in the top bar.
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { hexToHsl } from '../baseColor';
import WebcamView from './WebcamView.vue';
import TempChartCard from './TempChartCard.vue';
import CameraAudioPreview from './CameraAudioPreview.vue';
import { soundStylesFor, resolveSoundStyle, soundCategory } from '../soundStyles';
import voyagerLogo from '../../public/logo.svg?url';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import Toggle from './Toggle.vue';
import ChipList from './ChipList.vue';
import NotifierSettings from './NotifierSettings.vue';
import ConsoleView from './ConsoleView.vue';
import { getNoise, setNoise } from '../camAudio';
import {
  state,
  saveSettings,
  prettyName,
  tempSensors,
  DEFAULT_SETTINGS,
  S,
  VERSION,
  toast,
  APP,
  OLD_APPS,
  APP_NAME,
  uiZoomFor,
  setCams,
  moveCam,
  graphHidden,
} from '../store';
import { api } from '../api/moonraker';
import { playSound, speak, desktopPermission, askDesktop } from '../features';
import { undoable } from '../undo';
import { setTablet } from '../tablet';
import { sync, detect, importFrom, push } from '../sync';
import { go } from '../router';
import { iconUrl, readIcon, LOGOS, probeMainsailLogos } from '../printerIcon';
import { t, LANGS } from '../i18n';
import { PARTS, partsIn, restoreParts } from '../settingsParts';

const TABS = [
  ['general', 'gear', 'General'],
  ['dashboard', 'layout', 'Dashboard'],
  ['appearance', 'palette', 'Appearance'],
  ['control', 'move', 'Control'],
  ['presets', 'flame', 'Presets'],
  ['console', 'term', 'Console'],
  ['sounds', 'volume', 'Sounds & alerts'],
  ['notify', 'bell', 'Phone notifications'],
  ['webcams', 'cam', 'Cameras'],
  ['sync', 'refresh', 'Mainsail / Fluidd'],
  ['backup', 'save', 'Backup & reset'],
];
const tab = computed({
  get: () => (TABS.some(([k]) => k === state.settingsOpen) ? state.settingsOpen : 'general'),
  set: (v) => (state.settingsOpen = v),
});
const close = () => (state.settingsOpen = null);
// Cameras: the sound stream's noise filter, read when the tab opens (null: no go2rtc sound on this printer)
const noise = ref(null);
const noiseBusy = ref(false);
const audioPreview = ref(null);
watch(
  () => tab.value === 'webcams' && state.connected,
  (on) =>
    on &&
    getNoise()
      .then((n) => (noise.value = n))
      .catch(() => {}),
  { immediate: true },
);
async function pickNoise(level) {
  if (!noise.value || noise.value.level === level) return;
  noiseBusy.value = true;
  try {
    await setNoise(level);
    noise.value = { ...noise.value, level };
    audioPreview.value?.reconnect();
    toast(t('Saved. Camera audio reconnects with the new filter.'));
  } catch (e) {
    toast(t('Could not write go2rtc.yaml: {err}', { err: e.message }), 'error');
  }
  noiseBusy.value = false;
}
// Escape closes the settings only when nothing is open on top of them: a dialog or a pop-up of one of the tabs
// (a notification being edited, the icon picker) takes the key first
const esc = (e) => {
  if (e.key === 'Escape' && !sub.value && !window.__modalStack?.length) close();
};
onMounted(() => window.addEventListener('keydown', esc));
import { onBeforeUnmount } from 'vue';
onBeforeUnmount(() => window.removeEventListener('keydown', esc));

if (!state.settings.sound) state.settings.sound = DEFAULT_SETTINGS().sound;
if (!state.settings.control) state.settings.control = DEFAULT_SETTINGS().control;
const snd = computed(() => state.settings.sound);
const ctl = computed(() => state.settings.control);
// printer icon (tab icon + top bar logo)
const pi = computed(() => state.settings.printerIcon);
const piFile = ref(null);
const msLogos = ref([]);
watch(
  tab,
  (v) => {
    if (v === 'appearance') probeMainsailLogos().then((l) => (msLogos.value = l));
  },
  { immediate: true },
);
const piSel = computed(() =>
  pi.value.kind === 'mainsail' && pi.value.theme
    ? 'm:' + pi.value.theme
    : pi.value.kind === 'logo' && LOGOS.some((l) => l.id === pi.value.logo)
      ? 'l:' + pi.value.logo
      : pi.value.kind === 'image' && pi.value.img
        ? 'image'
        : 'voyager',
);
function setPi(v) {
  if (v.startsWith('m:')) state.settings.printerIcon = { ...pi.value, kind: 'mainsail', theme: v.slice(2) };
  else if (v.startsWith('l:')) state.settings.printerIcon = { ...pi.value, kind: 'logo', logo: v.slice(2) };
  else state.settings.printerIcon = { ...pi.value, kind: v };
}
async function pickIcon(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    const img = await readIcon(f);
    state.settings.printerIcon = { ...pi.value, kind: 'image', img };
  } catch {
    toast(t('This file is not an image'), 'error');
  }
}
const zoomNow = computed(() => uiZoomFor(state.uiScale ?? 100));
const deskPerm = ref(desktopPermission());
async function setDesktop(on) {
  if (on && deskPerm.value !== 'granted') deskPerm.value = await askDesktop();
  snd.value.desktop = on && deskPerm.value === 'granted';
}
const SOUNDS = [
  ['complete', 'Print finished', 'complete'],
  ['paused', 'Print paused', 'paused'],
  ['runout', 'Filament runout', 'runout'],
  ['error', 'Error / Klipper shutdown', 'error'],
  ['heated', 'Heater reached target', 'heated'],
];
// Theme colour: '' is the built-in graphite. The swatch shows the colour itself at a middle brightness, so the
// dark picks can be told apart (the page they give is much darker, or near white in the light theme)
const BASES = ['', '#14213d', '#132a2a', '#17261f', '#261a2e', '#2a211c'];
function baseSwatch(c) {
  const h = hexToHsl(c || '#16181c');
  return { background: `hsl(${h.h} ${Math.min(h.s * 1.3, 45)}% 36%)` };
}
// moving the volume slider plays the finished sound at that volume, a few times a second at most
let volT = 0;
function hearVolume() {
  const now = Date.now();
  if (now - volT < 350) return;
  volT = now;
  playSound('complete', resolveSoundStyle('complete', snd.value.styles?.complete));
}
const ACCENTS = ['#ff6b1a', '#f5b23a', '#38d6ff', '#3dd68c', '#8b6cff', '#ff3d7f'];
const heaters = computed(() => S('heaters').available_heaters || []);
function addPreset() {
  state.settings.presets.push({
    id: 'p' + Date.now(),
    name: t('New'),
    temps: Object.fromEntries(heaters.value.map((h) => [h, 0])),
  });
}
function toggleHidden(list, id) {
  const i = list.indexOf(id);
  i >= 0 ? list.splice(i, 1) : list.push(id);
}
function customize() {
  close();
  go('dashboard');
  state.dashEditReq = Date.now();
}
function editFavs() {
  close();
  go('dashboard');
  state.favEdit = true;
}

// ---- sync ----
const syncMsg = ref('');
async function doImport(which) {
  syncMsg.value = '';
  try {
    const took = await importFrom(which);
    syncMsg.value = took.length
      ? t('Imported shared values from {ui}: {what}', {
          ui: which === 'mainsail' ? 'Mainsail' : 'Fluidd',
          what: took
            .map((k) =>
              t({ name: 'printer name', control: 'jog and extrusion presets', presets: 'temperature presets' }[k]),
            )
            .join(', '),
        })
      : t('No shared values to import.');
  } catch (e) {
    toast(e.message, 'error');
  }
}
async function doPush() {
  try {
    await push();
    toast(t('Shared settings written to Mainsail / Fluidd. They show up there after a page reload.'));
  } catch (e) {
    toast(e.message, 'error');
  }
}
watch(
  () => state.settingsOpen,
  (v) => {
    if (v && !sync.checked) detect();
  },
  { immediate: true },
);

// ---- webcams (Moonraker's list, shared with every UI) ----
const SERVICES = [
  ['mjpegstreamer', 'MJPEG stream'],
  ['mjpegstreamer-adaptive', 'MJPEG adaptive'],
  ['webrtc-camerastreamer', 'WebRTC (camera-streamer)'],
  ['webrtc-go2rtc', 'WebRTC (go2rtc)'],
  ['hlsstream', 'HLS'],
  ['ipstream', 'Video / IP stream'],
  ['iframe', 'Web page (iframe)'],
];
const cam = ref(null);
function newCam() {
  cam.value = {
    name: '',
    service: 'mjpegstreamer',
    stream_url: '/webcam/?action=stream',
    snapshot_url: '/webcam/?action=snapshot',
    target_fps: 15,
    flip_horizontal: false,
    flip_vertical: false,
    rotation: 0,
    enabled: true,
  };
}
function editCam(c) {
  cam.value = { ...c, _old: c.name };
}
// live preview in the camera dialog: the picture follows flips and rotation at once, a new address or service
// after a short pause in typing (each change reconnects the stream)
const pv = reactive({});
const pvKey = ref(0);
let pvT = null;
watch(
  () => cam.value && [cam.value.service, cam.value.stream_url, cam.value.snapshot_url],
  (v, o) => {
    if (!v) return;
    clearTimeout(pvT);
    pvT = setTimeout(
      () => {
        Object.assign(pv, { ...cam.value, name: cam.value.name || 'preview' });
        pvKey.value++;
      },
      o ? 700 : 0,
    );
  },
  { immediate: true },
);
watch(
  () => cam.value && [cam.value.flip_horizontal, cam.value.flip_vertical, cam.value.rotation],
  (v) => {
    if (v) Object.assign(pv, { flip_horizontal: v[0], flip_vertical: v[1], rotation: v[2] });
  },
);
async function saveCam() {
  // `source` is read-only on Moonraker's side. An edited camera keeps its `uid`, which is how Moonraker finds it,
  // so Moonraker renames it in place. Deleting the old name first (as before) removed the camera, and the post
  // then failed with "Webcam with UID … not found", so a renamed camera vanished.
  const { _old: old, source, ...c } = cam.value;
  if (!c.name.trim()) return;
  if (!old) delete c.uid;
  try {
    await api.call('server.webcams.post_item', c);
    // a Moonraker without camera uids saved the new name as a new camera: remove the old one
    if (old && old !== c.name && !c.uid) await api.call('server.webcams.delete_item', { name: old }).catch(() => {});
    if (old && old !== c.name) {
      // cards that showed this camera follow the new name
      const cams = state.settings.cardOpts?.cams;
      if (cams) for (const k in cams) if (cams[k] === old) cams[k] = c.name;
    }
    setCams((await api.call('server.webcams.list')).webcams);
    cam.value = null;
  } catch (e) {
    toast(e.message, 'error');
  }
}
const delCam = ref(null);
async function removeCam() {
  const n = delCam.value.name;
  const saved = state.webcams.find((w) => w.name === n);
  delCam.value = null;
  try {
    await api.call('server.webcams.delete_item', { name: n });
    state.webcams = state.webcams.filter((w) => w.name !== n);
    // removed at once, Undo saves the same camera again
    if (saved)
      undoable(t('{name} removed', { name: n }), {
        undo: async () => {
          const { uid, source, ...cfg } = saved;
          try {
            await api.call('server.webcams.post_item', cfg);
            setCams((await api.call('server.webcams.list')).webcams);
          } catch (e) {
            toast(e.message, 'error');
          }
        },
      });
  } catch (e) {
    toast(e.message, 'error');
  }
}
const sub = computed(() => cam.value || delCam.value || pending.value || confirmReset.value);

// the Temperatures card and the graph each hide sensors on their own (the graph follows the card until changed)
const SENSOR_LISTS = [
  {
    key: 'hiddenSensors',
    title: 'Temperatures card',
    desc: 'Sensors shown in the Temperatures card.',
    list: () => state.settings.hiddenSensors || [],
  },
  { key: 'hiddenGraph', title: 'Temperature graph', desc: 'Sensors drawn in the graph.', list: () => graphHidden() },
];
function toggleSensor(key, s) {
  const h = [...SENSOR_LISTS.find((g) => g.key === key).list()];
  const i = h.indexOf(s);
  i >= 0 ? h.splice(i, 1) : h.push(s);
  state.settings[key] = h;
}
// ---- backup / restore / reset ----
const confirmReset = ref(false);
const restoreFile = ref(null);
const pending = ref(null);
const prev = ref(null);
api
  .call('server.database.get_item', { namespace: APP, key: 'settings_prev' })
  .then((r) => (prev.value = r.value))
  .catch(() => {});
function download() {
  const data = {
    app: APP,
    version: VERSION,
    date: new Date().toISOString(),
    settings: JSON.parse(JSON.stringify(state.settings)),
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `${APP}-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}
async function pickFile(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (![APP, ...OLD_APPS].includes(d.app) || !d.settings)
      throw new Error(t('not a {app} settings file', { app: APP_NAME }));
    const parts = partsIn(d.settings);
    pending.value = { ...d, name: f.name, parts, pick: parts.filter((x) => !x.off).map((x) => x.id) };
  } catch (err) {
    toast(t('Could not read backup: {msg}', { msg: err.message }), 'error');
  }
}
async function apply(data, label) {
  const cur = JSON.parse(JSON.stringify(state.settings));
  try {
    await api.call('server.database.post_item', {
      namespace: APP,
      key: 'settings_prev',
      value: { date: new Date().toISOString(), settings: cur },
    });
  } catch {}
  prev.value = { date: new Date().toISOString(), settings: cur };
  const def = DEFAULT_SETTINGS();
  state.settings = {
    ...def,
    ...data,
    devices: { ...def.devices, ...(data.devices || {}) },
    strip: { ...def.strip, ...(data.strip || {}) },
    control: { ...def.control, ...(data.control || {}) },
  };
  saveSettings();
  toast(label);
}
// only the parts ticked in the dialog; the others keep what this printer has now
function applyPending() {
  const p = pending.value;
  pending.value = null;
  if (!p.pick.length) return;
  const cur = JSON.parse(JSON.stringify(state.settings));
  apply(
    restoreParts(cur, p.settings, p.pick, DEFAULT_SETTINGS()),
    t('Settings restored from {name}', { name: p.name }),
  );
}
function togglePart(p, id) {
  p.pick = p.pick.includes(id) ? p.pick.filter((x) => x !== id) : [...p.pick, id];
}
function undoRestore() {
  if (prev.value) apply(prev.value.settings, t('Previous settings restored'));
}
const fmtD = (d) =>
  d
    ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
function reset() {
  confirmReset.value = false;
  apply(
    { ...DEFAULT_SETTINGS(), lang: state.settings.lang, setupDone: true, syncImported: true },
    t('Settings reset to defaults'),
  );
}
// Settings > Console preview: a short made-up session (a command and its replies, a temperature report, a
// macro's messages, an error, a long line) drawn with the console's own look and the choices above
const consoleSample = (() => {
  const t0 = Math.floor(Date.now() / 1000) - 90;
  const L = [
    [0, 'command', 'G28'],
    [2, 'response', 'ok'],
    [14, 'response', 'ok B:60.1 /60.0 T0:215.2 /215.0'],
    [30, 'command', 'BED_MESH_CALIBRATE ADAPTIVE=1'],
    [31, 'response', '// probe at 125.000,125.000 is z=1.284731'],
    [33, 'response', '// Mesh Bed Leveling Complete'],
    [34, 'response', 'ok'],
    [52, 'command', 'G1 X400 F6000'],
    [52, 'response', '!! Move out of range: 400.000 180.000 10.000 [0.000]'],
    [
      70,
      'response',
      '// Recommended shaper_type_x = mzv, shaper_freq_x = 48.2 Hz. To avoid too much smoothing with mzv, suggested max_accel <= 6900 mm/sec^2',
    ],
  ];
  return L.map(([dt, type, message], i) => ({ id: -1 - i, time: t0 + dt, type, message }));
})();
</script>

<template>
  <Teleport to="body">
    <div class="ov" @mousedown.self="close">
      <div class="dlg" role="dialog" :aria-label="t('Interface settings')">
        <div class="hd">
          <Icon name="gear" :size="20" />
          <h2>{{ t('Interface settings') }}</h2>
          <button class="btn clear ibtn sm" :aria-label="t('Close')" @click="close">
            <Icon name="x" :size="18" />
          </button>
        </div>
        <div class="bd">
          <nav class="nv" role="tablist">
            <button
              v-for="[k, ic, l] in TABS"
              :key="k"
              role="tab"
              :aria-selected="tab === k"
              :class="{ on: tab === k }"
              @click="tab = k"
            >
              <Icon :name="ic" :size="17" /><span>{{ t(l) }}</span>
            </button>
          </nav>
          <div class="pn">
            <!-- General -->
            <template v-if="tab === 'general'">
              <h3 class="sec">{{ t('Printer') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Printer name') }}</b
                  ><span>{{ t('Empty: the name from Mainsail or the hostname') }}</span>
                </div>
                <input
                  v-model="state.settings.printerName"
                  class="input v"
                  :placeholder="state.printerName || 'Printer'"
                  :aria-label="t('Printer name')"
                />
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Language') }}</b>
                </div>
                <select
                  class="input v"
                  :value="state.settings.lang || 'en'"
                  :aria-label="t('Language')"
                  @change="state.settings.lang = $event.target.value"
                >
                  <option v-for="[k, n] in LANGS" :key="k" :value="k">{{ n }}</option>
                </select>
              </div>
              <h3 class="sec">{{ t('Printing') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Check the file before printing') }}</b
                  ><span>{{
                    t(
                      'Compares material, spool weight, nozzle, temperatures and height with the printer and asks when something does not fit.',
                    )
                  }}</span>
                </div>
                <Toggle v-model="state.settings.preprintCheck" :label="t('Check the file before printing')" />
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Show Klipper errors as pop-ups') }}</b>
                </div>
                <Toggle v-model="state.settings.errorToasts" :label="t('Error pop-ups')" />
              </div>
              <h3 class="sec">{{ t('Search and updates') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Search inside scripts and notes') }}</b
                  ><span>{{
                    t(
                      'Ctrl+K also finds lines in .py, .sh and .txt files of the config folder. Turn off on slow hosts.',
                    )
                  }}</span>
                </div>
                <Toggle v-model="state.settings.searchContent" :label="t('Search inside scripts and notes')" />
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Check for updates automatically') }}</b
                  ><span>{{
                    t(
                      'Asks Moonraker to look for new versions every 6 hours, not while printing. Off: only when you press Check.',
                    )
                  }}</span>
                </div>
                <Toggle
                  :model-value="state.settings.autoUpdateCheck !== false"
                  :label="t('Check for updates automatically')"
                  @update:model-value="state.settings.autoUpdateCheck = $event"
                />
              </div>
              <h3 class="sec">{{ t('Setup') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('First-start setup') }}</b
                  ><span>{{ t('Runs the short setup again: language, favorites, sounds.') }}</span>
                </div>
                <button
                  class="btn"
                  @click="
                    close();
                    state.settings.setupDone = false;
                  "
                >
                  {{ t('Run again') }}
                </button>
              </div>
              <div v-if="api.auth.token" class="rw">
                <div class="k">
                  <b>{{ t('Signed in to Moonraker as {user}', { user: api.auth.user }) }}</b>
                </div>
                <button class="btn" @click="api.logout()"><Icon name="lock" :size="15" />{{ t('Sign out') }}</button>
              </div>
            </template>

            <!-- Dashboard -->
            <template v-else-if="tab === 'dashboard'">
              <h3 class="sec">{{ t('Layout') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Cards and layout') }}</b
                  ><span>{{ t('Add, remove, move and resize cards, choose card colours, hide top tiles.') }}</span>
                </div>
                <button class="btn acc" @click="customize">
                  <Icon name="customize" :size="16" />{{ t('Customize') }}
                </button>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Compact cards') }}</b
                  ><span>{{
                    t('Less padding, a thinner title bar and smaller gaps, so more fits on the screen.')
                  }}</span>
                </div>
                <Toggle
                  :model-value="state.settings.compactCards !== false"
                  :label="t('Compact cards')"
                  @update:model-value="state.settings.compactCards = $event"
                />
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Separate dashboard while printing') }}</b
                  ><span>{{ t('A second layout that is shown while a print runs.') }}</span>
                </div>
                <Toggle v-model="state.settings.autoLayout" :label="t('Separate dashboard while printing')" />
              </div>
              <h3 class="sec">{{ t('Temperatures') }}</h3>
              <div v-for="g in SENSOR_LISTS" :key="g.key" class="rw col">
                <div class="k">
                  <b>{{ t(g.title) }}</b
                  ><span>{{ t(g.desc) }}</span>
                </div>
                <div class="row" style="flex-wrap: wrap; gap: 6px">
                  <button
                    v-for="s in tempSensors"
                    :key="s"
                    class="sch"
                    :class="{ on: !g.list().includes(s) }"
                    :aria-pressed="!g.list().includes(s)"
                    @click="toggleSensor(g.key, s)"
                  >
                    {{ prettyName(s) }}
                  </button>
                </div>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Graph range') }}</b>
                </div>
                <div class="seg v">
                  <button
                    v-for="r in [300, 600, 1200, 3600, 21600, 86400]"
                    :key="r"
                    :class="{ on: (state.settings.tempRange || 600) === r }"
                    @click="state.settings.tempRange = r"
                  >
                    {{ r >= 3600 ? r / 3600 + ' ' + t('h') : r / 60 + ' ' + t('min') }}
                  </button>
                </div>
              </div>
              <!-- the graph itself, so the sensors and the range picked above show at once -->
              <div class="tprev"><TempChartCard /></div>
            </template>

            <!-- Control -->
            <template v-else-if="tab === 'control'">
              <h3 class="sec"><Icon name="flame" :size="16" />{{ t('Heaters') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Heaters left on') }}</b
                  ><span>{{
                    t(
                      'Warns when heaters stay on this long with no print. Skipped when Klipper’s idle_timeout turns them off sooner.',
                    )
                  }}</span>
                </div>
                <div class="seg v">
                  <button
                    v-for="m in [0, 10, 20, 30, 60]"
                    :key="m"
                    :class="{ on: (state.settings.idleHeatMin ?? 20) === m }"
                    @click="state.settings.idleHeatMin = m"
                  >
                    {{ m ? t('{n} min', { n: m }) : t('Off') }}
                  </button>
                </div>
              </div>
              <div v-if="(state.settings.idleHeatMin ?? 20) > 0" class="rw">
                <div class="k">
                  <b>{{ t('Turn them off') }}</b
                  ><span>{{
                    t(
                      'After the warning the heaters are turned off a minute later, unless Keep them on is pressed. Needs a Voyager page open at that time.',
                    )
                  }}</span>
                </div>
                <Toggle v-model="state.settings.idleHeatOff" :label="t('Turn them off')" />
              </div>
              <h3 class="sec"><Icon name="move" :size="16" />{{ t('Toolhead') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Control style') }}</b
                  ><span>{{
                    t('Circle: a round pad with one ring per step. Buttons: rows of steps per axis and a D-pad.')
                  }}</span>
                </div>
                <div class="seg v" role="radiogroup" :aria-label="t('Control style')">
                  <button
                    role="radio"
                    :aria-checked="state.settings.toolheadStyle !== 'buttons'"
                    :class="{ on: state.settings.toolheadStyle !== 'buttons' }"
                    @click="state.settings.toolheadStyle = 'circle'"
                  >
                    {{ t('Circle') }}
                  </button>
                  <button
                    role="radio"
                    :aria-checked="state.settings.toolheadStyle === 'buttons'"
                    :class="{ on: state.settings.toolheadStyle === 'buttons' }"
                    @click="state.settings.toolheadStyle = 'buttons'"
                  >
                    {{ t('Buttons') }}
                  </button>
                </div>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Invert Z jog buttons (bed moves in Z)') }}</b>
                </div>
                <Toggle v-model="state.settings.invertZ" :label="t('Invert Z')" />
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Movement speed X & Y axes') }}</b>
                </div>
                <label class="unit v"
                  ><input
                    v-model.number="ctl.feedXY"
                    type="number"
                    min="1"
                    max="1000"
                    class="input mono"
                    :aria-label="t('Movement speed X & Y axes')"
                  /><span>mm/s</span></label
                >
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Movement speed Z axis') }}</b>
                </div>
                <label class="unit v"
                  ><input
                    v-model.number="ctl.feedZ"
                    type="number"
                    min="1"
                    max="200"
                    class="input mono"
                    :aria-label="t('Movement speed Z axis')"
                  /><span>mm/s</span></label
                >
              </div>
              <!-- only the steps of the style in use: the circle has its own rings -->
              <div v-if="state.settings.toolheadStyle === 'buttons'" class="rw">
                <div class="k">
                  <b>{{ t('Move distance increments X & Y axes (in mm)') }}</b
                  ><span>{{ t('Buttons left and right of the axis letter, up to 4.') }}</span>
                </div>
                <ChipList
                  v-model="ctl.stepsXY"
                  class="v"
                  :max="4"
                  desc
                  :label="t('Move distance increments X & Y axes (in mm)')"
                />
              </div>
              <div v-if="state.settings.toolheadStyle === 'buttons'" class="rw">
                <div class="k">
                  <b>{{ t('Move distance increments Z axis (in mm)') }}</b>
                </div>
                <ChipList
                  v-model="ctl.stepsZ"
                  class="v"
                  :max="4"
                  desc
                  :label="t('Move distance increments Z axis (in mm)')"
                />
              </div>
              <div v-if="state.settings.toolheadStyle !== 'buttons'" class="rw">
                <div class="k">
                  <b>{{ t('Circle rings X & Y axes (in mm)') }}</b
                  ><span>{{ t('One ring per step, the smallest inside. Up to 4.') }}</span>
                </div>
                <ChipList
                  v-model="ctl.circleXY"
                  class="v"
                  :max="4"
                  desc
                  :label="t('Circle rings X & Y axes (in mm)')"
                />
              </div>
              <div v-if="state.settings.toolheadStyle !== 'buttons'" class="rw">
                <div class="k">
                  <b>{{ t('Circle rings Z axis (in mm)') }}</b>
                </div>
                <ChipList v-model="ctl.circleZ" class="v" :max="4" desc :label="t('Circle rings Z axis (in mm)')" />
              </div>
              <div v-if="state.settings.toolheadStyle === 'buttons'" class="rw">
                <div class="k">
                  <b>{{ t('D-pad steps (in mm)') }}</b
                  ><span>{{ t('Step choices next to the arrow pad.') }}</span>
                </div>
                <ChipList v-model="ctl.dpad" class="v" :max="6" desc :label="t('D-pad steps (in mm)')" />
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Z-Offset increments (in mm)') }}</b>
                </div>
                <ChipList v-model="ctl.zOffset" class="v" :max="5" :label="t('Z-Offset increments (in mm)')" />
              </div>
              <h3 class="sec"><Icon name="load" :size="16" />{{ t('Extruder') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Extrusion amount presets (in mm)') }}</b>
                </div>
                <ChipList v-model="ctl.extAmounts" class="v" :max="6" :label="t('Extrusion amount presets (in mm)')" />
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Extrusion speed presets (in mm/s)') }}</b>
                </div>
                <ChipList v-model="ctl.extFeeds" class="v" :max="6" :label="t('Extrusion speed presets (in mm/s)')" />
              </div>
            </template>

            <!-- Presets -->
            <template v-else-if="tab === 'presets'">
              <div class="rw">
                <div class="k">
                  <b>{{ t('Temperature presets') }}</b
                  ><span>{{ t('Tip: type a preset name in the search (Ctrl+K) to preheat.') }}</span>
                </div>
                <button class="btn" @click="addPreset"><Icon name="plus" :size="16" />{{ t('Add preset') }}</button>
              </div>
              <div v-for="(p, i) in state.settings.presets" :key="p.id" class="pr">
                <label class="col" style="gap: 4px"
                  ><span class="lbl">{{ t('Name') }}</span
                  ><input
                    v-model="p.name"
                    class="input"
                    style="width: 120px; font-weight: 600"
                    :aria-label="t('Preset name')"
                /></label>
                <label v-for="h in heaters" :key="h" class="col" style="gap: 4px"
                  ><span class="lbl">{{ prettyName(h) }}</span
                  ><input v-model.number="p.temps[h]" type="number" class="input mono" style="width: 84px"
                /></label>
                <label class="col pg" style="gap: 4px"
                  ><span class="lbl">{{ t('G-code after the temperatures (optional)') }}</span
                  ><textarea
                    v-model="p.gcode"
                    class="input mono"
                    rows="2"
                    :placeholder="t('e.g. HEAT_SOAK or M106 S128, one command per line')"
                    :aria-label="t('G-code after the temperatures (optional)')"
                  ></textarea>
                </label>
                <button
                  class="btn clear ibtn sm"
                  :aria-label="t('Remove preset')"
                  style="margin-top: 20px"
                  @click="state.settings.presets.splice(i, 1)"
                >
                  <Icon name="trash" :size="16" />
                </button>
              </div>
            </template>

            <!-- Console -->
            <template v-else-if="tab === 'console'">
              <h3 class="sec">{{ t('What the log shows') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Hide temperature lines') }}</b
                  ><span>{{ t('M105 / temperature reports are filtered out of the console.') }}</span>
                </div>
                <Toggle v-model="state.settings.consoleHideTemps" :label="t('Hide temperature lines')" />
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Group commands with their replies') }}</b
                  ><span>{{
                    t('A command you send and the lines that answer it show as one block, with a copy button on hover.')
                  }}</span>
                </div>
                <Toggle v-model="state.settings.consoleGroup" :label="t('Group commands with their replies')" />
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Newest line on top') }}</b
                  ><span>{{
                    t(
                      'The input moves above the log and the newest line comes right under it. A command and its replies keep their order.',
                    )
                  }}</span>
                </div>
                <Toggle v-model="state.settings.consoleNewestFirst" :label="t('Newest line on top')" />
              </div>
              <h3 class="sec">{{ t('Look') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Text theme') }}</b
                  ><span>{{ t('Colours of the console text.') }}</span>
                </div>
                <div class="seg v wide">
                  <button
                    v-for="[k, l] in [
                      ['default', 'Default'],
                      ['soft', 'Soft'],
                      ['terminal', 'Terminal'],
                      ['contrast', 'High contrast'],
                      ['paper', 'Paper'],
                    ]"
                    :key="k"
                    :class="{ on: (state.settings.consoleTheme || 'default') === k }"
                    @click="state.settings.consoleTheme = k"
                  >
                    {{ t(l) }}
                  </button>
                </div>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Timestamps') }}</b
                  ><span>{{ t('The time in front of each line.') }}</span>
                </div>
                <Toggle v-model="state.settings.consoleTime" :label="t('Timestamps')" />
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Wrap long lines') }}</b
                  ><span>{{ t('Off: each line stays on one row and the console scrolls sideways.') }}</span>
                </div>
                <Toggle v-model="state.settings.consoleWrap" :label="t('Wrap long lines')" />
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Command help on hover') }}</b
                  ><span>{{ t('Pointing at a command you sent says what it does.') }}</span>
                </div>
                <Toggle v-model="state.settings.consoleHelp" :label="t('Command help on hover')" />
              </div>
              <h3 class="sec">{{ t('Typing') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Paste several lines') }}</b
                  ><span>{{
                    t('Several lines pasted into the console all go with one Enter, in the order they were pasted.')
                  }}</span>
                </div>
                <Toggle v-model="state.settings.consoleMultiline" :label="t('Paste several lines')" />
              </div>
              <h3 class="sec">{{ t('Preview') }}</h3>
              <!-- how the console looks with the choices above: sample lines only, nothing is sent -->
              <div class="rw col">
                <div class="k">
                  <b>{{ t('Preview') }}</b
                  ><span>{{ t('Sample lines, nothing is sent to the printer.') }}</span>
                </div>
                <div class="cprev"><ConsoleView :sample="consoleSample" /></div>
              </div>
            </template>

            <!-- Appearance -->
            <template v-else-if="tab === 'appearance'">
              <h3 class="sec">{{ t('Theme') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Mode') }}</b>
                </div>
                <div class="seg v">
                  <button
                    v-for="[k, l, ic] in [
                      ['dark', 'Dark', 'moon'],
                      ['light', 'Light', 'sun'],
                      ['auto', 'Auto', 'contrast'],
                    ]"
                    :key="k"
                    :class="{ on: (state.settings.theme || 'dark') === k }"
                    @click="state.settings.theme = k"
                  >
                    <Icon :name="ic" :size="14" style="margin-right: 6px; vertical-align: -2px" />{{ t(l) }}
                  </button>
                </div>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Background') }}</b
                  ><span>{{
                    t('Darker makes the page behind the cards almost black, so the cards stand out more.')
                  }}</span>
                </div>
                <div class="seg v">
                  <button :class="{ on: !state.settings.bgDark }" @click="state.settings.bgDark = false">
                    {{ t('Normal') }}</button
                  ><button :class="{ on: !!state.settings.bgDark }" @click="state.settings.bgDark = true">
                    {{ t('Darker') }}
                  </button>
                </div>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Theme colour') }}</b
                  ><span>{{
                    t(
                      'Tints the whole interface: the page, cards, panels, borders and grey text. In the dark theme the colour’s brightness sets how dark the page is; the light theme stays light. Card colours you picked stay.',
                    )
                  }}</span>
                </div>
                <div class="row v" style="flex-wrap: wrap; gap: 10px">
                  <button
                    v-for="c in BASES"
                    :key="c || 'default'"
                    class="swc"
                    :class="{ on: (state.settings.baseColor || '') === c }"
                    :style="baseSwatch(c)"
                    :aria-label="c ? t('Theme colour') + ' ' + c : t('Default')"
                    :data-tip="c ? c : t('Default')"
                    @click="state.settings.baseColor = c"
                  ></button
                  ><label class="swc cu" :aria-label="t('Custom theme colour')"
                    ><input
                      type="color"
                      :value="state.settings.baseColor || '#16181c'"
                      @input="state.settings.baseColor = $event.target.value"
                  /></label>
                </div>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Accent') }}</b
                  ><span>{{ t('Colour of actions, selected options, section headings and the logo.') }}</span>
                </div>
                <div class="row v" style="flex-wrap: wrap; gap: 10px">
                  <button
                    v-for="c in ACCENTS"
                    :key="c"
                    class="swc"
                    :class="{ on: state.settings.accent === c }"
                    :style="{ background: c }"
                    :aria-label="t('Accent') + ' ' + c"
                    @click="state.settings.accent = c"
                  ></button
                  ><label class="swc cu" :aria-label="t('Custom accent')"
                    ><input v-model="state.settings.accent" type="color"
                  /></label>
                </div>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Accent strength') }}</b
                  ><span>{{
                    t(
                      'How far the accent reaches. Subtle: buttons and the selected option, lightly. Normal and strong: selected options more, the page, cards and panels lean a little to the accent, and the small dashboard tiles take their kind’s colour (fans, heaters, lights).',
                    )
                  }}</span>
                </div>
                <div class="seg v">
                  <button
                    v-for="[k, l] in [
                      ['subtle', 'Subtle'],
                      ['normal', 'Normal'],
                      ['strong', 'Strong'],
                    ]"
                    :key="k"
                    :class="{ on: (state.settings.accentReach || 'subtle') === k }"
                    @click="state.settings.accentReach = k"
                  >
                    {{ t(l) }}
                  </button>
                </div>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Printer icon') }}</b
                  ><span>{{
                    t('Shown in the browser tab and the top bar, so each printer is easy to find among open tabs.')
                  }}</span>
                </div>
                <div class="printer-icon-picker">
                  <div class="printer-icon-controls">
                    <img
                      :src="iconUrl() || voyagerLogo"
                      width="34"
                      height="34"
                      alt=""
                      style="border-radius: 8px; object-fit: contain"
                    />
                    <select
                      class="input"
                      style="width: auto"
                      :value="piSel"
                      :aria-label="t('Printer icon')"
                      @change="setPi($event.target.value)"
                    >
                      <option value="voyager">Voyager</option>
                      <option v-for="l in LOGOS" :key="l.id" :value="'l:' + l.id">{{ l.name }}</option>
                      <optgroup v-if="msLogos.length" :label="t('From Mainsail')">
                        <option v-for="l in msLogos" :key="l.id" :value="'m:' + l.id">{{ l.name }}</option>
                      </optgroup>
                      <option value="image" :disabled="!pi.img">{{ t('Own image') }}</option>
                    </select>
                    <button class="btn" @click="piFile.click()">
                      <Icon name="upload" :size="16" />{{ t('Choose image') }}
                    </button>
                  </div>
                  <input
                    ref="piFile"
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                    hidden
                    @change="pickIcon"
                  />
                </div>
              </div>
              <h3 class="sec">{{ t('Size') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Interface size') }}</b
                  ><span
                    >{{
                      t(
                        'Only this browser. Auto keeps the layout the same on every screen: a laptop shows the same cards side by side as a 1920 px monitor, only smaller.',
                      )
                    }}
                    <span class="mono">{{ Math.round(zoomNow * 100) }}%</span></span
                  >
                </div>
                <div class="seg v">
                  <button
                    v-for="k in [80, 90, 100, 110, 125, 'auto']"
                    :key="k"
                    :class="{ on: String(state.uiScale ?? 100) === String(k) }"
                    @click="state.uiScale = k"
                  >
                    {{ k === 'auto' ? t('Auto') : k + '%' }}
                  </button>
                </div>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Tablet mode') }}</b
                  ><span>{{
                    t(
                      'For a touch screen next to the printer: bigger buttons, full screen, the screen stays on. Only this browser.',
                    )
                  }}</span>
                </div>
                <Toggle :model-value="state.tablet" :label="t('Tablet mode')" @update:model-value="setTablet" />
              </div>
              <h3 class="sec">{{ t('Menu') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Menu style') }}</b
                  ><span>{{
                    t(
                      'Classic: the menu under the top bar. Floating, Attached and Frame run the full height with the printer at the top and fold to icons. Top tabs: the pages as tabs in the top bar. Bottom dock: the pages on a shelf at the bottom, the top bar shows the print.',
                    )
                  }}</span>
                </div>
                <div class="seg v wide">
                  <button
                    v-for="[k, l] in [
                      ['classic', 'Classic'],
                      ['float', 'Floating'],
                      ['attached', 'Attached'],
                      ['frame', 'Frame'],
                      ['tabs', 'Top tabs'],
                      ['dock', 'Bottom dock'],
                    ]"
                    :key="k"
                    :class="{ on: (state.settings.navStyle || 'classic') === k }"
                    @click="state.settings.navStyle = k"
                  >
                    {{ t(l) }}
                  </button>
                </div>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Side menu') }}</b
                  ><span>{{ t('Auto-hide: move the mouse to the left edge and the menu opens over the page.') }}</span>
                </div>
                <div class="seg v">
                  <button
                    v-for="[k, l] in [
                      ['pinned', 'Always visible'],
                      ['hidden', 'Hidden'],
                      ['auto', 'Auto-hide'],
                    ]"
                    :key="k"
                    :class="{ on: (state.settings.navMode || 'pinned') === k }"
                    @click="state.settings.navMode = k"
                  >
                    {{ t(l) }}
                  </button>
                </div>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Favorites bar') }}</b
                  ><span>{{
                    t('Macro buttons under the top bar. Also available as a Favorites card for the dashboard.')
                  }}</span>
                </div>
                <div class="row" style="gap: 8px">
                  <div class="seg">
                    <button
                      v-for="[k, l] in [
                        ['always', 'Everywhere'],
                        ['dashboard', 'Dashboard only'],
                        ['off', 'Off'],
                      ]"
                      :key="k"
                      :class="{ on: (state.settings.favBar || 'always') === k }"
                      @click="state.settings.favBar = k"
                    >
                      {{ t(l) }}
                    </button>
                  </div>
                  <button class="btn" @click="editFavs"><Icon name="pencil" :size="15" />{{ t('Edit') }}</button>
                </div>
              </div>
            </template>

            <!-- Sounds -->
            <template v-else-if="tab === 'sounds'">
              <h3 class="sec">{{ t('Sound') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Play sounds') }}</b
                  ><span>{{ t('Each event has its own sound. Errors are the loudest.') }}</span>
                </div>
                <Toggle v-model="snd.enabled" :label="t('Play sounds')" />
              </div>
              <div v-if="snd.enabled" class="rw">
                <div class="k">
                  <b>{{ t('Volume') }}</b>
                </div>
                <input
                  v-model.number="snd.volume"
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  class="rng v"
                  :style="{ '--f': (snd.volume - 0.1) / 0.9 }"
                  :aria-label="t('Volume')"
                  @input="hearVolume"
                />
              </div>
              <h3 class="sec">{{ t('Events') }}</h3>
              <template v-if="snd.enabled || snd.desktop || snd.speak">
                <span class="hint">{{
                  t(
                    'Alerts need this page open in a tab, in front or behind. For a closed browser use Phone notifications.',
                  )
                }}</span>
                <div v-for="[k, l, tone] in SOUNDS" :key="k" class="rw">
                  <div class="k">
                    <b>{{ t(l) }}</b>
                    <span class="hint">{{ t(soundCategory(tone)) }}</span>
                  </div>
                  <div class="row alert-controls" style="gap: 6px">
                    <select
                      class="input"
                      :aria-label="t(l) + ' — ' + t('Sound style')"
                      :value="resolveSoundStyle(tone, snd.styles?.[tone])"
                      @change="
                        snd.styles = { ...snd.styles, [tone]: $event.target.value };
                        playSound(tone, $event.target.value);
                      "
                    >
                      <option v-for="style in soundStylesFor(tone)" :key="style.id" :value="style.id">
                        {{ t(style.label) }}
                      </option>
                    </select>
                    <button
                      class="btn clear ibtn sm"
                      :disabled="!snd.enabled"
                      :aria-label="t('Play')"
                      @click="playSound(tone, resolveSoundStyle(tone, snd.styles?.[tone]))"
                    >
                      <Icon name="play" :size="14" /></button
                    ><Toggle v-model="snd[k]" :label="t(l)" />
                  </div>
                </div>
              </template>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Part ready alert') }}</b>
                  <span class="hint">{{ t('Alert when the bed cools after a print. Keep this page open.') }}</span>
                </div>
                <Toggle v-model="snd.partReady" :label="t('Part ready alert')" />
              </div>
              <label v-if="snd.partReady" class="rw">
                <span>{{ t('Bed temperature for removal') }} (°C)</span>
                <input
                  class="input mono"
                  type="number"
                  min="10"
                  max="60"
                  :value="snd.partReadyTemp ?? 35"
                  @change="snd.partReadyTemp = Math.min(60, Math.max(10, $event.target.valueAsNumber || 35))"
                />
              </label>
              <h3 class="sec">{{ t('Other ways to be told') }}</h3>
              <div class="rw">
                <div class="k">
                  <b>{{ t('System notifications') }}</b
                  ><span>{{
                    deskPerm === 'denied'
                      ? t(
                          'The browser blocks notifications for this page. Allow them in the site settings of the browser.',
                        )
                      : deskPerm === 'unsupported'
                        ? t('This browser cannot show notifications for this page (it needs https or localhost).')
                        : t('A notification from the browser when this tab is in the background or minimized.')
                  }}</span>
                </div>
                <Toggle
                  :model-value="!!snd.desktop && deskPerm === 'granted'"
                  :disabled="deskPerm === 'denied' || deskPerm === 'unsupported'"
                  :label="t('System notifications')"
                  @update:model-value="setDesktop"
                />
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Read events aloud') }}</b
                  ><span>{{ t('The browser says what happened, in the interface language.') }}</span>
                </div>
                <div class="row" style="gap: 6px">
                  <button
                    class="btn clear ibtn sm"
                    :aria-label="t('Test')"
                    @click="speak(t('Print finished: {file}', { file: 'benchy' }))"
                  >
                    <Icon name="play" :size="14" /></button
                  ><Toggle v-model="snd.speak" :label="t('Read events aloud')" />
                </div>
              </div>
            </template>

            <!-- Notifications -->
            <template v-else-if="tab === 'notify'"><NotifierSettings /></template>

            <!-- Cameras -->
            <template v-else-if="tab === 'webcams'">
              <h3 class="sec">{{ t('Cameras') }}</h3>
              <span class="hint">{{
                t(
                  'Cameras are stored by Moonraker, so this list is the same in Mainsail and Fluidd. The first one here is the camera shown wherever none is picked.',
                )
              }}</span>
              <!-- the cameras as small cards with their live picture -->
              <div class="camg">
                <div v-for="(w, i) in state.webcams" :key="w.name" class="camc">
                  <div class="cpv"><WebcamView :cam="w" :overlay="false" /></div>
                  <div class="cmeta">
                    <b>{{ w.name }}</b
                    ><span v-if="i === 0 && state.webcams.length > 1" class="first">{{ t('Default') }}</span>
                  </div>
                  <span class="mono curl">{{ SERVICES.find(([k]) => k === w.service)?.[1] || w.service }}</span>
                  <div class="cacts">
                    <template v-if="state.webcams.length > 1"
                      ><button
                        class="btn clear ibtn sm"
                        :disabled="i === 0"
                        :aria-label="t('Move up')"
                        :data-tip="i === 1 ? t('First: shown wherever no camera is picked') : t('Move up')"
                        @click="moveCam(w.name, -1)"
                      >
                        <Icon name="left" :size="15" :stroke="2.4" /></button
                      ><button
                        class="btn clear ibtn sm"
                        :disabled="i === state.webcams.length - 1"
                        :aria-label="t('Move down')"
                        @click="moveCam(w.name, 1)"
                      >
                        <Icon name="right" :size="15" :stroke="2.4" /></button
                    ></template>
                    <span class="grow"></span>
                    <button class="btn sm" @click="editCam(w)"><Icon name="pencil" :size="15" />{{ t('Edit') }}</button
                    ><button
                      class="btn clear ibtn sm"
                      :aria-label="t('Remove {name}', { name: w.name })"
                      @click="delCam = w"
                    >
                      <Icon name="trash" :size="15" />
                    </button>
                  </div>
                </div>
                <button class="camc add" @click="newCam"><Icon name="plus" :size="22" />{{ t('Add camera') }}</button>
              </div>
              <h3 v-if="state.webcams.length || noise" class="sec">{{ t('Pictures and sound') }}</h3>
              <div v-if="state.webcams.length" class="rw">
                <div class="k">
                  <b>{{ t('Picture at the end of each print') }}</b
                  ><span>{{
                    t(
                      'When a print ends, the first camera’s picture is kept with the job in History, also when it failed. Taken by a Voyager page open at that moment; the last 60 are kept.',
                    )
                  }}</span>
                </div>
                <Toggle v-model="state.settings.endShot" :label="t('Picture at the end of each print')" />
              </div>
              <!-- sound (go2rtc): the noise filter on the microphone line of go2rtc.yaml -->
              <template v-if="noise">
                <CameraAudioPreview ref="audioPreview" :busy="noiseBusy" />
                <div class="rw">
                  <div class="k">
                    <b>{{ t('Sound: noise reduction') }}</b
                    ><span>{{
                      t(
                        'Takes the steady noise of fans and motors out of the camera sound ({name} in go2rtc.yaml). Strong can make voices sound hollow. The change takes a moment: go2rtc restarts.',
                        { name: noise.name },
                      )
                    }}</span>
                  </div>
                  <div class="seg v">
                    <button
                      v-for="[k, l] in [
                        ['off', 'Off'],
                        ['light', 'Light'],
                        ['normal', 'Normal'],
                        ['strong', 'Strong'],
                      ]"
                      :key="k"
                      :class="{ on: noise.level === k }"
                      :disabled="noiseBusy"
                      @click="pickNoise(k)"
                    >
                      {{ t(l) }}
                    </button>
                  </div>
                </div>
                <span v-if="noise.level === 'custom'" class="hint">{{
                  t('The line has a filter of its own; picking a level here replaces it.')
                }}</span>
              </template>
              <div class="row" style="justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-top: 14px">
                <button
                  class="btn clear"
                  @click="
                    close();
                    go('config', 'config/crowsnest.conf');
                  "
                >
                  <Icon name="code" :size="15" />{{ t('Edit crowsnest.conf') }}
                </button>
              </div>
            </template>

            <!-- Sync -->
            <template v-else-if="tab === 'sync'">
              <div class="rw">
                <div class="k">
                  <b>{{ t('Keep shared settings in sync') }}</b
                  ><span>{{
                    t(
                      'Printer name, language, jog speeds and steps, extrusion and temperature presets are written to the Mainsail and Fluidd database when they change here. Nothing else of theirs is touched.',
                    )
                  }}</span>
                </div>
                <Toggle v-model="state.settings.sync" :label="t('Keep shared settings in sync')" />
              </div>
              <div class="rw sync-host">
                <div class="k">
                  <b>{{ t('Found on this host') }}</b
                  ><span v-if="!sync.checked">{{ t('Checking…') }}</span
                  ><span v-else>{{
                    [sync.mainsail && 'Mainsail', sync.fluidd && 'Fluidd'].filter(Boolean).join(', ') ||
                    t('Neither Mainsail nor Fluidd has settings in the Moonraker database.')
                  }}</span>
                </div>
                <div class="sync-actions">
                  <button v-if="sync.mainsail" class="btn" @click="doImport('mainsail')">
                    <Icon name="download" :size="15" />{{ t('Import from Mainsail') }}</button
                  ><button v-if="sync.fluidd" class="btn" @click="doImport('fluidd')">
                    <Icon name="download" :size="15" />{{ t('Import from Fluidd') }}</button
                  ><button
                    v-if="sync.mainsail || sync.fluidd"
                    class="btn"
                    :disabled="sync.busy || !state.settings.sync"
                    @click="doPush"
                  >
                    <Icon name="upload" :size="15" />{{ t('Send shared values to other interfaces') }}
                  </button>
                </div>
              </div>
              <span v-if="syncMsg" class="hint ok">{{ syncMsg }}</span>
              <span class="hint">{{
                t(
                  'Import copies only printer name, movement steps and presets into Voyager. It does not reset your dashboard, colours or favorites. Send updates the same shared values in Mainsail / Fluidd; reload that interface to see them.',
                )
              }}</span>
            </template>

            <!-- Backup -->
            <template v-else-if="tab === 'backup'">
              <div class="rw">
                <div class="k">
                  <b>{{ t('Backup & restore') }}</b
                  ><span>{{
                    t('Favorites, dashboard layout, cards, presets, theme and all other UI settings in one file.')
                  }}</span>
                </div>
                <div class="sync-actions">
                  <button class="btn acc" @click="download">
                    <Icon name="download" :size="16" :stroke="2.4" />{{ t('Download backup') }}</button
                  ><button class="btn" @click="restoreFile.click()">
                    <Icon name="upload" :size="16" />{{ t('Restore from file') }}</button
                  ><input ref="restoreFile" type="file" accept=".json,application/json" hidden @change="pickFile" />
                </div>
              </div>
              <div v-if="prev" class="rw">
                <div class="k">
                  <b>{{ t('Previous settings') }}</b
                  ><span>{{ fmtD(prev.date) }}</span>
                </div>
                <button class="btn" @click="undoRestore"><Icon name="rot" :size="16" />{{ t('Go back') }}</button>
              </div>
              <div class="rw">
                <div class="k">
                  <b>{{ t('Reset all UI settings') }}</b
                  ><span>{{ t('Favorites, presets and card settings go back to defaults.') }}</span>
                </div>
                <button class="btn dg" @click="confirmReset = true">{{ t('Reset') }}</button>
              </div>
              <span class="hint">{{ APP_NAME }} v{{ VERSION }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Modal v-if="cam" :title="cam._old ? t('Edit camera') : t('Add camera')" width="560px" @close="cam = null">
    <label class="col" style="gap: 4px"
      ><span class="lbl">{{ t('Name') }}</span
      ><input v-model="cam.name" class="input" :aria-label="t('Name')"
    /></label>
    <label class="col" style="gap: 4px"
      ><span class="lbl">{{ t('Service') }}</span
      ><select v-model="cam.service" class="input" :aria-label="t('Service')">
        <option v-for="[k, l] in SERVICES" :key="k" :value="k">{{ l }}</option>
      </select></label
    >
    <label class="col" style="gap: 4px"
      ><span class="lbl">{{ t('Stream URL') }}</span
      ><input v-model="cam.stream_url" class="input mono" spellcheck="false" :aria-label="t('Stream URL')"
    /></label>
    <label class="col" style="gap: 4px"
      ><span class="lbl">{{ t('Snapshot URL') }}</span
      ><input v-model="cam.snapshot_url" class="input mono" spellcheck="false" :aria-label="t('Snapshot URL')"
    /></label>
    <div class="row" style="gap: 14px; flex-wrap: wrap">
      <label class="row" style="gap: 8px"
        ><input v-model="cam.flip_horizontal" type="checkbox" />{{ t('Flip horizontally') }}</label
      >
      <label class="row" style="gap: 8px"
        ><input v-model="cam.flip_vertical" type="checkbox" />{{ t('Flip vertically') }}</label
      >
      <label class="row" style="gap: 8px"
        >{{ t('Rotation')
        }}<select v-model.number="cam.rotation" class="input" style="height: 32px">
          <option v-for="r in [0, 90, 180, 270]" :key="r" :value="r">{{ r }}°</option>
        </select></label
      >
    </div>
    <div class="pvw">
      <WebcamView v-if="pvKey" :key="pvKey" :cam="pv" :overlay="false" />
    </div>
    <template #foot
      ><button class="btn lg" @click="cam = null">{{ t('Cancel') }}</button
      ><button class="btn lg acc" :disabled="!cam.name.trim()" @click="saveCam">{{ t('Save') }}</button></template
    >
  </Modal>
  <Modal v-if="delCam" :title="t('Remove {name}?', { name: delCam.name })" @close="delCam = null">
    <p class="mu" style="margin: 0">
      {{ t('The webcam is removed from Moonraker, so also from Mainsail and Fluidd.') }}
    </p>
    <template #foot
      ><button class="btn lg" @click="delCam = null">{{ t('Cancel') }}</button
      ><button class="btn lg dgf" @click="removeCam">{{ t('Remove') }}</button></template
    >
  </Modal>
  <Modal v-if="pending" :title="t('Restore settings?')" @close="pending = null">
    <p style="margin: 0">
      {{ t('What to take from {name}?', { name: pending.name }) }}
      <span class="mu"
        >({{ [fmtD(pending.date), pending.version && 'v' + pending.version].filter(Boolean).join(', ') }})</span
      >
    </p>
    <div class="parts">
      <label v-for="x in pending.parts" :key="x.id" class="part"
        ><input type="checkbox" :checked="pending.pick.includes(x.id)" @change="togglePart(pending, x.id)" />{{
          t(x.name)
        }}</label
      >
    </div>
    <span class="mu">{{
      t('Parts left unticked keep what this printer has now. Your current settings are kept so you can go back.')
    }}</span>
    <template #foot
      ><button class="btn lg" @click="pending = null">{{ t('Cancel') }}</button
      ><button class="btn lg acc" :disabled="!pending.pick.length" @click="applyPending">
        {{ t('Restore') }}
      </button></template
    >
  </Modal>
  <Modal v-if="confirmReset" :title="t('Reset UI settings?')" @close="confirmReset = false">
    <p class="mu" style="margin: 0">{{ t('Favorites, presets and card settings go back to defaults.') }}</p>
    <template #foot
      ><button class="btn lg" @click="confirmReset = false">{{ t('Cancel') }}</button
      ><button class="btn lg dgf" @click="reset">{{ t('Reset') }}</button></template
    >
  </Modal>
</template>

<style scoped>
.pvw {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 260px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--plate);
}
.pvw > :deep(*) {
  width: 100%;
  height: 100%;
}
.ov {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 95;
  /* the top bar stays above the dialog (E-STOP reachable), so the dialog starts under it */
  padding: 80px 16px 16px;
}
.dlg {
  /* large enough that a tab (Appearance has the most) fits without scrolling on a usual screen */
  width: 1320px;
  max-width: 100%;
  height: calc((100vh - 96px) / var(--zoom, 1));
  max-height: 1080px;
  display: flex;
  flex-direction: column;
  background: var(--s1);
  border: 1px solid var(--bd);
  border-radius: var(--r);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.hd {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 14px 20px;
  border-bottom: 1px solid var(--bd);
  flex-shrink: 0;
}
.hd h2 {
  margin: 0;
  flex: 1;
  font-size: 17px;
}
.bd {
  flex: 1;
  min-height: 0;
  display: flex;
}
.nv {
  width: 210px;
  flex-shrink: 0;
  overflow: auto;
  padding: 10px 8px;
  border-right: 1px solid var(--bd);
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--s0, var(--bg));
}
.nv button {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 12px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--mu);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}
.nv button:hover {
  color: var(--tx);
  background: var(--s2);
}
.nv button.on {
  color: var(--tx);
  background: var(--s2);
  box-shadow: inset 3px 0 0 var(--ac);
}
.pn {
  container-type: inline-size;
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 8px 22px 22px;
  display: flex;
  flex-direction: column;
}
.rw {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 0;
  border-bottom: 1px solid var(--bd);
}
/* the controls of every row start on one line: the text on the left, the controls in a column of their own,
   aligned to its left edge, so the switches, segments and swatches line up down the page */
.rw:not(.col) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 500px;
  column-gap: 32px;
  row-gap: 8px;
}
.rw:not(.col) > .k {
  grid-column: 1;
}
.rw:not(.col) > :not(.k) {
  grid-column: 2;
  justify-self: start;
  max-width: 100%;
}
@container (max-width: 820px) {
  .rw:not(.col) {
    grid-template-columns: minmax(0, 1fr) 360px;
  }
}
.rw.col {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}
.cprev {
  height: 300px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.rw:last-child {
  border-bottom: none;
}
.k {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.k b {
  font-size: 14px;
  font-weight: 600;
}
.k span {
  font-size: 12px;
  color: var(--mu);
}
.v {
  width: 340px;
  max-width: 100%;
  flex-shrink: 0;
}
/* more choices than fit in the usual width: as wide as they need, wrapping onto a second row on a narrow dialog */
.v.wide {
  width: auto;
  max-width: 100%;
  flex-wrap: wrap;
}
.unit {
  display: flex;
  align-items: center;
  gap: 8px;
}
.unit input {
  width: 100%;
}
.unit span {
  color: var(--mu);
  font-size: 13px;
  white-space: nowrap;
}
.sec {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 18px 0 2px;
  font-size: 13px;
  font-weight: 600;
  color: var(--mu);
}
.sec :deep(svg) {
  color: var(--ac);
}
.hint {
  font-size: 12.5px;
  color: var(--mu);
  padding: 10px 0;
}
.hint.ok {
  color: var(--ok);
}
.mu {
  color: var(--mu);
  font-size: 13px;
}
/* each preset a panel of its own: name and remove on top, the temperatures, then its G-code */
.pr {
  display: flex;
  align-items: flex-start;
  gap: 10px 12px;
  flex-wrap: wrap;
  padding: 14px 16px;
  margin-top: 12px;
  border-radius: var(--rb);
  background: var(--bg);
  border: 1px solid var(--bd);
}
.pr .pg {
  flex-basis: 100%;
  order: 10; /* under the temperatures, the remove button stays on the first row */
}
.pr .pg textarea {
  height: auto;
  padding: 8px 12px;
  resize: vertical;
  font-size: 12.5px;
}
.swc {
  width: 34px;
  height: 34px;
  border-radius: 17px;
  border: 3px solid var(--s1);
  outline: 2px solid var(--bd);
  cursor: pointer;
}
.swc.on {
  outline-color: var(--tx);
}
.cu {
  background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
  position: relative;
  overflow: hidden;
}
.cu input {
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.sch {
  height: 30px;
  padding: 0 12px;
  border-radius: 15px;
  border: none;
  background: var(--s2);
  color: var(--mu2);
  font-size: 12.5px;
  font-weight: 500;
  text-decoration: line-through;
}
.sch.on {
  background: var(--heat-bg);
  color: var(--heat);
  text-decoration: none;
}
@media (max-width: 760px) {
  .ov {
    padding: 0;
  }
  .dlg {
    height: 100%;
    max-height: none;
    border-radius: 0;
    border: none;
  }
  .bd {
    flex-direction: column;
  }
  .nv {
    width: auto;
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--bd);
    padding: 8px;
  }
  .nv button {
    height: 34px;
    padding: 0 10px;
  }
  .nv button span {
    display: none;
  }
  .nv button.on span {
    display: inline;
  }
  .rw:not(.col) {
    grid-template-columns: minmax(0, 1fr);
  }
  .rw:not(.col) > :not(.k) {
    grid-column: 1;
  }
  .v {
    width: 100%;
    max-width: 100%;
  }
}
.parts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 4px 0;
}
.part {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  cursor: pointer;
}
.part:hover {
  background: var(--s2);
}
.tprev {
  height: 300px;
  display: flex;
  margin-top: 4px;
}
.tprev > :deep(.card) {
  flex: 1;
  min-height: 0;
}
/* setting groups: a heading with room above it and a line over it, so each group reads as its own part */
.sec {
  margin: 34px 0 2px;
  padding-top: 22px;
  border-top: 1px solid var(--bd);
  font-size: 15px;
  color: var(--tx);
}
.pn > .sec:first-child {
  margin-top: 8px;
  padding-top: 0;
  border-top: 0;
}
.rw:has(+ .sec) {
  border-bottom: 0;
}
.camg {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
  margin: 12px 0 6px;
}
.camc {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: var(--rb);
  background: var(--bg);
  border: 1px solid var(--bd);
  min-width: 0;
}
.cpv {
  aspect-ratio: 16 / 9;
  border-radius: calc(var(--rb) - 3px);
  overflow: hidden;
  background: #000;
  display: flex;
}
.cpv > :deep(*) {
  flex: 1;
  min-width: 0;
}
/* the picture fills the small frame, centred, with no band above or below it */
.cpv > :deep(.wc) {
  min-height: 0;
  border-radius: 0;
}
.cpv :deep(.wc img),
.cpv :deep(.wc video) {
  object-fit: cover;
}
.cmeta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px 0;
  min-width: 0;
}
.cmeta b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.first {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ac) 16%, var(--s2));
  color: color-mix(in srgb, var(--ac) 60%, var(--tx));
}
.curl {
  padding: 0 4px;
  font-size: 11.5px;
  color: var(--mu);
}
.cacts {
  display: flex;
  align-items: center;
  gap: 4px;
}
.camc.add {
  align-items: center;
  justify-content: center;
  min-height: 180px;
  border-style: dashed;
  color: var(--mu);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.camc.add:hover {
  color: var(--tx);
}
</style>

<style scoped>
.printer-icon-picker {
  min-width: 0;
  flex: 0 1 auto;
}
.printer-icon-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}
.printer-icon-controls img {
  flex: 0 0 34px;
}
.printer-icon-controls select {
  min-width: 0;
  max-width: 160px;
}
.alert-controls select {
  width: 145px;
  min-width: 0;
}
@media (max-width: 600px) {
  .printer-icon-controls {
    flex-wrap: wrap;
  }
  .printer-icon-controls select {
    flex: 1;
  }
}
</style>

<style scoped>
.rw.sync-host {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}
.sync-host .k {
  width: auto;
  flex: none;
}
.sync-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sync-actions .btn {
  flex: 1 1 220px;
  white-space: normal;
  height: auto;
  min-height: 36px;
  padding: 8px 12px;
}
</style>
