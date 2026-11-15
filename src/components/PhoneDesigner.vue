<script setup>
// Customize > Phone on a computer: the phone dashboard edited beside a live preview. The preview is this same
// interface in a frame the size of the chosen phone (?phonepreview, see store.js): it gets the settings from here
// on every change and saves nothing itself. The lists set the phone's card order and which cards and top tiles a
// phone leaves out (mobileOrder, mobileHidden, stripPhoneHidden); the desktop grid keeps all of them.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import SortList from './SortList.vue';
import { state, stripAll, prettyName } from '../store';
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
// (the room is what the window has left under the phone's top edge, less the note under it)
const room = ref(600);
const fwrap = ref(null);
function measure() {
  const top = fwrap.value?.getBoundingClientRect().top ?? 300;
  room.value = window.innerHeight - Math.max(0, top) - 44;
}
onMounted(() => {
  measure();
  window.addEventListener('resize', measure);
});
onBeforeUnmount(() => window.removeEventListener('resize', measure));
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
// the tiles in groups: heat, air, lights and outputs, the rest
const GROUPS = [
  { id: 'temp', n: 'Temperatures', kinds: ['temp'] },
  { id: 'fan', n: 'Fans', kinds: ['fan'] },
  { id: 'out', n: 'Lights and outputs', kinds: ['led', 'pin'] },
  { id: 'rest', n: 'Other', kinds: null },
];
const known = GROUPS.flatMap((g) => g.kinds || []);
const groups = computed(() =>
  GROUPS.map((g) => ({
    ...g,
    tiles: tiles.value.filter((d) => (g.kinds ? g.kinds.includes(d.kind) : !known.includes(d.kind))),
  })).filter((g) => g.tiles.length),
);
const shownN = computed(() => tiles.value.filter((d) => !hiddenTiles.value.includes(d.id)).length);
function groupAll(g, on) {
  const ids = g.tiles.map((d) => d.id);
  const rest = hiddenTiles.value.filter((x) => !ids.includes(x));
  state.settings.stripPhoneHidden = on ? rest : [...rest, ...ids];
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
      <div class="row dbar2">
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
          t('Click a tile to leave it out on the phone. Tiles the computer hides stay hidden on the phone too.')
        }}</span>
        <div class="scroll">
          <div v-for="g in groups" :key="g.id" class="grp">
            <div class="gh">
              <span class="sec-lbl">{{ t(g.n) }}</span>
              <button class="btn clear sm" @click="groupAll(g, true)">{{ t('All') }}</button>
              <button class="btn clear sm" @click="groupAll(g, false)">{{ t('None') }}</button>
            </div>
            <div class="tgrid">
              <button
                v-for="d in g.tiles"
                :key="d.id"
                class="tile"
                :class="{ off: hiddenTiles.includes(d.id) }"
                :aria-pressed="!hiddenTiles.includes(d.id)"
                @click="toggleTile(d.id)"
              >
                <Icon :name="KINDS[d.kind] || 'dash'" :size="14" />
                <span class="nm">{{ tileName(d) }}</span>
                <Icon :name="hiddenTiles.includes(d.id) ? 'eyeoff' : 'eye'" :size="14" class="ey" />
              </button>
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
.dbar2 {
  gap: 8px;
  align-self: stretch;
  justify-content: center;
}
.dbar2 select {
  width: auto;
  height: 34px;
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
.grp + .grp {
  margin-top: 14px;
}
.gh {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}
.gh .sec-lbl {
  margin-right: auto;
}
.gh .btn {
  height: 24px;
  padding: 0 8px;
  font-size: 11.5px;
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
.tgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px;
}
.tile {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--bd);
  background: var(--s2);
  color: var(--tx);
  font-size: 12.5px;
  font-weight: 500;
  text-align: left;
  min-width: 0;
}
.tile .nm {
  flex: 1;
}
.tile .ey {
  color: var(--mu);
  flex-shrink: 0;
}
.tile.off {
  text-decoration: none;
  opacity: 0.5;
  border-style: dashed;
  background: transparent;
}
.tile.off .nm {
  text-decoration: line-through;
}
</style>
