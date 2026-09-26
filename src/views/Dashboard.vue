<script setup>
// Dashboard: the status tiles (DeviceStrip) and a grid of cards the user arranges (grid-layout-plus).
// MODULES lists every card type with its size limits. Customize mode: drag, resize (also from the bottom-left
// corner), hide, colour and add cards, a separate layout while printing, undo and saved backups. On narrow
// screens the cards stack in one column with their own order (mobileOrder).
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { GridLayout, GridItem } from 'grid-layout-plus';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import Toggle from '../components/Toggle.vue';
import CmdInput from '../components/CmdInput.vue';
import DeviceStrip from '../components/DeviceStrip.vue';
import TempsCard from '../components/TempsCard.vue';
import TempChartCard from '../components/TempChartCard.vue';
import WebcamCard from '../components/WebcamCard.vue';
import ConsoleCard from '../components/ConsoleCard.vue';
import ToolheadCard from '../components/ToolheadCard.vue';
import ExtruderCard from '../components/ExtruderCard.vue';
import LimitsCard from '../components/LimitsCard.vue';
import PrintCard from '../components/PrintCard.vue';
import MmuCard from '../components/MmuCard.vue';
import PowerCard from '../components/PowerCard.vue';
import ObjectsCard from '../components/ObjectsCard.vue';
import MiniMeshCard from '../components/MiniMeshCard.vue';
import SystemLoads from '../components/SystemLoads.vue';
import CustomCard from '../components/CustomCard.vue';
import QueueCard from '../components/QueueCard.vue';
import MacrosCard from '../components/MacrosCard.vue';
import DevicesCard from '../components/DevicesCard.vue';
import RecentFilesCard from '../components/RecentFilesCard.vue';
import RecentJobsCard from '../components/RecentJobsCard.vue';
import SpoolCard from '../components/SpoolCard.vue';
import RetractionCard from '../components/RetractionCard.vue';
import HealthCard from '../components/HealthCard.vue';
import { t } from '../i18n';
import { useEdgeAutoScroll } from '../autoscroll';
import interact from 'interactjs';
import { nextTick } from 'vue';
import {
  state,
  isPrinting,
  DEFAULT_LAYOUT,
  DEFAULT_SETTINGS,
  layoutSnapshot,
  pushLayoutBackup,
  restoreLayout,
} from '../store';
import IconPicker from '../components/IconPicker.vue';
import LiveZCard from '../components/LiveZCard.vue';
import FavoritesCard from '../components/FavoritesCard.vue';
import { pushDown } from '../calc';

const MODULES = {
  console: { c: ConsoleCard, n: 'Console', min: [4, 4], def: [12, 7] },
  temps: { c: TempsCard, n: 'Temperatures', min: [3, 3], def: [6, 8] },
  tempchart: { c: TempChartCard, n: 'Temperature Graph', min: [3, 4], def: [12, 6] },
  webcam: { c: WebcamCard, n: 'Webcam', min: [3, 4], def: [6, 8] },
  toolhead: { c: ToolheadCard, n: 'Toolhead', min: [5, 5], def: [12, 5] }, // below 5 rows the controls no longer fit even shrunk
  favorites: { c: FavoritesCard, n: 'Favorites', min: [2, 2], def: [6, 3] },
  livez: { c: LiveZCard, n: 'Live Z (position and Z offset)', min: [2, 3], def: [3, 4] },
  extruder: { c: ExtruderCard, n: 'Extruder', min: [3, 5], def: [6, 7] },
  limits: { c: LimitsCard, n: 'Machine Limits', min: [3, 5], def: [6, 7] },
  print: { c: PrintCard, n: 'Print Status', min: [5, 3], def: [12, 3] },
  objects: { c: ObjectsCard, n: 'Objects Map', min: [3, 4], def: [4, 7] },
  mesh: { c: MiniMeshCard, n: 'Bed Mesh', min: [2, 4], def: [3, 6] },
  system: { c: SystemLoads, n: 'System Loads', min: [3, 3], def: [6, 3] },
  queue: { c: QueueCard, n: 'Job Queue', min: [3, 4], def: [4, 6] },
  macros: { c: MacrosCard, n: 'Macros', min: [2, 3], def: [6, 4], opts: true },
  devices: { c: DevicesCard, n: 'Devices (fans, pins, LEDs)', min: [3, 4], def: [6, 7] },
  files: { c: RecentFilesCard, n: 'Recent files', min: [3, 4], def: [6, 7] },
  jobs: { c: RecentJobsCard, n: 'Recent prints', min: [3, 4], def: [6, 7] },
  spool: { c: SpoolCard, n: 'Spoolman', min: [3, 3], def: [4, 4], need: () => !!state.spoolman.server },
  retraction: {
    c: RetractionCard,
    n: 'Firmware retraction',
    min: [3, 3],
    def: [6, 4],
    need: () => state.objects.includes('firmware_retraction'),
  },
  health: { c: HealthCard, n: 'Health', min: [3, 3], def: [4, 4] },
  power: { c: PowerCard, n: 'Power devices', min: [3, 3], def: [4, 4], need: () => state.power.length > 0 },
  mmu: { c: MmuCard, n: 'MMU (Happy Hare, Box Turtle)', min: [4, 5], def: [12, 7], need: () => hasMmu.value },
};
const isCustom = (i) => i.startsWith('c_');
// a multi material unit shows up on the dashboard by itself the first time it is found
const hasMmu = computed(() => state.objects.includes('mmu') || state.objects.includes('AFC'));
// Default hue per module follows meaning, the same as the top tiles: orange = heat, purple = filament,
// blue = air and devices, slate = motion, green = health. Everything else stays neutral.
const TINTS = ['heat', 'cool', 'light', 'sense', 'spool', 'rose', 'teal', 'sand', 'slate', 'lime'];
// cards start without a colour; a colour is something the user adds in Customize
const DEFAULT_TINT = {};
const tintKey = (i) => state.settings.cardColors?.[i] ?? (isCustom(i) ? 'none' : DEFAULT_TINT[i] || 'none');
const tintVar = (i) => {
  const k = tintKey(i);
  return k === 'none' ? null : k.startsWith('#') ? k : `var(--tn-${k})`;
};
function setTint(i, v) {
  state.settings.cardColors = { ...(state.settings.cardColors || {}), [i]: v };
}
function resetTint(i) {
  const c = { ...(state.settings.cardColors || {}) };
  delete c[i];
  state.settings.cardColors = c;
}
// customize: scroll the page when a card is dragged to the top or bottom edge
// interact.js (used by the grid) has its own auto-scroll: it scrolls and keeps the card under the pointer
// our own edge scrolling: scroll the page, then ask interact.js to re-run the move with the
// same pointer position so grid-layout recomputes the card position against the scrolled grid
let dragI = null,
  jit = 0;
