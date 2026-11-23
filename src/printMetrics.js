// Print progress and time-estimate sources, saved choices, and layer tracking.
export const PROGRESS_METHODS = [
  ['file', 'File'],
  ['relative', 'Relative'],
  ['filament', 'Filament'],
  ['slicer', 'Slicer'],
];
export const TIME_METHODS = [['smart', 'Smart'], ...PROGRESS_METHODS.filter(([id]) => id !== 'relative')];

function savedPrintMethod(value, methods) {
  // Older versions appended each newly selected method. Keep the most recent valid choice.
  const choices = Array.isArray(value) ? [...value].reverse() : [value];
  return choices.find((choice) => methods.some(([id]) => id === choice)) ?? 'slicer';
}

export function savedPrintMethods(settings) {
  // Older clients sharing this printer expect both time settings to be arrays.
  return {
    progressCalc: savedPrintMethod(settings.progressCalc, PROGRESS_METHODS),
    estimateCalc: [savedPrintMethod(settings.estimateCalc, TIME_METHODS)],
    etaCalc: [savedPrintMethod(settings.etaCalc, TIME_METHODS)],
  };
}

// File position and slicer progress are different clocks. Never feed the selected display method
// back into the File estimator, otherwise selecting Slicer silently changes both estimators.
export function fileRemaining(progress, duration) {
  return Number.isFinite(progress) && progress > 0.01 && duration > 0
    ? Math.max(0, duration / Math.min(1, progress) - duration)
    : null;
}
export function slicerRemaining(estimated, duration, fallback = null) {
  // Do not claim "0 seconds left" for the rest of an overrun print.
  return estimated > duration ? estimated - duration : fallback;
}
export function createLayerTracker() {
  let previous = null,
    z = null;
  return (ps, move) => {
    const pos = move.gcode_position;
    const reset =
      !previous ||
      previous.file !== ps.filename ||
      ps.print_duration < previous.duration ||
      !['printing', 'paused', 'complete'].includes(ps.state);
    if (reset) z = null;
    if (pos?.length >= 4 && pos.every(Number.isFinite)) {
      if (!reset && previous?.pos && previous.file === ps.filename && ps.state === 'printing') {
        const old = previous.pos;
        // Reject travel, retract and stationary unretract. Same-Z samples avoid assigning extrusion
        // accumulated before a coalesced Z-hop to the lifted travel height.
        if (
          pos[3] > old[3] + 0.0001 &&
          Math.hypot(pos[0] - old[0], pos[1] - old[1]) > 0.0001 &&
          Math.abs(pos[2] - old[2]) < 0.0001
        )
          z = pos[2];
      }
      previous = { file: ps.filename, duration: ps.print_duration, pos: [...pos] };
    }
    return z;
  };
}
export function layers(info = {}, meta = {}, extrusionZ = null) {
  info ||= {};
  const hasCurrent = Number.isFinite(info.current_layer) && info.current_layer >= 0;
  const reportedTotal = Number.isSafeInteger(info.total_layer) && info.total_layer > 0 ? info.total_layer : 0;
  let total = reportedTotal;
  const h = meta.layer_height,
    first = meta.first_layer_height || h;
  if (!total && h > 0 && meta.object_height > 0) total = Math.max(1, Math.round((meta.object_height - first) / h) + 1);
  let cur = hasCurrent
    ? info.current_layer
    : h > 0 && extrusionZ > 0
      ? Math.max(1, Math.round((extrusionZ - first) / h) + 1)
      : 0;
  // With variable layer heights the printer can advance past the fixed-height estimate.
  // Keep the printer's reading and drop a total it has already disproved.
  if (total && cur > total) {
    if (hasCurrent) total = 0;
    else cur = total;
  }
  return {
    cur,
    total,
    estimated: !hasCurrent,
    confirmedTotal: total && reportedTotal,
    labels: {
      cur: hasCurrent ? String(cur) : cur ? '~' + cur : '--',
      total: total ? (reportedTotal ? '' : '~') + total : '--',
    },
  };
}
