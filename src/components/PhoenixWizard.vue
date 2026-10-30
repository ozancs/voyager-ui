<script setup>
// Phoenix print recovery wizard. Six steps over the module's own state: the printer's `phoenix` status decides
// where we are (detected: steps 1-4, the operator walks them; prepared: 5-6; heating / returning: progress), so a
// reload or a reconnect lands on the same step. Every button sends exactly one Phoenix command and waits for the
// status; nothing is sent by opening, closing, a step change or an animation, nothing is retried after an error.
import { ref, computed, watch } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import PhoenixGuide from './PhoenixGuide.vue';
import { state, S, gcode, setHeater, fmtDate } from '../store';
import {
  ph,
  phoenixKnown,
  CHECKS,
  checkCommand,
  selectCommand,
  canPrepare,
  canResume,
  PREPARE,
  RESUME,
  DISCARD,
} from '../phoenix';
import { t } from '../i18n';

const p = ph;
const close = () => (state.phoenixOpen = false);
// mutations only on a known API, a connected printer, and while neither Phoenix nor this page is busy
const sending = ref(false);
const online = computed(() => state.connected && state.klippy === 'ready');
const canAct = computed(() => phoenixKnown.value && online.value && !p.value.busy && !sending.value);
async function send(cmd) {
  if (!canAct.value) return;
  sending.value = true;
  try {
    await gcode(cmd, { force: true }); // an error shows as a toast; the status, not this call, moves the wizard
  } catch {
    // shown by gcode()
  } finally {
    sending.value = false;
  }
}

// ---- steps ----
const STEPS = ['Interrupted print', 'Resume point', 'Checklist', 'Lift and park', 'Clean and prime', 'Resume'];
const local = ref(1); // the step the operator is on while the phase leaves it open (detected: 1-4, prepared: 5-6)
const phase = computed(() => p.value.phase || 'idle');
const step = computed(() => {
  const ph = phase.value;
  if (ph === 'detected') return Math.min(local.value, 4);
  if (ph === 'preparing') return 4;
  if (ph === 'prepared') return Math.max(5, Math.min(local.value, 6));
  if (ph === 'heating' || ph === 'returning') return 6;
  return 0;
});
watch(phase, (ph, old) => {
  if (ph === 'prepared' && old !== 'prepared') local.value = 5;
  if (ph === 'detected' && old && old !== 'detected') local.value = 1;
});
if (phase.value === 'prepared') local.value = 5;
const go = (n) => (local.value = n);

// ---- data ----
const cps = computed(() => p.value.checkpoints || []);
const sel = computed(() => cps.value[p.value.selected_index] || cps.value[0] || null);
const newest = computed(() => cps.value[0] || null);
const mm = (v) => (v == null || isNaN(v) ? '--' : Number(v).toFixed(2));
const xyz = (a) => (Array.isArray(a) ? `X ${mm(a[0])} · Y ${mm(a[1])} · Z ${mm(a[2])}` : '--');
const when = (ts) => (ts ? fmtDate(ts) : '--');
const ago = (ts) => {
  if (!ts) return '';
  const s = Math.max(0, Date.now() / 1000 - ts);
  return s < 120 ? t('{n} s ago', { n: Math.round(s) }) : s < 7200 ? t('{n} min ago', { n: Math.round(s / 60) }) : '';
};
const UNC = {
  axes_assumed_unchanged: 'Nothing is homed: the axes are assumed not to have moved since the print stopped.',
  queued_motion: 'Moves already queued when the record was saved may or may not have run.',
  z_hop: 'If power was cut during a Z-hop, the nozzle may be a little higher or lower than recorded.',
  sample_gap: 'Records are taken every few seconds, so the last one is not the exact moment the print stopped.',
};
const REASON = {
  unclean_shutdown: 'The printer stopped without finishing the print (power loss, a restart or a fault).',
  print_error: 'The print stopped with an error.',
};
const CHECK_TEXT = {
  bed_attached: ['The part is still stuck to the bed', 'It has not come loose, shifted or tipped over.'],
  axes_unmoved: [
    'Nobody moved the toolhead or the axes',
    'Not by hand and not with a command since the print stopped.',
  ],
  plate_unmoved: ['The build plate was not lifted off or moved', 'A removable plate is exactly where it was.'],
  nozzle_free: [
    'The nozzle is not stuck in the part',
    'If it froze into the plastic, warm it under supervision with the hotend control below until it comes free, then check this.',
  ],
  path_clear: ['The way up and to the park point is clear', 'Nothing taller on the bed, no clips or tools in the way.'],
  uncertainty_accepted: [
    'I understand the record is not exact',
    'The print may continue slightly above or below, or repeat or skip a little plastic.',
  ],
};
const checked = (k) => p.value.checks?.[k] === true;
const nChecked = computed(() => CHECKS.filter(checked).length);
const toggleCheck = (k) => send(checkCommand(k, !checked(k)));
function pick(i) {
  if (i !== p.value.selected_index) send(selectCommand(i));
}

