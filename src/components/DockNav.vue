<script setup>
// Bottom dock menu style: the pages on a floating shelf at the bottom of the window, like the macOS dock. The top
// bar is left to the printer and its print. Pointing at a page lifts it a little and shows its name above it;
// the open page has a dot under it. Printer settings and config files sit after a divider.
import Icon from './Icon.vue';
import { state } from '../store';
import { route, go } from '../router';
import { t } from '../i18n';
import { NAV2, navItems, healthBadge } from '../nav';

const icon = (it) => (it[0] === 'dashboard' ? 'home2' : it[1]);
function open(k) {
  go(k, k === 'config' ? state.lastCfg || 'printer.cfg' : undefined);
}
</script>
<template>
  <nav class="dock" :aria-label="t('Main')">
    <template v-for="(group, gi) in [navItems, NAV2]" :key="gi">
      <span v-if="gi" class="sep" aria-hidden="true"></span>
      <button
        v-for="it in group"
        :key="it[0]"
        class="di"
        :class="{ on: route.name === it[0] }"
        :aria-current="route.name === it[0] ? 'page' : null"
        :aria-label="t(it[2])"
        @click="open(it[0])"
      >
        <Icon :name="icon(it)" :size="22" /><span class="tip" aria-hidden="true">{{ t(it[2]) }}</span
        ><span
          v-if="it[0] === 'health' && healthBadge"
          class="nb"
          :style="{ background: healthBadge.c, color: healthBadge.c === 'var(--s3)' ? 'var(--tx)' : null }"
          >{{ healthBadge.n }}</span
        >
      </button>
    </template>
  </nav>
</template>
<style scoped>
.dock {
  position: fixed;
  left: 50%;
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100vw - 24px);
  padding: 7px 9px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--s1) 82%, transparent);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid var(--bd);
  box-shadow:
    0 14px 34px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 color-mix(in srgb, var(--tx) 6%, transparent);
}
:root[data-theme='light'] .dock {
  box-shadow:
    0 12px 30px rgba(20, 24, 30, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
.di {
  position: relative;
  flex-shrink: 0;
  width: 50px;
  height: 50px;
  border: 0;
  border-radius: 14px;
  background: var(--s2);
  color: var(--mu);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition:
    transform 0.22s cubic-bezier(0.3, 0.7, 0.2, 1),
    color 0.15s,
    background 0.15s;
}
.di:hover,
.di:focus-visible {
  transform: translateY(-5px);
  color: var(--tx);
  outline: none;
}
.di:focus-visible {
  box-shadow: 0 0 0 2px var(--ac);
}
.di.on {
  color: var(--tx);
  background: var(--s3);
}
.di.on > :deep(svg) {
  color: var(--ac);
}
/* the open page: a dot under it */
.di.on::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  width: 4px;
  height: 4px;
  margin-left: -2px;
  border-radius: 50%;
  background: var(--tx);
}
.tip {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--s1);
  border: 1px solid var(--bd);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
  color: var(--tx);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0;
  transform: translate(-50%, 4px);
  transition:
    opacity 0.12s,
    transform 0.18s cubic-bezier(0.3, 0.7, 0.2, 1);
  pointer-events: none;
}
.di:hover .tip,
.di:focus-visible .tip {
  opacity: 1;
  transform: translate(-50%, 0);
}
.sep {
  width: 1px;
  height: 34px;
  margin: 0 3px;
  background: var(--bd);
}
.nb {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  color: #111;
  font-size: 10.5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
@media (prefers-reduced-motion: reduce) {
  .di,
  .tip {
    transition: none;
  }
}
</style>
