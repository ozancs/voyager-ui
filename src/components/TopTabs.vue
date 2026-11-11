<script setup>
// Top tabs menu style: the pages as folder tabs along the bottom of the top bar. The open page is a folder that
// joins the page panel below (it slides from tab to tab); pointing at another tab shows a light box floating in
// it, never joined to the panel, so it does not look open. Printer settings and config files are under More.
// When the window gets narrower the tabs never go away, they get smaller: names and icons, tighter, icons only
// (the name shows above the tab on hover), and at the narrowest one tab with the open page that lists them all.
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import Popover from './Popover.vue';
import { state } from '../store';
import { route, go } from '../router';
import { t } from '../i18n';
import { NAV2, navItems, healthBadge } from '../nav';

const items = navItems;
const label = (it) => t(it[3] || it[2]);
const icon = (it) => (it[0] === 'dashboard' ? 'home2' : it[1]);
const moreOn = computed(() => NAV2.some(([k]) => k === route.name));
const current = computed(
  () => [...items.value, ...NAV2].find(([k]) => k === route.name) || ['dashboard', 'dash', 'Dashboard'],
);
const moreOpen = ref(false);
const moreBtn = ref(null);
const menuOpen = ref(false);
const menuBtn = ref(null);
function open(k) {
  go(k, k === 'config' ? state.lastCfg || 'printer.cfg' : undefined);
  moreOpen.value = false;
  menuOpen.value = false;
}

// ---- size: the first level the tabs fit at ----
const box = ref(null);
const g0 = ref(null); // the tabs with names, measured
const g1 = ref(null); // the same, tighter
const ICON_TAB = 46;
const level = ref(0); // 0 names, 1 tighter, 2 icons, 3 one tab
function measure() {
  const have = box.value?.clientWidth || 0;
  if (!have || !g0.value || !g1.value) return;
  const need = [g0.value.offsetWidth, g1.value.offsetWidth, (items.value.length + 1) * ICON_TAB];
  const l = need.findIndex((w) => w <= have);
  level.value = l < 0 ? 3 : l;
}

// ---- the folder under the open tab ----
const track = ref(null);
const folder = ref({ left: 0, width: 0, show: false, anim: false });
let jump = true; // the next placing does not slide: first time, or the tabs changed size
function placeFolder() {
  const el = track.value?.querySelector('.tab.on');
  if (!el) {
    folder.value = { ...folder.value, show: false };
    jump = true;
    return;
  }
  folder.value = { left: el.offsetLeft, width: el.offsetWidth, show: true, anim: !jump };
  jump = false;
}
function refit() {
  measure();
  jump = true;
  nextTick(placeFolder);
}

