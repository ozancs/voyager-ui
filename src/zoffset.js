// Baby steps during a print change the Z offset only until Klipper restarts. When a print that was baby-stepped
// ends, a message offers to write the offset into the config (Z_OFFSET_APPLY_PROBE / _ENDSTOP, then SAVE_CONFIG),
// so a first layer that was dialed in by hand is not lost.
import { watch } from 'vue';
import { state, S, printState, gcode, toast, askConfirm } from './store';
import { t } from './i18n';

const zoff = () => S('gcode_move').homing_origin?.[2] ?? 0;
const hasProbe = () => state.objects.some((o) => /^(probe|bltouch|scanner)$|^(probe_eddy|beacon|cartographer)/.test(o));

let startOff = null; // Z offset when the print started
let wired = false;
export function initZOffset() {
  if (wired) return;
  wired = true;
  watch(printState, (now, was) => {
    const active = (s) => s === 'printing' || s === 'paused';
    if (active(now) && !active(was)) startOff = zoff();
    if (!active(now) && active(was) && startOff !== null) {
      const off = zoff();
      const delta = Math.round((off - startOff) * 1000) / 1000;
      startOff = null;
      if (!delta || !off) return;
      toast(
        t('Z offset changed by {d} mm during this print ({z} mm now). Keep it for the next prints?', {
          d: (delta > 0 ? '+' : '') + delta.toFixed(3),
          z: off.toFixed(3),
        }),
        'info',
        { ms: 30000, action: { label: t('Save to config'), run: save } },
      );
    }
  });
}
async function save() {
  const ok = await askConfirm({
    title: t('Save Z offset?'),
    text: t('The offset is written into the config and Klipper restarts (SAVE_CONFIG). The printer must be idle.'),
    ok: t('Save and restart'),
  });
  if (!ok) return;
  try {
    await gcode(hasProbe() ? 'Z_OFFSET_APPLY_PROBE' : 'Z_OFFSET_APPLY_ENDSTOP');
    await gcode('SAVE_CONFIG');
  } catch (e) {
    toast(e.message, 'error');
  }
}