function nudge() {
  const c = dragI?.coords?.cur;
  if (!c?.client) return;
  // same position with a sub-pixel wiggle so interact.js does not drop it as a duplicate move
  jit = jit ? 0 : 0.01;
  const id = dragI.pointers?.[0]?.id ?? 1;
  const fake = {
    type: 'pointermove',
    pointerId: id,
    pointerType: 'mouse',
    isPrimary: true,
    buttons: 1,
    clientX: c.client.x + jit,
    clientY: c.client.y,
    pageX: c.page.x + jit,
    pageY: c.page.y,
    screenX: c.client.x,
    screenY: c.client.y,
    target: dragI.element,
    currentTarget: document,
    timeStamp: performance.now(),
    preventDefault() {},
    stopPropagation() {},
  };
  try {
    dragI.pointerMove(fake, fake, dragI.element);
  } catch {}
}
const hooked = new WeakSet();
function hookAutoScroll() {
  nextTick(() =>
    document.querySelectorAll('.grid .vgl-item').forEach((el) => {
      if (hooked.has(el)) return;
      hooked.add(el);
      try {
        interact(el)
          .on('dragstart resizestart', (e) => (dragI = e._interaction || e.interaction))
          .on('dragend resizeend', () => (dragI = null));
      } catch {}
    }),
  );
}
const edge = useEdgeAutoScroll(
  () => document.querySelector('main.main'),
  () => state.editDash,
  {
    onScroll: nudge,
    getBox: () =>
      document.querySelector('.grid .vgl-item--dragging, .grid .vgl-item--resizing')?.getBoundingClientRect(),
  },
);
onMounted(edge.start);
onBeforeUnmount(edge.stop);
const colorFor = ref(null);
const closeColor = () => (colorFor.value = null);
onMounted(() => document.addEventListener('click', closeColor));
onBeforeUnmount(() => document.removeEventListener('click', closeColor));
const minOf = (i) =>
  isCustom(i)
    ? { btn: [1, 2], cam: [3, 4] }[state.settings.customCards?.[i]?.type] || [2, 3]
    : MODULES[i]?.min || [2, 2];
const nameOf = (i) => (isCustom(i) ? state.settings.customCards?.[i]?.name || 'Custom' : MODULES[i]?.n);

const width = ref(window.innerWidth);
const onResize = () => (width.value = window.innerWidth);
onMounted(() => window.addEventListener('resize', onResize));
onBeforeUnmount(() => window.removeEventListener('resize', onResize));
const wide = computed(() => width.value > 1000);
// how many screen pixels one CSS pixel of the grid is (interface scale). Measured instead of taken from the setting,
// because browsers disagree on how CSS zoom shows up in pointer and element coordinates.
const gridScale = ref(1);
const gap = computed(() => (state.settings.compactCards !== false ? [14, 14] : [20, 20]));
function measureScale() {
  const g = document.querySelector('.grid');
  if (g && g.offsetWidth) gridScale.value = g.getBoundingClientRect().width / g.offsetWidth || 1;
}
watch(
  () => [state.editDash, state.uiZoom, width.value],
  () => nextTick(measureScale),
);
onMounted(() => nextTick(measureScale));