// ---- prepare / clean / resume ----
const confirmMove = ref(false);
watch(phase, () => (confirmMove.value = false));
const cleaned = ref(false),
  pathClear = ref(false);
watch(phase, (ph) => {
  if (ph !== 'prepared') cleaned.value = pathClear.value = false;
});
const ext = computed(() => S('extruder'));
const tgt = ref('');
function heat(v) {
  if (online.value) setHeater('extruder', v);
}
function extrude(mmE) {
  if (!online.value || p.value.phase !== 'prepared') return;
  gcode(`SAVE_GCODE_STATE NAME=_ui_ext\nM83\nG1 E${mmE} F240\nRESTORE_GCODE_STATE NAME=_ui_ext`, { force: true });
}

// ---- discard ----
const askDiscard = ref(false);
const discardable = computed(() => ['detected', 'prepared', 'blocked'].includes(phase.value));
async function discard() {
  await send(DISCARD);
  askDiscard.value = false;
}
const PHASE_TEXT = {
  heating: 'Heating to the saved temperatures…',
  returning: 'Moving back above the part and down to the resume point…',
};
</script>

<template>
  <Modal :title="t('Print recovery')" width="900px" @close="close">
    <!-- an API version this page was not written for: what it says, no buttons -->
    <div v-if="!phoenixKnown" class="note warn">
      <b>{{ t('Phoenix API version {v} is not supported by this Voyager version.', { v: p.api_version }) }}</b>
      <span>{{ t('Nothing is sent from here. Use the console commands (PHOENIX_STATUS) or update Voyager UI.') }}</span>
      <span v-if="p.phase" class="mono sm">phase: {{ p.phase }} · {{ p.filename }}</span>
    </div>

    <template v-else>
      <div v-if="!online" class="note warn">
        <b>{{ t('Not connected to the printer') }}</b
        ><span>{{ t('The buttons come back when the printer is connected again. Nothing is repeated.') }}</span>
      </div>
      <div v-if="p.storage_error" class="note warn">
        <b>{{ t('Recovery records could not be saved') }}</b
        ><span class="esc">{{ p.storage_error }}</span>
      </div>
      <div v-if="p.journal_fallback" class="note warn">
        <span>{{
          t('The newest record was damaged, an older one is shown. The resume point may be further back.')
        }}</span>
      </div>

      <!-- blocked: say why, offer nothing that forces it -->
      <div v-if="phase === 'blocked'" class="col g">
        <div class="note err">
          <b>{{ t('Print recovery needs attention') }}</b>
          <span class="esc">{{
            p.error || t('Recovery stopped. Review the printer before doing anything else.')
          }}</span>
        </div>
        <p class="mu">
          {{
            t(
              'Phoenix stopped this recovery to stay safe; it cannot be continued from here. Check the printer by hand. To start fresh, discard the recovery record.',
            )
          }}
        </p>
      </div>

      <!-- nothing to recover / back to printing -->
      <div v-else-if="phase === 'recording' || phase === 'idle'" class="col g">
        <div class="note ok">
          <b>{{ phase === 'recording' ? t('The print is running again') : t('No interrupted print') }}</b>
          <span v-if="phase === 'recording'">{{ t('Watch the first layers closely.') }}</span>
        </div>
      </div>

      <template v-else>
        <ol class="steps" :aria-label="t('Steps')">
          <li
            v-for="(s, i) in STEPS"
            :key="s"
            :class="{ on: step === i + 1, done: step > i + 1 }"
            :aria-current="step === i + 1 ? 'step' : null"
          >
            <i>{{ i + 1 }}</i
            ><span>{{ t(s) }}</span>
          </li>
        </ol>

        <div class="body">
          <div class="main col g">
            <!-- 1: what stopped -->
            <template v-if="step === 1">
              <h3>{{ t('Interrupted print detected') }}</h3>
              <p class="mu">{{ t(REASON[p.reason] || REASON.unclean_shutdown) }}</p>
              <dl class="kv">
                <dt>{{ t('File') }}</dt>
                <dd class="esc mono">{{ p.filename || '--' }}</dd>
                <dt>{{ t('Last record') }}</dt>
                <dd>{{ when(newest?.saved_at) }}</dd>
                <dt v-if="newest?.layer_z != null">{{ t('Layer Z') }}</dt>
                <dd v-if="newest?.layer_z != null" class="mono">{{ mm(newest.layer_z) }} mm</dd>
                <dt>{{ t('Assumed position') }}</dt>
                <dd class="mono">{{ xyz(p.assumed_position) }}</dd>
              </dl>
              <div class="unc">
                <b>{{ t('What is not known for sure') }}</b>
                <ul>
                  <li v-for="u in p.uncertainties || []" :key="u">{{ t(UNC[u] || u) }}</li>
                </ul>
              </div>
              <p class="mu sm">{{ t('Opening this window does not move or heat anything.') }}</p>
            </template>

            <!-- 2: which record to continue from -->
            <template v-else-if="step === 2">
              <h3>{{ t('Where to continue') }}</h3>
              <p class="mu">
                {{
                  t(
                    'The newest record is usually right. An older one starts further back and may print a little over what is already there. These are saved records, not the exact point where the print stopped.',
                  )
                }}
              </p>
              <div class="cps" role="radiogroup" :aria-label="t('Resume point')">
                <button
                  v-for="c in cps"
                  :key="c.index"
                  class="cp"
                  role="radio"
                  :aria-checked="c.index === p.selected_index"
                  :class="{ on: c.index === p.selected_index }"
                  :disabled="!canAct"
                  @click="pick(c.index)"
                >
                  <span class="dot"></span>
                  <span class="col grow" style="gap: 2px; min-width: 0">
                    <b>{{
                      c.index === 0
                        ? t('Newest record')
                        : c.index === 1
                          ? t('One record earlier')
                          : t('{n} records earlier', { n: c.index })
                    }}</b>
                    <span class="mu sm">{{ when(c.saved_at) }}</span>
                  </span>
                  <span class="mono sm r">
                    Z {{ mm(c.gcode_position?.[2]) }}
                    <span v-if="c.z_above_layer > 0.01" class="mu"
                      >({{ t('{n} mm above the layer', { n: mm(c.z_above_layer) }) }})</span
                    >
                  </span>
                </button>
              </div>
              <p class="mu sm">{{ t('Changing the point clears the checklist; it has to be confirmed again.') }}</p>
            </template>

            <!-- 3: the six checks, one by one -->
            <template v-else-if="step === 3">
              <h3>{{ t('Check the printer') }}</h3>
              <p class="mu">
                {{ t('Look at the printer and confirm each point yourself. Leave it unchecked if you are not sure.') }}
              </p>
              <div class="checks">
                <label v-for="k in CHECKS" :key="k" class="ck" :class="{ on: checked(k) }">
                  <input
                    type="checkbox"
                    class="cb"
                    :checked="checked(k)"
                    :disabled="!canAct"
                    @change.prevent="toggleCheck(k)"
                  />
                  <span class="col" style="gap: 2px">
                    <b>{{ t(CHECK_TEXT[k][0]) }}</b>
                    <span class="mu sm">{{ t(CHECK_TEXT[k][1]) }}</span>
                  </span>
                </label>
              </div>
              <div class="heat">
                <span class="sm"
                  >{{ t('Hotend') }}
                  <b class="mono">{{ Math.round(ext.temperature ?? 0) }}° / {{ Math.round(ext.target ?? 0) }}°</b></span
                >
                <input
                  v-model="tgt"
                  class="input mono"
                  type="number"
                  inputmode="numeric"
                  :placeholder="t('Target °C')"
                  :aria-label="t('Hotend target')"
                  @keydown.enter="heat(tgt)"
                />
                <button class="btn" :disabled="!online || tgt === ''" @click="heat(tgt)">{{ t('Set') }}</button>
                <button class="btn" :disabled="!online" @click="heat(0)">{{ t('Off') }}</button>
              </div>
            </template>

            <!-- 4: lift and park -->
            <template v-else-if="step === 4">
              <h3>{{ t('Lift and park') }}</h3>
              <p class="mu">
                {{
                  t(
                    'The toolhead moves straight up to open a gap between the nozzle and the part, then over to the park point. Z is not homed.',
                  )
                }}
              </p>
              <div v-if="!p.profile_ready" class="note warn">
                <b>{{ t('The recovery profile is not set up yet') }}</b>
                <span>{{
                  t(
                    'Review park_x, park_y and clearance in phoenix.cfg for this printer, set profile_ready: True and restart Klipper.',
                  )
                }}</span>
              </div>
              <div v-if="phase === 'preparing'" class="note">
                <Icon name="refresh" :size="16" class="spin" /><span>{{ t('Lifting and parking…') }}</span>
              </div>
              <template v-else>
                <div v-if="confirmMove" class="note warn col">
                  <b>{{ t('The printer will move now') }}</b>
                  <span>{{ t('Keep hands away from the toolhead. E-STOP stays at the top right.') }}</span>
                  <div class="row" style="gap: 8px; margin-top: 6px">
                    <button class="btn" @click="confirmMove = false">{{ t('Back') }}</button>
                    <button class="btn acc" :disabled="!canAct || !canPrepare(p)" @click="send(PREPARE)">
                      <Icon name="up" :size="16" :stroke="2.4" />{{ t('Lift and park') }}
                    </button>
                  </div>
                </div>
                <button v-else class="btn lg acc" :disabled="!canAct || !canPrepare(p)" @click="confirmMove = true">
                  <Icon name="up" :size="16" :stroke="2.4" />{{ t('Lift and park') }}
                </button>
                <span v-if="nChecked < CHECKS.length" class="mu sm">{{
                  t('{n} of 6 checks confirmed.', { n: nChecked })
                }}</span>
              </template>
            </template>

            <!-- 5: clean and prime at the park point -->
            <template v-else-if="step === 5">
              <h3>{{ t('Clean and prime') }}</h3>
              <p class="mu">
                {{
                  t(
                    'The toolhead is parked. Heat the hotend, push out a little filament and clean the nozzle. Do not touch the part and do not move the axes.',
                  )
                }}
              </p>
              <div class="heat">
                <span class="sm"
                  >{{ t('Hotend') }}
                  <b class="mono">{{ Math.round(ext.temperature ?? 0) }}° / {{ Math.round(ext.target ?? 0) }}°</b></span
                >
                <input
                  v-model="tgt"
                  class="input mono"
                  type="number"
                  inputmode="numeric"
                  :placeholder="t('Target °C')"
                  :aria-label="t('Hotend target')"
                  @keydown.enter="heat(tgt)"
                />
                <button class="btn" :disabled="!online || tgt === ''" @click="heat(tgt)">{{ t('Set') }}</button>
                <button class="btn" :disabled="!online" @click="heat(0)">{{ t('Off') }}</button>
              </div>
              <div class="row" style="gap: 8px; flex-wrap: wrap">
                <button class="btn" :disabled="!online" @click="extrude(10)">
                  <Icon name="down" :size="15" />{{ t('Extrude {n} mm', { n: 10 }) }}
                </button>
                <button class="btn" :disabled="!online" @click="extrude(-2)">
                  <Icon name="up" :size="15" />{{ t('Retract {n} mm', { n: 2 }) }}
                </button>
              </div>
              <p class="mu sm">
                {{ t('Resuming heats to the saved temperatures by itself; priming here is up to you.') }}
              </p>
              <button class="btn lg acc" style="align-self: flex-start" @click="go(6)">
                {{ t('Next') }}<Icon name="right" :size="16" />
              </button>
            </template>

            <!-- 6: resume -->
            <template v-else-if="step === 6">
              <h3>{{ t('Resume') }}</h3>
              <template v-if="phase === 'prepared'">
                <p class="mu">
                  {{
                    t(
                      'The printer heats to the saved temperatures, moves back above the part, lowers to the resume point and carries on.',
                    )
                  }}
                </p>
                <label class="ck" :class="{ on: cleaned }"
                  ><input v-model="cleaned" type="checkbox" class="cb" /><b>{{
                    t('The nozzle is clean and primed')
                  }}</b></label
                >
                <label class="ck" :class="{ on: pathClear }"
                  ><input v-model="pathClear" type="checkbox" class="cb" /><b>{{
                    t('The way back to the part is clear')
                  }}</b></label
                >
                <div class="row" style="gap: 8px">
                  <button class="btn" @click="go(5)"><Icon name="left" :size="16" />{{ t('Back') }}</button>
                  <button
                    class="btn lg acc"
                    :disabled="!canAct || !canResume(p, cleaned, pathClear)"
                    @click="send(RESUME)"
                  >
                    <Icon name="play" :size="16" />{{ t('Resume print') }}
                  </button>
                </div>
              </template>
              <div v-else class="note">
                <Icon name="refresh" :size="16" class="spin" /><span>{{ t(PHASE_TEXT[phase] || phase) }}</span>
              </div>
            </template>

            <div v-if="step >= 1 && step <= 3" class="row nav">
              <button v-if="step > 1" class="btn" @click="go(step - 1)">
                <Icon name="left" :size="16" />{{ t('Back') }}
              </button>
              <span class="grow"></span>
              <button class="btn acc" :disabled="step === 3 && nChecked < CHECKS.length" @click="go(step + 1)">
                {{ t('Next') }}<Icon name="right" :size="16" />
              </button>
            </div>
            <div v-else-if="step === 4 && phase === 'detected'" class="row nav">
              <button class="btn" @click="go(3)"><Icon name="left" :size="16" />{{ t('Back') }}</button>
            </div>
          </div>
          <PhoenixGuide
            class="guide"
            :step="step <= 3 ? 'inspect' : step === 4 ? 'clearance' : step === 5 ? 'clean' : 'return'"
          />
        </div>
      </template>
    </template>

    <template #foot>
      <template v-if="phoenixKnown && discardable">
        <div v-if="askDiscard" class="row dz">
          <span class="sm">{{
            t('Forget this recovery? The printer does not move and the heaters stay as they are.')
          }}</span>
          <button class="btn" @click="askDiscard = false">{{ t('Keep it') }}</button>
          <button class="btn dgf" :disabled="!canAct" @click="discard">{{ t('Discard') }}</button>
        </div>
        <button v-else class="btn clear dgt" :disabled="!canAct" @click="askDiscard = true">
          <Icon name="trash" :size="15" />{{ t('Discard recovery') }}
        </button>
      </template>
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
.g {
  gap: 12px;
}
.mu {
  color: var(--mu);
  margin: 0;
}
.sm {
  font-size: 12.5px;
}
h3 {
  margin: 0;
  font-size: 18px;
}
.esc {
  word-break: break-word;
}
.steps {
  list-style: none;
  margin: 0 0 4px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}
