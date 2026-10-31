// What the printer is doing when no print runs, for the top bar in place of "Standby": the command this page sent
// that is still running (homing, levelling, a macro such as a PA test), a heater on its way to its target, or
// Klipper busy with something another client started. Read from the live status only, never guessed: null when
// there is nothing to say.
import { computed, ref, watch } from 'vue';
import { state, S, isPrinting, prettyName } from './store';
import { t } from './i18n';

// what a command is, in words; anything else is a macro or a command shown by its name
const KNOWN = [
  [/^G28$/, 'Homing'],
  [/^QUAD_GANTRY_LEVEL$/, 'Levelling the gantry'],
  [/^Z_TILT_ADJUST$/, 'Levelling Z'],
  [/^BED_MESH_CALIBRATE$/, 'Probing the bed mesh'],
  [/^(PROBE|PROBE_ACCURACY|PROBE_CALIBRATE|Z_ENDSTOP_CALIBRATE)$/, 'Probing'],
  [/^SCREWS_TILT_CALCULATE$/, 'Measuring the bed screws'],
  [/^(SHAPER_CALIBRATE|TEST_RESONANCES|AXES_SHAPER_CALIBRATION|COMPARE_BELTS_RESPONSES)$/, 'Measuring resonances'],
  [/^PID_CALIBRATE$/, 'PID tuning'],
  [/^(M109|M190|TEMPERATURE_WAIT)$/, 'Heating'],
  [/^(G0|G1|G2|G3)$/, 'Moving'],
];
export function describe(run) {
  if (!run) return null;
  // the jog and move buttons wrap a G1 in a saved G-code state
  if (/^SAVE_GCODE_STATE$/.test(run.cmd) && /\nG1 /.test(run.script)) return t('Moving');
  for (const [re, label] of KNOWN) if (re.test(run.cmd)) return t(label);
  return t('Running {cmd}', { cmd: run.cmd });
}

// a heater still on its way up to its target (more than 2° below), extruders first
export function heatingNow(status) {
  const names = status.heaters?.available_heaters || [];
  const order = (n) => (n.startsWith('extruder') ? 0 : n === 'heater_bed' ? 1 : 2);
  return (
    [...names]
      .sort((a, b) => order(a) - order(b))
      .map((n) => ({ n, s: status[n] || {} }))
      .find(({ s }) => s.target > 0 && s.target - (s.temperature ?? 0) > 2) || null
  );
}

const now = ref(Date.now());
let tick = null;
watch(
  () => !!state.running,
  (on) => {
    clearInterval(tick);
    tick = on ? setInterval(() => (now.value = Date.now()), 1000) : null;
    now.value = Date.now();
  },
);
const secs = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};

export const activity = computed(() => {
  if (!state.connected || state.klippy !== 'ready' || isPrinting.value) return null;
  const run = state.running;
  const h = heatingNow(state.status);
  const heat =
    h &&
    t('{heater} {temp}° / {target}°', {
      heater: prettyName(h.n),
      temp: Math.round(h.s.temperature ?? 0),
      target: Math.round(h.s.target),
    });
  const msg = (S('display_status').message || '').trim();
  if (run) return { title: describe(run), detail: heat || msg || secs(now.value - run.at) };
  if (h) return { title: t('Heating'), detail: heat };
  // started from somewhere else (another client, a macro button on the printer): Klipper only says it is busy
  if (S('idle_timeout').state === 'Printing') return { title: t('Busy'), detail: msg || t('A command is running') };
  return null;
});
