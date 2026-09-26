// The calibration commands the Calibrations page knows: Klipper's own (PID, input shaper, probe, leveling) and
// the ones common plugins add (Shake&Tune, Beacon, Cartographer, klipper_z_calibration, TMC autotune).
// A tab shows only when the printer has at least one of its commands. Commands that look like calibrations
// but are not in this list (a macro named FLOW_CALIBRATION, say) end up in the "Other" tab.
// parseResult() reads the useful numbers out of the console lines a command printed.

// param: { k: name, def: placeholder, hint, req: needed to run, opts: (ctx) => choices }
// ctx: { status, objects } from the store
const named = (re) => (ctx) =>
  ctx.objects
    .map((o) => re.exec(o))
    .filter(Boolean)
    .map((m) => m[1]);
const heaters = (ctx) => ctx.status.heaters?.available_heaters || [];
const tmcSteppers = named(/^tmc\w+ (.+)$/);
const eddyChips = named(/^probe_eddy_current (.+)$/);
const tempProbes = named(/^temperature_probe (.+)$/);

export const SHAKETUNE_CMDS = [
  'AXES_SHAPER_CALIBRATION',
  'COMPARE_BELTS_RESPONSES',
  'CREATE_VIBRATIONS_PROFILE',
  'AXES_MAP_CALIBRATION',
  'EXCITATE_AXIS_AT_FREQ',
];

