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
  let total = info.total_layer > 0 ? info.total_layer : null;
  const h = meta.layer_height,
    first = meta.first_layer_height || h;
  if (total == null && h > 0 && meta.object_height > 0)
    total = Math.max(1, Math.round((meta.object_height - first) / h) + 1);
  let cur = hasCurrent
    ? info.current_layer
    : h > 0 && extrusionZ > 0
      ? Math.max(1, Math.round((extrusionZ - first) / h) + 1)
      : 0;
  if (total > 0) cur = Math.min(cur, total);
  return { cur, total: total || 0, estimated: !hasCurrent };
}
