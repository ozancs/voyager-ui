<script setup>
// Customize > Phone on a computer: the phone dashboard edited beside a live preview. The preview is this same
// interface in a frame the size of the chosen phone (?phonepreview, see store.js): it gets the settings from here
// on every change and saves nothing itself. The lists set the phone's card order and which cards and top tiles a
// phone leaves out (mobileOrder, mobileHidden, stripPhoneHidden), and the order of the top tiles on the phone
// (stripPhoneOrder, shown here as small tiles in the phone's own columns); the desktop keeps its own.
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import Icon from './Icon.vue';
import SortList from './SortList.vue';
import { state, S, stripAll, prettyName, orderStrip } from '../store';
import { t } from '../i18n';
import { mergeOrder } from '../calc';
const props = defineProps({ cards: Array }); // [{ i, name }] in phone order, hidden ones included
// Screen sizes in CSS pixels (the whole screen; the browser's own bars take part of it). Flagships and a few
// popular models; Android phones are at their default display size, a larger or smaller display size setting
// changes them. Anything else: Other, with its own width and height.
const MODELS = [
  { brand: 'Apple', id: 'iphone16', name: 'iPhone 15 / 16 / 15 Pro', w: 393, h: 852 },
  { brand: 'Apple', id: 'iphone16pro', name: 'iPhone 16 Pro', w: 402, h: 874 },
  { brand: 'Apple', id: 'iphoneplus', name: 'iPhone 15 Plus / 16 Plus / 15 Pro Max', w: 430, h: 932 },
  { brand: 'Apple', id: 'iphone16pm', name: 'iPhone 16 Pro Max', w: 440, h: 956 },
  { brand: 'Apple', id: 'iphone13', name: 'iPhone 13 / 14', w: 390, h: 844 },
  { brand: 'Apple', id: 'iphonese', name: 'iPhone SE', w: 375, h: 667 },
  { brand: 'Samsung', id: 'galaxys24', name: 'Galaxy S23 / S24', w: 360, h: 780 },
  { brand: 'Samsung', id: 'galaxys24u', name: 'Galaxy S24+ / S24 Ultra', w: 384, h: 832 },
  { brand: 'Google', id: 'pixel8', name: 'Pixel 7 / 8', w: 412, h: 915 },
  { brand: 'Xiaomi', id: 'xiaomi', name: 'Xiaomi 14 / Redmi Note 13', w: 393, h: 873 },
  { brand: 'OnePlus', id: 'oneplus', name: 'OnePlus 12', w: 412, h: 915 },
];
const BRANDS = [...new Set(MODELS.map((m) => m.brand))];
// the choice and the Other size are kept in this browser only
const KEY = 'voyager-ui-phone-model';
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
} catch {}
const modelId = ref(saved.id === 'other' || MODELS.some((m) => m.id === saved.id) ? saved.id : MODELS[0].id);
const otherW = ref(saved.w || 400);
const otherH = ref(saved.h || 860);
watch([modelId, otherW, otherH], () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id: modelId.value, w: otherW.value, h: otherH.value }));
  } catch {}
});
const clampPx = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(+v) || d));
const model = computed(() =>
  modelId.value === 'other'
    ? { id: 'other', w: clampPx(otherW.value, 300, 820, 400), h: clampPx(otherH.value, 480, 1400, 860) }
    : MODELS.find((m) => m.id === modelId.value),
);
// the phone is shrunk to fit the window height (it keeps its own size inside, so the layout is the phone's)
const BEZEL = 12;
// The room is what the page area has left under the phone's top edge, less the note under it. Measured in the
// page's own CSS pixels (the interface scale zooms the page), again whenever the page area or the phone changes.
const room = ref(600);
const fwrap = ref(null);
const NOTE = 52; // the note under the phone, up to two lines
function measure() {
  const el = fwrap.value;
  if (!el) return;
  const main = el.closest('main');
  const r = el.getBoundingClientRect();
  const zoom = r.width / (el.offsetWidth || r.width) || 1;
  const bottom = main ? main.getBoundingClientRect().bottom : window.innerHeight;
  room.value = (Math.min(bottom, window.innerHeight) - Math.max(0, r.top)) / zoom - NOTE;
}
let ro;
onMounted(() => {
  nextTick(measure);
  setTimeout(measure, 300); // after the Customize bar and the page have settled
  window.addEventListener('resize', measure);
  const main = fwrap.value?.closest('main');
  if (main) {
    ro = new ResizeObserver(() => measure());
    ro.observe(main);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure);
  ro?.disconnect();
});
watch(model, () => nextTick(measure));
const k = computed(() => Math.min(1, Math.max(0.45, room.value / (model.value.h + BEZEL * 2))));
const src = location.pathname + '?phonepreview=1#/dashboard';
const frame = ref(null);
let timer = 0;
function send() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    frame.value?.contentWindow?.postMessage(
      { type: 'voyager-phone-settings', settings: JSON.parse(JSON.stringify(state.settings)) },
      location.origin,
    );
  }, 120);
}
watch(() => state.settings, send, { deep: true });
function onMsg(e) {
  if (e.origin === location.origin && e.data?.type === 'voyager-phone-ready' && e.source === frame.value?.contentWindow)
    send();
}
onMounted(() => window.addEventListener('message', onMsg));
onBeforeUnmount(() => {
  window.removeEventListener('message', onMsg);
  clearTimeout(timer);
});
function reloadFrame() {
  frame.value?.contentWindow?.location.reload();
}