.steps li {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 10px;
  background: var(--s2);
  color: var(--mu);
  font-size: 12px;
}
.steps li span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.steps i {
  font-style: normal;
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--s3);
  font-weight: 700;
  font-size: 11px;
}
.steps li.on {
  color: var(--tx);
  background: color-mix(in srgb, var(--ac) 14%, var(--s2));
}
.steps li.on i {
  background: var(--ac);
  color: var(--bg);
}
.steps li.done i {
  background: color-mix(in srgb, var(--ok) 60%, var(--s3));
  color: var(--bg);
}
.body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 18px;
  align-items: start;
}
.kv {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 14px;
  margin: 0;
}
.kv dt {
  color: var(--mu);
  font-size: 13px;
}
.kv dd {
  margin: 0;
}
.unc {
  padding: 10px 12px;
  border-radius: var(--r);
  background: var(--s2);
}
.unc ul {
  margin: 6px 0 0;
  padding-left: 18px;
  color: var(--mu);
  font-size: 13px;
}
.cps,
.checks {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cp {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 12px;
  text-align: left;
  border-radius: var(--r);
  border: 1px solid var(--bd);
  background: var(--s1);
  color: var(--tx);
}
.cp.on {
  border-color: var(--ac);
  background: color-mix(in srgb, var(--ac) 10%, var(--s1));
}
.cp .dot {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 8px;
  border: 2px solid var(--mu2);
}
.cp.on .dot {
  border: 5px solid var(--ac);
}
.cp .r {
  text-align: right;
}
.ck {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 48px;
  padding: 10px 12px;
  border-radius: var(--r);
  border: 1px solid var(--bd);
  background: var(--s1);
  cursor: pointer;
}
.ck.on {
  border-color: color-mix(in srgb, var(--ok) 50%, var(--bd));
}
.ck .cb {
  margin-top: 2px;
  flex: none;
}
.heat {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.heat .input {
  width: 110px;
}
.note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: var(--r);
  background: var(--s2);
  border-left: 3px solid var(--mu2);
}
.note:has(> .spin) {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.note.warn {
  border-left-color: var(--wn);
}
.note.err {
  border-left-color: var(--dg);
}
.note.ok {
  border-left-color: var(--ok);
}
.nav {
  gap: 8px;
  margin-top: 4px;
}
.dz {
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.dgt {
  color: var(--dg);
}
@media (max-width: 760px) {
  .body {
    grid-template-columns: 1fr;
  }
  .guide {
    order: -1;
  }
  .steps {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .steps li span {
    display: none;
  }
  .steps li {
    justify-content: center;
  }
}
</style>
