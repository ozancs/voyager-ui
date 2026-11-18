<script setup>
// The ⋮ menu of the MMU card (Happy Hare), with what Happy Hare's own panel offers there:
//   Map tools        -> the tool map dialog (MmuToolMap)
//   Edit filaments   -> every gate, each opening the filament editor (GateFilament)
//   Fix MMU state    -> tell Happy Hare what is really loaded: MMU_RECOVER TOOL= GATE= [LOADED=0|1]
//   MMU maintenance  -> selector (home, grip / release or servo up / down / move), gear motor sync, extruder-only
//                       load / unload, MMU motors on / off
//   Print stats      -> MMU_STATS SHOWCOUNTS=1 (the answer goes to the console)
//   Sync Spoolman    -> MMU_SPOOLMAN REFRESH=1 QUIET=1 (only with Spoolman support on)
//   Check all gates  -> MMU_CHECK_GATE ALL=1, after a confirmation: it moves filament in every gate
// Entries whose command this Happy Hare doesn't have are left out.
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import Popover from './Popover.vue';
import { state, S, gcode, toast, isPrinting } from '../store';
import { t } from '../i18n';

const props = defineProps({ gates: Array });
const emit = defineEmits(['toolMap', 'editGate']);
const m = computed(() => S('mmu'));
const has = (c) => Object.keys(state.commands || {}).some((k) => k.toUpperCase() === c);
const btn = ref(null);
const open = ref(false);
const dlg = ref(''); // 'filaments' | 'recover' | 'maint' | 'check'
const off = computed(() => m.value.enabled === false);

async function send(cmd, done) {
  if (
    off.value ||
    (isPrinting.value &&
      /^(MMU_CHECK_GATE|MMU_HOME|MMU_GRIP|MMU_RELEASE|MMU_SERVO|MMU_SYNC_GEAR_MOTOR|MMU_LOAD|MMU_UNLOAD|MMU_MOTORS_ON|MMU_MOTORS_OFF)\b/.test(
        cmd,
      ))
  )
    return;
  try {
    await gcode(cmd);
    if (done) toast(done);
  } catch (e) {
    toast(e.message, 'error');
  }
}
function pick(fn) {
  open.value = false;
  fn();
}

const spoolman = computed(() => has('MMU_SPOOLMAN') && m.value.spoolman_support && m.value.spoolman_support !== 'off');

// ---- Fix MMU state: what is loaded right now, as Happy Hare should believe it
const nGates = computed(() => m.value.num_gates || (m.value.gate_status || []).length || props.gates?.length || 0);
const nTools = computed(() => (m.value.ttg_map || []).length || nGates.value);
const rec = ref({ tool: -1, gate: -1, pos: 'keep' });
function openRecover() {
  rec.value = {
    tool: m.value.tool ?? -1,
    gate: m.value.gate ?? -1,
    pos: m.value.filament === 'Loaded' ? 'loaded' : m.value.filament === 'Unloaded' ? 'unloaded' : 'keep',
  };
  dlg.value = 'recover';
}
function recover() {
  const r = rec.value;
  let cmd = `MMU_RECOVER TOOL=${r.tool} GATE=${r.gate}`;
  if (r.pos !== 'keep') cmd += ` LOADED=${r.pos === 'loaded' ? 1 : 0}`;
  dlg.value = '';
  send(cmd, t('MMU state set'));
}
// the tool that maps to a gate, for the gate list of the dialog
const toolsOf = (g) => (m.value.ttg_map || []).map((x, i) => (x === g ? 'T' + i : null)).filter(Boolean);

