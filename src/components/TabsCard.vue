<script setup>
// A card with tabs: each tab shows one of the dashboard cards (a module or a custom card). Which cards exist
// comes from the dashboard (provide 'dashModules'); the active tab is remembered per card in this browser.
import { computed, inject, ref, watch } from 'vue';
import Icon from './Icon.vue';
import CustomCard from './CustomCard.vue';
import { state } from '../store';
import { t } from '../i18n';
const props = defineProps({ id: String });
const modules = inject('dashModules', {});
const c = computed(() => state.settings.customCards?.[props.id] || { type: 'tabs', tabs: [] });
const tabs = computed(() =>
  (c.value.tabs || []).filter((tb) => tb.card && (modules[tb.card] || state.settings.customCards?.[tb.card])),
);
const KEY = 'voyager-ui-tab-' + props.id;
let saved = null;
try {
  saved = localStorage.getItem(KEY);
} catch {}
const active = ref(saved && tabs.value.some((tb) => tb.id === saved) ? saved : tabs.value[c.value.active || 0]?.id);
watch(tabs, (l) => {
  if (!l.some((tb) => tb.id === active.value)) active.value = l[c.value.active || 0]?.id;
});
function pick(tb) {
  active.value = tb.id;
  try {
    localStorage.setItem(KEY, tb.id);
  } catch {}
}
const cur = computed(() => tabs.value.find((tb) => tb.id === active.value));
const nameOf = (card) =>
  card.startsWith('c_') ? state.settings.customCards?.[card]?.name || t('Custom') : t(modules[card]?.n || card);
</script>
<template>
  <section class="card tc">
    <div class="card-h">
      <div class="tabs" role="tablist">
        <button
          v-for="tb in tabs"
          :key="tb.id"
          role="tab"
          :aria-selected="tb.id === active"
          class="tab"
          :class="{ on: tb.id === active }"
          @click="pick(tb)"
        >
          <Icon v-if="tb.icon" :name="tb.icon" :size="15" :stroke="2.4" /><span>{{ tb.label || nameOf(tb.card) }}</span>
        </button>
      </div>
    </div>
    <div v-if="!tabs.length" class="empty">{{ t('No tabs yet. Edit this card to add some.') }}</div>
    <div v-else-if="cur" class="body" :key="cur.id">
      <CustomCard v-if="cur.card.startsWith('c_')" :id="cur.card" class="inner" />
      <component v-else :is="modules[cur.card].c" class="inner" />
    </div>
  </section>
</template>
<style scoped>
.tc {
  padding: 12px 12px 12px;
  gap: 8px;
  overflow: hidden;
}
.tc > .card-h {
  min-height: 0;
}
.tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
  min-width: 0;
}
.tabs::-webkit-scrollbar {
  display: none;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--mu);
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
}
.tab:hover {
  color: var(--tx);
  background: var(--s2);
}
.tab.on {
  color: var(--tx);
  background: var(--s2);
  box-shadow: inset 0 -2px 0 var(--ac);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
/* the card inside loses its own frame: the tabs card is the frame */
.body > :deep(.card),
.body > :deep(.inner) {
  flex: 1;
  min-height: 0;
  min-width: 0;
  background: transparent;
  border: none;
  padding: 4px 4px 0;
  border-radius: 0;
}
</style>