let ro;
onMounted(() => {
  ro = new ResizeObserver(refit);
  ro.observe(box.value);
  refit();
  document.fonts?.ready.then(refit);
});
onBeforeUnmount(() => ro?.disconnect());
watch(
  () => [items.value.length, state.settings.lang, !!healthBadge.value],
  () => nextTick(refit),
);
watch(level, () => {
  jump = true;
  nextTick(placeFolder);
});
watch(
  () => route.name,
  () => nextTick(placeFolder),
);
</script>
<template>
  <nav ref="box" class="tt" :aria-label="t('Main')">
    <!-- the tabs with their names, out of sight, to measure them -->
    <div class="gw" aria-hidden="true">
      <div ref="g0" class="track l0">
        <span v-for="it in items" :key="it[0]" class="tab"
          ><Icon :name="icon(it)" :size="18" /><span class="lb">{{ label(it) }}</span></span
        ><span class="tab"
          ><Icon name="grid" :size="18" /><span class="lb">{{ t('More') }}</span></span
        >
      </div>
      <div ref="g1" class="track l1">
        <span v-for="it in items" :key="it[0]" class="tab"
          ><Icon :name="icon(it)" :size="18" /><span class="lb">{{ label(it) }}</span></span
        ><span class="tab"
          ><Icon name="grid" :size="18" /><span class="lb">{{ t('More') }}</span></span
        >
      </div>
    </div>

    <div v-if="level < 3" ref="track" class="track live" :class="'l' + level">
      <i
        v-if="folder.show"
        class="folder"
        :class="{ anim: folder.anim }"
        :style="{ left: folder.left + 'px', width: folder.width + 'px' }"
      ></i>
      <button
        v-for="it in items"
        :key="it[0]"
        class="tab"
        :class="{ on: route.name === it[0] }"
        :aria-current="route.name === it[0] ? 'page' : null"
        :aria-label="label(it)"
        @click="open(it[0])"
      >
        <Icon :name="icon(it)" :size="18" /><span class="lb">{{ label(it) }}</span
        ><span class="tip" aria-hidden="true">{{ label(it) }}</span
        ><span
          v-if="it[0] === 'health' && healthBadge"
          class="nb"
          :style="{ background: healthBadge.c, color: healthBadge.c === 'var(--s3)' ? 'var(--tx)' : null }"
          >{{ healthBadge.n }}</span
        >
      </button>
      <button
        ref="moreBtn"
        class="tab"
        :class="{ on: moreOn, open: moreOpen }"
        :aria-expanded="moreOpen"
        :aria-label="t('More')"
        @click.stop="moreOpen = !moreOpen"
      >
        <Icon name="grid" :size="18" /><span class="lb">{{ t('More') }}</span
        ><span class="tip" aria-hidden="true">{{ t('More') }}</span>
      </button>
    </div>

    <!-- the narrowest: one tab, the open page, that lists them all -->
    <div v-else class="track live l0">
      <i class="folder" style="left: 0; right: 0"></i>
      <button
        ref="menuBtn"
        class="tab on one"
        :aria-expanded="menuOpen"
        :aria-label="t('Pages')"
        @click.stop="menuOpen = !menuOpen"
      >
        <Icon :name="icon(current)" :size="18" /><span class="lb">{{ label(current) }}</span
        ><Icon name="down" :size="15" :stroke="2.4" class="chev" :class="{ up: menuOpen }" />
      </button>
    </div>

    <Popover v-if="moreOpen" :anchor="moreBtn" :width="230" @close="moreOpen = false">
      <button
        v-for="it in NAV2"
        :key="it[0]"
        class="btn clear mi"
        :class="{ cur: route.name === it[0] }"
        @click="open(it[0])"
      >
        <Icon :name="it[1]" :size="17" /><span class="grow">{{ t(it[2]) }}</span>
      </button>
    </Popover>
    <Popover v-if="menuOpen" :anchor="menuBtn" :width="250" @close="menuOpen = false">
      <button
        v-for="it in items"
        :key="it[0]"
        class="btn clear mi"
        :class="{ cur: route.name === it[0] }"
        @click="open(it[0])"
      >
        <Icon :name="icon(it)" :size="17" /><span class="grow">{{ t(it[2]) }}</span
        ><span
          v-if="it[0] === 'health' && healthBadge"
          class="nb"
          :style="{ background: healthBadge.c, color: healthBadge.c === 'var(--s3)' ? 'var(--tx)' : null }"
          >{{ healthBadge.n }}</span
        >
      </button>
      <div class="sep"></div>
      <button
        v-for="it in NAV2"
        :key="it[0]"
        class="btn clear mi"
        :class="{ cur: route.name === it[0] }"
        @click="open(it[0])"
      >
        <Icon :name="it[1]" :size="17" /><span class="grow">{{ t(it[2]) }}</span>
      </button>
    </Popover>
  </nav>
