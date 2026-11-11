<script setup>
// Top tabs menu style: the pages as round icon buttons in the top bar. Pointing at one (or tabbing to it) widens
// it to show its name, and it narrows back when the pointer leaves. As many as fit are shown, the rest are under
// More; the page that is open always keeps a button of its own (it takes the last place when it would be under More).
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
function customize() {
  moreOpen.value = false;
  go('dashboard');
  state.dashEditReq = Date.now();
}
function open(k) {
  go(k, k === 'config' ? state.lastCfg || 'printer.cfg' : undefined);
  moreOpen.value = false;
}

const box = ref(null);
const ghost = ref(null);
const lbl = ref(null); // the widest name, measured
const fit = ref(items.value.length); // how many pills fit next to More
function measure() {
  const b = box.value,
    g = ghost.value;
  if (!b || !g) return;
  const pills = [...g.children];
  const more = pills.pop();
  const gap = parseFloat(getComputedStyle(g).columnGap) || 0;
  const w = pills.map((p) => p.offsetWidth);
  // less some room for a name opening on hover: a long one may reach a little
  // over the status box next to the tabs for as long as it is pointed at, the row is drawn above it
  const have = b.clientWidth - Math.min(lbl.value?.offsetWidth || 0, 64);
  let used = more.offsetWidth; // More is always there: it also holds Customize dashboard
  let n = 0;
  for (const x of w) {
    if (used + gap + x > have) break;
    used += gap + x;
    n++;
  }
  fit.value = n;
}
// the pills shown: the first ones that fit, with the open page swapped in for the last one when it is further on
const shown = computed(() => {
  const l = items.value;
  if (fit.value >= l.length) return l;
  const s = l.slice(0, fit.value);
  const cur = l.findIndex(([k]) => k === route.name);
  if (cur >= fit.value && s.length) s[s.length - 1] = l[cur];
  return s;
});
const rest = computed(() => items.value.filter((it) => !shown.value.includes(it)));
const widestLabel = computed(() =>
  [...items.value.map(label), t('More')].reduce((a, b) => (b.length > a.length ? b : a), ''),
);
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
    <!-- every pill once, out of sight, to measure them -->
    <div class="gw" aria-hidden="true">
      <div ref="ghost" class="row-p">
        <span v-for="it in items" :key="it[0]" class="tp"><Icon :name="icon(it)" :size="19" /></span
        ><span class="tp"><Icon name="grid" :size="19" /></span>
      </div>
      <span ref="lbl" class="lb-m">{{ widestLabel }}</span>
    </div>
    <div class="row-p live">
      <button
        v-for="it in shown"
        :key="it[0]"
        class="tp"
        :class="{ on: route.name === it[0] }"
        :aria-current="route.name === it[0] ? 'page' : null"
        :aria-label="label(it)"
        @click="open(it[0])"
      >
        <Icon :name="icon(it)" :size="19" /><span class="lb">{{ label(it) }}</span
        ><span
          v-if="it[0] === 'health' && healthBadge"
          class="nb"
          :style="{ background: healthBadge.c, color: healthBadge.c === 'var(--s3)' ? 'var(--tx)' : null }"
          >{{ healthBadge.n }}</span
        >
      </button>
      <button
        ref="moreBtn"
        class="tp"
        :class="{ on: restOn, open: moreOpen }"
        :aria-expanded="moreOpen"
        :aria-label="t('More')"
        @click.stop="moreOpen = !moreOpen"
      >
        <Icon name="grid" :size="19" /><span class="lb">{{ t('More') }}</span>
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
      <div v-if="rest.length" class="sep"></div>
      <button class="btn clear mi" :class="{ cur: state.editDash }" @click="customize">
        <Icon name="customize" :size="17" /><span class="grow">{{ t('Customize dashboard') }}</span>
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
  z-index: 2; /* a name opening over the status box beside the tabs is drawn above it */
}
.tp {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 44px;
  padding: 0 12px;
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  background: var(--s1);
  color: var(--mu);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    padding 0.25s ease;
}
.tp :deep(svg) {
  flex-shrink: 0;
}
/* the name: no width until the button is pointed at, then it slides out beside the icon */
.lb {
  display: inline-block;
  max-width: 0;
  margin-left: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-width 0.28s ease,
    margin-left 0.28s ease,
    opacity 0.18s ease;
}
.lb-m {
  font-size: 14px;
  font-weight: 600;
  padding-left: 30px; /* the name, its gap and the wider padding */
  white-space: nowrap;
}
.tp:hover,
.tp:focus-visible {
  background: var(--s2);
  color: var(--tx);
  padding: 0 16px 0 13px;
}
.tp:hover .lb,
.tp:focus-visible .lb {
  max-width: 180px;
  margin-left: 8px;
  opacity: 1;
}
.tp.on {
  background: var(--tx);
  color: var(--bg);
  font-weight: 600;
}
.tp.open {
  background: var(--s2);
  color: var(--tx);
}
/* the number of health issues sits on the icon's corner */
.tp .nb {
  position: absolute;
  top: -3px;
  right: -3px;
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
  .tp,
  .lb {
    transition: none;
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
.sep {
  height: 1px;
  background: var(--bd);
  margin: 4px 0;
}
.mi.cur {
  background: var(--s2);
}
</style>
