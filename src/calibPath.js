// Interactive calibration: the order a printer is usually tuned in, as steps the UI walks through with a
// picture of what is happening. This file decides which steps a printer has and reads Klipper's console output
// into numbers; CalibPath.vue draws it. Pure functions, no store import.

// ctx: { commands: {NAME: help}, settings: configfile.settings, heaters: [names] }
export function pathSteps(ctx) {
  const has = (c) => !!ctx.commands && c in ctx.commands;
  const set = ctx.settings || {};
  const heaters = ctx.heaters || [];
  const probe = Object.keys(set).some((k) =>
    /^(probe|bltouch|smart_effector|probe_eddy_current \w+|beacon|cartographer)$/.test(k),
  );
  const out = [];
  if (heaters.includes('extruder') && has('PID_CALIBRATE'))
    out.push({ key: 'pid_extruder', kind: 'pid', heater: 'extruder', name: 'Hotend PID', target: 245 });
  if (heaters.includes('heater_bed') && has('PID_CALIBRATE'))
    out.push({ key: 'pid_bed', kind: 'pid', heater: 'heater_bed', name: 'Bed PID', target: 80 });
  if (set.quad_gantry_level && has('QUAD_GANTRY_LEVEL'))
    out.push({ key: 'level', kind: 'level', cmd: 'QUAD_GANTRY_LEVEL', name: 'Gantry leveling' });
  else if (set.z_tilt && has('Z_TILT_ADJUST'))
    out.push({ key: 'level', kind: 'level', cmd: 'Z_TILT_ADJUST', name: 'Z tilt' });
  if (set.screws_tilt_adjust && has('SCREWS_TILT_CALCULATE'))
    out.push({ key: 'screws', kind: 'screws', cmd: 'SCREWS_TILT_CALCULATE', name: 'Bed screws' });
  if (probe && has('PROBE_ACCURACY'))
    out.push({ key: 'accuracy', kind: 'accuracy', cmd: 'PROBE_ACCURACY', name: 'Probe accuracy' });
  if (probe && has('PROBE_CALIBRATE'))
    out.push({ key: 'zoffset', kind: 'zoffset', cmd: 'PROBE_CALIBRATE', name: 'Z offset' });
  else if (has('Z_ENDSTOP_CALIBRATE'))
    out.push({ key: 'zoffset', kind: 'zoffset', cmd: 'Z_ENDSTOP_CALIBRATE', name: 'Z endstop' });
  if (set.bed_mesh && has('BED_MESH_CALIBRATE'))
    out.push({ key: 'mesh', kind: 'mesh', cmd: 'BED_MESH_CALIBRATE', name: 'Bed mesh' });
  if (set.resonance_tester && has('SHAPER_CALIBRATE'))
    out.push({ key: 'shaper', kind: 'shaper', cmd: 'SHAPER_CALIBRATE', name: 'Input shaper' });
  return out;
}

const lines = (list) => list.flatMap((l) => String(l).split('\n')).map((l) => l.replace(/^\/\/\s?/, '').trim());

export function parsePid(list) {
  for (const l of lines(list)) {
    const m = /PID parameters:\s*pid_Kp=([\d.]+)\s+pid_Ki=([\d.]+)\s+pid_Kd=([\d.]+)/i.exec(l);
    if (m) return { kp: +m[1], ki: +m[2], kd: +m[3] };
  }
  return null;
}

// "probe at 150.000,150.000 is z=1.234567"
export function parseProbes(list) {
  const out = [];
  for (const l of lines(list)) {
    const m = /probe at ([-\d.]+),([-\d.]+) is z=([-\d.]+)/i.exec(l);
    if (m) out.push({ x: +m[1], y: +m[2], z: +m[3] });
  }
  return out;
}

export function parseAccuracy(list) {
  for (const l of lines(list)) {
    const m = /probe accuracy results:\s*(.+)/i.exec(l);
    if (!m) continue;
    const r = {};
    for (const part of m[1].split(',')) {
      const p = /^\s*([a-z ]+?)\s+([-\d.]+)\s*$/i.exec(part);
      if (p) r[p[1].toLowerCase().replace(/ /g, '_')] = +p[2];
    }
    return r;
  }
  return null;
}
// how good a probe range is, in plain words (a range of a few microns is what good probes do)
export const accuracyGrade = (range) =>
  range == null ? '' : range <= 0.005 ? 'great' : range <= 0.015 ? 'good' : 'poor';

// Z tilt / QGL: one entry per pass, the last one under tolerance means done
export function parseLevel(list) {
  const out = [];
  for (const l of lines(list)) {
    const m = /Retries:\s*(\d+)\/(\d+)\s+Probed points range:\s*([\d.]+)\s+tolerance:\s*([\d.]+)/i.exec(l);
    if (m) out.push({ retry: +m[1], max: +m[2], range: +m[3], tol: +m[4] });
  }
  return out;
}

// "front right : x=380.0, y=20.0, z=2.52344 : adjust CW 01:05"
export function parseScrews(list) {
  const out = [];
  for (const l of lines(list)) {
    const m =
      /^(.+?)\s*(\(base\))?\s*:\s*x=([-\d.]+),\s*y=([-\d.]+),\s*z=([-\d.]+)(?:\s*:\s*adjust\s+(CW|CCW)\s+(\d+):(\d+))?/i.exec(
        l,
      );
    if (m)
      out.push({
        name: m[1].replace(/\s*screw$/i, '').trim(),
        base: !!m[2],
        x: +m[3],
        y: +m[4],
        z: +m[5],
        dir: m[6] ? m[6].toUpperCase() : '',
        turns: m[7] ? +m[7] + +m[8] / 60 : 0,
        text: m[7] ? `${m[7]}:${m[8]}` : '',
      });
  }
  return out;
}

// SHAPER_CALIBRATE: the fitted shapers of each axis and the recommendation
export function parseShaper(list) {
  const axes = {};
  let fits = [],
    accel = {};
  for (const l of lines(list)) {
    let m;
    if (
      (m = /Fitted shaper '(\w+)' frequency = ([\d.]+) Hz \(vibrations = ([\d.]+)%, smoothing ~= ([\d.]+)\)/i.exec(l))
    )
      fits.push({ type: m[1].toLowerCase(), freq: +m[2], vib: +m[3], smooth: +m[4] });
    else if ((m = /smoothing with '(\w+)', suggested max_accel <= ([\d.]+)/i.exec(l)))
      accel[m[1].toLowerCase()] = +m[2];
    else if ((m = /Recommended shaper_type_([xy]) = (\w+), shaper_freq_[xy] = ([\d.]+) Hz/i.exec(l))) {
      const type = m[2].toLowerCase();
      axes[m[1].toLowerCase()] = {
        fits: fits.map((f) => ({ ...f, maxAccel: accel[f.type] ?? null })),
        type,
        freq: +m[3],
        maxAccel: accel[type] ?? null,
      };
      fits = [];
      accel = {};
    }
  }
  return axes;
}

// after ACCEPT: "probe: z_offset: 1.234" or "stepper_z: position_endstop: 0.5"
export function parseZOffset(list) {
  for (const l of lines(list)) {
    const m = /(z_offset|position_endstop):\s*([-\d.]+)/i.exec(l);
    if (m) return { key: m[1], value: +m[2] };
  }
  return null;
}