export const GROUPS = [
  {
    key: 'shaper',
    name: 'Input shaper',
    icon: 'pulse',
    items: [
      {
        cmd: 'SHAPER_CALIBRATE',
        name: 'Input shaper calibration',
        desc: 'Shakes X and Y with the accelerometer and suggests an input shaper. The result can be saved with SAVE_CONFIG.',
        home: true,
        params: [
          { k: 'AXIS', def: 'x + y', hint: '', opts: () => ['', 'x', 'y'] },
          { k: 'FREQ_START', def: '5', hint: 'Hz' },
          { k: 'FREQ_END', def: '133.33', hint: 'Hz' },
          { k: 'HZ_PER_SEC', def: '1', hint: '' },
          { k: 'MAX_SMOOTHING', def: '', hint: '' },
        ],
      },
      {
        cmd: 'MEASURE_AXES_NOISE',
        name: 'Accelerometer noise',
        desc: 'Measures the noise of the accelerometer while the printer stands still.',
      },
      {
        cmd: 'ACCELEROMETER_QUERY',
        name: 'Accelerometer check',
        desc: 'Reads the accelerometer once, to see that it is connected.',
      },
    ],
  },
  {
    key: 'heaters',
    name: 'Heaters',
    icon: 'flame',
    items: [
      {
        cmd: 'PID_CALIBRATE',
        name: 'PID tuning',
        desc: 'Heats the heater to the target a few times and calculates its PID values. The result can be saved with SAVE_CONFIG.',
        params: [
          { k: 'HEATER', def: 'extruder', hint: '', req: true, opts: heaters },
          { k: 'TARGET', def: '', hint: '°C', req: true },
        ],
      },
      {
        cmd: 'MPC_CALIBRATE',
        name: 'MPC calibration',
        desc: 'Measures the heater model for model predictive control (Kalico).',
        params: [
          { k: 'HEATER', def: 'extruder', hint: '', req: true, opts: heaters },
          { k: 'TARGET', def: '', hint: '°C' },
        ],
      },
    ],
  },
  {
    key: 'probe',
    name: 'Probe and Z',
    icon: 'tap',
    items: [
      {
        cmd: 'PROBE_CALIBRATE',
        name: 'Probe Z offset',
        desc: 'Finds the probe z_offset with the paper test.',
        home: true,
      },
      {
        cmd: 'PROBE_ACCURACY',
        name: 'Probe accuracy',
        desc: 'Probes the same point several times and shows how much the results spread.',
        home: true,
        params: [
          { k: 'SAMPLES', def: '10', hint: '' },
          { k: 'SAMPLE_RETRACT_DIST', def: '', hint: 'mm' },
          { k: 'PROBE_SPEED', def: '', hint: 'mm/s' },
        ],
      },
      {
        cmd: 'Z_ENDSTOP_CALIBRATE',
        name: 'Z endstop position',
        desc: 'Finds position_endstop of Z with the paper test.',
        home: true,
      },
      {
        cmd: 'LDC_CALIBRATE_DRIVE_CURRENT',
        name: 'Eddy drive current',
        desc: 'Finds the drive current of an eddy current probe. Put the nozzle about 20 mm above the bed first.',
        params: [{ k: 'CHIP', def: '', hint: '', req: true, opts: eddyChips }],
      },
      {
        cmd: 'PROBE_EDDY_CURRENT_CALIBRATE',
        name: 'Eddy height map',
        desc: 'Maps frequency to height for an eddy current probe, starting with the paper test.',
        home: true,
        params: [{ k: 'CHIP', def: '', hint: '', req: true, opts: eddyChips }],
      },
      {
        cmd: 'TEMPERATURE_PROBE_CALIBRATE',
        name: 'Probe temperature drift',
        desc: 'Measures how the probe drifts with temperature.',
        home: true,
        params: [
          { k: 'PROBE', def: '', hint: '', req: true, opts: tempProbes },
          { k: 'TARGET', def: '', hint: '°C', req: true },
          { k: 'STEP', def: '2', hint: '°C' },
        ],
      },
      { cmd: 'BEACON_CALIBRATE', name: 'Beacon calibration', desc: 'Beacon probe calibration.', home: true },
      {
        cmd: 'BEACON_AUTO_CALIBRATE',
        name: 'Beacon auto calibration',
        desc: 'Beacon contact calibration.',
        home: true,
      },
      {
        cmd: 'CARTOGRAPHER_CALIBRATE',
        name: 'Cartographer calibration',
        desc: 'Cartographer probe calibration.',
        home: true,
      },
      {
        cmd: 'CARTOGRAPHER_SCAN_CALIBRATE',
        name: 'Cartographer scan calibration',
        desc: 'Cartographer scan mode calibration.',
        home: true,
      },
      {
        cmd: 'CARTOGRAPHER_TOUCH_CALIBRATE',
        name: 'Cartographer touch calibration',
        desc: 'Cartographer touch mode calibration.',
        home: true,
      },
      {
        cmd: 'CALIBRATE_Z',
        name: 'Automatic Z calibration',
        desc: 'klipper_z_calibration: sets the Z offset from the Z endstop, the probe and the bed.',
        home: true,
      },
    ],
  },
  {
    key: 'level',
    name: 'Bed leveling',
    icon: 'tilt',
    items: [
      {
        cmd: 'SCREWS_TILT_CALCULATE',
        name: 'Bed screws',
        desc: 'Probes next to each bed screw and says how far to turn it.',
        home: true,
      },
      { cmd: 'Z_TILT_ADJUST', name: 'Z tilt', desc: 'Levels the bed with the Z motors.', home: true },
      {
        cmd: 'QUAD_GANTRY_LEVEL',
        name: 'Quad gantry level',
        desc: 'Levels the gantry with the four Z motors.',
        home: true,
      },
      {
        cmd: 'BED_MESH_CALIBRATE',
        name: 'Bed mesh',
        desc: 'Probes the bed and saves a mesh. The Heightmap page shows it.',
        home: true,
        params: [{ k: 'PROFILE', def: 'default', hint: '' }],
      },
      { cmd: 'BED_TILT_CALIBRATE', name: 'Bed tilt', desc: 'Measures the bed tilt.', home: true },
      { cmd: 'DELTA_CALIBRATE', name: 'Delta calibration', desc: 'Calibrates a delta printer.', home: true },
    ],
  },
  {
    key: 'motors',
    name: 'Motors',
    icon: 'motor',
    items: [
      {
        cmd: 'AUTOTUNE_TMC',
        name: 'TMC autotune',
        desc: 'Tunes the TMC driver settings from the motor data (klipper_tmc_autotune).',
        params: [{ k: 'STEPPER', def: '', hint: '', opts: tmcSteppers }],
      },
      {
        cmd: 'ENDSTOP_PHASE_CALIBRATE',
        name: 'Endstop phase',
        desc: 'Reports the stepper phase at the endstop.',
        params: [{ k: 'STEPPER', def: '', hint: '', opts: tmcSteppers }],
      },
    ],
  },
];

