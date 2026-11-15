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
// screen sizes in CSS pixels, as the phone's browser reports them
const MODELS = [
  { id: 'iphone16', name: 'iPhone 15 / 16', w: 393, h: 852 },
  { id: 'iphone16pm', name: 'iPhone 16 Pro Max', w: 440, h: 956 },
  { id: 'iphone15pm', name: 'iPhone 15 Pro Max', w: 430, h: 932 },
  { id: 'iphonese', name: 'iPhone SE', w: 375, h: 667 },
  { id: 'pixel8', name: 'Google Pixel 8', w: 412, h: 915 },
  { id: 'galaxys24', name: 'Samsung Galaxy S24', w: 360, h: 780 },
  { id: 'galaxys20u', name: 'Samsung Galaxy S20 Ultra', w: 412, h: 915 },
];
const KEY = 'voyager-ui-phone-model'; // this browser only
let saved = '';
try {
  saved = localStorage.getItem(KEY) || '';
} catch {}
const modelId = ref(MODELS.some((m) => m.id === saved) ? saved : MODELS[0].id);
watch(modelId, (v) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {}
});
const model = computed(() => MODELS.find((m) => m.id === modelId.value));
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
          <option v-for="m in MODELS" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
        <span class="mono mu sz">{{ model.w }} × {{ model.h }}</span>
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
            :key="modelId"
            :src="src"
            :title="t('Phone preview')"
            :style="{ width: model.w + 'px', height: model.h + 'px' }"
          ></iframe>
        </div>
      </div>
      <span class="mu note">{{ t('The preview is the real interface: its buttons act on the printer.') }}</span>
    </div>
    <div class="side">
      <section class="card">
        <div class="card-h">
          <h2>{{ t('Cards on the phone') }}</h2>
        </div>
        <span class="mu note">{{
          t('Drag to change the order, eye to leave a card out on the phone. The computer keeps all its cards.')
        }}</span>
        <button v-if="hiddenN" class="btn sm shb" :class="{ on: showHidden }" @click="showHidden = !showHidden">
          <Icon :name="showHidden ? 'eye' : 'eyeoff'" :size="15" />{{
            showHidden ? t('Hide the hidden ones') : t('Show hidden ({n})', { n: hiddenN })
          }}
        </button>
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
      </section>
      <section v-if="tiles.length" class="card">
        <div class="card-h">
          <h2>{{ t('Top tiles on the phone') }}</h2>
          <div class="acts">
            <button class="btn sm" @click="allTiles(true)">{{ t('All') }}</button>
            <button class="btn sm" @click="allTiles(false)">{{ t('None') }}</button>
          </div>
        </div>
        <div class="tgrid">
          <button
            v-for="d in tiles"
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
/* the lists scroll beside the phone, so the phone stays in view */
.side {
  flex: 1;
  min-width: 300px;
  max-height: calc(var(--main-h, 100vh) - 110px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
