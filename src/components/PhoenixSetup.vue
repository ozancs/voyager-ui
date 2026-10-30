<script setup>
// Phoenix setup window, from the module's own setup report (status.setup, backend 0.2): the steps with what each
// still needs, the two slicer lines with an explicit "I added them", and the park point (the current XY after the
// toolhead was moved there with the normal controls, or typed machine coordinates), each saved only after a
// confirmation. Nothing here moves, heats, homes or restarts; the settings apply at once, no SAVE_CONFIG.
import { ref, computed, watch } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import { state, gcode, isPrinting } from '../store';
import {
  ph,
  phoenixKnown,
  setupProfileCommand,
  SETUP_RECHECK,
  SETUP_SLICER,
  canDemo,
  demoOn,
  openDemo,
} from '../phoenix';
import { t } from '../i18n';

const p = ph;
const su = computed(() => p.value.setup || null);
const close = () => (state.phoenixSetupOpen = false);
const online = computed(() => state.connected && state.klippy === 'ready');
const sending = ref(false);
const editable = computed(
  () => phoenixKnown.value && online.value && !!su.value?.can_edit && !p.value.busy && !sending.value,
);
async function send(cmd) {
  if (!online.value || sending.value) return;
  sending.value = true;
  try {
    await gcode(cmd);
  } catch {
    // shown by gcode()
  } finally {
    sending.value = false;
  }
}

// why changes are locked right now, in the user's terms
const lockReason = computed(() => {
  if (demoOn.value) return t('Finish the Phoenix demo before changing setup.');
  if (isPrinting.value) return t('Finish the current print before changing setup.');
  return t('Finish the current print or close the interrupted-print recovery before changing setup.');
});

const STEP = {
  module: 'Phoenix module',
  printer: 'Printer configuration',
  hooks: 'Print start and end',
  park: 'Park point',
  test: 'Test print',
};
const STATE_ICON = { ok: 'check', needs_action: 'warn', blocked: 'x', manual: 'info' };
const stepText = (s) => {
  if (s.id === 'printer' && s.state === 'blocked') return s.message; // the reason, from the module, as it is
  if (s.id === 'hooks')
    return s.state === 'ok'
      ? t('Start and end commands are connected.')
      : t('Phoenix is not connected to your prints yet.');
  if (s.id === 'park')
    return s.state === 'ok' ? t('A reviewed park point is saved.') : t('Choose a clear park point on an empty bed.');
  if (s.id === 'test') return t('Run a small print you watch, and check that the Phoenix card shows Recording.');
  return s.state === 'ok' ? t('Done') : s.message;
};
const hooksMissing = computed(() => su.value?.steps?.some((s) => s.id === 'hooks' && s.state !== 'ok'));

// ---- slicer lines ----
const LINES = [
  ['PHOENIX_START', 'After your start code, before the model'],
  ['PHOENIX_END', 'After the last layer, before your end code'],
];
const copied = ref('');
async function copy(txt) {
  try {
    await navigator.clipboard.writeText(txt);
    copied.value = txt;
    setTimeout(() => (copied.value = ''), 1500);
  } catch {}
}

// ---- park point ----
// a saved park point stays folded behind Change until the user wants to move it
const editing = ref(false);
const showPark = computed(() => !su.value?.profile_ready || editing.value);
const mode = ref('current');
const fx = ref(''),
  fy = ref(''),
  fc = ref('');
watch(
  su,
  (s) => {
    if (!s) return;
    if (fx.value === '' && s.park?.length) fx.value = s.park[0];
    if (fy.value === '' && s.park?.length) fy.value = s.park[1];
    if (fc.value === '' && s.clearance) fc.value = s.clearance;
  },
  { immediate: true },
);
const reviewed = ref(false);
watch(mode, () => (reviewed.value = false));
const cmd = computed(() => {
  try {
    return setupProfileCommand(p.value, {
      x: Number(fx.value),
      y: Number(fy.value),
      clearance: Number(fc.value),
      useCurrent: mode.value === 'current',
      confirmed: reviewed.value,
    });
  } catch {
    return null;
  }
});
async function saveProfile() {
  if (!cmd.value || !editable.value) return;
  await send(cmd.value);
  reviewed.value = false;
  editing.value = false;
}
const n1 = (v) => (v == null || isNaN(v) ? '--' : Number(v).toFixed(1));
</script>

