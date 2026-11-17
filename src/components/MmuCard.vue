<script setup>
// Multi material units, found automatically:
//   Happy Hare (ERCF, Tradrack, ...) -> printer object "mmu"
//   AFC / Box Turtle                 -> printer objects "AFC" and "AFC_stepper <lane>" / "AFC_lane <lane>"
// Gates show colour, material and which tool uses them. Anything that moves filament needs a second click.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import GateFilament from './GateFilament.vue';
import MmuPath from './MmuPath.vue';
import MmuFeedback from './MmuFeedback.vue';
import MmuToolMap from './MmuToolMap.vue';
import MmuMenu from './MmuMenu.vue';
import Popover from './Popover.vue';
import { state, S, gcode, toast, isPrinting } from '../store';
import { api } from '../api/moonraker';
import { t } from '../i18n';

const kind = computed(() => (state.objects.includes('mmu') ? 'hh' : state.objects.includes('AFC') ? 'afc' : null));
const has = (c) => Object.keys(state.commands || {}).some((k) => k.toUpperCase() === c);
const armed = ref('');
async function run(cmd) {
  if (armed.value !== cmd) {
    armed.value = cmd;
    setTimeout(() => {
      if (armed.value === cmd) armed.value = '';
    }, 4000);
    return;
  }
  armed.value = '';
  open.value = null;
  try {
    await gcode(cmd);
  } catch (e) {
    toast(e.message, 'error');
  }
}
const open = ref(null); // gate index with its menu open
const openEl = ref(null); // that gate's tile: the popup opens next to it
function toggleGate(g, e) {
  if (open.value === g.id) open.value = null;
  else {
    openEl.value = e.currentTarget;
    open.value = g.id;
  }
}
const closeMenu = () => (open.value = null);
const openGate = computed(() => list.value.find((g) => g.id === open.value) || null);
onMounted(() => document.addEventListener('click', closeMenu));
onBeforeUnmount(() => document.removeEventListener('click', closeMenu));
const rgb = (c) => {
  if (!c) return null;
  if (Array.isArray(c))
    return `rgb(${c
      .slice(0, 3)
      .map((x) => Math.round(x * 255))
      .join(',')})`;
  const s = String(c).replace(/^#/, '');
  return /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s) ? '#' + s.slice(0, 6) : c;
};

// ---------------- Happy Hare
const m = computed(() => S('mmu'));
const STATUS = {
  '-1': ['Unknown', 'var(--mu2)'],
  0: ['Empty', 'var(--dg)'],
  1: ['Ready', 'var(--ok)'],
  2: ['Ready (buffer)', 'var(--ok)'],
};
const gates = computed(() => {
  const x = m.value;
  if (kind.value !== 'hh') return [];
  const n = x.num_gates || (x.gate_status || []).length;
  const ttg = x.ttg_map || [];
  return Array.from({ length: n }, (_, g) => ({
    id: g,
    label: String(g),
    status: x.gate_status?.[g] ?? -1,
    color: rgb(x.gate_color_rgb?.[g]) || rgb(x.gate_color?.[g]),
    material: x.gate_material?.[g] || '',
    name: x.gate_name?.[g] || '',
    temp: x.gate_temperature?.[g],
    spoolId: x.gate_spool_id?.[g],
    tools: ttg.map((gg, tool) => (gg === g ? tool : null)).filter((v) => v != null),
    current: x.gate === g,
  }));
});
const hhTool = computed(() => (m.value.tool === -2 ? t('Bypass') : m.value.tool >= 0 ? 'T' + m.value.tool : '?'));