// two layouts: normal and while printing (optional). In Customize both can be edited.
const editMode = ref('idle');
const mode = computed(() =>
  state.editDash
    ? state.settings.autoLayout
      ? editMode.value
      : 'idle'
    : state.settings.autoLayout && isPrinting.value
      ? 'print'
      : 'idle',
);
const LK = () => (mode.value === 'print' ? 'layoutPrint' : 'layout');
const HK = () => (mode.value === 'print' ? 'hiddenCardsPrint' : 'hiddenCards');
const srcLayout = () =>
  (mode.value === 'print' ? state.settings.layoutPrint || state.settings.layout : state.settings.layout) ||
  DEFAULT_LAYOUT();
// while printing without its own layout, the print dashboard is the idle one, hidden cards included
const hiddenNow = () =>
  (mode.value === 'print' && !state.settings.layoutPrint ? state.settings.hiddenCards : state.settings[HK()]) || [];
function clean(l) {
  const hidden = hiddenNow();
  const seen = new Set();
  const ok = (i) => MODULES[i] || (isCustom(i) && state.settings.customCards?.[i]);
  const out = (l || [])
    .filter((x) => ok(x.i) && !seen.has(x.i) && seen.add(x.i))
    .map(({ i, x, y, w, h }) => ({ i, x, y, w: Math.max(w, minOf(i)[0]), h: Math.max(h, minOf(i)[1]) })); // a raised minimum applies to saved layouts too
  for (const d of DEFAULT_LAYOUT()) if (!seen.has(d.i) && !hidden.includes(d.i)) out.push({ ...d, y: 999 });
  return out;
}
const layout = ref(clean(srcLayout()));
watch(
  () => hasMmu.value && state.settingsLoaded,
  (on) => {
    if (!on || state.settings.mmuSeen) return;
    state.settings.mmuSeen = true;
    if (!layout.value.some((x) => x.i === 'mmu')) {
      layout.value = [{ i: 'mmu', x: 0, y: 0, w: 12, h: 7 }, ...layout.value.map((x) => ({ ...x, y: x.y + 7 }))];
      persist(true);
    }
  },
  { immediate: true },
);
// hook the auto scroll into interact once the grid items exist
watch(
  () => [state.editDash, layout.value.length],
  ([on]) => on && hookAutoScroll(),
);
function reload() {
  layout.value = clean(srcLayout());
}
watch(mode, reload);
watch(
  () => state.settingsLoaded,
  (v) => v && reload(),
);
const sorted = computed(() => [...layout.value].sort((a, b) => a.y - b.y || a.x - b.x));
// phone / narrow window: one column. Its order is kept on its own (mobileOrder), so moving a card here does not
// shuffle the desktop grid. Cards not in the list yet follow in desktop order.
const column = computed(() => {
  const ord = state.settings.mobileOrder || [];
  const has = (i) => layout.value.some((x) => x.i === i);
  const ids = [...ord.filter(has), ...sorted.value.map((x) => x.i).filter((i) => !ord.includes(i))];
  return ids.map((i) => layout.value.find((x) => x.i === i));
});
function moveCol(i, d) {
  const ids = column.value.map((x) => x.i),
    k = ids.indexOf(i),
    j = k + d;
  if (k < 0 || j < 0 || j >= ids.length) return;
  [ids[k], ids[j]] = [ids[j], ids[k]];
  state.settings.mobileOrder = ids;
}
// grid-layout-plus also emits layout-updated on mount and on resize; only a Customize session writes settings
function persist(force = false) {
  if (!state.editDash && !force) return;
  state.settings[LK()] = layout.value.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
}
const bottom = () => Math.max(0, ...layout.value.map((x) => x.y + x.h));
function removeCard(i) {
  if (MODULES[i] && DEFAULT_LAYOUT().some((d) => d.i === i))
    state.settings[HK()] = [...new Set([...(state.settings[HK()] || []), i])];
  layout.value = layout.value.filter((x) => x.i !== i);
  if (isCustom(i)) {
    const cc = { ...state.settings.customCards };
    delete cc[i];
    state.settings.customCards = cc;
  }
  persist();
}
const available = computed(() =>
  Object.keys(MODULES).filter((k) => !layout.value.some((x) => x.i === k) && (!MODULES[k].need || MODULES[k].need())),
);
function addModule(k) {
  state.settings[HK()] = (state.settings[HK()] || []).filter((x) => x !== k);
  const [w, h] = MODULES[k].def;
  layout.value = [...layout.value, { i: k, x: 0, y: bottom(), w, h }];
  persist();
  addOpen.value = false;
}
function addCustom(type, cam) {
  const id = 'c_' + Date.now().toString(36);
  const data =
    type === 'btn'
      ? { type, name: 'Button', icon: 'star', gcode: '', highlight: false }
      : type === 'cam'
        ? { type, name: cam || 'Webcam' }
        : { type, name: 'Macros', buttons: [] };
  state.settings.customCards = { ...(state.settings.customCards || {}), [id]: data };
  if (cam) {
    // the camera this card shows, the same setting the card's own camera picker changes
    const o = (state.settings.cardOpts ||= {});
    o.cams = { ...(o.cams || {}), [id]: cam };
  }
  const [w, h] = { btn: [2, 3], cam: [6, 8] }[type] || [4, 4];
  layout.value = [...layout.value, { i: id, x: 0, y: bottom(), w, h }];
  persist();
  addOpen.value = false;
  if (type !== 'cam') editCard(id); // a webcam card picks its camera in its own header
}

