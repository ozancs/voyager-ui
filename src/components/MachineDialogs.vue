<script setup>
// Dialogs Klipper asks for: macro prompts (action:prompt_*), manual probe (PROBE_CALIBRATE,
// Z_ENDSTOP_CALIBRATE, manual bed mesh...), BED_SCREWS_ADJUST and SCREWS_TILT_CALCULATE results.
import { ref, computed, watch } from 'vue';
import Icon from './Icon.vue';
import { state, S, gcode } from '../store';
import { promptRun, promptClose } from '../features';
import { t } from '../i18n';

const p = computed(() => state.prompt);
const cls = (c) => ({ primary: 'acc', secondary: '', info: 'info', warning: 'warn', error: 'dg' })[c] ?? '';

const mp = computed(() => S('manual_probe'));
const STEPS = [-1, -0.1, -0.05, -0.01, 0.01, 0.05, 0.1, 1];
const fmt = (v) => (v == null ? '--' : Number(v).toFixed(3));
const bs = computed(() => S('bed_screws'));

// SCREWS_TILT_CALCULATE: show the result when it changes
const st = computed(() => S('screws_tilt_adjust'));
const tilt = ref(null);
let lastTilt = null;
watch(
  () => JSON.stringify(st.value.results || {}),
  (j) => {
    if (lastTilt === null) {
      lastTilt = j;
      return;
    } // skip what was there on page load
    if (j !== lastTilt && j !== '{}') tilt.value = st.value;
    lastTilt = j;
  },
);
// Klipper also prints the result to the console; "(base)" marks it. Covers a re-run with identical numbers.
watch(
  () => state.console[state.console.length - 1]?.id,
  () => {
    const l = state.console[state.console.length - 1];
    if (l?.type === 'response' && /\(base\)\s*:/.test(l.message))
      setTimeout(() => {
        if (Object.keys(st.value.results || {}).length) tilt.value = st.value;
      }, 300);
  },
);
const tiltRows = computed(() =>
  Object.entries(tilt.value?.results || {}).map(([k, r]) => ({ k, name: r.name || k, ...r })),
);
</script>