// ---------------- AFC / Box Turtle
const lanes = computed(() => {
  if (kind.value !== 'afc') return [];
  const cur = S('AFC').current_load;
  return state.objects
    .filter((o) => /^AFC_(stepper|lane) /.test(o))
    .map((o, i) => {
      const l = S(o),
        name = l.name || o.split(' ').slice(1).join(' ');
      const ready = l.prep && l.load;
      return {
        id: name,
        label: name.replace(/^lane/i, ''),
        status: l.tool_loaded ? 1 : ready ? 1 : l.prep ? 2 : 0,
        color: rgb(l.color),
        material: l.material || '',
        weight: l.weight,
        spoolId: l.spool_id,
        tools: l.map ? [String(l.map).replace(/^T/i, '')] : [],
        current: cur === name || l.tool_loaded,
        loaded: !!l.tool_loaded,
        unit: l.unit,
        lstatus: l.status,
      };
    });
});
// ---------------- Spoolman: what is left on each gate's spool (vendor, weight, length), by the gate's spool id
const spools = ref({});
async function loadSpools() {
  if (!state.spoolman.server || !kind.value) return;
  try {
    const r = await api.call('server.spoolman.proxy', {
      request_method: 'GET',
      path: '/v1/spool?allow_archived=false',
      use_v2_response: true,
    });
    const map = {};
    for (const sp of Array.isArray(r.response) ? r.response : []) map[sp.id] = sp;
    spools.value = map;
  } catch {}
}
let spoolTimer = null;
onMounted(() => {
  loadSpools();
  spoolTimer = setInterval(loadSpools, 60000); // Spoolman's weights change while printing
});
onBeforeUnmount(() => clearInterval(spoolTimer));
watch(() => [state.spoolman.server, kind.value, (m.value.gate_spool_id || []).join(',')].join('|'), loadSpools);
function withSpool(g) {
  const sp = g.spoolId > 0 ? spools.value[g.spoolId] : null;
  if (!sp) return g;
  const full = sp.initial_weight || sp.filament?.weight;
  const left = sp.remaining_weight ?? g.weight;
  return {
    ...g,
    spool: sp,
    weight: left,
    full,
    length: sp.remaining_length,
    vendor: sp.filament?.vendor?.name || '',
    spoolName: sp.filament?.name || '',
    temp: g.temp || sp.filament?.settings_extruder_temp,
    pct: full > 0 && left != null ? Math.max(0, Math.min(100, (left / full) * 100)) : null,
  };
}
const list = computed(() => (kind.value === 'hh' ? gates.value : lanes.value).map(withSpool));
// the gate the details show: the one whose menu is open, otherwise the one in use
const detail = computed(() => list.value.find((g) => g.id === open.value) || list.value.find((g) => g.current) || null);
const isLoaded = computed(() => (kind.value === 'hh' ? m.value.filament === 'Loaded' : !!current.value?.loaded));
const loadedText = computed(() =>
  kind.value === 'hh' ? t(m.value.filament || 'Unknown') : current.value?.loaded ? t('Loaded') : t('Unloaded'),
);
const kg = (g) => (g >= 1000 ? +(g / 1000).toFixed(g % 1000 ? 1 : 0) + ' kg' : Math.round(g) + ' g');
// the spool circle: filled from the bottom as far as the spool is full, so a dark filament still shows its level
function spoolBg(g) {
  if (!g.color) return null;
  if (g.pct == null) return g.color;
  const p = g.pct.toFixed(1);
  return `linear-gradient(to top, ${g.color} 0 ${p}%, var(--s3) ${p}% 100%)`;
}
const toolLabel = (g) => (g.tools.length ? 'T' + g.tools[0] + (g.tools.length > 1 ? '+' : '') : '');
const current = computed(() => list.value.find((g) => g.current));