// ---- resize from the bottom-left corner too (the grid library only has the bottom-right one) ----
// Pointer moves are turned into whole grid cells; the left edge moves the card's x so its right side stays put.
// Top corners are left out on purpose: the grid packs cards upwards, so growing a card upwards cannot hold.
let rz = null;
function rzStart(it, corner, e) {
  const g = document.querySelector('.grid');
  if (!g) return;
  const colW = (g.offsetWidth - gap.value[0] * 13) / 12;
  rz = {
    it,
    corner,
    x0: e.clientX,
    y0: e.clientY,
    start: { x: it.x, y: it.y, w: it.w, h: it.h },
    base: layout.value.map((l) => ({ ...l })),
    last: '',
    stepX: colW + gap.value[0],
    stepY: 40 + gap.value[1],
  };
  window.addEventListener('pointermove', rzMove);
  window.addEventListener('pointerup', rzEnd);
  window.addEventListener('pointercancel', rzEnd);
}
function rzMove(e) {
  if (!rz) return;
  const k = gridScale.value || 1;
  const dc = Math.round((e.clientX - rz.x0) / k / rz.stepX),
    dr = Math.round((e.clientY - rz.y0) / k / rz.stepY);
  const s = rz.start,
    [mw, mh] = minOf(rz.it.i);
  let { x, y, w, h } = s;
  if (rz.corner[1] === 'l') {
    const nx = Math.max(0, Math.min(s.x + s.w - mw, s.x + dc));
    w = s.w + (s.x - nx);
    x = nx;
  } else w = Math.max(mw, Math.min(12 - s.x, s.w + dc));
  if (rz.corner[0] === 't') {
    const ny = Math.max(0, Math.min(s.y + s.h - mh, s.y + dr));
    h = s.h + (s.y - ny);
    y = ny;
  } else h = Math.max(mh, s.h + dr);
  const sig = [x, y, w, h].join();
  if (sig === rz.last) return;
  rz.last = sig;
  // always start from the layout as it was when the resize began, so shrinking back undoes the pushes
  const L = rz.base.map((l) => ({ ...l }));
  Object.assign(
    L.find((l) => l.i === rz.it.i),
    { x, y, w, h },
  );
  layout.value = pushDown(L, rz.it.i);
}
function rzEnd() {
  window.removeEventListener('pointermove', rzMove);
  window.removeEventListener('pointerup', rzEnd);
  window.removeEventListener('pointercancel', rzEnd);
  if (rz) {
    rz = null;
    persist();
  }
}
onBeforeUnmount(rzEnd);

// ---- customize session with undo / backups ----
let entry = null;
const addOpen = ref(false);
const restoreOpen = ref(false);
const askReset = ref(false);
function startEdit() {
  entry = layoutSnapshot();
  state.editDash = true;
}
watch(
  () => state.dashEditReq,
  (v) => {
    if (!v) return;
    state.dashEditReq = 0;
    if (!state.editDash) startEdit();
  },
  { immediate: true },
);
function done() {
  colorFor.value = null;
  persist();
  if (entry && JSON.stringify(entry) !== JSON.stringify(layoutSnapshot())) pushLayoutBackup(entry, 'Before last edit');
  entry = null;
  state.editDash = false;
}
function cancel() {
  if (entry) restoreLayout(entry);
  entry = null;
  reload();
  state.editDash = false;
}
function undoSession() {
  if (entry) {
    restoreLayout(entry);
    reload();
  }
}
function factoryReset() {
  pushLayoutBackup(layoutSnapshot(), 'Before reset');
  const d = DEFAULT_SETTINGS();
  restoreLayout({
    layout: null,
    hiddenCards: [],
    strip: d.strip,
    customCards: {},
    layoutPrint: null,
    hiddenCardsPrint: [],
    autoLayout: state.settings.autoLayout,
  });
  reload();
  persist();
  askReset.value = false;
}
function restore(b) {
  pushLayoutBackup(layoutSnapshot(), 'Before restore');
  restoreLayout(b.data);
  reload();
  restoreOpen.value = false;
}
const fmtT = (t) =>
  new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
watch(
  () => state.editDash,
  (v) => document.body.classList.toggle('dash-edit', v),
  { immediate: true },
);
onBeforeUnmount(() => {
  if (state.editDash) done();
  document.body.classList.remove('dash-edit');
});

