// Pause at several layers in one go (50, 120, 200): Klipper's SET_PAUSE_AT_LAYER holds one layer at a time, so
// the rest wait here and the next one is set as soon as the one before has paused the print. Kept in the settings
// (per printer, with the file it belongs to), so a reload or another browser carries on. Needs a page open on
// this printer between the pauses; the first one is in Klipper and works without.
import { watch, computed } from 'vue';
import { state, S, gcode, printState, layerInfo } from './store';

const atLayer = computed(
  () =>
    S('gcode_macro SET_PRINT_STATS_INFO').pause_at_layer || S('gcode_macro SET_PAUSE_AT_LAYER').pause_at_layer || {},
);
export const pauseQueue = computed(() => {
  const q = state.settings.pauseQueue;
  return q && q.file === S('print_stats').filename
    ? (q.layers || []).filter((n) => n > (layerInfo.value.cur || 0))
    : [];
});
export function setPauseQueue(layers) {
  const l = [...new Set(layers.map((n) => Math.round(n)).filter((n) => n > 0))].sort((a, b) => a - b);
  state.settings.pauseQueue = l.length ? { file: S('print_stats').filename, layers: l } : null;
  lastArmed = null;
  return l;
}
let lastArmed = null;
export function initPauseQueue() {
  watch(
    () => [printState.value, atLayer.value.enable, atLayer.value.layer, layerInfo.value.cur, state.settings.pauseQueue],
    () => {
      const q = state.settings.pauseQueue;
      if (!q) return;
      const active = ['printing', 'paused'].includes(printState.value);
      if (!active || q.file !== S('print_stats').filename) {
        // the print ended (or another file runs): its list goes
        if (!active && ['complete', 'cancelled', 'error', 'standby'].includes(printState.value))
          state.settings.pauseQueue = null;
        return;
      }
      const next = pauseQueue.value[0];
      if (next == null) return (state.settings.pauseQueue = null);
      if (atLayer.value.enable || lastArmed === next) return;
      lastArmed = next;
      gcode(`SET_PAUSE_AT_LAYER ENABLE=1 LAYER=${next}`).catch(() => (lastArmed = null));
    },
  );
}
