<script setup>
// Phone: a bar at the bottom with the pages used most and a "More" button that opens the full menu. Replaces
// reaching for the hamburger in the top left with one thumb. Which four pages, and their order: Customize > Phone
// (phonePages in nav.js); the others are under More.
import { computed } from 'vue';
import Icon from './Icon.vue';
import { route, go } from '../router';
import { healthIssues } from '../features';
import { phonePages } from '../nav';
import { state } from '../store';
import { t } from '../i18n';
const emit = defineEmits(['menu']);
// [route, icon, short label]
const ITEMS = computed(() => phonePages.value.slice(0, 4).map(([k, i, l, short]) => [k, i, short || l]));
const badge = computed(() => healthIssues.value.length);
const healthIn = computed(() => ITEMS.value.some(([k]) => k === 'health'));
const more = computed(() => !ITEMS.value.some(([k]) => k === route.name));
function open(k) {
  go(k, k === 'config' ? state.lastCfg || 'printer.cfg' : undefined);
}
</script>
<template>
  <nav class="bnav" :aria-label="t('Pages')">
    <button
      v-for="[k, ic, l] in ITEMS"
      :key="k"
      :class="{ on: route.name === k }"
      :aria-current="route.name === k ? 'page' : null"
      @click="open(k)"
    >
      <span class="ic"
        ><Icon :name="ic" :size="20" :stroke="2.2" /><i v-if="k === 'health' && badge" class="bd"></i></span
      ><span>{{ t(l) }}</span>
    </button>
    <button :class="{ on: more }" :aria-label="t('Menu')" @click="emit('menu')">
      <span class="ic"><Icon name="menu" :size="20" :stroke="2.2" /><i v-if="badge && !healthIn" class="bd"></i></span
      ><span>{{ t('More') }}</span>
    </button>
  </nav>
</template>
<style scoped>
.bnav {
  display: none;
}
@media (max-width: 720px) {
  .bnav {
    position: sticky;
    bottom: 0;
    z-index: 30;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    background: var(--s1);
    border-top: 1px solid var(--bd);
    padding: 4px 4px calc(4px + env(safe-area-inset-bottom));
    flex-shrink: 0;
  }
}
.bnav button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  height: 52px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--mu);
  font-size: 10.5px;
  font-weight: 600;
}
.bnav button.on {
  color: var(--ac);
  background: var(--s2);
}
.ic {
  position: relative;
  display: inline-flex;
}
.bd {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--wn);
}
</style>