// ---- module options ----
const optsFor = ref(null);
const mo = computed(() => {
  const o = state.settings.cardOpts || (state.settings.cardOpts = {});
  return o.macros || (o.macros = { scroll: false, showHidden: false, hidden: [] });
});
const allMacros = computed(() =>
  state.objects
    .filter((o) => o.startsWith('gcode_macro '))
    .map((o) => o.slice(12))
    .filter((m) => mo.value.showHidden || !m.startsWith('_'))
    .sort(),
);
function toggleMacro(m) {
  const h = mo.value.hidden || (mo.value.hidden = []);
  const i = h.indexOf(m);
  i >= 0 ? h.splice(i, 1) : h.push(m);
}

// ---- custom card editor ----
const editing = ref(null); // { id, data }
const iconFor = ref(null);
function editCard(id) {
  editing.value = { id, data: JSON.parse(JSON.stringify(state.settings.customCards[id])) };
}
function saveCard() {
  state.settings.customCards = { ...state.settings.customCards, [editing.value.id]: editing.value.data };
  editing.value = null;
}
</script>

<template>
  <div class="page">
    <div v-if="state.editDash" class="dbar on">
      <template v-if="state.editDash">
        <Icon name="move" :size="18" style="color: var(--ac)" />
        <b>{{ t('Customize') }}</b>
        <label class="row al" :title="t('Use a separate layout while a print is running')"
          ><Toggle v-model="state.settings.autoLayout" :label="t('Separate layout while printing')" /><span>{{
            t('While printing')
          }}</span></label
        >
        <div v-if="state.settings.autoLayout" class="seg" role="tablist" :aria-label="t('Layout to edit')">
          <button
            :class="{ on: editMode === 'idle' }"
            @click="
              persist();
              editMode = 'idle';
            "
          >
            {{ t('Idle') }}
          </button>
          <button
            :class="{ on: editMode === 'print' }"
            @click="
              persist();
              editMode = 'print';
            "
          >
            {{ t('Printing') }}
          </button>
        </div>
        <span v-if="wide" class="mu hint">{{
          t('Drag by title, resize from the corner. Top cards: drag to reorder, eye to hide.')
        }}</span>
        <div class="grow"></div>
        <div class="rel">
          <button
            class="btn acc"
            @click="
              addOpen = !addOpen;
              restoreOpen = false;
            "
          >
            <Icon name="plus" :size="16" :stroke="2.6" />{{ t('Add card') }}
          </button>
          <div v-if="addOpen" class="dd card" v-away="() => (addOpen = false)">
            <span class="sec-lbl">{{ t('Modules') }}</span>
            <button v-for="k in available" :key="k" class="btn clear di" @click="addModule(k)">
              {{ t(MODULES[k].n) }}
            </button>
            <span v-if="!available.length" class="mu" style="font-size: 12px">{{
              t('All modules are on the dashboard')
            }}</span>
            <span class="sec-lbl" style="margin-top: 8px">{{ t('Custom') }}</span>
            <button class="btn clear di" @click="addCustom('btn')">
              <Icon name="star" :size="16" />{{ t('Command button (square)') }}
            </button>
            <button class="btn clear di" @click="addCustom('macros')">
              <Icon name="dash" :size="16" />{{ t('Macro group') }}
            </button>
            <button
              v-for="w in state.webcams.filter((w) => w.enabled !== false)"
              :key="'cam:' + w.name"
              class="btn clear di"
              @click="addCustom('cam', w.name)"
            >
              <Icon name="snap" :size="16" />{{ t('Webcam: {name}', { name: w.name }) }}
            </button>
          </div>
        </div>
        <div class="rel">
          <button
            class="btn"
            :disabled="!(state.settings.layoutBackups || []).length"
            @click="
              restoreOpen = !restoreOpen;
              addOpen = false;
            "
          >
            <Icon name="clock" :size="16" />{{ t('Restore') }}
          </button>
          <div v-if="restoreOpen" class="dd card" style="width: 280px" v-away="() => (restoreOpen = false)">
            <span class="sec-lbl">{{ t('Saved layouts') }}</span>
            <button
              v-for="(b, k) in state.settings.layoutBackups"
              :key="k"
              class="btn clear di"
              style="justify-content: space-between"
              @click="restore(b)"
            >
              <span>{{ t(b.label) }}</span
              ><span class="mono mu" style="font-size: 11px">{{ fmtT(b.t) }}</span>
            </button>
          </div>
        </div>
        <button class="btn" :aria-label="t('Undo changes since Customize was opened')" @click="undoSession">
          <Icon name="rot" :size="16" />{{ t('Undo') }}
        </button>
        <button class="btn dg" @click="askReset = true"><Icon name="refresh" :size="16" />{{ t('Reset') }}</button>
        <button class="btn" @click="cancel">{{ t('Cancel') }}</button>
        <button class="btn acc" @click="done"><Icon name="check" :size="16" :stroke="2.6" />{{ t('Done') }}</button>
      </template>
    </div>
    <div class="top">
      <DeviceStrip v-if="state.klippy === 'ready'" />
      <div v-else class="grow"></div>
    </div>
    <GridLayout
      v-if="wide"
      v-model:layout="layout"
      class="grid"
      :class="{ editing: state.editDash }"
      :col-num="12"
      :row-height="40"
      :margin="gap"
      :style="{ margin: -(gap[0] - 4) + 'px' }"
      :transform-scale="gridScale"
      :is-draggable="state.editDash"
      :is-resizable="state.editDash"
      vertical-compact
      use-css-transforms
      @layout-updated="persist"
    >
      <GridItem
        v-for="it in layout"
        :key="it.i"
        :i="it.i"
        :x="it.x"
        :y="it.y"
        :w="it.w"
        :h="it.h"
        :min-w="minOf(it.i)[0]"
        :min-h="minOf(it.i)[1]"
        drag-ignore-from=".tools, .rz"
      >
        <div
          v-fit
          class="cell"
          :class="{ 'tint-cell': tintVar(it.i), cpop: colorFor === it.i }"
          :style="tintVar(it.i) ? { '--tint': tintVar(it.i) } : null"
        >
          <CustomCard v-if="isCustom(it.i)" :id="it.i" class="fill" @edit="editCard" />
          <component v-else :is="MODULES[it.i].c" class="fill" />
          <template v-if="state.editDash"
            ><span class="rz bl" @pointerdown.stop.prevent="rzStart(it, 'bl', $event)"></span
          ></template>
          <div v-if="state.editDash" class="tools">
            <button
              v-if="isCustom(it.i) && state.settings.customCards?.[it.i]?.type !== 'cam'"
              class="btn ibtn sm"
              :aria-label="t('Edit {name}', { name: t(nameOf(it.i)) })"
              @click="editCard(it.i)"
            >
              <Icon name="pencil" :size="14" />
            </button>
            <button
              v-if="MODULES[it.i]?.opts"
              class="btn ibtn sm"
              :aria-label="t('Options {name}', { name: t(nameOf(it.i)) })"
              @click="optsFor = it.i"
            >
              <Icon name="gear" :size="15" />
            </button>
            <button
              class="btn ibtn sm sw"
              :aria-label="t('Card color')"
              @click.stop="colorFor = colorFor === it.i ? null : it.i"
            >
              <i :style="{ background: tintVar(it.i) || 'var(--s3)' }"></i>
            </button>
            <button
              class="btn ibtn sm"
              :aria-label="t('Remove {name}', { name: t(nameOf(it.i)) })"
              @click="removeCard(it.i)"
            >
              <Icon name="x" :size="16" />
            </button>
            <div v-if="colorFor === it.i" class="cp card" @mousedown.stop @click.stop>
              <span class="lbl">{{ t('Card color') }}</span>
              <div class="cps">
                <button
                  v-for="k in TINTS"
                  :key="k"
                  class="dot"
                  :class="{ on: tintKey(it.i) === k }"
                  :style="{ background: `var(--tn-${k})` }"
                  :aria-label="k"
                  @click="setTint(it.i, k)"
                ></button>
                <button
                  class="dot none"
                  :class="{ on: tintKey(it.i) === 'none' }"
                  :aria-label="t('No color')"
                  @click="setTint(it.i, 'none')"
                ></button>
              </div>
              <label class="row cpc"
                ><input
                  type="color"
                  :value="tintKey(it.i).startsWith('#') ? tintKey(it.i) : '#5aa9ee'"
                  @input="setTint(it.i, $event.target.value)"
                /><span>{{ t('Custom color') }}</span></label
              >
              <button
                class="btn clear"
                style="align-self: flex-start; height: 30px; padding: 0 6px"
                @click="resetTint(it.i)"
              >
                {{ t('Default') }}
              </button>
            </div>
          </div>
        </div>
      </GridItem>
    </GridLayout>
    <div v-else class="col" style="gap: 20px">
      <template v-if="state.editDash">
        <div v-for="(it, k) in column" :key="it.i" class="mrow">
          <span class="grow">{{ isCustom(it.i) ? nameOf(it.i) : t(nameOf(it.i)) }}</span>
          <button v-if="isCustom(it.i)" class="btn ibtn sm" :aria-label="t('Edit')" @click="editCard(it.i)">
            <Icon name="pencil" :size="16" />
          </button>
          <button class="btn ibtn sm" :disabled="k === 0" :aria-label="t('Move up')" @click="moveCol(it.i, -1)">
            <Icon name="up" :size="18" :stroke="2.4" />
          </button>
          <button
            class="btn ibtn sm"
            :disabled="k === column.length - 1"
            :aria-label="t('Move down')"
            @click="moveCol(it.i, 1)"
          >
            <Icon name="down" :size="18" :stroke="2.4" />
          </button>
          <button class="btn ibtn sm" :aria-label="t('Remove card')" @click="removeCard(it.i)">
            <Icon name="x" :size="18" :stroke="2.4" />
          </button>
        </div>
      </template>
      <template v-else v-for="it in column" :key="it.i">
        <CustomCard v-if="isCustom(it.i)" :id="it.i" :style="{ minHeight: it.h * 40 + 'px' }" @edit="editCard" />
        <component v-else :is="MODULES[it.i].c" :style="{ minHeight: it.h * 40 + 'px' }" />
      </template>
    </div>
  </div>

  <Modal v-if="optsFor === 'macros'" :title="t('Macros card')" width="620px" @close="optsFor = null">
    <div class="row" style="justify-content: space-between">
      <div class="col" style="gap: 2px">
        <b>{{ t('Scroll instead of shrinking') }}</b
        ><span class="mu" style="font-size: 12.5px">{{
          t('Off: buttons shrink so all macros fit the card. On: buttons keep their size and the card scrolls.')
        }}</span>
      </div>
      <Toggle v-model="mo.scroll" :label="t('Scroll')" />
    </div>
    <div class="row" style="justify-content: space-between">
      <b>{{ t('Show hidden macros (starting with _)') }}</b
      ><Toggle v-model="mo.showHidden" :label="t('Show hidden macros')" />
    </div>
    <span class="lbl">{{ t('Click a macro to hide or show it on the card') }}</span>
    <div class="row" style="flex-wrap: wrap; gap: 6px; max-height: 40vh; overflow: auto">
      <button
        v-for="m in allMacros"
        :key="m"
        class="mchip code"
        :class="{ off: (mo.hidden || []).includes(m) }"
        @click="toggleMacro(m)"
      >
        {{ m }}
      </button>
    </div>
    <template #foot
      ><button class="btn lg acc" @click="optsFor = null">{{ t('Done') }}</button></template
    >
  </Modal>

  <Modal v-if="askReset" :title="t('Reset dashboard?')" @close="askReset = false">
    <p class="mu" style="margin: 0">
      {{
        t(
          'Layout, top cards and custom cards go back to defaults. The current layout is saved under Restore, so you can go back.',
        )
      }}
    </p>
    <template #foot
      ><button class="btn lg" @click="askReset = false">{{ t('Cancel') }}</button
      ><button class="btn lg dgf" @click="factoryReset">{{ t('Reset') }}</button></template
    >
  </Modal>

  <Modal
    v-if="editing"
    :title="editing.data.type === 'btn' ? t('Command button') : t('Macro group')"
    width="620px"
    @close="editing = null"
  >
    <label class="col"
      ><span class="lbl">{{ editing.data.type === 'btn' ? t('Label') : t('Title') }}</span
      ><input v-model="editing.data.name" class="input"
    /></label>
    <template v-if="editing.data.type === 'btn'">
      <div class="row">
        <button class="btn ibtn" :aria-label="t('Change icon')" @click="iconFor = editing.data">
          <Icon :name="editing.data.icon" :size="22" :style="{ color: editing.data.color || 'var(--ac)' }" />
        </button>
        <CmdInput
          v-model="editing.data.gcode"
          input-class="input"
          :placeholder="t('G-code or macro, e.g. CHAMBER TEMP=50')"
          :aria-label="t('Command')"
        />
        <Toggle v-model="editing.data.highlight" :label="t('Highlight')" />
      </div>
    </template>
    <template v-else>
      <div v-for="(b, k) in editing.data.buttons" :key="k" class="row">
        <button class="btn ibtn" style="width: 40px; height: 40px" :aria-label="t('Change icon')" @click="iconFor = b">
          <Icon :name="b.icon || 'star'" :size="20" :style="{ color: b.color || 'var(--ac)' }" />
        </button>
        <input v-model="b.name" class="input" style="width: 130px" :aria-label="t('Button name')" />
        <CmdInput v-model="b.gcode" input-class="input" :placeholder="t('command')" :aria-label="t('Command')" />
        <Toggle v-model="b.highlight" :label="t('Highlight')" />
        <button class="btn clear ibtn sm" :aria-label="t('Remove button')" @click="editing.data.buttons.splice(k, 1)">
          <Icon name="trash" :size="16" />
        </button>
      </div>
      <button
        class="btn"
        style="align-self: flex-start"
        @click="editing.data.buttons.push({ name: 'New', icon: 'star', gcode: '', highlight: false })"
      >
        <Icon name="plus" :size="16" />{{ t('Add button') }}
      </button>
    </template>
    <template #foot
      ><button
        class="btn lg dg"
        style="margin-right: auto"
        @click="
          removeCard(editing.id);
          editing = null;
        "
      >
        {{ t('Delete card') }}</button
      ><button class="btn lg" @click="editing = null">{{ t('Cancel') }}</button
      ><button class="btn lg acc" @click="saveCard">{{ t('Save') }}</button></template
    >
  </Modal>
  <IconPicker
    v-if="iconFor"
    :icon="iconFor.icon"
    :color="iconFor.color"
    @pick="iconFor.icon = $event"
    @color="iconFor.color = $event"
    @close="iconFor = null"
  />