// ---- MMU maintenance
const unit = computed(() => S('mmu_machine').unit_0 || {});
const selector = computed(() => unit.value.selector_type || '');
const gripSelector = computed(() => ['RotarySelector', 'ServoSelector'].includes(selector.value));
const servoSelector = computed(() => selector.value === 'LinearSelector');
const MAINT = computed(() =>
  [
    {
      title: 'Selector',
      state: gripSelector.value ? m.value.grip : servoSelector.value ? m.value.servo : null,
      show: has('MMU_HOME'),
      btns: [
        ['MMU_HOME', 'Home'],
        ...(gripSelector.value
          ? [
              ['MMU_GRIP', 'Grip'],
              ['MMU_RELEASE', 'Release'],
            ]
          : []),
        ...(servoSelector.value
          ? [
              ['MMU_SERVO POS=up', 'Servo up'],
              ['MMU_SERVO POS=down', 'Servo down'],
              ['MMU_SERVO POS=move', 'Servo move'],
            ]
          : []),
      ],
    },
    {
      title: 'Gear motor sync to extruder',
      state: m.value.sync_drive ? t('Synced') : t('Not synced'),
      show: has('MMU_SYNC_GEAR_MOTOR'),
      btns: [
        ['MMU_SYNC_GEAR_MOTOR SYNC=1', 'Sync'],
        ['MMU_SYNC_GEAR_MOTOR SYNC=0', 'Unsync'],
      ],
    },
    {
      title: 'Extruder only',
      desc: 'Load or unload between the extruder and the nozzle, without the MMU',
      show: has('MMU_LOAD'),
      btns: [
        ['MMU_LOAD EXTRUDER_ONLY=1', 'Load'],
        ['MMU_UNLOAD EXTRUDER_ONLY=1', 'Unload'],
      ],
    },
    {
      title: 'MMU motors',
      show: has('MMU_MOTORS_ON') || has('MMU_MOTORS_OFF'),
      btns: [
        ['MMU_MOTORS_ON', 'On'],
        ['MMU_MOTORS_OFF', 'Off'],
      ],
    },
  ]
    .map((r) => ({ ...r, btns: r.btns.filter(([c]) => has(c.split(' ')[0])) }))
    .filter((r) => r.show && r.btns.length),
);
</script>