function gateActions(g) {
  const out = [];
  if (kind.value === 'hh') {
    for (const tool of g.tools)
      out.push({
        label: t('Load T{n}', { n: tool }),
        cmd: `MMU_CHANGE_TOOL TOOL=${tool}`,
        need: 'MMU_CHANGE_TOOL',
        icon: 'load',
      });
    out.push({ label: t('Select gate'), cmd: `MMU_SELECT GATE=${g.id}`, need: 'MMU_SELECT', icon: 'right' });
    out.push({ label: t('Check gate'), cmd: `MMU_CHECK_GATE GATE=${g.id}`, need: 'MMU_CHECK_GATE', icon: 'search' });
  } else {
    out.push({ label: t('Load to toolhead'), cmd: `CHANGE_TOOL LANE=${g.id}`, need: 'CHANGE_TOOL', icon: 'load' });
    if (g.loaded)
      out.push({
        label: t('Unload from toolhead'),
        cmd: `TOOL_UNLOAD LANE=${g.id}`,
        need: 'TOOL_UNLOAD',
        icon: 'unload',
      });
    out.push({ label: t('Eject lane'), cmd: `LANE_UNLOAD LANE=${g.id}`, need: 'LANE_UNLOAD', icon: 'up' });
  }
  return out.filter((a) => has(a.need));
}
const mainActions = computed(() => {
  if (kind.value === 'hh') {
    const x = m.value;
    return [
      ['MMU_LOAD', 'Load', 'load'],
      ['MMU_UNLOAD', 'Unload', 'unload'],
      ['MMU_EJECT', 'Eject', 'up'],
      ['MMU_HOME', 'Home', 'home'],
      ['MMU_CHECK_GATE ALL=1', 'Check all gates', 'search'],
      ['MMU_RECOVER', 'Recover', 'refresh'],
      ...(x.has_bypass ? [['MMU_SELECT_BYPASS', 'Bypass', 'right']] : []),
      ...(x.print_state === 'pause_locked' || x.is_locked ? [['MMU_UNLOCK', 'Unlock', 'lock']] : []),
    ].filter(([c]) => has(c.split(' ')[0]));
  }
  return [
    ['TOOL_UNLOAD', 'Unload', 'unload'],
    ['AFC_CALIBRATION', 'Calibrate', 'target'],
  ].filter(([c]) => has(c));
});
// editing what is loaded in a gate / lane
const editGate = ref(null);
const canSetFilament = computed(() =>
  kind.value === 'hh' ? has('MMU_GATE_MAP') : has('SET_COLOR') || has('SET_MATERIAL'),
);
const busy = computed(() => (kind.value === 'hh' ? m.value.action && m.value.action !== 'Idle' : false));
const toolMap = ref(false);
// the path needs Happy Hare's filament position; older versions without it keep the plain card
const hasPath = computed(() => kind.value === 'hh' && m.value.filament_pos != null);
</script>