const hiddenCards = computed(() => state.settings.mobileHidden || []);
function toggleCard(i) {
  const h = hiddenCards.value;
  state.settings.mobileHidden = h.includes(i) ? h.filter((x) => x !== i) : [...h, i];
}
// the cards left out on the phone stay out of the list unless asked for, so the rest is quick to drag
const showHidden = ref(false);
const hiddenN = computed(() => props.cards.filter((c) => hiddenCards.value.includes(c.i)).length);
const listed = computed(() =>
  showHidden.value ? props.cards : props.cards.filter((c) => !hiddenCards.value.includes(c.i)),
);
function setOrder(list) {
  const ids = list.map((x) => x.i);
  state.settings.mobileOrder = showHidden.value
    ? ids
    : mergeOrder(
        props.cards.map((c) => c.i),
        ids,
        (i) => hiddenCards.value.includes(i),
      );
}
// the tiles the desktop hides stay hidden on the phone too; only the ones shown there are listed
const tiles = computed(() =>
  stripAll.value.filter(
    (x) => !(state.settings.strip?.hidden || []).includes(x.id) && !state.settings.devices.hidden.includes(x.obj),
  ),
);
const tileName = (d) => (d.kind === 'spoolman' ? 'Spoolman' : d.kind === 'phoenix' ? 'Phoenix' : prettyName(d.obj));
const hiddenTiles = computed(() => state.settings.stripPhoneHidden || []);
function toggleTile(id) {
  const h = hiddenTiles.value;
  state.settings.stripPhoneHidden = h.includes(id) ? h.filter((x) => x !== id) : [...h, id];
}
function allTiles(on) {
  state.settings.stripPhoneHidden = on ? [] : tiles.value.map((x) => x.id);
}
// The top tiles in the phone's order and in its columns, as small tiles: drag one onto another to move it there,
// the eye leaves it out on the phone. The tiles left out stay off the grid until Show hidden, like the cards.
const ordered = computed(() => orderStrip(tiles.value, true));
const showHiddenTiles = ref(false);
const hiddenTileN = computed(() => tiles.value.filter((d) => hiddenTiles.value.includes(d.id)).length);
const shownN = computed(() => tiles.value.length - hiddenTileN.value);
const listedTiles = computed(() =>
  showHiddenTiles.value ? ordered.value : ordered.value.filter((d) => !hiddenTiles.value.includes(d.id)),
);
// as many columns as the phone shows (DeviceStrip: about 104 px per tile in the page's width)
const tCols = computed(() => Math.max(2, Math.floor((model.value.w - 24 + 4) / 104)));
function saveTiles(ids) {
  const full = ordered.value.map((d) => d.id);
  state.settings.stripPhoneOrder = showHiddenTiles.value
    ? [...ids, ...full.filter((x) => !ids.includes(x))]
    : mergeOrder(full, ids, (x) => hiddenTiles.value.includes(x));
}
function moveTile(id, to) {
  const ids = listedTiles.value.map((d) => d.id);
  const from = ids.indexOf(id);
  to = Math.max(0, Math.min(ids.length - 1, to));
  if (from < 0 || from === to) return;
  ids.splice(from, 1);
  ids.splice(to, 0, id);
  saveTiles(ids);
}
const tGrid = ref(null);
const tDrag = ref(null); // { id, dx, dy, over } while a tile is dragged
let tStart = null;
let tRects = [];
function tDown(d, e) {
  if (e.button !== 0 || e.target.closest('button')) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  tStart = { id: d.id, x: e.clientX, y: e.clientY, zoom: r.width / (el.offsetWidth || r.width) || 1, moved: false };
  tRects = [...tGrid.value.children].map((c) => ({ id: c.dataset.id, r: c.getBoundingClientRect() }));
  el.setPointerCapture?.(e.pointerId);
}
function tMove(e) {
  if (!tStart) return;
  const dx = e.clientX - tStart.x,
    dy = e.clientY - tStart.y;
  if (!tStart.moved && Math.hypot(dx, dy) < 5) return;
  tStart.moved = true;
  // the tile whose middle is nearest to the pointer is where the dragged one goes
  let over = null,
    best = Infinity;
  for (const { id, r } of tRects) {
    const dd = (r.left + r.width / 2 - e.clientX) ** 2 + (r.top + r.height / 2 - e.clientY) ** 2;
    if (dd < best) [best, over] = [dd, id];
  }
  tDrag.value = { id: tStart.id, dx: dx / tStart.zoom, dy: dy / tStart.zoom, over };
}
function tUp() {
  const d = tDrag.value;
  if (tStart?.moved && d?.over && d.over !== d.id)
    moveTile(
      d.id,
      listedTiles.value.findIndex((x) => x.id === d.over),
    );
  tStart = null;
  tDrag.value = null;
}
// the arrow keys move the focused tile, up and down by a whole row
function tKey(d, e) {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -tCols.value, ArrowDown: tCols.value }[e.key];
  if (!step) return;
  e.preventDefault();
  moveTile(d.id, listedTiles.value.findIndex((x) => x.id === d.id) + step);
  nextTick(() => tGrid.value?.querySelector(`[data-id="${CSS.escape(d.id)}"]`)?.focus());
}
// what the tile shows on the phone, in short
function tileValue(d) {
  const o = d.obj ? S(d.obj) : {};
  if (d.kind === 'temp') return o.temperature != null ? o.temperature.toFixed(1) + '°' : '';
  if (d.kind === 'fan') return o.speed != null ? Math.round(o.speed * 100) + '%' : '';
  if (d.kind === 'pin') return o.value != null ? (o.value > 0 ? t('ON') : t('OFF')) : '';
  return '';
}
const KINDS = {
  temp: 'thermo',
  fan: 'fan',
  led: 'bulb',
  pin: 'bulb',
  filament: 'sensor',
  spoolman: 'spool',
  phoenix: 'refresh',
};
</script>
<template>
  <div class="pd">
    <div class="dev">
      <div class="row dbar2" :style="{ maxWidth: Math.max(330, (model.w + BEZEL * 2) * k) + 'px' }">
        <select v-model="modelId" class="input" :aria-label="t('Phone')">
          <optgroup v-for="b in BRANDS" :key="b" :label="b">
            <option v-for="m in MODELS.filter((x) => x.brand === b)" :key="m.id" :value="m.id">{{ m.name }}</option>
          </optgroup>
          <option value="other">{{ t('Other') }}</option>
        </select>
        <template v-if="modelId === 'other'"
          ><input
            v-model.lazy="otherW"
            class="input mono px"
            type="number"
            min="300"
            max="820"
            :aria-label="t('Width')" /><span class="mu">×</span
          ><input
            v-model.lazy="otherH"
            class="input mono px"
            type="number"
            min="480"
            max="1400"
            :aria-label="t('Height')"
        /></template>
        <span v-else class="mono mu sz">{{ model.w }} × {{ model.h }}</span>
        <button class="btn ibtn" :aria-label="t('Reload preview')" :data-tip="t('Reload preview')" @click="reloadFrame">
          <Icon name="refresh" :size="16" />
        </button>
      </div>
      <div
        ref="fwrap"
        class="fwrap"
        :style="{ width: (model.w + BEZEL * 2) * k + 'px', height: (model.h + BEZEL * 2) * k + 'px' }"
      >
        <div
          class="phone"
          :style="{
            width: model.w + BEZEL * 2 + 'px',
            height: model.h + BEZEL * 2 + 'px',
            transform: `scale(${k})`,
          }"
        >
          <iframe
            ref="frame"
            :key="model.w + 'x' + model.h"
            :src="src"
            :title="t('Phone preview')"
            :style="{ width: model.w + 'px', height: model.h + 'px' }"
          ></iframe>
        </div>
      </div>
      <span class="mu note">{{
        t('The preview is the real interface: drag to scroll as with a finger, its buttons act on the printer.')
      }}</span>
    </div>
    <div class="side">
      <section class="card cards">
        <div class="card-h">
          <h2>{{ t('Cards on the phone') }}</h2>
          <span class="mono mu cnt">{{ cards.length - hiddenN }} / {{ cards.length }}</span>
        </div>
        <span class="mu note">{{
          t('Drag to change the order, eye to leave a card out on the phone. The computer keeps all its cards.')
        }}</span>
        <button v-if="hiddenN" class="btn sm shb" :class="{ on: showHidden }" @click="showHidden = !showHidden">
          <Icon :name="showHidden ? 'eye' : 'eyeoff'" :size="15" />{{
            showHidden ? t('Hide the hidden ones') : t('Show hidden ({n})', { n: hiddenN })
          }}
        </button>
        <div class="scroll">
          <SortList class="plist" :model-value="listed" :item-key="(c) => c.i" @update:model-value="setOrder">
            <template #default="{ item: c }">
              <span class="grow nm" :class="{ off: hiddenCards.includes(c.i) }">{{ c.name }}</span>
              <button
                class="btn ibtn sm"
                :aria-pressed="!hiddenCards.includes(c.i)"
                :aria-label="hiddenCards.includes(c.i) ? t('Show on the phone') : t('Hide on the phone')"
                :data-tip="hiddenCards.includes(c.i) ? t('Show on the phone') : t('Hide on the phone')"
                @click="toggleCard(c.i)"
              >
                <Icon :name="hiddenCards.includes(c.i) ? 'eyeoff' : 'eye'" :size="16" />
              </button>
            </template>
          </SortList>
        </div>
      </section>
      <section v-if="tiles.length" class="card tilesc">
        <div class="card-h">
          <h2>{{ t('Top tiles on the phone') }}</h2>
          <span class="mono mu cnt">{{ shownN }} / {{ tiles.length }}</span>
          <div class="acts">
            <button class="btn sm" @click="allTiles(true)">{{ t('All') }}</button>
            <button class="btn sm" @click="allTiles(false)">{{ t('None') }}</button>
          </div>
        </div>
        <span class="mu note">{{
          t(
            'Drag a tile onto another to change the order on the phone, eye to leave it out. Tiles the computer hides stay hidden on the phone too.',
          )
        }}</span>
        <button
          v-if="hiddenTileN"
          class="btn sm shb"
          :class="{ on: showHiddenTiles }"
          @click="showHiddenTiles = !showHiddenTiles"
        >
          <Icon :name="showHiddenTiles ? 'eye' : 'eyeoff'" :size="15" />{{
            showHiddenTiles ? t('Hide the hidden ones') : t('Show hidden ({n})', { n: hiddenTileN })
          }}
        </button>
        <div class="scroll">
          <div ref="tGrid" class="tg2" :style="{ gridTemplateColumns: `repeat(${tCols}, minmax(0, 1fr))` }">
            <div
              v-for="d in listedTiles"
              :key="d.id"
              :data-id="d.id"
              class="mt"
              :class="{
                off: hiddenTiles.includes(d.id),
                drag: tDrag?.id === d.id,
                over: tDrag && tDrag.over === d.id && tDrag.id !== d.id,
              }"
              :style="tDrag?.id === d.id ? { translate: `${tDrag.dx}px ${tDrag.dy}px` } : null"
              tabindex="0"
              role="listitem"
              :aria-label="tileName(d)"
              @pointerdown="tDown(d, $event)"
              @pointermove="tMove"
              @pointerup="tUp"
              @pointercancel="tUp"
              @keydown="tKey(d, $event)"
            >
              <div class="mh">
                <span class="nm">{{ tileName(d) }}</span>
                <button
                  class="ey"
                  :aria-pressed="!hiddenTiles.includes(d.id)"
                  :aria-label="hiddenTiles.includes(d.id) ? t('Show on the phone') : t('Hide on the phone')"
                  :data-tip="hiddenTiles.includes(d.id) ? t('Show on the phone') : t('Hide on the phone')"
                  @click="toggleTile(d.id)"
                >
                  <Icon :name="hiddenTiles.includes(d.id) ? 'eyeoff' : 'eye'" :size="13" />
                </button>
              </div>
              <div class="mb">
                <Icon :name="KINDS[d.kind] || 'dash'" :size="14" class="ki" />
                <span class="mono mv">{{ tileValue(d) }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
<style scoped>
.pd {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.dev {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.sz {
  font-size: 12px;
}
.fwrap {
  position: relative;
  flex-shrink: 0;
}
.phone {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  box-sizing: border-box;
  padding: 12px;
  border-radius: 46px;
  background: #0b0c0e;
  box-shadow:
    0 0 0 2px #2c2f35,
    0 20px 50px rgba(0, 0, 0, 0.45);
}
iframe {
  display: block;
  border: none;
  border-radius: 34px;
  background: var(--bg);
}
.note {
  font-size: 12px;
  max-width: 420px;
  text-align: center;
}
/* two columns beside the phone, the cards and the top tiles; each list scrolls in its own column, so the phone
   and both headers stay in view */
.side {
  flex: 1;
  min-width: 300px;
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(300px, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 1300px) {
  .side {
    grid-template-columns: 1fr;
  }
}
.side > .card {
  max-height: calc(var(--main-h, 100vh) - 110px);
  min-height: 0;
}
.scroll {
  overflow: auto;
  min-height: 0;
  flex: 1;
  margin-right: -6px;
  padding-right: 6px;
}
.cnt {
  font-size: 12px;
}
.card-h > .cnt {
  margin-left: 0 !important;
  margin-right: auto;
}
.px {
  width: 74px;
  height: 34px;
}

.side .note {
  text-align: left;
  max-width: none;
}
.shb {
  align-self: flex-start;
}
.plist {
  gap: 6px;
}
.plist :deep(.sr) {
  gap: 6px;
  padding: 4px 6px 4px 2px;
  background: var(--s2);
  border-radius: 10px;
  font-weight: 600;
  font-size: 13.5px;
}
.nm {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.off {
  opacity: 0.45;
  text-decoration: line-through;
}
/* the model picker as wide as its text; with Other the size fields wrap under it instead of pushing the row */
.dbar2 {
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
.dbar2 select {
  flex: 0 1 auto;
  width: auto;
  min-width: 0;
  max-width: 100%;
  height: 34px;
  field-sizing: content;
}
/* the top tiles as on the phone: small, in its columns, in its order */
.tg2 {
  display: grid;
  gap: 6px;
  max-width: 460px;
}
.mt {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 4px;
  height: 52px;
  padding: 6px 6px 6px 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--s2);
  cursor: grab;
  touch-action: none;
  user-select: none;
  min-width: 0;
}
.mt:focus-visible {
  outline: 2px solid var(--ac);
  outline-offset: 1px;
}
.mt.drag {
  z-index: 5;
  cursor: grabbing;
  border-color: var(--ac);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.4);
  opacity: 0.9;
}
.mt.over {
  outline: 2px solid var(--ac);
  outline-offset: -2px;
}
.mt.off {
  opacity: 0.45;
  border-color: var(--bd);
  border-style: dashed;
  background: transparent;
}
.mt.off .nm {
  text-decoration: line-through;
}
.mh {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.mh .nm {
  flex: 1;
  font-size: 11px;
  font-weight: 500;
  color: var(--mu);
}
.ey {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--mu);
  cursor: pointer;
}
.ey:hover {
  background: var(--s3);
  color: var(--tx);
}
.mb {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.mb .ki {
  color: var(--mu);
  flex-shrink: 0;
}
.mv {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
