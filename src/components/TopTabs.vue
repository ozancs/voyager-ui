<script setup>
// Top tabs menu style: the pages as pills in the top bar, an icon and the name. When they do not all fit they turn
// into round icons: pointing at one (or tabbing to it) opens its name over the icons beside it, without moving
// them, so the row never jumps under the pointer. When even the icons do not fit, the rest go under More; the page
// that is open always keeps a button of its own (it takes the last place when it would be under More).
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import Popover from './Popover.vue';
import { state } from '../store';
import { route, go } from '../router';
import { t } from '../i18n';
import { NAV2, navItems, healthBadge } from '../nav';

const items = computed(() => [...navItems.value, ...NAV2]);
const label = (it) => t(it[3] || it[2]);
const icon = (it) => (it[0] === 'dashboard' ? 'home2' : it[1]);
function open(k) {
  go(k, k === 'config' ? state.lastCfg || 'printer.cfg' : undefined);
  moreOpen.value = false;
}

const box = ref(null);
const ghost = ref(null);
const ICON_W = 44; // a round icon button
const MIN_NAMED = 6; // below this many pages with their names, all of them turn into icons
const iconMode = ref(false);
const fit = ref(items.value.length); // how many buttons are shown next to More
function measure() {
  const b = box.value,
    g = ghost.value;
  if (!b || !g) return;
  const gap = parseFloat(getComputedStyle(g).columnGap) || 0;
  const w = [...g.children].map((p) => p.offsetWidth);
  const have = b.clientWidth;
  // with names: all of them, or the first ones and More (a round icon) for the rest, as long as at least
  // MIN_NAMED keep their names. Fewer than that: icons only, which fit about three times as many.
  const all = w.reduce((a, x) => a + x, 0) + gap * (w.length - 1);
  if (all <= have) {
    iconMode.value = false;
    fit.value = w.length;
    return;
  }
  let used = ICON_W,
    n = 0;
  for (const x of w) {
    if (used + gap + x > have) break;
    used += gap + x;
    n++;
  }
  if (n >= Math.min(MIN_NAMED, w.length)) {
    iconMode.value = false;
    fit.value = n;
    return;
  }
  iconMode.value = true;
  const each = ICON_W + gap;
  fit.value =
    w.length * each - gap <= have ? w.length : Math.max(0, Math.min(w.length, Math.floor((have - ICON_W) / each)));
}
// the buttons shown: the first ones that fit, with the open page swapped in for the last one when it is further on
const shown = computed(() => {
  const l = items.value;
  if (fit.value >= l.length) return l;
  const s = l.slice(0, fit.value);
  const cur = l.findIndex(([k]) => k === route.name);
  if (cur >= fit.value && s.length) s[s.length - 1] = l[cur];
  return s;
});
const rest = computed(() => items.value.filter((it) => !shown.value.includes(it)));
const restOn = computed(() => rest.value.some(([k]) => k === route.name));
const moreOpen = ref(false);
const moreBtn = ref(null);