<template>
  <section class="card mmu">
    <div class="card-h">
      <CardTitle :text="kind === 'afc' ? 'Box Turtle / AFC' : 'MMU'" />
      <!-- what is in use, in the middle of the header -->
      <div v-if="kind" class="hst">
        <b>{{ kind === 'hh' ? hhTool : current ? 'T' + (current.tools[0] ?? '?') : '-' }}</b>
        <span
          >{{ kind === 'hh' ? t('Gate') : t('Lane') }}
          {{ current?.label ?? (kind === 'hh' && m.gate === -2 ? t('Bypass') : '-') }}</span
        >
        <span :class="{ ld: isLoaded }">{{ loadedText }}</span>
      </div>
      <div class="acts">
        <span v-if="kind === 'hh'" class="chip" :style="{ color: busy ? 'var(--wn)' : 'var(--mu)' }"
          ><i></i>{{ m.enabled === false ? t('Disabled') : t(m.action || 'Idle') }}</span
        >
        <span v-if="kind === 'hh' && m.sync_drive" class="chip" :data-tip="t('Gear motor synced to the extruder')"
          >sync</span
        >
        <MmuMenu v-if="kind === 'hh'" :gates="gates" @tool-map="toolMap = true" @edit-gate="(g) => (editGate = g)" />
      </div>
      <CardCollapse />
    </div>
    <div v-if="!kind" class="empty">{{ t('No MMU found (Happy Hare or AFC).') }}</div>
    <template v-else>
      <!-- the unit's state and the spool of the gate in use (or of the gate whose menu is open) -->
      <div v-if="detail" class="now">
        <div v-if="detail" class="det" :class="{ solo: detail.weight == null }">
          <div class="dtx">
            <div class="dl1">
              <b class="dn">{{ detail.spoolName || detail.name || detail.material || t('Unknown') }}</b>
              <span v-if="detail.vendor" class="dv">{{ detail.vendor }}</span>
            </div>
            <div class="dl2">
              <span v-if="!detail.current" class="dg"
                >{{ kind === 'hh' ? t('Gate') : t('Lane') }} {{ detail.label }}</span
              >
              <span>{{ detail.material || '—' }}</span>
              <span v-if="detail.temp">{{ detail.temp }}°C</span>
              <span v-if="detail.spoolId > 0">#{{ detail.spoolId }}</span>
            </div>
          </div>
          <div v-if="detail.weight != null" class="dw">
            <span class="dwt"
              ><b>{{ kg(detail.weight) }}</b
              ><template v-if="detail.full"> / {{ kg(detail.full) }}</template></span
            >
            <i v-if="detail.pct != null" class="dbar"><i :style="{ width: detail.pct + '%' }"></i></i>
            <span v-if="detail.length" class="dlen">{{ Math.round(detail.length / 1000) }} m</span>
          </div>
        </div>
      </div>
      <MmuPath v-if="hasPath" :mmu="m" :color="current?.color" />
      <div
        v-else-if="kind === 'hh' && m.bowden_progress >= 0 && busy"
        class="bar state"
        :style="{ '--pst': 'var(--wn)' }"
      >
        <div :style="{ width: m.bowden_progress + '%' }"></div>
      </div>
      <MmuFeedback v-if="kind === 'hh'" :mmu="m" part="buffer" />
      <div v-if="kind === 'hh' && m.reason_for_pause && ['paused', 'pause_locked'].includes(m.print_state)" class="why">
        <Icon name="warn" :size="15" />{{ m.reason_for_pause }}
      </div>

      <div class="grow-gates">
        <div class="gates">
          <div
            v-for="g in list"
            :key="g.id"
            class="gate"
            :class="{ cur: g.current, gempty: g.status === 0, open: open === g.id }"
          >
            <button
              class="gb"
              :aria-label="
                (kind === 'hh' ? t('Gate') : t('Lane')) +
                ' ' +
                g.label +
                (g.tools.length ? ', T' + g.tools.join(', T') : '')
              "
              @click.stop="toggleGate(g, $event)"
            >
              <span class="tx">
                <b class="gn" :class="{ mu: !g.tools.length }">{{ toolLabel(g) || '–' }}</b>
                <span class="mat">{{ g.material || '—' }}</span>
              </span>
              <span
                class="spool"
                :style="{ background: spoolBg(g) || 'transparent' }"
                :class="{ none: !g.color }"
                :data-tip="g.pct != null ? Math.round(g.pct) + '% · ' + kg(g.weight) : null"
              ></span>
              <i
                class="st"
                :style="{ background: (STATUS[g.status] || STATUS[-1])[1] }"
                :aria-label="t((STATUS[g.status] || STATUS[-1])[0])"
              ></i>
            </button>
          </div>
        </div>

        <MmuFeedback v-if="kind === 'hh'" :mmu="m" part="gauges" />
      </div>
      <!-- a gate's actions: a popup next to its tile -->
      <Popover v-if="openGate" :anchor="openEl" :width="260" @close="open = null">
        <div class="gm" @click.stop>
          <div class="gh">
            <span
              class="spool"
              :class="{ none: !openGate.color }"
              :style="{ background: spoolBg(openGate) || 'transparent' }"
            ></span>
            <div class="ghx">
              <b>{{
                openGate.spoolName ||
                openGate.name ||
                openGate.material ||
                (kind === 'hh' ? t('Gate {n}', { n: openGate.label }) : openGate.id)
              }}</b>
              <span class="mu sm"
                >{{ kind === 'hh' ? t('Gate {n}', { n: openGate.label }) : openGate.id }} ·
                {{ t((STATUS[openGate.status] || STATUS[-1])[0])
                }}<template v-if="openGate.temp"> · {{ openGate.temp }}°</template
                ><template v-if="openGate.weight != null"> · {{ kg(openGate.weight) }}</template></span
              >
            </div>
          </div>
          <button
            v-for="a in gateActions(openGate)"
            :key="a.cmd"
            class="btn clear mi"
            :class="{ arm: armed === a.cmd }"
            :disabled="isPrinting"
            @click="run(a.cmd)"
          >
            <Icon :name="a.icon || 'right'" :size="16" />{{
              armed === a.cmd ? t('Tap again: {action}', { action: a.label }) : a.label
            }}
          </button>
          <button
            v-if="canSetFilament"
            class="btn clear mi"
            @click="
              editGate = openGate;
              open = null;
            "
          >
            <Icon name="pencil" :size="16" />{{ t('Set filament') }}
          </button>
          <span v-if="!gateActions(openGate).length && !canSetFilament" class="mu sm">{{
            t('No commands available for this unit.')
          }}</span>
        </div>
      </Popover>
      <div class="acts2">
        <button
          v-for="[c, l, ic] in mainActions"
          :key="c"
          class="btn"
          :class="{ acc: armed === c }"
          :disabled="isPrinting && !/RECOVER|UNLOCK/.test(c)"
          @click="run(c)"
        >
          <Icon :name="ic" :size="14" />{{ armed === c ? t('Again') : t(l) }}
        </button>
        <button v-if="kind === 'hh' && has('MMU_TTG_MAP')" class="btn" @click="toolMap = true">
          <Icon name="shuffle" :size="14" />{{ t('Tool map') }}
        </button>
      </div>
    </template>
    <GateFilament v-if="editGate" :gate="editGate" :kind="kind" @close="editGate = null" />
    <MmuToolMap v-if="toolMap" @close="toolMap = false" />
  </section>