<template>
  <!-- macro prompt -->
  <div v-if="p" class="ov">
    <div class="dlg card" role="dialog" :aria-label="p.title">
      <div class="card-h">
        <h2>{{ p.title }}</h2>
        <button class="btn clear ibtn sm" :aria-label="t('Close')" @click="promptClose">
          <Icon name="x" :size="18" />
        </button>
      </div>
      <template v-for="(it, k) in p.items" :key="k">
        <p v-if="it.type === 'text'" class="tx">{{ it.text }}</p>
        <div v-else class="bg" :class="{ grp: it.type === 'group' }">
          <button v-for="(b, j) in it.buttons" :key="j" class="btn lg" :class="cls(b.color)" @click="promptRun(b)">
            {{ b.label }}
          </button>
        </div>
      </template>
      <div v-if="p.footer.length" class="ft">
        <button v-for="(b, j) in p.footer" :key="j" class="btn lg" :class="cls(b.color)" @click="promptRun(b)">
          {{ b.label }}
        </button>
      </div>
    </div>
  </div>

  <!-- manual probe -->
  <div v-else-if="mp.is_active" class="ov">
    <div class="dlg card" role="dialog" :aria-label="t('Manual probe')">
      <div class="card-h">
        <h2>{{ t('Manual probe') }}</h2>
        <span class="chip mono">{{ mp.name || 'probe' }}</span>
      </div>
      <p class="tx mu">{{ t('Move the nozzle down until a sheet of paper just drags, then accept.') }}</p>
      <div class="zbox">
        <div class="col" style="gap: 2px; align-items: center">
          <span class="lbl">{{ t('Z position') }}</span
          ><b class="mono zv">{{ fmt(mp.z_position) }}</b>
        </div>
        <div class="row mono mu" style="font-size: 12px; gap: 14px">
          <span>{{ t('lower {v}', { v: fmt(mp.z_position_lower) }) }}</span
          ><span>{{ t('upper {v}', { v: fmt(mp.z_position_upper) }) }}</span>
        </div>
      </div>
      <div class="steps">
        <button v-for="s in STEPS" :key="s" class="btn lg mono" :class="{ up: s > 0 }" @click="gcode('TESTZ Z=' + s)">
          {{ s > 0 ? '+' : '' }}{{ s }}
        </button>
      </div>
      <div class="row">
        <button class="btn grow" @click="gcode('TESTZ Z=-')">{{ t('Bisect down') }}</button>
        <button class="btn grow" @click="gcode('TESTZ Z=+')">{{ t('Bisect up') }}</button>
      </div>
      <div class="ft">
        <button class="btn lg dg" @click="gcode('ABORT')">{{ t('Abort') }}</button
        ><button class="btn lg acc" @click="gcode('ACCEPT')">
          <Icon name="check" :size="18" :stroke="2.6" />{{ t('Accept') }}
        </button>
      </div>
    </div>
  </div>

  <!-- bed screws -->
  <div v-else-if="bs.is_active" class="ov">
    <div class="dlg card" role="dialog" :aria-label="t('Bed screws adjust')">
      <div class="card-h">
        <h2>{{ t('Bed screws') }}</h2>
        <span class="chip">{{ bs.state === 'fine' ? t('fine adjust') : t('adjust') }}</span>
      </div>
      <p class="tx">
        {{ t('Screw {n}: adjust until the paper just drags.', { n: (bs.current_screw ?? 0) + 1 }) }} {{ t('Press') }}
        <b>{{ t('Adjusted') }}</b> {{ t('if you turned it,') }} <b>{{ t('Accept') }}</b>
        {{ t('if it was already right.') }}
      </p>
      <p class="mu" style="margin: 0; font-size: 12.5px">{{ t('Accepted: {n}', { n: bs.accepted_screws ?? 0 }) }}</p>
      <div class="ft">
        <button class="btn lg dg" @click="gcode('ABORT')">{{ t('Abort') }}</button
        ><button class="btn lg" @click="gcode('ADJUSTED')">{{ t('Adjusted') }}</button
        ><button class="btn lg acc" @click="gcode('ACCEPT')">{{ t('Accept') }}</button>
      </div>
    </div>
  </div>

  <!-- screws tilt result -->
  <div v-if="tilt" class="ov" @mousedown.self="tilt = null">
    <div class="dlg card" role="dialog" :aria-label="t('Screws tilt result')">
      <div class="card-h">
        <h2>{{ t('Screws tilt') }}</h2>
        <button class="btn clear ibtn sm" :aria-label="t('Close')" @click="tilt = null">
          <Icon name="x" :size="18" />
        </button>
      </div>
      <p v-if="tilt.error" class="tx" style="color: var(--dg)">{{ t('Probing failed.') }}</p>
      <table class="tbl">
        <thead>
          <tr>
            <th>{{ t('Screw') }}</th>
            <th>Z</th>
            <th>{{ t('Turn') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in tiltRows" :key="r.k">
            <td>
              {{ r.name }}<span v-if="r.is_base" class="chip" style="margin-left: 8px">{{ t('base') }}</span>
            </td>
            <td class="mono">{{ r.z?.toFixed?.(4) ?? r.z }}</td>
            <td class="mono">
              <b v-if="!r.is_base" :style="{ color: r.adjust === '00:00' ? 'var(--ok)' : 'var(--heat)' }"
                >{{ r.sign }} {{ r.adjust }}</b
              >
            </td>
          </tr>
        </tbody>
      </table>
      <p class="mu" style="margin: 0; font-size: 12px">
        {{ t('CW = clockwise, CCW = counter-clockwise, hh:mm = turns : minutes on a clock face.') }}
      </p>
      <div class="ft">
        <button
          class="btn lg"
          @click="
            gcode('SCREWS_TILT_CALCULATE');
            tilt = null;
          "
        >
          {{ t('Probe again') }}</button
        ><button class="btn lg acc" @click="tilt = null">{{ t('Done') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ov {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  padding: 16px;
}
.dlg {
  width: 460px;
  max-width: 100%;
  max-height: calc(90vh / var(--zoom, 1));
  overflow: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.tx {
  margin: 0;
  line-height: 1.5;
}
.bg {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.bg .btn {
  flex: 1 1 0;
}
.bg:not(.grp) .btn {
  flex-basis: 100%;
}
.ft {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
  margin-top: 4px;
}
.btn.info {
  background: var(--cool-bg);
  color: var(--cool);
}
.btn.warn {
  background: var(--light-bg);
  color: var(--light);
}
.zbox {
  background: var(--s2);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.zv {
  font-size: 34px;
  letter-spacing: -0.02em;
}
.steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.steps .btn {
  padding: 0;
}
.steps .up {
  color: var(--cool);
}
</style>
