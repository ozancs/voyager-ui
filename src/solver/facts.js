// Problem Solver: what can be read about a print, kept apart by where it comes from, so a finding never passes
// today's printer off as the print's. Pure functions (the reading itself is in ProblemSolver.vue):
//  - file:  the G-code as it is now: Moonraker's metadata and the slicer's settings block (PrusaSlicer, OrcaSlicer,
//           SuperSlicer and Bambu Studio write "; key = value" lines; Cura writes almost none)
//  - print: what Moonraker's history kept when the print ran (status, its metadata copy, the Spoolman spool)
//  - today: the printer's config and live values now
//  - unknown: what none of them says

// the first value of a setting that may list one per extruder ("250,250"), as a number when it is one
const first = (v) => {
  if (v == null) return null;
  const s = String(v).split(/[,;]/)[0].trim().replace(/^"|"$/g, '');
  if (s === '' || s === 'nil') return null;
  const n = Number(s.replace(/%$/, ''));
  return Number.isFinite(n) && !/%$/.test(s) ? n : s;
};
// the slicer's settings block: "; key = value" lines (at the end of the file for most slicers)
export function parseSlicerConfig(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const m = /^;\s*([a-z][a-z0-9_]*)\s*=\s*(.*?)\s*$/i.exec(line);
    if (m && !(m[1] in out)) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}
// one setting under the names the slicers use for it
const pick = (cfg, ...names) => {
  for (const n of names) if (cfg[n] != null && cfg[n] !== '') return first(cfg[n]);
  return null;
};
// the slicer settings that matter for the problems, by meaning; null when the file does not say
export function slicerSettings(cfg) {
  return {
    filament: pick(cfg, 'filament_type'),
    nozzleTemp: pick(cfg, 'nozzle_temperature', 'temperature'),
    firstNozzleTemp: pick(cfg, 'nozzle_temperature_initial_layer', 'first_layer_temperature'),
    bedTemp: pick(cfg, 'hot_plate_temp', 'textured_plate_temp', 'bed_temperature'),
    firstBedTemp: pick(cfg, 'hot_plate_temp_initial_layer', 'first_layer_bed_temperature'),
    layer: pick(cfg, 'layer_height'),
    firstLayer: pick(cfg, 'initial_layer_print_height', 'first_layer_height'),
    lineWidth: pick(cfg, 'inner_wall_line_width', 'line_width', 'perimeter_extrusion_width', 'extrusion_width'),
    outerSpeed: pick(cfg, 'outer_wall_speed', 'external_perimeter_speed'),
    innerSpeed: pick(cfg, 'inner_wall_speed', 'perimeter_speed'),
    infillSpeed: pick(cfg, 'sparse_infill_speed', 'infill_speed'),
    firstSpeed: pick(cfg, 'initial_layer_speed', 'first_layer_speed'),
    travelSpeed: pick(cfg, 'travel_speed'),
    overhangSpeed: pick(cfg, 'overhang_3_4_speed', 'overhang_speed', 'bridge_speed'),
    accel: pick(cfg, 'default_acceleration'),
    outerAccel: pick(cfg, 'outer_wall_acceleration', 'external_perimeter_acceleration', 'perimeter_acceleration'),
    travelAccel: pick(cfg, 'travel_acceleration'),
    retract: pick(cfg, 'retraction_length', 'retract_length'),
    retractSpeed: pick(cfg, 'retraction_speed', 'retract_speed'),
    zhop: pick(cfg, 'z_hop', 'retract_lift'),
    wipe: pick(cfg, 'wipe'),
    fwRetract: pick(cfg, 'use_firmware_retraction'),
    fanMin: pick(cfg, 'fan_min_speed', 'min_fan_speed'),
    fanMax: pick(cfg, 'fan_max_speed', 'max_fan_speed'),
    overhangFan: pick(cfg, 'overhang_fan_speed', 'bridge_fan_speed'),
    seam: pick(cfg, 'seam_position'),
    brim: pick(cfg, 'brim_width'),
    footComp: pick(cfg, 'elefant_foot_compensation', 'elephant_foot_compensation'),
    maxFlow: pick(cfg, 'filament_max_volumetric_speed'),
    pa: (() => {
      const on = pick(cfg, 'enable_pressure_advance');
      return on == null || on === 0 ? null : pick(cfg, 'pressure_advance');
    })(),
  };
}

