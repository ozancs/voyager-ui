// Own dashboard layout on one device. The layout (LAYOUT_KEYS in store.js) is part of the printer's settings,
// shared by every browser. A device that keeps its own stores it in settings.deviceLayouts[id] instead, and the
// shared layout stays as the other browsers left it. These are the two conversions between the settings as
// stored on the printer and the settings this device shows.

const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

// Older snapshots included the backup list itself. Drop that field before any deep copy:
// traversing the nested history is the expensive part, even when only five entries are visible.
export function compactLayoutHistory(layout) {
  if (!Array.isArray(layout?.layoutBackups)) return layout;
  const layoutBackups = layout.layoutBackups.slice(0, 5).flatMap((backup) => {
    if (!backup?.data || typeof backup.data !== 'object') return [];
    const { layoutBackups: nested, ...data } = backup.data;
    return [{ ...backup, data }];
  });
  return { ...layout, layoutBackups };
}

export function compactStoredHistories(settings) {
  const shared = compactLayoutHistory(settings);
  if (!shared?.deviceLayouts) return shared;
  const deviceLayouts = Object.fromEntries(
    Object.entries(shared.deviceLayouts).map(([id, entry]) => [
      id,
      { ...entry, data: compactLayoutHistory(entry?.data) },
    ]),
  );
  return { ...shared, deviceLayouts };
}

export function pickLayout(settings, keys) {
  const o = {};
  for (const k of keys) o[k] = clone(settings?.[k]);
  return o;
}

// stored settings (already merged with the defaults) -> shown on this device: its own layout replaces the shared one
export function withOwnLayout(merged, stored, id, keys, defaults) {
  const own = id && stored?.deviceLayouts?.[id]?.data;
  if (!own) return merged;
  for (const k of keys) merged[k] = clone(own[k] ?? defaults[k]);
  return merged;
}

// The dashboard is drawn at the width its layout was arranged at (layoutWidths) and zoomed down to fit. A layout
// copied from another browser still carries that browser's width, so a smaller screen (a tablet) shows it shrunk.
// While the device's layout is still that copy, forget the width: the dashboard then fits this screen, and the
// first Customize here records this device's own width.
export function fitToDevice(shown, shared) {
  if (JSON.stringify(shown?.layoutWidths ?? null) === JSON.stringify(shared?.layoutWidths ?? null))
    shown.layoutWidths = null;
  return shown;
}

// shown on this device -> to store: the device's layout goes to deviceLayouts[id], the shared layout is put back
export function toStored(shown, shared, device, keys, now = Date.now()) {
  const v = clone(shown);
  if (!device || !shared) return v;
  v.deviceLayouts = {
    ...(v.deviceLayouts || {}),
    [device.id]: { name: device.name, t: now, data: pickLayout(shown, keys) },
  };
  for (const k of keys) v[k] = clone(shared[k]);
  return v;
}