let ro;
onMounted(() => {
  ro = new ResizeObserver(() => measure());
  ro.observe(box.value);
  measure();
  document.fonts?.ready.then(measure);
});
onBeforeUnmount(() => ro?.disconnect());
watch(
  () => [items.value.length, state.settings.lang, !!healthBadge.value],
  () => nextTick(measure),
);
</script>
<template>
  <nav ref="box" class="tt" :aria-label="t('Main')">
    <!-- every page with its name, out of sight, to measure them -->
    <div class="gw" aria-hidden="true">
      <div ref="ghost" class="row-p">
        <span v-for="it in items" :key="it[0]" class="tp"
          ><span class="face"
            ><Icon :name="icon(it)" :size="19" /><span class="lb">{{ label(it) }}</span></span
          ></span
        >
      </div>
    </div>
    <div class="row-p live">
      <button
        v-for="it in shown"
        :key="it[0]"
        class="tp"
        :class="{ on: route.name === it[0], ic: iconMode }"
        :aria-current="route.name === it[0] ? 'page' : null"
        :aria-label="label(it)"
        @click="open(it[0])"
      >
        <span class="face"
          ><Icon :name="icon(it)" :size="19" /><span class="lb">{{ label(it) }}</span></span
        ><span
          v-if="it[0] === 'health' && healthBadge"
          class="nb"
          :style="{ background: healthBadge.c, color: healthBadge.c === 'var(--s3)' ? 'var(--tx)' : null }"
          >{{ healthBadge.n }}</span
        >
      </button>
      <button
        v-if="rest.length"
        ref="moreBtn"
        class="tp ic"
        :class="{ on: restOn, open: moreOpen }"
        :aria-expanded="moreOpen"
        :aria-label="t('More')"
        @click.stop="moreOpen = !moreOpen"
      >
        <span class="face"
          ><Icon name="grid" :size="19" /><span class="lb">{{ t('More') }}</span></span
        >
      </button>
    </div>
    <Popover v-if="moreOpen" :anchor="moreBtn" :width="230" @close="moreOpen = false">
      <button
        v-for="it in rest"
        :key="it[0]"
        class="btn clear mi"
        :class="{ cur: route.name === it[0] }"
        @click="open(it[0])"
      >
        <Icon :name="it[1]" :size="17" /><span class="grow">{{ t(it[2]) }}</span
        ><span
          v-if="it[0] === 'health' && healthBadge"
          class="nb"
          :style="{ background: healthBadge.c, color: healthBadge.c === 'var(--s3)' ? 'var(--tx)' : null }"
          >{{ healthBadge.n }}</span
        >
      </button>
    </Popover>
  </nav>
</template>
<style scoped>
.tt {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
}
.row-p {
  display: flex;
  align-items: center;
  gap: 6px;
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
.gw > * {
  position: absolute;
  left: 0;
  top: 0;
}
.live {
  position: relative;
  z-index: 2; /* an icon's name opening over the status box beside the tabs is drawn above it */
}
.tp {
  position: relative;
  flex-shrink: 0;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
/* what is seen: the pill with the icon and the name */
.face {
  display: inline-flex;
  align-items: center;
  height: 44px;
  padding: 0 16px 0 12.5px;
  border-radius: 999px;
  background: var(--s1);
  color: var(--mu);
  white-space: nowrap;
  transition:
    background 0.15s,
    color 0.15s,
    padding 0.25s ease,
    box-shadow 0.2s;
}
.face :deep(svg) {
  flex-shrink: 0;
}
.lb {
  display: inline-block;
  margin-left: 8px;
  overflow: hidden;
}
.tp:hover .face,
.tp:focus-visible .face {
  background: var(--s2);
  color: var(--tx);
}
.tp:focus-visible {
  outline: none;
}
.tp:focus-visible .face {
  outline: 2px solid var(--ac);
  outline-offset: 2px;
}
.tp.on .face {
  background: var(--tx);
  color: var(--bg);
  font-weight: 600;
}
.tp.open .face {
  background: var(--s2);
  color: var(--tx);
}
/* icons only: the button keeps an icon's width; its name opens over the buttons to its right (it does not take
   the pointer, so they can still be pointed at) and none of them move */
.tp.ic {
  width: 44px;
}
.tp.ic .face {
  position: absolute;
  left: 0;
  top: 0;
  padding: 0 12.5px;
  pointer-events: none;
}
.tp.ic .lb {
  max-width: 0;
  margin-left: 0;
  opacity: 0;
  transition:
    max-width 0.26s ease,
    margin-left 0.26s ease,
    opacity 0.18s ease;
}
.tp.ic:hover .face,
.tp.ic:focus-visible .face {
  z-index: 3;
  padding-right: 16px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
}
.tp.ic:hover .lb,
.tp.ic:focus-visible .lb {
  max-width: 180px;
  margin-left: 8px;
  opacity: 1;
}
/* the number of health issues sits on the button's corner */
.tp .nb {
  position: absolute;
  top: -3px;
  right: -3px;
  z-index: 4;
}
.nb {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  color: #111;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
@media (prefers-reduced-motion: reduce) {
  .face,
  .lb {
    transition: none !important;
  }
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
</style>