// what usually works for a material, a general guide (not this printer's numbers)
export const RANGES = {
  PLA: { nozzle: [190, 220], bed: [50, 65], shrinks: false, wet: false },
  PETG: { nozzle: [225, 250], bed: [70, 85], shrinks: false, wet: true },
  ABS: { nozzle: [235, 260], bed: [95, 110], shrinks: true, wet: false },
  ASA: { nozzle: [240, 260], bed: [95, 110], shrinks: true, wet: false },
  TPU: { nozzle: [210, 235], bed: [30, 60], shrinks: false, wet: true },
  PA: { nozzle: [250, 285], bed: [70, 90], shrinks: true, wet: true },
  PC: { nozzle: [260, 300], bed: [100, 120], shrinks: true, wet: true },
};
export function material(name) {
  const n = String(name || '').toUpperCase();
  if (!n) return null;
  if (/NYLON|^PA/.test(n)) return 'PA';
  for (const k of Object.keys(RANGES)) if (n.includes(k)) return k;
  return null;
}

// the printer now, from configfile.settings and the live status
export function printerToday(status) {
  const set = status.configfile?.settings || {};
  const ex = status.extruder || {};
  const th = status.toolhead || {};
  const is = set.input_shaper;
  const probe = Object.entries(set).find(([k]) =>
    /^(probe|bltouch|smart_effector|probe_eddy_current \w+|beacon|cartographer)$/.test(k),
  )?.[1];
  const tmc = (axis) => {
    const k = Object.keys(set).find((n) => new RegExp(`^tmc\\d+ stepper_${axis}$`).test(n));
    return k ? set[k].run_current : null;
  };
  return {
    pa: ex.pressure_advance ?? set.extruder?.pressure_advance ?? null,
    smooth: ex.smooth_time ?? set.extruder?.pressure_advance_smooth_time ?? null,
    maxAccel: th.max_accel ?? set.printer?.max_accel ?? null,
    scv: th.square_corner_velocity ?? set.printer?.square_corner_velocity ?? null,
    shaper: is
      ? {
          x: is.shaper_freq_x ? { type: is.shaper_type_x || is.shaper_type || 'mzv', freq: is.shaper_freq_x } : null,
          y: is.shaper_freq_y ? { type: is.shaper_type_y || is.shaper_type || 'mzv', freq: is.shaper_freq_y } : null,
        }
      : null,
    probeOffset: probe?.z_offset ?? null,
    zAdjust: status.gcode_move?.homing_origin?.[2] ?? null,
    mesh: status.bed_mesh ? status.bed_mesh.profile_name || '' : null,
    hasMesh: !!set.bed_mesh,
    fwRetract: set.firmware_retraction
      ? { len: status.firmware_retraction?.retract_length ?? set.firmware_retraction.retract_length ?? null }
      : null,
    rotation: set.extruder?.rotation_distance ?? null,
    current: { x: tmc('x'), y: tmc('y') },
    hasFan: !!set.fan,
  };
}

// volumetric flow of a line in mm³/s (speed × layer × width), null when a number is missing
export function flowOf(speed, layer, width) {
  if (![speed, layer, width].every((v) => typeof v === 'number' && v > 0)) return null;
  return Math.round(speed * layer * width * 10) / 10;
}

// everything known about one print, by source. meta: Moonraker's file metadata (now); cfg: the parsed slicer
// settings block; job: the history entry when the print was picked from History; status: the live printer status
export function buildFacts({ meta = null, cfg = {}, job = null, fileModified = null, status = {} }) {
  const s = slicerSettings(cfg);
  const m = meta || {};
  const file = {
    ...s,
    exists: !!meta,
    hasConfig: Object.keys(cfg).length > 0,
    slicer: m.slicer ? `${m.slicer}${m.slicer_version ? ' ' + m.slicer_version : ''}` : null,
    filament: s.filament ?? m.filament_type ?? null,
    nozzleTemp: s.nozzleTemp ?? m.first_layer_extr_temp ?? null,
    bedTemp: s.bedTemp ?? m.first_layer_bed_temp ?? null,
    layer: s.layer ?? m.layer_height ?? null,
    nozzle: m.nozzle_diameter ?? null,
  };
  let print = null;
  if (job) {
    const spool = (job.auxiliary_data || []).find((d) => d.name === 'spool_ids')?.value;
    const then = job.metadata || {};
    print = {
      status: job.status,
      start: job.start_time,
      duration: job.print_duration,
      filamentUsed: job.filament_used,
      spoolIds: Array.isArray(spool) ? spool : null,
      slicer: then.slicer ? `${then.slicer}${then.slicer_version ? ' ' + then.slicer_version : ''}` : null,
      filament: then.filament_type ?? null,
      nozzleTemp: then.first_layer_extr_temp ?? null,
      bedTemp: then.first_layer_bed_temp ?? null,
      // the file was sliced again (or replaced) after this print: what it says now may not be what printed
      fileChanged: !!(then.modified && fileModified && Math.abs(then.modified - fileModified) > 1),
      fileGone: job.exists === false,
    };
  }
  const mat = material(file.filament ?? print?.filament);
  return { file, print, today: printerToday(status), mat, range: mat ? RANGES[mat] : null };
}
