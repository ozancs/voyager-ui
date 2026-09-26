<script setup>
// Side menu: the pages, a badge with the number of health issues, and the footer (connection state,
// slow requests, "new version" hint that opens the update manager). Can be pinned, hidden or auto-hide.
import { ref, computed, onMounted, watch } from 'vue';
import Icon from './Icon.vue';
import { state, useApiEvent, activeTasks } from '../store';
import { healthIssues } from '../features';
import { route, go } from '../router';
import { api } from '../api/moonraker';
import { t } from '../i18n';
defineOptions({ inheritAttrs: false });
defineProps({ open: Boolean, mode: { type: String, default: 'pinned' } });
const emit = defineEmits(['close', 'pin']);
const NAV = [
  ['dashboard', 'dash', 'Dashboard'],
  ['webcam', 'cam', 'Webcam'],
  ['console', 'term', 'Console'],
  ['heightmap', 'hmap', 'Heightmap'],
  ['files', 'file', 'G-code Files'],
  ['viewer', 'cube', 'G-code Viewer'],
  ['history', 'clock', 'History'],
  ['machine', 'cpu', 'Machine'],
  ['health', 'heart', 'Health'],
];
const NAV2 = [
  ['quick', 'sliders', 'Printer settings'],
  ['config', 'code', 'Config files'],
];
function nav(n, a) {
  go(n, a ?? (n === 'config' ? state.lastCfg || 'printer.cfg' : undefined));
  emit('close');
}
const hBadge = computed(() => {
  const l = healthIssues.value;
  if (!l.length) return null;
  return {
    n: l.length,
    c: l.some((i) => i.level === 'error') ? 'var(--dg)' : l.some((i) => i.level === 'warn') ? 'var(--wn)' : 'var(--s3)',
  };
});
const tick = ref(Date.now());
setInterval(() => (tick.value = Date.now()), 250);
const slowTasks = computed(() => (state.booted ? activeTasks.value.filter((t) => tick.value - t.t > 400) : []));
</script>
<template>
  <nav v-bind="$attrs" class="sn" :class="[{ open }, mode !== 'pinned' && 'float', mode]" :aria-label="t('Main')">
    <div class="pinrow">
      <button
        class="pin"
        :aria-label="t('Show / hide the side menu')"
        :data-tip="mode === 'pinned' ? t('Hide menu') : t('Keep menu open')"
        @click="emit('pin')"
      >
        <Icon :name="mode === 'pinned' ? 'chevl2' : 'sidebar'" :size="16" :stroke="2.4" />
      </button>
    </div>
    <button v-for="[k, i, l] in NAV" :key="k" class="it" :class="{ on: route.name === k }" @click="nav(k)">
      <Icon :name="i" /><span>{{ t(l) }}</span
      ><span
        v-if="k === 'health' && hBadge"
        class="nb"
        :style="{ background: hBadge.c, color: hBadge.c === 'var(--s3)' ? 'var(--tx)' : null }"
        >{{ hBadge.n }}</span
      >
    </button>
    <div class="sep"></div>
    <button v-for="[k, i, l] in NAV2" :key="k" class="it" :class="{ on: route.name === k }" @click="nav(k)">
      <Icon :name="i" /><span>{{ t(l) }}</span>
    </button>
    <button
      class="it cz"
      :class="{ on: state.editDash }"
      @click="
        state.dashEditReq = Date.now();
        nav('dashboard');
      "
    >
      <Icon name="layout" /><span>{{ t('Customize dashboard') }}</span>
    </button>
    <button
      class="it"
      :class="{ on: !!state.settingsOpen }"
      @click="
        state.settingsOpen = 'general';
        emit('close');
      "
    >
      <Icon name="gear" /><span>{{ t('Interface settings') }}</span>
    </button>
    <div class="ft">
      <template v-if="slowTasks.length"
        ><Icon name="refresh" :size="13" class="spin" /><span class="tk"
          >{{ slowTasks[0].label }}…<template v-if="slowTasks.length > 1"> +{{ slowTasks.length - 1 }}</template></span
        ></template
      >
      <button
        v-else-if="state.uiUpdate && state.connected"
        class="up"
        :data-tip="t('Open the update manager')"
        @click="
          state.anchor = 'upd-' + state.uiUpdate.name;
          nav('machine');
        "
      >
        <Icon name="download" :size="13" /><span class="tk">{{
          t('Voyager UI {v} is out', { v: state.uiUpdate.remote })
        }}</span>
      </button>
      <template v-else
        ><span v-if="!state.connected" class="d" style="background: var(--dg)"></span
        >{{ state.connected ? t('Moonraker connected') : t('Connecting…') }}</template
      >
    </div>
  </nav>
  <div v-if="open && mode === 'hidden'" class="scrim" @click="emit('close')"></div>
</template>
<style scoped>
.sn {
  width: 232px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px 12px;
  background: var(--bg);
  border-right: 1px solid var(--bd);
  overflow-y: auto;
}
.it {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 42px;
  padding: 0 12px;
  background: transparent;
  color: var(--tx);
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  text-align: left;
  flex-shrink: 0;
}
.it :deep(svg) {
  color: var(--mu);
}
.it:hover {
  background: var(--s2);
}
.it.on {
  background: var(--s2);
  color: var(--tx);
  font-weight: 600;
}
.it.on :deep(svg) {
  color: var(--tx);
}
.nb {
  margin-left: auto;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  color: #111;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pinrow {
  display: flex;
  justify-content: flex-end;
  margin: -8px -4px 2px 0;
  flex-shrink: 0;
}
.pin {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--bd);
  background: var(--s1);
  color: var(--mu);
  display: flex;
  align-items: center;
  justify-content: center;
}
.pin:hover {
  color: var(--tx);
  border-color: var(--mu2);
}
@media (max-width: 1100px) {
  .pinrow {
    display: none;
  }
}
/* the top bar has no room for the Customize button on small screens, the menu has it instead */
.cz {
  display: none;
}
@media (max-width: 1100px) {
  .cz {
    display: flex;
  }
}
.sep {
  height: 1px;
  background: var(--bd);
  margin: 6px 4px;
  flex-shrink: 0;
}
.ft {
  flex-shrink: 0;
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 0;
  font-size: 12px;
  color: var(--mu);
}
.up {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: color-mix(in srgb, #f5b23a 14%, transparent);
  color: #f5b23a;
  font-weight: 600;
  font-size: 12px;
  padding: 6px 10px;
  margin: 0 -4px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}
.up:hover {
  background: color-mix(in srgb, #f5b23a 22%, transparent);
}
.tk {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.d {
  width: 8px;
  height: 8px;
  border-radius: 4px;
}
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 80;
}
/* hidden / auto-hide: the menu slides over the page instead of taking space */
.sn.float {
  position: fixed;
  left: 0;
  top: 140px;
  bottom: 0;
  z-index: 90;
  transform: translateX(-100%);
  transition:
    transform 0.18s ease-out,
    box-shadow 0.18s;
  border-right: 1px solid var(--bd);
  border-radius: 0 14px 0 0;
  background: var(--s1);
}
.sn.float.open {
  transform: none;
  box-shadow: 12px 0 40px rgba(0, 0, 0, 0.45);
}
@media (max-width: 1100px) {
  .sn.float {
    top: 0;
    border-radius: 0;
  }
  .scrim {
    background: rgba(0, 0, 0, 0.5);
  }
}
</style>
