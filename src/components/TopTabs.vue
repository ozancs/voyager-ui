<script setup>
// Top tabs menu style: the pages as pills in the top bar. As many as fit are shown, the rest are under More; the
// page that is open always keeps a pill of its own (it takes the last place when it would be under More).
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import Popover from './Popover.vue';
import { state } from '../store';
import { route, go } from '../router';
import { t } from '../i18n';
import { NAV2, navItems, healthBadge } from '../nav';

const items = computed(() => [...navItems.value, ...NAV2]);
const label = (it) => t(it[3] || it[2]);
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
const fit = ref(items.value.length); // how many pills fit next to More
function measure() {
  const b = box.value,
    g = ghost.value;
  if (!b || !g) return;
  const pills = [...g.children];
  const more = pills.pop();
  const gap = parseFloat(getComputedStyle(g).columnGap) || 0;
  const w = pills.map((p) => p.offsetWidth);
  const have = b.clientWidth - 8; // less the padding for the focus ring
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
    <div ref="ghost" class="row-p ghost" aria-hidden="true">
      <span v-for="it in items" :key="it[0]" class="tp"
        >{{ label(it) }}<span v-if="it[0] === 'health' && healthBadge" class="nb">{{ healthBadge.n }}</span></span
      ><span class="tp">{{ t('More') }}<Icon name="down" :size="14" :stroke="2.4" /></span>
    </div>
    <div class="row-p">
      <button
        v-for="it in shown"
        :key="it[0]"
        class="tp"
        :class="{ on: route.name === it[0] }"
        :aria-current="route.name === it[0] ? 'page' : null"
        @click="open(it[0])"
      >
        {{ label(it)
        }}<span
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
        @click.stop="moreOpen = !moreOpen"
      >
        {{ t('More') }}<Icon name="down" :size="14" :stroke="2.4" />
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
  overflow: hidden; /* the measuring row is as long as all the pills */
  padding: 4px; /* room for the focus ring */
  margin: -4px;
}
.row-p {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ghost {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}
.tp {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 16px;
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
    background 0.12s,
    color 0.12s;
}
.tp:hover {
  background: var(--s2);
  color: var(--tx);
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
.tp :deep(svg) {
  margin-right: -4px;
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