const KNOWN = new Set([...SHAKETUNE_CMDS, ...GROUPS.flatMap((g) => g.items.map((i) => i.cmd))]);
const LOOKS_LIKE = /CALIBRAT|TUNE|(^|_)CAL(_|$)/i;

// the tabs this printer has: [{ key, name, icon, items }] with only the commands that exist
export function availableGroups(commands) {
  const names = new Map(Object.keys(commands || {}).map((c) => [c.toUpperCase(), c]));
  const out = [];
  if ([...names.keys()].some((c) => /^_?AXES_SHAPER_CALIBRATION$/.test(c)))
    out.push({ key: 'shaketune', name: 'Shake&Tune', icon: 'wave', items: [] });
  for (const g of GROUPS) {
    const items = g.items.filter((i) => names.has(i.cmd));
    if (items.length) out.push({ ...g, items });
  }
  const other = [...names.keys()]
    .filter((c) => !c.startsWith('_') && !KNOWN.has(c) && !KNOWN.has(c.replace(/^_/, '')) && LOOKS_LIKE.test(c))
    .sort()
    .map((c) => ({ cmd: c, name: c, desc: String(commands[names.get(c)] || ''), free: true }));
  if (other.length) out.push({ key: 'other', name: 'Other', icon: 'wrench', items: other });
  return out;
}

// the command line from an item and the typed values. Values are single words, anything else is dropped.
export function buildCommand(item, vals, extra = '') {
  const p = (item.params || [])
    .map((x) => [x.k, String(vals[x.k] ?? '').trim()])
    .filter(([, v]) => v && /^[A-Za-z0-9._-]+$/.test(v))
    .map(([k, v]) => `${k}=${v}`);
  const e = String(extra || '')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9_]+=[A-Za-z0-9._-]+$/.test(w));
  return [item.cmd, ...p, ...e].join(' ');
}
export const missingParams = (item, vals) =>
  (item.params || []).filter((x) => x.req && !String(vals[x.k] ?? '').trim()).map((x) => x.k);

// numbers worth showing from the console output. rows: [[label, value]], shapers: [{ axis, type, freq, maxAccel }]
export function parseResult(cmd, lines) {
  const rows = [],
    shapers = [];
  let accel = {};
  for (const text of lines)
    for (const line of String(text).split('\n')) {
      let m;
      if ((m = /smoothing with '(\w+)', suggested max_accel <= ([\d.]+)/i.exec(line)))
        accel[m[1].toLowerCase()] = +m[2];
      else if ((m = /Recommended shaper_type_([xy]) = (\w+), shaper_freq_[xy] = ([\d.]+) Hz/i.exec(line))) {
        const type = m[2].toLowerCase();
        shapers.push({ axis: m[1].toLowerCase(), type, freq: +m[3], maxAccel: accel[type] ?? null });
        accel = {};
      } else if ((m = /PID parameters:\s*pid_Kp=([\d.]+)\s+pid_Ki=([\d.]+)\s+pid_Kd=([\d.]+)/i.exec(line)))
        rows.push(['pid_Kp', m[1]], ['pid_Ki', m[2]], ['pid_Kd', m[3]]);
      else if ((m = /probe accuracy results:\s*(.+)/i.exec(line)))
        for (const part of m[1].split(','))
          (m = /^\s*([a-z ]+?)\s+([-\d.]+)\s*$/i.exec(part)) && rows.push([m[1], m[2]]);
      else if ((m = /Retries:\s*(\d+)\/(\d+)\s+Probed points range:\s*([\d.]+)\s+tolerance:\s*([\d.]+)/i.exec(line))) {
        const keep = rows.filter((r) => !['Retries', 'range', 'tolerance'].includes(r[0]));
        rows.length = 0;
        rows.push(...keep, ['Retries', m[1] + '/' + m[2]], ['range', m[3]], ['tolerance', m[4]]);
      } else if ((m = /Axes noise for (.+?):\s*(.+)/i.exec(line))) rows.push([m[1], m[2]]);
      else if ((m = /accelerometer values \(x, y, z\):\s*(.+)/i.exec(line))) rows.push(['x, y, z', m[1]]);
    }
  return { rows, shapers };
}