<template>
  <div class="mm">
    <button
      ref="btn"
      class="btn ibtn"
      :class="{ on: open }"
      :aria-label="t('MMU menu')"
      :data-tip="t('MMU menu')"
      @click.stop="open = !open"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="2.2" />
        <circle cx="12" cy="12" r="2.2" />
        <circle cx="12" cy="19" r="2.2" />
      </svg>
    </button>
    <Popover v-if="open" :anchor="btn" :width="250" @close="open = false">
      <button v-if="has('MMU_TTG_MAP')" class="btn clear mi" :disabled="off" @click="pick(() => emit('toolMap'))">
        <Icon name="shuffle" :size="16" />{{ t('Map tools') }}
      </button>
      <button v-if="has('MMU_GATE_MAP')" class="btn clear mi" :disabled="off" @click="pick(() => (dlg = 'filaments'))">
        <Icon name="pencil" :size="16" />{{ t('Edit filaments') }}
      </button>
      <button v-if="has('MMU_RECOVER')" class="btn clear mi" :disabled="off" @click="pick(openRecover)">
        <Icon name="refresh" :size="16" />{{ t('Fix MMU state') }}
      </button>
      <button
        v-if="MAINT.length"
        class="btn clear mi"
        :disabled="off || isPrinting"
        @click="pick(() => (dlg = 'maint'))"
      >
        <Icon name="wrench" :size="16" />{{ t('MMU maintenance') }}
      </button>
      <div class="sep"></div>
      <button
        v-if="has('MMU_STATS')"
        class="btn clear mi"
        :disabled="off"
        @click="pick(() => send('MMU_STATS SHOWCOUNTS=1', t('MMU statistics are in the console')))"
      >
        <Icon name="list" :size="16" />{{ t('Print stats') }}
      </button>
      <button
        v-if="spoolman"
        class="btn clear mi"
        :disabled="off"
        @click="pick(() => send('MMU_SPOOLMAN REFRESH=1 QUIET=1', t('Gates synced with Spoolman')))"
      >
        <Icon name="spool" :size="16" />{{ t('Sync Spoolman') }}
      </button>
      <button
        v-if="has('MMU_CHECK_GATE')"
        class="btn clear mi"
        :disabled="off || isPrinting"
        @click="pick(() => (dlg = 'check'))"
      >
        <Icon name="search" :size="16" />{{ t('Check all gates') }}
      </button>
    </Popover>

    <!-- Edit filaments: every gate; a row opens the filament editor of that gate -->
    <Modal v-if="dlg === 'filaments'" :title="t('Edit filaments')" width="520px" @close="dlg = ''">
      <div class="gl">
        <button
          v-for="g in gates"
          :key="g.id"
          class="btn clear gr"
          @click="
            dlg = '';
            emit('editGate', g);
          "
        >
          <span class="num mono">{{ g.label }}</span>
          <i class="sw" :style="{ background: g.color || 'var(--s3)' }"></i>
          <span class="nm"
            ><b>{{ g.material || t('Unknown') }}</b
            ><span v-if="g.name" class="mu"> · {{ g.name }}</span></span
          >
          <span class="mu sm">{{ g.tools.map((x) => 'T' + x).join(' ') }}</span>
          <Icon name="pencil" :size="14" class="mu" />
        </button>
      </div>
    </Modal>

    <!-- Fix MMU state -->
    <Modal v-if="dlg === 'recover'" :title="t('Fix MMU state')" width="460px" @close="dlg = ''">
      <p class="mu sm" style="margin: 0 0 12px">
        {{ t('Tell Happy Hare what is really loaded, for example after fixing a jam by hand. Nothing moves.') }}
      </p>
      <div class="fr">
        <label>{{ t('Tool') }}</label>
        <select v-model.number="rec.tool" class="input">
          <option :value="-1">{{ t('Unknown') }}</option>
          <option v-for="i in nTools" :key="i" :value="i - 1">T{{ i - 1 }}</option>
        </select>
      </div>
      <div class="fr">
        <label>{{ t('Gate') }}</label>
        <select v-model.number="rec.gate" class="input">
          <option :value="-1">{{ t('Unknown') }}</option>
          <option v-if="m.has_bypass" :value="-2">{{ t('Bypass') }}</option>
          <option v-for="i in nGates" :key="i" :value="i - 1">
            {{ i - 1 }}{{ toolsOf(i - 1).length ? ' (' + toolsOf(i - 1).join(', ') + ')' : '' }}
          </option>
        </select>
      </div>
      <div class="fr">
        <label>{{ t('Filament') }}</label>
        <div class="seg">
          <button :class="{ on: rec.pos === 'unloaded' }" @click="rec.pos = 'unloaded'">{{ t('Unloaded') }}</button>
          <button :class="{ on: rec.pos === 'loaded' }" @click="rec.pos = 'loaded'">{{ t('Loaded') }}</button>
          <button :class="{ on: rec.pos === 'keep' }" @click="rec.pos = 'keep'">{{ t('Unknown') }}</button>
        </div>
      </div>
      <template #foot>
        <button class="btn lg" @click="dlg = ''">{{ t('Cancel') }}</button>
        <button class="btn lg acc" @click="recover">{{ t('Set state') }}</button>
      </template>
    </Modal>

    <!-- MMU maintenance -->
    <Modal v-if="dlg === 'maint'" :title="t('MMU maintenance')" width="560px" @close="dlg = ''">
      <div v-for="r in MAINT" :key="r.title" class="mr">
        <div class="k">
          <b>{{ t(r.title) }}</b>
          <span v-if="r.desc" class="mu sm">{{ t(r.desc) }}</span>
          <span v-if="r.state" class="mu sm">{{ t(r.state) }}</span>
        </div>
        <div class="bb">
          <button v-for="[c, l] in r.btns" :key="c" class="btn" :disabled="isPrinting" @click="send(c)">
            {{ t(l) }}
          </button>
        </div>
      </div>
      <template #foot>
        <button class="btn lg" @click="dlg = ''">{{ t('Close') }}</button>
      </template>
    </Modal>

    <!-- Check all gates -->
    <Modal v-if="dlg === 'check'" :title="t('Check all gates?')" width="420px" @close="dlg = ''">
      <p class="mu" style="margin: 0">
        {{ t('The MMU loads a little filament from every gate to see which ones have filament.') }}
      </p>
      <template #foot>
        <button class="btn lg" @click="dlg = ''">{{ t('Cancel') }}</button>
        <button
          class="btn lg acc"
          :disabled="off || isPrinting"
          @click="
            dlg = '';
            send('MMU_CHECK_GATE ALL=1');
          "
        >
          {{ t('Check all gates') }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.mm {
  display: contents;
}
.mi {
  justify-content: flex-start;
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
.sm {
  font-size: 12px;
}
.mu {
  color: var(--mu);
}
.gl {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gr {
  justify-content: flex-start;
  gap: 12px;
  height: 46px;
  color: var(--tx);
  text-align: left;
}
.gr .num {
  width: 22px;
  color: var(--mu);
}
.sw {
  width: 22px;
  height: 22px;
  border-radius: 11px;
  flex: none;
  box-shadow: 0 0 0 1px var(--bd);
}
.nm {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fr {
  display: grid;
  grid-template-columns: 90px 1fr;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.fr label {
  color: var(--mu);
  font-size: 13px;
}
.mr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--bd);
}
.mr:last-child {
  border-bottom: 0;
}
.mr .k {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.bb {
  display: flex;
  flex: none;
  gap: 6px;
  justify-content: flex-end;
}
@media (max-width: 560px) {
  .mr {
    flex-wrap: wrap;
  }
  .bb {
    flex-wrap: wrap;
  }
}
</style>
