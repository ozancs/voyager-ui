// A settings backup is one file with everything; a restore can take only some parts of it (the dashboard cards
// of one printer onto another, without its name, presets or theme). PARTS groups the settings keys, anything not
// listed belongs to 'other'. Parts not picked keep what this printer has now.
export const PARTS = [
  {
    id: 'dash',
    name: 'Dashboard cards',
    keys: [
      'layout',
      'layoutPrint',
      'hiddenCards',
      'hiddenCardsPrint',
      'mobileOrder',
      'customCards',
      'cardOpts',
      'cardColors',
      'collapsed',
      'autoLayout',
      'compactCards',
      'layoutBackups',
      'strip',
      'devices',
      'ledfxSeen',
      'mmuSeen',
    ],
  },
  { id: 'fav', name: 'Favorites', keys: ['favorites', 'favBar', 'favResolved'] },
  { id: 'presets', name: 'Presets', keys: ['presets'] },
  {
    id: 'sensors',
    name: 'Temperature sensors and graph',
    keys: ['hiddenSensors', 'sensorColors', 'sensorOrder', 'sensorIcons', 'graphFill', 'graphLine', 'tempRange'],
  },
  { id: 'control', name: 'Control (jog steps, speeds)', keys: ['control', 'invertZ', 'quickConfig'] },
  {
    id: 'look',
    name: 'Appearance and language',
    keys: [
      'theme',
      'accent',
      'accentReach',
      'bgDark',
      'uiScale',
      'scale100',
      'navMode',
      'printBar',
      'lang',
      'heightmap',
    ],
  },
  {
    id: 'printer',
    name: 'This printer (name, icon, maintenance, heater measurements)',
    keys: ['printerName', 'printerIcon', 'maintenance', 'heaterBase'],
    // moving cards to another printer should not bring the other printer's name along
    off: true,
  },
  { id: 'other', name: 'Everything else', keys: null },
];
// never taken from a file: they say what this browser and this install have already been through
const KEEP = ['setupDone', 'migratedCarbon', 'seenVersion', 'syncImported', 'backupLast'];
const LISTED = new Set(PARTS.flatMap((p) => p.keys || []));
export const partOf = (k) => PARTS.find((p) => p.keys?.includes(k))?.id || 'other';

// the parts a backup file has something for
export const partsIn = (data) =>
  PARTS.filter((p) => Object.keys(data || {}).some((k) => !KEEP.includes(k) && partOf(k) === p.id));

// the settings after restoring the picked parts of `data` over `cur`. A picked part takes the file's value for each
// of its keys, or the default when the file does not have it (an older backup); the rest stays as it is.
export function restoreParts(cur, data, picked, def) {
  const out = { ...cur };
  const pick = new Set(picked);
  const keys = new Set([...Object.keys(def), ...Object.keys(data || {})]);
  for (const k of keys) {
    if (KEEP.includes(k) || !pick.has(partOf(k))) continue;
    if (k in (data || {})) out[k] = data[k];
    else if (LISTED.has(k) || k in def) out[k] = def[k];
  }
  return out;
}