</template>

<style scoped>
.hst {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  font-size: 13px;
  color: var(--mu);
  white-space: nowrap;
  overflow: hidden;
}
.hst b {
  font-size: 16px;
  color: var(--tx);
  font-variant-numeric: tabular-nums;
}
.hst .ld {
  color: var(--ok);
}
.now {
  display: flex;
  align-items: center;
  gap: 18px;
}
.det {
  /* two halves: the divider of the weight block is the middle of the card */
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
}
.dtx {
  justify-self: end;
  padding-right: 16px;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dl1 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.dn {
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dv {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mu);
  white-space: nowrap;
}
.dl2 {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 12.5px;
  color: var(--mu);
  font-variant-numeric: tabular-nums;
}
.dl2 .dg {
  color: var(--ac);
  font-weight: 600;
}
.det.solo {
  grid-template-columns: 1fr;
}
.det.solo .dtx {
  justify-self: center;
  padding-right: 0;
}
.dw {
  justify-self: start;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-left: 16px;
  border-left: 1px solid var(--bd);
  gap: 4px;
  font-size: 12.5px;
  color: var(--mu);
  font-variant-numeric: tabular-nums;
}
.dwt b {
  color: var(--tx);
  font-size: 14px;
}
.dbar {
  display: block;
  width: 120px;
  height: 5px;
  border-radius: 3px;
  background: var(--s3);
  overflow: hidden;
}
.dbar i {
  display: block;
  height: 100%;
  background: var(--ok);
}

.why {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--wn) 14%, transparent);
  font-size: 13px;
}
.why :deep(svg) {
  color: var(--wn);
}
.grow-gates {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.grow-gates > .gates {
  flex: 1 1 260px;
  min-width: 0;
}
.grow-gates > :last-child:not(.gates) {
  margin-left: auto;
}
.gates {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gate {
  flex: none;
  min-width: 96px;
  position: relative;
}
.gb {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 6px 10px;
  text-align: left;
  border: none;
  border-radius: 12px;
  background: var(--s2);
  color: var(--tx);
  position: relative;
}
.gb:hover {
  background: var(--s3);
}
.gate.cur .gb {
  box-shadow: inset 0 0 0 2px var(--ac);
}
.gate.gempty .gb {
  opacity: 0.55;
}
.spool {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 15px;
  /* a light rim, so a dark filament doesn't vanish into the tile */
  box-shadow:
    0 0 0 1.5px color-mix(in srgb, var(--tx) 28%, transparent),
    inset 0 0 0 1px rgba(0, 0, 0, 0.25);
}
.spool.none {
  box-shadow: inset 0 0 0 2px var(--mu2);
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0 4px,
    color-mix(in srgb, var(--mu2) 40%, transparent) 4px 6px
  ) !important;
}
.tx {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}
.gn {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.gn.mu {
  color: var(--mu2);
}
.mat {
  font-size: 11.5px;
  color: var(--mu);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.st {
  /* status: a badge on the spool's top-right */
  position: absolute;
  top: 5px;
  right: 6px;
  width: 9px;
  height: 9px;
  border-radius: 5px;
  box-shadow: 0 0 0 2px var(--s2);
}
.gb:hover .st {
  box-shadow: 0 0 0 2px var(--s3);
}
.gm {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.gh {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 2px 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--bd);
}
.ghx {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ghx b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mi {
  justify-content: flex-start;
  gap: 10px;
  height: 40px;
  color: var(--tx);
  font-weight: 600;
}
.btn.mi.arm,
.btn.mi.arm:hover {
  background: color-mix(in srgb, var(--ac) 18%, transparent);
  color: var(--ac);
}
.acts2 {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: auto;
}
/* small buttons, so the row fits on one line on a tablet */
.acts2 .btn {
  flex: 1 1 auto;
  height: 32px;
  padding: 0 9px;
  gap: 5px;
  font-size: 12.5px;
}
.sm {
  font-size: 12px;
}
.mu {
  color: var(--mu);
}
</style>
