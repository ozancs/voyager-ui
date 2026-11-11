<script setup>
// Side menu: the pages, a badge with the number of health issues, and the footer (connection state,
// slow requests, "new version" hint that opens the update manager). Can be pinned, hidden or auto-hide.
// side: pinned on a wide screen, the menu runs the full height of the window as a floating panel with the printer
// at its top; rail is its collapsed form, icons only, each page's name showing on hover.
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import PrinterBrand from './PrinterBrand.vue';
import { state, useApiEvent, activeTasks } from '../store';
import { NAV2, navItems, healthBadge } from '../nav';
import { route, go } from '../router';
import { api } from '../api/moonraker';
import { t } from '../i18n';
defineOptions({ inheritAttrs: false });
const props = defineProps({
  open: Boolean,
  mode: { type: String, default: 'pinned' },
  side: Boolean,
  rail: Boolean,
});
const emit = defineEmits(['close', 'pin', 'rail']);
function nav(n, a) {
  go(n, a ?? (n === 'config' ? state.lastCfg || 'printer.cfg' : undefined));
  emit('close');
}
const hBadge = healthBadge;
// a short window: everything in the menu gets smaller together until it fits, instead of a scrollbar (down to
// 60 %; below that it scrolls after all). Not for the menu that slides over the page.
const navEl = ref(null);
const zoom = ref(1);
function fitNav() {
  const el = navEl.value;
  if (!el || (props.mode !== 'pinned' && !props.side)) return (zoom.value = 1);
  const kids = [...el.children];
  for (const k of kids) k.style.zoom = '';
  const pad = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
  const need = el.scrollHeight - pad,
    have = el.clientHeight - pad;
  const z = need > have + 1 ? Math.max(0.6, Math.floor(((have - 2) / need) * 100) / 100) : 1;
  let zz = z;
  if (zz < 1) for (const k of kids) k.style.zoom = String(zz);
  // the gaps and borders do not shrink: step down while it still does not fit
  for (let i = 0; i < 8 && zz > 0.6 && el.scrollHeight > el.clientHeight + 1; i++) {
    zz = Math.max(0.6, Math.round((zz - 0.03) * 100) / 100);
    for (const k of kids) k.style.zoom = String(zz);
  }
  zoom.value = zz;
}
let navRo;
onMounted(() => {
  navRo = new ResizeObserver(() => fitNav());
  if (navEl.value) navRo.observe(navEl.value);
  fitNav();
});
onBeforeUnmount(() => navRo?.disconnect());
watch(
  () => [props.rail, props.side, props.mode, navItems.value.length],
  () => nextTick(fitNav),
);
const tick = ref(Date.now());
setInterval(() => (tick.value = Date.now()), 250);
const slowTasks = computed(() => (state.booted ? activeTasks.value.filter((t) => tick.value - t.t > 400) : []));
</script>
<template>
  <nav
    ref="navEl"
    v-bind="$attrs"
    class="sn"
    :class="[{ open, side, rail: side && rail }, mode !== 'pinned' && !side && 'float', mode]"
    :aria-label="t('Main')"
  >
    <PrinterBrand v-if="side" :rail="rail" />
    <div v-if="side && !rail" class="sl">{{ t('Printer') }}</div>
    <div v-if="!side" class="pinrow">
      <button
        class="pin"
        :aria-label="t('Show / hide the side menu')"
        :data-tip="mode === 'pinned' ? t('Hide menu') : t('Keep menu open')"
        @click="emit('pin')"
      >
        <Icon :name="mode === 'pinned' ? 'chevl2' : 'sidebar'" :size="16" :stroke="2.4" />
      </button>
    </div>
    <button v-for="[k, i, l] in navItems" :key="k" class="it" :class="{ on: route.name === k }" @click="nav(k)">
      <Icon :name="i" /><span>{{ t(l) }}</span
      ><span
        v-if="k === 'health' && hBadge"
        class="nb"
        :style="{ background: hBadge.c, color: hBadge.c === 'var(--s3)' ? 'var(--tx)' : null }"
        >{{ hBadge.n }}</span
      >
    </button>
    <!-- the setup group sits at the bottom, apart from the pages above (push: takes the free space above it) -->
    <div v-if="!side" class="sep push"></div>
    <div v-else-if="!rail" class="sl push">{{ t('Setup') }}</div>
    <div v-else class="sep push"></div>
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
      <Icon name="customize" /><span>{{ t('Customize dashboard') }}</span>
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
      <button
        v-if="side"
        class="rl"
        :aria-label="rail ? t('Expand menu') : t('Collapse menu')"
        :data-tip="rail ? t('Expand menu') : t('Collapse menu')"
        @click="emit('rail')"
      >
        <Icon :name="rail ? 'chevr2' : 'chevl2'" :size="16" :stroke="2.4" />
      </button>
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
  font-weight: 600;
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
.sep.push,
.sl.push {
  margin-top: auto;
}
.ft {
  flex-shrink: 0;
  margin-top: 8px;
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
/* phone: More at the bottom right opens the menu as a sheet from the bottom, where the thumb already is, sitting
   on the bottom bar so More closes it again */
@media (max-width: 720px) {
  .sn.float {
    top: auto;
    left: 0;
    right: 0;
    bottom: calc(61px + env(safe-area-inset-bottom));
    width: auto;
    max-height: 72vh;
    border-right: 0;
    border-top: 1px solid var(--bd);
    border-radius: 18px 18px 0 0;
    transform: translateY(calc(100% + 70px));
    padding-bottom: 10px;
  }
  .sn.float.open {
    transform: none;
    box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.45);
  }
  .scrim {
    bottom: calc(61px + env(safe-area-inset-bottom));
  }
}
/* side: the full height panel, apart from the page, with the printer at the top */
.sn.side {
  width: 248px;
  margin: 12px 0 12px 12px;
  padding: 12px 12px 12px;
  border: 1px solid var(--bd);
  border-radius: 20px;
  background: linear-gradient(180deg, var(--s1), var(--bg));
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  position: relative;
  z-index: 95; /* the page names of the rail show over the page */
}
.sl {
  font-size: 11.5px;
  color: var(--mu);
  padding: 10px 12px 4px;
  flex-shrink: 0;
}
.side .it {
  position: relative;
}
.side .it.on {
  background: color-mix(in srgb, var(--ac) 14%, var(--s2));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ac) 40%, transparent);
}
.side .it.on::before {
  content: '';
  position: absolute;
  left: -13px;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--ac);
}
.side .ft {
  padding: 10px 2px 0 8px;
}
.rl {
  order: 2;
  margin-left: auto;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid var(--bd);
  background: transparent;
  color: var(--mu);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.rl:hover {
  color: var(--tx);
  border-color: var(--mu2);
}
/* rail: icons only, the name of a page beside it on hover */
.sn.rail {
  width: 70px;
  padding: 12px 10px;
  align-items: center;
  overflow: visible;
}
.rail .it {
  width: 48px;
  height: 46px;
  padding: 0;
  justify-content: center;
}
.rail .it > span:first-of-type {
  display: none;
  position: absolute;
  left: 58px;
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  background: var(--s3);
  color: var(--tx);
  padding: 7px 11px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
.rail .it:hover > span:first-of-type,
.rail .it:focus-visible > span:first-of-type {
  display: block;
}
.rail .it.on::before {
  left: -11px;
}
.rail .nb {
  position: absolute;
  top: 3px;
  right: 1px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
}
.rail .sep {
  width: 36px;
}
.rail .ft {
  font-size: 0; /* the connection text has no room */
  padding: 10px 0 0;
  justify-content: center;
}
.rail .ft > :not(.rl) {
  display: none;
}
.rail .rl {
  margin: 0;
}
</style>