</template>
<style scoped>
.tt {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  align-self: stretch;
  display: flex;
  align-items: flex-end;
}
/* the measuring copies: out of sight and out of the layout */
.gw {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}
.gw > .track {
  position: absolute;
  left: 0;
  top: 0;
  width: max-content;
}
.track {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 2px;
}
/* the open page: one folder in the panel's colour that slides to it and opens into the panel with curved feet */
.folder {
  position: absolute;
  bottom: 0;
  height: 46px;
  background: var(--bg);
  border-radius: 14px 14px 0 0;
  z-index: 1;
}
.folder.anim {
  transition:
    left 0.38s cubic-bezier(0.3, 0.7, 0.2, 1),
    width 0.38s cubic-bezier(0.3, 0.7, 0.2, 1);
}
.folder::before,
.folder::after {
  content: '';
  position: absolute;
  bottom: 0;
  width: 14px;
  height: 14px;
}
.folder::before {
  left: -14px;
  border-bottom-right-radius: 14px;
  box-shadow: 6px 6px 0 6px var(--bg);
}
.folder::after {
  right: -14px;
  border-bottom-left-radius: 14px;
  box-shadow: -6px 6px 0 6px var(--bg);
}
.tab {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  height: 46px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  color: var(--mu);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.2s;
}
.tab :deep(svg) {
  flex-shrink: 0;
}
/* pointing at a tab: a light box floats in it, not joined to the panel, so it never looks like the open page */
.tab::before {
  content: '';
  position: absolute;
  inset: 8px 3px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--tx) 6%, transparent);
  opacity: 0;
  transform: scale(0.9);
  transition:
    opacity 0.18s,
    transform 0.25s cubic-bezier(0.3, 0.7, 0.2, 1);
  z-index: -1;
  pointer-events: none;
}
.tab:not(.on):hover,
.tab.open {
  color: var(--tx);
}
.tab:not(.on):hover::before,
.tab.open::before {
  opacity: 1;
  transform: none;
}
.tab:focus-visible {
  outline: none;
  color: var(--tx);
}
.tab:focus-visible::before {
  opacity: 1;
  transform: none;
  box-shadow: inset 0 0 0 2px var(--ac);
}
.tab.on {
  color: var(--tx);
  font-weight: 600;
}
/* level 1: tighter */
.l1 {
  gap: 0;
}
.l1 .tab {
  padding: 0 11px;
  gap: 6px;
  font-size: 13px;
}
/* level 2: icons only, the name shows above the tab on hover */
.l2 {
  gap: 0;
}
.l2 .tab {
  width: 46px;
  padding: 0;
  justify-content: center;
}
.l2 .tab .lb {
  display: none;
}
.tip {
  display: none;
}
.l2 .tip {
  display: block;
  position: absolute;
  left: 50%;
  bottom: calc(100% + 3px);
  padding: 3px 9px;
  border-radius: 8px;
  background: var(--s2);
  color: var(--tx);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0;
  transform: translate(-50%, 6px);
  transition:
    opacity 0.18s,
    transform 0.25s cubic-bezier(0.3, 0.7, 0.2, 1);
  pointer-events: none;
  z-index: 5;
}
.l2 .tab:hover .tip,
.l2 .tab:focus-visible .tip {
  opacity: 1;
  transform: translate(-50%, 0);
}
/* level 3: the one tab */
.one {
  padding: 0 14px 0 16px;
}
.chev {
  margin-left: 2px;
  transition: transform 0.25s;
}
.chev.up {
  transform: rotate(180deg);
}
/* the number of health issues on the tab's corner */
.tab .nb {
  position: absolute;
  top: 2px;
  right: 2px;
}
.nb {
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9px;
  color: #111;
  font-size: 10.5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mi {
  justify-content: flex-start;
  text-align: left;
  gap: 10px;
  height: 40px;
  color: var(--tx);
  font-weight: 600;
}
.mi.cur {
  background: var(--s2);
}
.sep {
  height: 1px;
  background: var(--bd);
  margin: 4px 0;
}
@media (prefers-reduced-motion: reduce) {
  .folder.anim,
  .tab::before,
  .tip,
  .chev {
    transition: none;
  }
}
</style>