<template>
  <Modal :title="t('Phoenix setup')" width="720px" @close="close">
    <div v-if="!phoenixKnown" class="note warn">
      <b>{{ t('Phoenix API version {v} is not supported by this Voyager version.', { v: p.api_version }) }}</b>
    </div>
    <div v-else-if="!su" class="note warn">
      <b>{{ t('This Phoenix version has no setup report.') }}</b>
      <span>{{ t('Update Phoenix, or use the PHOENIX_SETUP_GUIDE macro.') }}</span>
    </div>
    <template v-else>
      <div class="row hd">
        <span class="badge" :class="su.complete ? 'ok' : 'wn'"
          ><Icon :name="su.complete ? 'check' : 'warn'" :size="14" :stroke="2.6" />{{
            su.complete ? t('Setup complete') : t('Setup not finished')
          }}</span
        >
        <span class="grow"></span>
        <button
          v-if="p.demo"
          class="btn"
          :disabled="!online || sending || (!demoOn && !canDemo(p))"
          :title="t('Empty-bed demo: the toolhead moves through a recovery. Nothing heats, extrudes or prints.')"
          @click="openDemo"
        >
          <Icon name="play" :size="15" />{{ demoOn ? t('Open demo') : t('Run demo') }}
        </button>
        <button class="btn" :disabled="!online || sending" @click="send(SETUP_RECHECK)">
          <Icon name="refresh" :size="15" />{{ t('Check again') }}
        </button>
      </div>
      <div v-if="!su.can_edit" class="note">
        <span>{{ lockReason }}</span>
      </div>

      <ol class="steps">
        <li v-for="s in su.steps" :key="s.id" :class="s.state">
          <span class="si"><Icon :name="STATE_ICON[s.state] || 'info'" :size="14" :stroke="2.6" /></span>
          <span class="col" style="gap: 2px; min-width: 0">
            <b>{{ t(STEP[s.id] || s.id) }}</b>
            <span class="mu sm esc">{{ stepText(s) }}</span>
          </span>
        </li>
      </ol>

      <!-- print hooks -->
      <section v-if="hooksMissing" class="blk">
        <h3>{{ t('Connect Phoenix to your prints') }}</h3>
        <p class="mu sm">
          {{
            t(
              'Run the Phoenix installer again to connect your print macros, or add these two lines to your slicer and slice again.',
            )
          }}
        </p>
        <div v-for="[c, where] in LINES" :key="c" class="ln">
          <code class="mono">{{ c }}</code>
          <span class="mu sm grow">{{ t(where) }}</span>
          <button class="btn sm" @click="copy(c)">
            <Icon :name="copied === c ? 'check' : 'copy'" :size="14" />{{ copied === c ? t('Copied') : t('Copy') }}
          </button>
        </div>
        <button class="btn" :disabled="!editable" @click="send(SETUP_SLICER)">
          {{ t('I added both lines to my slicer') }}
        </button>
      </section>

      <!-- park point -->
      <section class="blk">
        <h3>{{ t('Park point') }}</h3>
        <p class="mu sm">
          {{
            t(
              'Where the toolhead waits during a recovery while you clean the nozzle. Machine coordinates. Saving does not move the printer and needs no restart.',
            )
          }}
        </p>
        <div v-if="su.profile_ready" class="row saved">
          <span class="sm"
            >{{ t('Saved') }}: <b class="mono">X {{ n1(su.park?.[0]) }} · Y {{ n1(su.park?.[1]) }}</b> ·
            {{ t('clearance {n} mm', { n: n1(su.clearance) }) }}</span
          >
          <button v-if="!editing" class="btn sm" :disabled="!editable" @click="editing = true">
            <Icon name="pencil" :size="14" />{{ t('Change') }}
          </button>
          <button v-else class="btn clear sm" @click="editing = false">{{ t('Cancel') }}</button>
        </div>
        <span v-if="su.profile_error" class="note warn esc">{{ su.profile_error }}</span>
        <template v-if="showPark">
          <div class="seg" role="tablist">
            <button :class="{ on: mode === 'current' }" @click="mode = 'current'">{{ t('Use the current XY') }}</button>
            <button :class="{ on: mode === 'typed' }" @click="mode = 'typed'">{{ t('Type the coordinates') }}</button>
          </div>
          <template v-if="mode === 'current'">
            <p class="mu sm">
              {{
                t(
                  'Move the toolhead to the park point with the normal controls on an empty bed, then save. X and Y must be homed.',
                )
              }}
            </p>
            <span class="sm"
              >{{ t('Now') }}:
              <b class="mono">X {{ n1(su.current_position?.[0]) }} · Y {{ n1(su.current_position?.[1]) }}</b></span
            >
            <span v-if="!su.can_use_current && su.can_edit" class="note warn">{{ t('Home X and Y first.') }}</span>
          </template>
          <div v-else class="row nums">
            <label
              ><span class="lbl">X</span
              ><input v-model="fx" class="input mono" type="number" step="0.1" :aria-label="t('Park X')"
            /></label>
            <label
              ><span class="lbl">Y</span
              ><input v-model="fy" class="input mono" type="number" step="0.1" :aria-label="t('Park Y')"
            /></label>
          </div>
          <label class="row nums"
            ><span class="lbl">{{ t('Clearance (mm)') }}</span
            ><input
              v-model="fc"
              class="input mono"
              type="number"
              step="0.5"
              min="0.5"
              :aria-label="t('Clearance (mm)')"
          /></label>
          <label class="ck"
            ><input v-model="reviewed" type="checkbox" class="cb" :disabled="!editable" /><span>{{
              t('The bed is empty and I checked the way to this point is clear')
            }}</span></label
          >
          <button
            class="btn acc"
            style="align-self: flex-start"
            :disabled="!editable || !cmd || (mode === 'current' && !su.can_use_current)"
            @click="saveProfile"
          >
            <Icon name="save" :size="15" />{{
              mode === 'current' ? t('Use this XY as the park point') : t('Save park point')
            }}
          </button>
        </template>
      </section>
    </template>
    <template #foot>
      <span class="grow"></span>
      <button class="btn lg" @click="close">{{ t('Close') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.col {
  display: flex;
  flex-direction: column;
}
.mu {
  color: var(--mu);
  margin: 0;
}
.sm {
  font-size: 12.5px;
}
.esc {
  word-break: break-word;
}
.hd {
  gap: 8px;
  align-items: center;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  background: color-mix(in srgb, var(--tone) 14%, var(--s2));
  color: var(--tone);
}
.badge.ok {
  --tone: var(--ok);
}
.badge.wn {
  --tone: var(--wn);
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.steps li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--r);
  background: var(--s2);
  --tone: var(--mu);
}
.steps li.ok {
  --tone: var(--ok);
}
.steps li.needs_action {
  --tone: var(--wn);
}
.steps li.blocked {
  --tone: var(--dg);
}
.si {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 16%, var(--s1));
}
.blk {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--bd);
}
h3 {
  margin: 0;
  font-size: 15px;
}
.ln {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border-radius: var(--r);
  background: var(--s2);
}
.ln code {
  font-weight: 700;
}
.btn.sm {
  height: 30px;
  padding: 0 10px;
  font-size: 12.5px;
}
.seg {
  align-self: flex-start;
}
.saved {
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.nums {
  gap: 10px;
  align-items: center;
}
.nums label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.nums .input {
  width: 110px;
}
.ck {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13.5px;
  cursor: pointer;
}
.ck .cb {
  margin-top: 2px;
  flex: none;
}
.note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  border-radius: var(--r);
  background: var(--s2);
  border-left: 3px solid var(--mu2);
  font-size: 13px;
}
.note.warn {
  border-left-color: var(--wn);
}
</style>