</template>

<style scoped>
.dbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.mrow {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px 8px 14px;
  background: var(--s1);
  border-radius: 12px;
  font-weight: 600;
  font-size: 14px;
}
/* device tiles: a strip of their own, separated from the cards below by an accent hairline */
.top {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  position: relative;
  z-index: 20;
  padding: 0 0 18px;
}
.dbar.on {
  padding: 10px 14px;
  background: var(--s1);
  border: 1px solid var(--ac);
  border-radius: 12px;
  position: sticky;
  top: -20px;
  z-index: 30;
}
@media (max-width: 700px) {
  .dbar.on {
    position: static;
  }
}
.mu {
  color: var(--mu);
  font-size: 13px;
}
.mchip {
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  border: none;
  background: var(--s2);
  color: var(--tx);
  font-size: 12px;
}
.mchip.off {
  background: var(--s2);
  color: var(--mu2);
  text-decoration: line-through;
}
.al {
  gap: 8px;
  font-size: 13px;
  color: var(--mu);
  margin-left: 10px;
  cursor: pointer;
}
:root.ew-lt-1900 .hint {
  display: none;
}
.rel {
  position: relative;
}
.dd {
  position: absolute;
  right: 0;
  top: 40px;
  width: 240px;
  z-index: 40;
  gap: 2px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.di {
  justify-content: flex-start;
  height: 36px;
  color: var(--tx);
}
.grid {
  margin: -16px;
}
:global(:root.compact) .top {
  padding-bottom: 6px;
}
.cell {
  position: relative;
  height: 100%;
}

.tools {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  display: flex;
  gap: 4px;
}
.tools .btn {
  background: var(--s1);
}
.sw i {
  width: 16px;
  height: 16px;
  border-radius: 8px;
  display: block;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.18);
}
.cp {
  position: absolute;
  top: 40px;
  right: 0;
  width: 232px;
  padding: 14px;
  gap: 10px;
  z-index: 60;
  background: var(--s1) !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  cursor: default;
}
.cps {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.dot {
  width: 28px;
  height: 28px;
  border-radius: 14px;
  border: 2px solid transparent;
  padding: 0;
}
.dot.on {
  border-color: var(--tx);
}
.dot.none {
  background: var(--s2);
  background-image: linear-gradient(135deg, transparent 45%, var(--mu2) 45%, var(--mu2) 55%, transparent 55%);
}
.cpc {
  gap: 10px;
  font-size: 13px;
  cursor: pointer;
}
.cpc input {
  width: 34px;
  height: 28px;
  border: none;
  padding: 0;
  background: none;
  cursor: pointer;
}
.grid :deep(.vgl-item:has(.cpop, .pp, .dd)) {
  z-index: 40;
}
/* a pop-up inside a card must not be clipped by the card's own scroll box */
.grid :deep(.cell > .card:has(.pp, .dd)) {
  overflow: visible;
}
.editing :deep(.card) {
  border-style: dashed;
  border-color: var(--mu2);
}
.editing :deep(.vgl-item) {
  cursor: move;
}
/* while customizing the whole card is a drag handle: its own buttons, sliders and fields stay inert */
.editing .cell > :deep(.fill) {
  pointer-events: none;
  user-select: none;
}
.editing .tools {
  pointer-events: auto;
}
.editing :deep(.card-h .acts) {
  visibility: hidden;
}
.editing :deep(.vgl-item__resizer) {
  width: 22px;
  height: 22px;
}
.editing :deep(.vgl-item__resizer::before) {
  border-color: var(--ac);
  border-right-width: 3px;
  border-bottom-width: 3px;
}
.grid :deep(.vgl-item--placeholder) {
  background: var(--ac);
  opacity: 0.15;
  border-radius: 12px;
}
.grid :deep(.vgl-item__resizer) {
  display: none;
}
.grid.editing :deep(.vgl-item__resizer) {
  display: block;
}
/* the three extra resize corners, drawn like the library's bottom-right one */
.rz {
  position: absolute;
  width: 22px;
  height: 22px;
  z-index: 6;
  touch-action: none;
}
.rz::before {
  content: '';
  position: absolute;
  width: 9px;
  height: 9px;
  border: 0 solid var(--ac);
}
.rz.tl {
  left: 0;
  top: 0;
  cursor: nwse-resize;
}
.rz.tl::before {
  left: 4px;
  top: 4px;
  border-left-width: 3px;
  border-top-width: 3px;
}
.rz.tr {
  right: 0;
  top: 0;
  cursor: nesw-resize;
}
.rz.tr::before {
  right: 4px;
  top: 4px;
  border-right-width: 3px;
  border-top-width: 3px;
}
.rz.bl {
  left: 0;
  bottom: 0;
  cursor: nesw-resize;
}
.rz.bl::before {
  left: 4px;
  bottom: 4px;
  border-left-width: 3px;
  border-bottom-width: 3px;
}
.ig {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 6px;
}
</style>
