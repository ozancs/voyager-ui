<script setup>
// Active Spoolman spool: filament name, colour, remaining weight. Only shown when Moonraker has
// a [spoolman] section.
defineOptions({ inheritAttrs: false });
import { computed } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import { state } from '../store';
import { t } from '../i18n';

const sp = computed(() => state.spoolman.spool);
const pct = computed(() =>
  sp.value?.initial_weight
    ? Math.max(0, Math.min(100, (sp.value.remaining_weight / sp.value.initial_weight) * 100))
    : null,
);
const color = computed(() => '#' + (sp.value?.filament?.color_hex || '777777'));
const openPick = () => (state.spoolPick = true); // SpoolPicker.vue, in App.vue
</script>

<template>
  <section v-bind="$attrs" class="card t-spool">
    <div class="card-h">
      <CardTitle :text="t('Spool')" />
      <button class="btn" @click="openPick"><Icon name="spool" :size="16" />{{ t('Change') }}</button>
      <CardCollapse />
    </div>
    <div v-if="sp" class="row" style="gap: 16px">
      <div class="reel" :style="{ '--c': color }"><div></div></div>
      <div class="col grow" style="gap: 4px; min-width: 0">
        <b style="font-size: 16px"
          >{{ sp.filament?.name || t('Spool') }} <span class="mu">#{{ sp.id }}</span></b
        >
        <span class="mu">{{ [sp.filament?.vendor?.name, sp.filament?.material].filter(Boolean).join(' · ') }}</span>
        <div class="bar"><div :style="{ width: (pct ?? 0) + '%', background: 'var(--spool)' }"></div></div>
        <span class="mono"
          >{{ Math.round(sp.remaining_weight || 0) }} g
          <span class="mu">/ {{ Math.round(sp.initial_weight || 0) }} g</span></span
        >
      </div>
    </div>
    <div v-else class="empty">
      {{ state.spoolman.server ? t('No active spool') : t('Spoolman is not set up in moonraker.conf') }}
    </div>
  </section>
</template>

<style scoped>
.reel {
  width: 64px;
  height: 64px;
  border-radius: 32px;
  background: var(--c);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 6px rgba(0, 0, 0, 0.25);
}
.reel div {
  width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--spool-bg);
}
.mu {
  color: var(--mu);
  font-size: 12.5px;
  font-weight: 400;
}
</style>
