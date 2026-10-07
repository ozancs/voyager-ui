// Browser-side fake Moonraker for the live demo (npm run build:demo). Replaces WebSocket and fetch so the UI runs
// without a printer. Everything is in memory: settings reset on reload, g-code is only echoed to the console card.
import { currentHost, savePrinters } from '../printers';
import { api } from '../api/moonraker';
import demoMp4 from './timelapse.mp4?url';
import demoWebm from './timelapse.webm?url'; // for a browser without H.264 (headless Chromium)

let sockets = [];
function wsAll(m) {
  const s = JSON.stringify(m);
  sockets.forEach((ws) => ws._recv(s));
}
const objects = ['mmu'].concat([
  'probe_eddy_current btt_eddy',
  'adxl345',
  'quad_gantry_level',
  'system_stats',
  'webhooks',
  'configfile',
  'heaters',
  'toolhead',
  'gcode_move',
  'motion_report',
  'print_stats',
  'virtual_sdcard',
  'display_status',
  'exclude_object',
  'bed_mesh',
  'extruder',
  'heater_bed',
  'heater_generic chamber',
  'temperature_sensor EBB_MCU',
  'temperature_sensor Chamber_Top',
  'temperature_fan XY_Driver_Fan',
  'temperature_fan PSU_Fan',
  'fan',
  'heater_fan hotend_fan',
  'fan_generic chamber_fan',
  'fan_generic Intake_Fan',
  'fan_generic Aux_Fan',
  'neopixel hotend_rgb',
  'output_pin Chamber_Light',
  'filament_switch_sensor filament_sensor',
  'smart_filament_sensor sfs',
  'mcu',
  'mcu EBBCan',
  'gcode_macro CHAMBER',
  'gcode_macro FILAMENT_LOAD',
  'gcode_macro FILAMENT_UNLOAD',
  'gcode_macro _CLIENT_VARIABLE',
  'gcode_macro PRINT_START',
  'gcode_macro PROBE_MENU',
  'gcode_macro BED_MESH_AUTO',
  'gcode_macro CLEAN_NOZZLE',
  'gcode_macro HEAT_SOAK',
  'gcode_macro GENERATE_SHAPER_GRAPHS',
  'gcode_macro PARK',
  'gcode_macro SET_PAUSE_NEXT_LAYER',
  'gcode_macro SET_PAUSE_AT_LAYER',
  'gcode_macro LOAD_PLA',
  'gcode_macro LOAD_ABS',
  'gcode_macro M600',
  'gcode_macro TEST_SPEED',
  'gcode_macro PID_ALL',
  'gcode_macro SHAPER_ALL',
  'gcode_macro LIGHTS_ON',
  'gcode_macro LIGHTS_OFF',
  'gcode_macro _HOME_CHECK',
  'firmware_retraction',
  'manual_probe',
  'bed_screws',
  'screws_tilt_adjust',
  'tmc2209 stepper_x',
  'tmc2209 stepper_y',
  'tmc2209 stepper_z',
  'tmc2240 extruder',
  'canbus_stats EBBCan',
]);
const status = {
  webhooks: { state: 'ready', state_message: 'Printer is ready' },
  mmu: {
    enabled: true,
    is_homed: true,
    num_gates: 6,
    tool: 2,
    gate: 2,
    filament: 'Loaded',
    filament_pos: 10,
    action: 'Idle',
    print_state: 'printing',
    has_bypass: true,
    sync_drive: true,
    bowden_progress: -1,
    gate_status: [1, 1, 1, 0, 2, -1],
    gate_material: ['PLA', 'PETG', 'ABS', '', 'ASA', 'TPU'],
    gate_color_rgb: [
      [0.95, 0.3, 0.2],
      [0.15, 0.45, 0.9],
      [0.1, 0.1, 0.1],
      [1, 1, 1],
      [0.95, 0.8, 0.2],
      [0.3, 0.8, 0.4],
    ],
    gate_name: ['Prusament Galaxy Red', 'Sunlu Blue', 'Polymaker ABS', '', 'Bambu ASA Yellow', 'NinjaTek'],
    gate_temperature: [215, 240, 255, 0, 260, 225],
    gate_spool_id: [14, -1, 12, -1, -1, -1],
    ttg_map: [0, 1, 2, 3, 4, 5],
    endless_spool: 1,
    endless_spool_groups: [0, 1, 2, 3, 0, 5],
    filament_direction: 1,
    sensors: { mmu_gate: true, extruder: true, toolhead: true },
    reason_for_pause: '',
  },
  AFC: { current_load: 'lane2', current_state: 'Idle' },
  'AFC_stepper lane1': {
    name: 'lane1',
    unit: 'Turtle_1',
    prep: true,
    load: true,
    tool_loaded: false,
    color: '#E0433A',
    material: 'PLA',
    weight: 812,
    map: 'T0',
  },
  'AFC_stepper lane2': {
    name: 'lane2',
    unit: 'Turtle_1',
    prep: true,
    load: true,
    tool_loaded: true,
    color: '#2D7BD6',
    material: 'PETG',
    weight: 430,
    map: 'T1',
  },
  'AFC_stepper lane3': {
    name: 'lane3',
    unit: 'Turtle_1',
    prep: true,
    load: false,
    tool_loaded: false,
    color: '#F5F5F5',
    material: 'ABS',
    weight: 120,
    map: 'T2',
  },
  'AFC_stepper lane4': {
    name: 'lane4',
    unit: 'Turtle_1',
    prep: false,
    load: false,
    tool_loaded: false,
    color: '',
    material: '',
    weight: 0,
    map: 'T3',
  },
  configfile: {
    save_config_pending: true,
    settings: {
      extruder: { max_temp: 300, min_temp: 0 },
      heater_bed: { max_temp: 120, min_temp: 0 },
      'heater_generic chamber': { max_temp: 70, min_temp: 0 },
      printer: { max_velocity: 500, max_accel: 10000, square_corner_velocity: 5, minimum_cruise_ratio: 0.5 },
      'output_pin kasa_ledi_guc': { pwm: false },
      'temperature_sensor ebb_mcu': { sensor_type: 'temperature_mcu', sensor_mcu: 'EBBCan' },
      resonance_tester: { accel_chip: 'adxl345', probe_points: [[175, 175, 20]] },
    },
    config: {
      printer: {
        kinematics: 'corexy',
        max_velocity: '500',
        max_accel: '10000',
        square_corner_velocity: '5.0',
        max_z_velocity: '15',
      },
      bed_mesh: { probe_count: '9,9', mesh_min: '20,20', mesh_max: '380,380', algorithm: 'bicubic' },
      z_tilt: { retries: '5', retry_tolerance: '0.05' },
      extruder: { pressure_advance: '0.035', max_temp: '300', min_temp: '0' },
      'heater_generic chamber': { max_temp: '70' },
      'gcode_macro BED_MESH_AUTO': { gcode: 'BED_MESH_CALIBRATE ADAPTIVE=1' },
      'gcode_macro CHAMBER': {
        gcode: '{% set t = params.TEMP|default(50)|int %}\nSET_HEATER_TEMPERATURE HEATER=chamber TARGET={t}',
      },
      'gcode_macro HEAT_SOAK': {
        gcode: '{% set m = params.MINUTES|default(10) %}{% set b = params.BED|default(110) %}',
      },
      'gcode_shell_command generate_shaper_graphs': {
        command: 'bash /home/pi/printer_data/config/scripts/generate_shaper_graphs.sh',
        timeout: 120,
      },
      'gcode_macro GENERATE_SHAPER_GRAPHS': {
        description: 'Draw the input shaper graphs from the last SHAPER_CALIBRATE',
        gcode: 'RUN_SHELL_COMMAND CMD=generate_shaper_graphs',
      },
      'gcode_macro PRINT_START': {
        gcode:
          '{% set BED = params.BED|default(60)|float %}{% set EXTRUDER = params.EXTRUDER|default(200) %}{% set CHAMBER = params.CHAMBER|default(0) %}',
      },
    },
  },
  heaters: {
    available_heaters: ['extruder', 'heater_bed', 'heater_generic chamber'],
    available_sensors: [
      'extruder',
      'heater_bed',
      'heater_generic chamber',
      'temperature_sensor EBB_MCU',
      'temperature_sensor Chamber_Top',
      'temperature_fan XY_Driver_Fan',
      'temperature_fan PSU_Fan',
    ],
  },
  toolhead: {
    homed_axes: 'xyz',
    position: [200, 177, 16.8, 0],
    axis_minimum: [0, 0, -5, 0],
    axis_maximum: [419, 379, 400, 0],
    max_velocity: 500,
    max_accel: 10000,
    square_corner_velocity: 5,
    minimum_cruise_ratio: 0.5,
    extruder: 'extruder',
  },
  motion_report: { live_velocity: 0, live_extruder_velocity: 0, live_position: [0, 0, 0, 0] },
  gcode_move: {
    speed_factor: 1,
    extrude_factor: 0.98,
    homing_origin: [0, 0, -0.025, 0],
    gcode_position: [200, 177, 16.8, 0],
  },
  print_stats: {
    state: 'printing',
    filename: 'bracket_v3.gcode',
    print_duration: 3120,
    total_duration: 3300,
    filament_used: 12400,
    info: { current_layer: 84, total_layer: 210 },
  },
  virtual_sdcard: { progress: 0.42, file_position: 0 },
  display_status: { progress: 0.42 },
  exclude_object: {
    objects: [
      {
        name: 'bracket_v3_id_0',
        center: [150, 150],
        polygon: [
          [130, 130],
          [170, 130],
          [170, 170],
          [130, 170],
        ],
      },
      {
        name: 'bracket_v3_id_1',
        center: [220, 150],
        polygon: [
          [200, 130],
          [240, 130],
          [240, 170],
          [200, 170],
        ],
      },
    ],
    excluded_objects: ['bracket_v3_id_1'],
    current_object: 'bracket_v3_id_0',
  },
  bed_mesh: {
    profile_name: 'default',
    mesh_min: [20, 20],
    mesh_max: [380, 340],
    probed_matrix: Array.from({ length: 9 }, (_, y) =>
      Array.from({ length: 9 }, (_, x) => 0.05 * Math.sin(x / 2) - 0.03 * Math.cos(y / 3)),
    ),
    mesh_matrix: Array.from({ length: 33 }, (_, y) =>
      Array.from({ length: 33 }, (_, x) => 0.05 * Math.sin(x / 8) - 0.03 * Math.cos(y / 12)),
    ),
    profiles: {
      default: {
        points: Array.from({ length: 9 }, (_, y) =>
          Array.from({ length: 9 }, (_, x) => 0.05 * Math.sin(x / 2) - 0.03 * Math.cos(y / 3)),
        ),
        mesh_params: { min_x: 20, max_x: 380, min_y: 20, max_y: 340, x_count: 9, y_count: 9 },
      },
      abs_110: {
        points: Array.from({ length: 9 }, (_, y) =>
          Array.from({ length: 9 }, (_, x) => 0.06 * Math.sin(x / 2 + 0.3) - 0.02 * Math.cos(y / 3) + 0.02),
        ),
        mesh_params: { min_x: 20, max_x: 380, min_y: 20, max_y: 340, x_count: 9, y_count: 9 },
      },
    },
  },
  extruder: {
    temperature: 249.8,
    target: 250,
    power: 0.42,
    can_extrude: true,
    pressure_advance: 0.035,
    smooth_time: 0.04,
  },
  heater_bed: { temperature: 110.1, target: 110, power: 0.61 },
  'heater_generic chamber': { temperature: 49.6, target: 50, power: 0.3 },
  'temperature_sensor EBB_MCU': { temperature: 48.2 },
  'temperature_sensor Chamber_Top': { temperature: 47.1 },
  'temperature_fan XY_Driver_Fan': { temperature: 38, target: 40, speed: 0 },
  'temperature_fan PSU_Fan': { temperature: 42, target: 40, speed: 0.3 },
  fan: { speed: 0.6 },
  'heater_fan hotend_fan': { speed: 1, rpm: 7140 },
  'fan_generic chamber_fan': { speed: 1 },
  'fan_generic Intake_Fan': { speed: 0 },
  'fan_generic Aux_Fan': { speed: 0.35, rpm: 2380 },
  'neopixel hotend_rgb': {
    color_data: [
      [0.5, 0, 0.5, 0],
      [0.5, 0, 0.5, 0],
      [0.5, 0, 0.5, 0],
    ],
  },
  'output_pin Chamber_Light': { value: 1 },
  'filament_switch_sensor filament_sensor': { filament_detected: true, enabled: true },
  'smart_filament_sensor sfs': { enabled: true, filament_detected: true, speed: 2.3 },
  system_stats: { sysload: 0.4, memavail: 3000000, cputime: 100 },
  mcu: {
    mcu_version: 'v0.13.0-628-g373f200c',
    mcu_constants: { MCU: 'stm32h723xx', CLOCK_FREQ: 520000000 },
    last_stats: {
      mcu_task_avg: 0.00002,
      mcu_task_stddev: 0.00001,
      bytes_retransmit: 0,
      bytes_invalid: 0,
      srtt: 0.0011,
    },
  },
  'mcu EBBCan': {
    mcu_version: 'v0.13.0-659-gdb88a336-dirty',
    mcu_constants: { MCU: 'stm32g0b1xx', CLOCK_FREQ: 64000000 },
    last_stats: {
      mcu_task_avg: 0.00003,
      mcu_task_stddev: 0.00001,
      bytes_retransmit: 120,
      bytes_invalid: 0,
      srtt: 0.0024,
    },
  },
  manual_probe: { name: 'probe', is_active: false, z_position: null, z_position_lower: null, z_position_upper: null },
  bed_screws: { is_active: false, state: null, current_screw: 0, accepted_screws: 0 },
  screws_tilt_adjust: { error: false, max_deviation: null, results: {} },
  'tmc2209 stepper_x': { run_current: 1.2, hold_current: 1.2, drv_status: { stst: 1, cs_actual: 18 } },
  'tmc2209 stepper_y': { run_current: 1.2, hold_current: 1.2, drv_status: { stst: 1, cs_actual: 18, otpw: 1 } },
  'tmc2209 stepper_z': { run_current: 0.8, hold_current: 0.8, drv_status: { stst: 1 } },
  'tmc2240 extruder': { run_current: 0.65, temperature: 48.5, drv_status: { stst: 1 } },
  'canbus_stats EBBCan': { rx_error: 0, tx_error: 0, tx_retries: 3, bus_state: 'active' },
  'gcode_macro PROBE_MENU': { description: 'Eddy probe setup menu' },
  firmware_retraction: { retract_length: 0.8, retract_speed: 35, unretract_extra_length: 0, unretract_speed: 30 },
  'gcode_macro BED_MESH_AUTO': {},
  'gcode_macro CLEAN_NOZZLE': {},
  'gcode_macro HEAT_SOAK': {},
  'gcode_macro GENERATE_SHAPER_GRAPHS': {},
  'gcode_macro PARK': {},
  'gcode_macro SET_PAUSE_NEXT_LAYER': { pause_next_layer: { enable: false, call: 'PAUSE' } },
  'gcode_macro SET_PAUSE_AT_LAYER': { pause_at_layer: { enable: false, layer: 0, call: 'PAUSE' } },
  'gcode_macro LOAD_PLA': {},
  'gcode_macro LOAD_ABS': {},
  'gcode_macro M600': {},
  'gcode_macro TEST_SPEED': {},
  'gcode_macro PID_ALL': {},
  'gcode_macro SHAPER_ALL': {},
  'gcode_macro LIGHTS_ON': {},
  'gcode_macro LIGHTS_OFF': {},
  'gcode_macro _HOME_CHECK': {},
  'gcode_macro CHAMBER': {},
  'gcode_macro FILAMENT_LOAD': {},
  'gcode_macro FILAMENT_UNLOAD': {},
  'gcode_macro PRINT_START': {},
};
let db = {
  'carbon-ui/settings': {
    favorites: [
      { id: 'x1', name: 'Brush Nozzle', icon: 'brush', gcode: 'BRUSH_ONLY', highlight: false },
      { id: 'x2', name: 'Probe Menu', icon: 'grip', gcode: 'PROBE_MENU', highlight: true },
      { id: 'x3', name: 'Load', icon: 'load', gcode: 'FILAMENT_LOAD', highlight: false },
      { id: 'x4', name: 'Unload', icon: 'unload', gcode: 'FILAMENT_UNLOAD', highlight: false },
      { id: 'x5', name: 'Heat soak', icon: 'flame', gcode: 'HEAT_SOAK', highlight: false },
      { id: 'x6', name: 'Park', icon: 'park', gcode: 'PARK', highlight: false },
    ],
    accent: '#03b597',
    devices: { hidden: [], names: { 'output_pin Chamber_Light': 'Chamber light' } },
  },
  'voyager-ui/settings': {
    setupDone: true,
    lang: 'en',
    autoLayout: true,
    uiScale: 100,
    mmuSeen: true,
    hiddenCards: [],
    strip: {
      order: [],
      hidden: [
        'dev:neopixel hotend_rgb',
        'dev:filament_switch_sensor filament_sensor',
        'dev:smart_filament_sensor sfs',
        'dev:fan_generic Aux_Fan',
      ],
    },
    // idle: temperatures, console and the camera on top, controls below
    layout: [
      { i: 'temps', x: 0, y: 0, w: 3, h: 7 },
      { i: 'console', x: 3, y: 0, w: 6, h: 7 },
      { i: 'system', x: 9, y: 0, w: 3, h: 3 },
      { i: 'webcam', x: 9, y: 3, w: 3, h: 4 },
      { i: 'tempchart', x: 0, y: 7, w: 3, h: 4 },
      { i: 'toolhead', x: 3, y: 7, w: 6, h: 5 },
      { i: 'livez', x: 9, y: 7, w: 3, h: 5 },
      { i: 'limits', x: 0, y: 11, w: 3, h: 6 },
      { i: 'macros', x: 3, y: 12, w: 6, h: 3 },
      { i: 'extruder', x: 9, y: 12, w: 3, h: 7 },
      { i: 'spool', x: 3, y: 15, w: 6, h: 4 },
      { i: 'mmu', x: 0, y: 19, w: 9, h: 7 },
      { i: 'timelapse', x: 9, y: 19, w: 3, h: 4 },
    ],
    // printing: print status across the top, then what matters during a print
    layoutPrint: [
      { i: 'print', x: 0, y: 0, w: 12, h: 3 },
      { i: 'temps', x: 0, y: 3, w: 4, h: 6 },
      { i: 'console', x: 4, y: 3, w: 5, h: 6 },
      { i: 'webcam', x: 9, y: 3, w: 3, h: 6 },
      { i: 'toolhead', x: 0, y: 9, w: 6, h: 5 },
      { i: 'livez', x: 6, y: 9, w: 3, h: 5 },
      { i: 'system', x: 9, y: 9, w: 3, h: 3 },
      { i: 'limits', x: 9, y: 12, w: 3, h: 7 },
      { i: 'tempchart', x: 0, y: 14, w: 6, h: 5 },
      { i: 'extruder', x: 6, y: 14, w: 3, h: 7 },
      { i: 'mmu', x: 0, y: 19, w: 9, h: 7 },
      { i: 'timelapse', x: 9, y: 19, w: 3, h: 4 },
    ],
    sound: { enabled: true, volume: 0.6, complete: true, error: true, paused: true, heated: false },
    heaterBase: {
      'extruder@250': { power: 0.28, fan: 0.6, t: Date.now() / 1000 - 40 * 86400 },
      'heater_bed@110': { heat: 240, from: 22, t: Date.now() / 1000 - 40 * 86400 },
    },
    maintenance: [
      { id: 'm1', name: 'Clean the bed / build plate', hours: 50, doneAt: 560, doneDate: Date.now() - 20 * 86400e3 },
      {
        id: 'm2',
        name: 'Clean extruder gears and filament path',
        hours: 150,
        doneAt: 540,
        doneDate: Date.now() - 30 * 86400e3,
      },
      { id: 'm3', name: 'Check belt tension', hours: 200, doneAt: 520, doneDate: Date.now() - 45 * 86400e3 },
      { id: 'm5', name: 'Lubricate linear rails / rods', hours: 300, doneAt: 400, doneDate: Date.now() - 90 * 86400e3 },
      { id: 'm6', name: 'Replace nozzle', hours: 500, doneAt: 300, doneDate: Date.now() - 150 * 86400e3 },
    ],
  },
};
// Shake&Tune graphs in the demo config folder (the images are drawn by graphSvg)
const stFiles = [
  'ShakeTune_results/belts/belts_20260920_101000.png',
  'ShakeTune_results/input_shaper/IS_X_20260920_102000.png',
  'ShakeTune_results/input_shaper/IS_Y_20260920_102500.png',
  'ShakeTune_results/vibrations/vibrations_20260919_180000.png',
].map((path, i) => ({ path, modified: Date.now() / 1000 - 86400 - i * 3600, size: 1000 }));
let queue = {
  state: 'paused',
  jobs: [
    { job_id: 'q1', filename: 'fan_duct.gcode', time_added: 0, time_in_queue: 0 },
    { job_id: 'q2', filename: 'bracket_v3.gcode', time_added: 0, time_in_queue: 0 },
  ],
};
const DEMO_USERS = [
  { username: 'ozan', source: 'moonraker', created_on: Date.now() / 1000 - 40 * 86400 },
  { username: 'tablet', source: 'moonraker', created_on: Date.now() / 1000 - 12 * 86400 },
];
let DEMO_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
// ---- moonraker-timelapse: settings as the component keeps them, frames while printing, a fake render
const TL = {
  enabled: true,
  mode: 'layermacro',
  camera: '',
  snapshoturl: 'http://localhost:8080/?action=snapshot',
  stream_delay_compensation: 0.05,
  gcode_verbose: false,
  parkhead: false,
  parkpos: 'back_left',
  park_custom_pos_x: 0,
  park_custom_pos_y: 0,
  park_custom_pos_dz: 0,
  park_travel_speed: 100,
  park_retract_speed: 15,
  park_extrude_speed: 15,
  park_retract_distance: 1,
  park_extrude_distance: 1,
  park_time: 0.1,
  fw_retract: false,
  hyperlapse_cycle: 30,
  autorender: true,
  constant_rate_factor: 23,
  output_framerate: 30,
  pixelformat: 'yuv420p',
  time_format_code: '%Y%m%d_%H%M',
  extraoutputparams: '',
  variable_fps: false,
  targetlength: 10,
  variable_fps_min: 5,
  variable_fps_max: 60,
  rotation: 0,
  flip_x: false,
  flip_y: false,
  duplicatelastframe: 0,
  previewimage: true,
  saveframes: false,
};
let TL_N = 84; // frames taken for the running print (one per layer so far)
const TL_FILES = [
  ['bracket_v3', '20260930_1412', 1.9e6],
  ['calicat_PLA', '20260929_2210', 1.2e6],
  ['fan_duct', '20260928_0935', 2.4e6],
  ['Cube_ASA_3', '20260927_1801', 0.6e6],
  ['spool_holder_v2', '20260925_1120', 3.1e6],
].flatMap(([n, d, size], i) => {
  const name = `timelapse_${n}_${d}.mp4`;
  const modified = Date.now() / 1000 - 86400 * (i + 1);
  return [
    { path: name, modified, size },
    { path: name.replace('.mp4', '.jpg'), modified, size: 48000 },
  ];
});
TL_FILES.push({
  path: 'timelapse_fan_duct_20260928_0935_frames.zip',
  modified: Date.now() / 1000 - 86400 * 3,
  size: 8.4e6,
});
function tlFrame() {
  if (!TL.enabled) return;
  TL_N++;
  wsAll({
    jsonrpc: '2.0',
    method: 'notify_timelapse_event',
    params: [
      {
        action: 'newframe',
        frame: String(TL_N),
        framefile: 'frame' + String(TL_N).padStart(6, '0') + '.jpg',
        status: 'success',
      },
    ],
  });
}
function tlRender() {
  const ev = (o) => wsAll({ jsonrpc: '2.0', method: 'notify_timelapse_event', params: [{ action: 'render', ...o }] });
  const name = `timelapse_bracket_v3_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${String(new Date().getHours()).padStart(2, '0')}${String(new Date().getMinutes()).padStart(2, '0')}.mp4`;
  ev({ status: 'started', framecount: TL_N, settings: { ...TL } });
  let k = 0;
  const t = setInterval(() => {
    k++;
    if (k < 8)
      return ev({
        status: 'running',
        progress: Math.round((k / 8) * 100),
        msg: `frame ${Math.round((TL_N * k) / 8)}/${TL_N}`,
      });
    clearInterval(t);
    const modified = Date.now() / 1000;
    TL_FILES.unshift(
      { path: name, modified, size: 1.4e6 },
      { path: name.replace('.mp4', '.jpg'), modified, size: 48000 },
    );
    TL_N = 0;
    ev({
      status: 'success',
      filename: name,
      previewimage: name.replace('.mp4', '.jpg'),
      printfile: 'bracket_v3.gcode',
      msg: `Rendered ${name}`,
    });
  }, 700);
}
// what a timelapse frame or a clip preview looks like in the demo: the bed cam with the layer number
function tlSvg(n, label = 'frame') {
  const h = 8 + Math.min(130, n * 0.9);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#15181c"/><polygon points="80,300 560,300 500,210 140,210" fill="#2c3138"/><rect x="270" y="${258 - h}" width="100" height="${h}" fill="#f5b23a"/><polygon points="370,258 410,238 410,${238 - h} 370,${258 - h}" fill="#c88c28"/><polygon points="270,${258 - h} 370,${258 - h} 410,${238 - h} 310,${238 - h}" fill="#ffcd6e"/><rect x="60" y="${182 - h}" width="520" height="12" fill="#464c54"/><text x="16" y="28" fill="#8b919b" font-family="monospace" font-size="16">${label} ${n}</text></svg>`;
}
const svgUrl = (svg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
function emitLines(lines, gap = 40) {
  lines.forEach((l, i) =>
    setTimeout(() => wsAll({ jsonrpc: '2.0', method: 'notify_gcode_response', params: [l] }), i * gap),
  );
}
function pushStatus(o) {
  for (const [k, v] of Object.entries(o)) Object.assign(status[k], v);
  wsAll({ jsonrpc: '2.0', method: 'notify_status_update', params: [o, 1] });
}
let gcodeScript = function (sc) {
  const S = sc.trim().toUpperCase();
  if (S === 'GENERATE_SHAPER_GRAPHS' || /^RUN_SHELL_COMMAND CMD=GENERATE_SHAPER_GRAPHS/.test(S)) {
    emitLines(['// Running Command {generate_shaper_graphs}...', '// Command {generate_shaper_graphs} finished'], 1500);
    setTimeout(() => {
      for (const a of ['x', 'y'])
        stFiles.unshift({ path: `shaper_calibrate_${a}.png`, modified: Date.now() / 1000, size: 1000 });
      wsAll({
        jsonrpc: '2.0',
        method: 'notify_filelist_changed',
        params: [{ action: 'create_file', item: { root: 'config', path: 'shaper_calibrate_x.png' } }],
      });
    }, 3200);
    return 'ok';
  }
  if (S === 'PROBE_MENU')
    emitLines([
      '// action:prompt_begin Eddy probe',
      '// action:prompt_text Eddy sensor found on EBBCan. Frequency 3.42 MHz, drive current 15.',
      '// action:prompt_text What do you want to do?',
      '// action:prompt_button_group_start',
      '// action:prompt_button Calibrate drive current|LDC_CALIBRATE_DRIVE_CURRENT CHIP=btt_eddy|primary',
      '// action:prompt_button Map height|PROBE_EDDY_CURRENT_CALIBRATE CHIP=btt_eddy|primary',
      '// action:prompt_button_group_end',
      '// action:prompt_button Probe accuracy test|PROBE_ACCURACY|info',
      '// action:prompt_button Temperature compensation|TEMPERATURE_PROBE_CALIBRATE|warning',
      '// action:prompt_footer_button Close|RESPOND TYPE=command MSG=action:prompt_end|secondary',
      '// action:prompt_show',
    ]);
  else if (S.startsWith('RESPOND') && S.includes('PROMPT_END')) emitLines(['// action:prompt_end']);
  else if (S === 'PROBE_CALIBRATE' || S === 'Z_ENDSTOP_CALIBRATE')
    pushStatus({ manual_probe: { is_active: true, z_position: 5, z_position_lower: null, z_position_upper: null } });
  else if (S.startsWith('TESTZ')) {
    const m = S.match(/Z=([-+]?[\d.]*)/);
    const mp = status.manual_probe;
    let z = mp.z_position;
    const v = parseFloat(m && m[1]);
    if (!isNaN(v)) {
      if (v < 0) pushStatus({ manual_probe: { z_position: +(z + v).toFixed(3), z_position_upper: z } });
      else pushStatus({ manual_probe: { z_position: +(z + v).toFixed(3), z_position_lower: z } });
    }
  } else if (S === 'ACCEPT') {
    const z = status.manual_probe.z_position ?? 0;
    pushStatus({ manual_probe: { is_active: false }, configfile: { save_config_pending: true } });
    emitLines([
      `// probe: z_offset: ${(2.5 - z).toFixed(3)}`,
      '// The SAVE_CONFIG command will update the printer config file with the above and restart the printer.',
    ]);
  } else if (S === 'ABORT') pushStatus({ manual_probe: { is_active: false } });
  else if (S === 'SCREWS_TILT_CALCULATE') {
    emitLines(
      [
        '// front left (base) : x=20.0, y=20.0, z=2.48125',
        '// front right : x=380.0, y=20.0, z=2.52344 : adjust CW 01:05',
      ],
      50,
    );
    pushStatus({
      screws_tilt_adjust: {
        error: false,
        max_deviation: 0.12,
        results: {
          screw1: { z: 2.4812, sign: 'CW', adjust: '00:00', is_base: true, name: 'front left' },
          screw2: { z: 2.5234, sign: 'CW', adjust: '01:05', is_base: false, name: 'front right' },
          screw3: { z: 2.4401, sign: 'CCW', adjust: '00:48', is_base: false, name: 'rear right' },
          screw4: { z: 2.4899, sign: 'CW', adjust: '00:10', is_base: false, name: 'rear left' },
        },
      },
    });
  } else if (S === 'BAD_MACRO') {
    emitLines(['!! Unknown command:"BAD_MACRO"']);
    throw { code: 400, message: 'Unknown command:"BAD_MACRO"' };
  } else if (S === 'G1 X999') {
    emitLines(['!! Move out of range: 999.000 177.000 16.800 [0.000]']);
    throw { code: 400, message: 'Move out of range: 999.000 177.000 16.800 [0.000]' };
  }
  return 'ok';
};
const files = [
  {
    filename: 'calicat_PLA.gcode.3mf', // OrcaSlicer "send as 3mf": a zip with Metadata/plate_1.gcode inside
    modified: Date.now() / 1000 - 1800,
    size: 410000,
    estimated_time: 3100,
    filament_total: 4100,
    layer_height: 0.2,
    thumbnails: [],
  },
  {
    filename: 'bracket_v3.gcode',
    modified: Date.now() / 1000 - 3600,
    size: 2400000,
    estimated_time: 7400,
    filament_total: 16200,
    layer_height: 0.2,
    thumbnails: [],
  },
  {
    filename: 'fan_duct.gcode',
    modified: Date.now() / 1000 - 86400,
    size: 3200000,
    estimated_time: 10000,
    filament_total: 21900,
    layer_height: 0.2,
  },
];
const cfgText = {
  'printer.cfg': `# Voyager demo printer: CoreXY 350, Octopus + EBB36 on CAN
[include mainsail.cfg]
[include macros.cfg]
[include hardware/steppers.cfg]
[include hardware/toolhead.cfg]
[include hardware/fans_and_leds.cfg]

[mcu]
canbus_uuid: 0e5f3b2a1c4d

[mcu EBBCan]
canbus_uuid: 7a19c2e4b0f3

[printer]
kinematics: corexy
max_velocity: 500
max_accel: 10000
max_z_velocity: 30
max_z_accel: 350
square_corner_velocity: 5.0

[idle_timeout]
timeout: 1800

[heater_bed]
heater_pin: PA3
sensor_type: Generic 3950
sensor_pin: PF3
max_power: 0.8
min_temp: 0
max_temp: 120
control: pid
pid_kp: 38.4
pid_ki: 1.6
pid_kd: 460.2

[heater_generic chamber]
heater_pin: PA1
sensor_type: Generic 3950
sensor_pin: PF6
control: watermark
min_temp: 0
max_temp: 70

[temperature_sensor EBB_MCU]
sensor_type: temperature_mcu
sensor_mcu: EBBCan

[temperature_sensor Chamber_Top]
sensor_type: Generic 3950
sensor_pin: PF5

[probe_eddy_current btt_eddy]
sensor_type: ldc1612
i2c_mcu: EBBCan
i2c_bus: i2c1_PB8_PB9
x_offset: 0
y_offset: 21.4
speed: 10
lift_speed: 15

[bed_mesh]
speed: 300
horizontal_move_z: 2
mesh_min: 20, 20
mesh_max: 330, 330
probe_count: 9, 9
algorithm: bicubic
adaptive_margin: 5

[quad_gantry_level]
gantry_corners:
    -60, -10
    410, 420
points:
    50, 25
    50, 275
    300, 275
    300, 25
speed: 300
horizontal_move_z: 10
retries: 5
retry_tolerance: 0.0075
max_adjust: 10

[input_shaper]
shaper_freq_x: 58.2
shaper_type_x: mzv
shaper_freq_y: 38.4
shaper_type_y: mzv

[firmware_retraction]
retract_length: 0.8
retract_speed: 35
unretract_speed: 30

[exclude_object]
[virtual_sdcard]
path: ~/printer_data/gcodes

#*# <---------------------- SAVE_CONFIG ---------------------->
#*# DO NOT EDIT THIS BLOCK OR BELOW. The contents are auto-generated.
#*#
#*# [extruder]
#*# control = pid
#*# pid_kp = 26.213
#*# pid_ki = 1.304
#*# pid_kd = 131.721
#*#
#*# [probe_eddy_current btt_eddy]
#*# reg_drive_current = 15
#*# calibrate =
#*#	0.050000:3211235.612,0.090000:3210689.101,0.130000:3210143.887
`,
  'hardware/steppers.cfg': `[stepper_x]
step_pin: PF13
dir_pin: PF12
enable_pin: !PF14
rotation_distance: 40
microsteps: 32
full_steps_per_rotation: 200
endstop_pin: EBBCan:PB6
position_min: 0
position_endstop: 350
position_max: 350
homing_speed: 60
homing_retract_dist: 5

[tmc2209 stepper_x]
uart_pin: PC4
interpolate: false
run_current: 1.2
sense_resistor: 0.110
stealthchop_threshold: 0

[stepper_y]
step_pin: PG0
dir_pin: PG1
enable_pin: !PF15
rotation_distance: 40
microsteps: 32
endstop_pin: PG9
position_min: 0
position_endstop: 355
position_max: 355
homing_speed: 60

[tmc2209 stepper_y]
uart_pin: PD11
interpolate: false
run_current: 1.2
sense_resistor: 0.110
stealthchop_threshold: 0

[stepper_z]
step_pin: PF11
dir_pin: PG3
enable_pin: !PG5
rotation_distance: 40
gear_ratio: 80:16
microsteps: 32
endstop_pin: probe:z_virtual_endstop
position_max: 340
position_min: -5
homing_speed: 8
second_homing_speed: 3

[tmc2209 stepper_z]
uart_pin: PC6
run_current: 0.8
stealthchop_threshold: 999999
`,
  'hardware/toolhead.cfg': `[extruder]
step_pin: EBBCan:PD0
dir_pin: PD1
enable_pin: !EBBCan:PD2
rotation_distance: 47.088
gear_ratio: 9:1
microsteps: 16
nozzle_diameter: 0.400
filament_diameter: 1.750
heater_pin: EBBCan:PB13
sensor_type: PT1000
sensor_pin: EBBCan:PA3
min_temp: 0
max_temp: 300
max_extrude_only_distance: 150
max_extrude_cross_section: 5
pressure_advance: 0.035
pressure_advance_smooth_time: 0.040

[tmc2240 extruder]
cs_pin: EBBCan:PA15
spi_software_sclk_pin: EBBCan:PB10
spi_software_mosi_pin: EBBCan:PB11
spi_software_miso_pin: EBBCan:PB2
run_current: 0.65
stealthchop_threshold: 0

[adxl345]
cs_pin: EBBCan:PB12
spi_software_sclk_pin: EBBCan:PB10
spi_software_mosi_pin: EBBCan:PB11
spi_software_miso_pin: EBBCan:PB2

[resonance_tester]
accel_chip: adxl345
probe_points: 175, 175, 20

[filament_switch_sensor filament_sensor]
switch_pin: ^EBBCan:PB3
pause_on_runout: true
runout_gcode: M600
`,
  'hardware/fans_and_leds.cfg': `[fan]
pin: EBBCan:PA0
kick_start_time: 0.5

[heater_fan hotend_fan]
pin: EBBCan:PA1
heater: extruder
heater_temp: 50.0

[fan_generic chamber_fan]
pin: PD12
max_power: 1.0

[fan_generic Intake_Fan]
pin: PD13

[fan_generic Aux_Fan]
pin: PD14

[temperature_fan XY_Driver_Fan]
pin: PD15
sensor_type: temperature_host
control: watermark
min_temp: 0
max_temp: 80
target_temp: 40

[temperature_fan PSU_Fan]
pin: PE5
sensor_type: Generic 3950
sensor_pin: PF7
control: watermark
min_temp: 0
max_temp: 80
target_temp: 40

[neopixel hotend_rgb]
pin: EBBCan:PD3
chain_count: 3
color_order: GRBW
initial_RED: 0.5
initial_BLUE: 0.5

[output_pin Chamber_Light]
pin: PB10
pwm: true
cycle_time: 0.01
value: 1
`,
  'moonraker.conf': `[server]
host: 0.0.0.0
port: 7125
klippy_uds_address: ~/printer_data/comms/klippy.sock

[authorization]
trusted_clients:
    10.0.0.0/8
    127.0.0.0/8
    192.168.0.0/16
cors_domains:
    *.lan
    *.local
    *://localhost
    *://localhost:*

[octoprint_compat]
[history]
[file_manager]
enable_object_processing: true

[spoolman]
server: http://192.168.1.20:7912

[update_manager]
channel: dev
refresh_interval: 168

[update_manager voyager-ui]
type: web
channel: stable
repo: ozancs/voyager-ui
path: ~/voyager-ui

[power printer]
type: tasmota
address: 192.168.1.31
locked_while_printing: true

[notifier telegram]
url: tgram://123:ABC/456
events: complete, error
title: Voyager Demo: {event_name}
body: {event_message}
`,
  'esp_bridge.py': [
    '# demo python module for the Ctrl+K content search',
    'import json',
    '',
    'class EspBridge:',
    '    def __init__(self, config):',
    '        self.printer = config.get_printer()',
    '        self.state = {}',
    '',
    '    def cmd_EB_SET(self, gcmd):',
    '        key = gcmd.get("KEY")',
    '        value = gcmd.get("VALUE")',
    '        self.state[key] = value',
    '',
    'def load_config(config):',
    '    return EspBridge(config)',
  ].join('\n'),
  'mainsail.cfg': `# Mainsail client macros (shortened for the demo)
[virtual_sdcard]
path: ~/printer_data/gcodes

[pause_resume]
[display_status]
[respond]

[gcode_macro CANCEL_PRINT]
description: Cancel the actual running print
rename_existing: CANCEL_PRINT_BASE
gcode:
  TURN_OFF_HEATERS
  CANCEL_PRINT_BASE
`,
  'README.txt':
    'Voyager demo config folder. Nothing here reaches a real printer.\nTry Ctrl+K and type: pressure, shaper, retract, EB_SET, stealthchop\n',
};
const versions = {
  klipper: {
    configured_type: 'git_repo',
    owner: 'Klipper3d',
    repo_name: 'klipper',
    version: 'v0.13.0-300',
    remote_version: 'v0.13.0-310',
    current_hash: 'a1b2c3d4e5',
    remote_hash: 'f6e7d8c9b0',
    commits_behind: [
      ['stepper: faster step timing on rp2040', 'Kevin'],
      ['toolhead: fix a rounding issue in lookahead', 'Kevin'],
      ['docs: update Config_Reference', 'Dmitry'],
      ['bed_mesh: small cleanups', 'Eric'],
    ].map(([subject, author], i) => ({
      sha: 'c' + i,
      subject,
      author,
      date: String(Math.round(Date.now() / 1000 - i * 86400)),
    })),
  },
  moonraker: { version: 'v0.9.3', remote_version: 'v0.9.3' },
  'voyager-ui': {
    configured_type: 'web',
    owner: 'ozancs',
    repo_name: 'voyager-ui',
    version: 'v0.14.5',
    remote_version: 'v' + __APP_VERSION__,
  },
  system: { package_count: 0 },
};
const updStatus = () => ({ busy: false, version_info: JSON.parse(JSON.stringify(versions)) });
function finishUpdate(name) {
  const v = versions[name];
  if (v) {
    v.version = v.remote_version;
    v.commits_behind = [];
  }
  wsAll({ jsonrpc: '2.0', method: 'notify_update_refreshed', params: [updStatus()] });
}
const SPOOLS = [
  {
    id: 12,
    remaining_weight: 642,
    initial_weight: 1000,
    filament: {
      name: 'ABS Black',
      material: 'ABS',
      color_hex: '1c1c1c',
      settings_extruder_temp: 250,
      vendor: { name: 'Polymaker' },
    },
  },
  {
    id: 14,
    remaining_weight: 880,
    initial_weight: 1000,
    filament: {
      name: 'Galaxy Red',
      material: 'PLA',
      color_hex: 'c0282d',
      settings_extruder_temp: 215,
      vendor: { name: 'Prusament' },
    },
  },
  {
    id: 21,
    remaining_weight: 310,
    initial_weight: 1000,
    filament: {
      name: 'Signal White',
      material: 'PETG',
      color_hex: 'f2f2ef',
      settings_extruder_temp: 240,
      vendor: { name: 'Extrudr' },
    },
  },
];
// ---- several printers in the demo ----
// The printer list gets three made-up printers the first time. Picking one reloads the page (like a real switch)
// and the fake Moonraker then answers as that printer: different kinematics, probes, plugins and state.
const DEMO_PRINTERS = [
  { id: 'demo-voron', name: 'Voron 2.4', host: 'voron24.local' },
  { id: 'demo-ender', name: 'Ender 3 V2', host: 'ender3.local' },
  { id: 'demo-trident', name: 'Trident', host: 'trident.local' },
];
try {
  if (localStorage.getItem('voyager-ui-printers') === null) savePrinters(DEMO_PRINTERS);
} catch {}
const DEMO_HOST = currentHost();
const drop = (re) => {
  for (let i = objects.length - 1; i >= 0; i--) if (re.test(objects[i])) objects.splice(i, 1);
};
const idle = (ext = 24, bed = 23) => {
  Object.assign(status.print_stats, { state: 'standby', filename: '', print_duration: 0, total_duration: 0 });
  Object.assign(status.virtual_sdcard, { progress: 0 });
  Object.assign(status.display_status, { progress: 0 });
  Object.assign(status.extruder, { temperature: ext, target: 0, power: 0 });
  Object.assign(status.heater_bed, { temperature: bed, target: 0, power: 0 });
  status.exclude_object.objects = [];
};
// what each demo printer has on top of (or instead of) the main demo printer
const PROFILE = {
  '': {
    // the main demo printer as it is
  },
  'voron24.local': {
    hostname: 'voron24',
    console: ['PRINT_END', '// Print finished: voron_cube.gcode, 47m 20s', 'G28', 'ok'],
    remove: /^(mmu|probe_eddy_current|heater_generic chamber|smart_filament_sensor|neopixel)/,
    add: ['beacon'],
    helpRemove: /^(MMU_|CHANGE_TOOL|TOOL_UNLOAD|LANE_UNLOAD|PROBE_EDDY|LDC_|Z_TILT|CHAMBER)/,
    help: {
      BEACON_CALIBRATE: 'Calibrate beacon response curve',
      BEACON_AUTO_CALIBRATE: 'Automatically calibrate beacon',
    },
    heaters: ['extruder', 'heater_bed'],
    cams: 1,
    setup() {
      idle(31, 104);
      Object.assign(status.print_stats, { state: 'complete', filename: 'voron_cube.gcode', print_duration: 2840 });
      Object.assign(status.heater_bed, { temperature: 104.6, target: 105, power: 0.38 });
      status.toolhead.axis_maximum = [350, 350, 330, 0];
      status.toolhead.homed_axes = 'xyz';
    },
  },
  'ender3.local': {
    hostname: 'ender3v2',
    console: ['// Klipper state: Ready', 'M140 S60', 'ok', 'M140 S0', 'ok'],
    remove:
      /^(mmu|probe_eddy_current|adxl345|quad_gantry_level|heater_generic|temperature_sensor|temperature_fan|fan_generic|neopixel|output_pin|smart_filament|mcu EBBCan|canbus_stats|tmc|firmware_retraction|gcode_macro (PROBE_MENU|CHAMBER|HEAT_SOAK|LOAD_ABS|LIGHTS|FILAMENT))/,
    add: ['bltouch'],
    helpKeep:
      /^(PID_CALIBRATE|PROBE_CALIBRATE|PROBE_ACCURACY|SCREWS_TILT_CALCULATE|BED_MESH_CALIBRATE|BED_MESH_PROFILE|SAVE_CONFIG|G28|SET_HEATER_TEMPERATURE|SET_FAN_SPEED)$/,
    help: { Z_ENDSTOP_CALIBRATE: 'Calibrate a Z endstop' },
    heaters: ['extruder', 'heater_bed'],
    cams: 0,
    noSpoolman: true,
    setup() {
      idle();
      status.toolhead.axis_maximum = [235, 235, 250, 0];
      status.toolhead.homed_axes = '';
      status.configfile.save_config_pending = false;
      delete status.configfile.settings.resonance_tester;
      status.configfile.settings.screws_tilt_adjust = {};
      status.configfile.config.printer.kinematics = 'cartesian';
      status.configfile.config.printer.max_velocity = '300';
      status.configfile.config.printer.max_accel = '3000';
      Object.assign(status.toolhead, { max_velocity: 300, max_accel: 3000 });
      delete db['voyager-ui/settings'].layout;
      delete db['voyager-ui/settings'].layoutPrint;
      db['carbon-ui/settings'].favorites = db['carbon-ui/settings'].favorites.filter((f) => f.gcode === 'PARK');
    },
  },
  'trident.local': {
    hostname: 'trident',
    console: [
      'PRINT_START BED=110 EXTRUDER=250 CHAMBER=50',
      'Z_TILT_ADJUST',
      '// Retries: 1/5 Probed points range: 0.004000 tolerance: 0.007500',
      'M600',
      '// Filament change: paused',
    ],
    remove: /^(mmu|probe_eddy_current|adxl345|quad_gantry_level|smart_filament_sensor|gcode_macro PROBE_MENU)/,
    add: ['cartographer', 'z_tilt'],
    helpRemove:
      /^(MMU_|CHANGE_TOOL|TOOL_UNLOAD|LANE_UNLOAD|PROBE_EDDY|LDC_|QUAD_GANTRY|SHAPER_CALIBRATE|MEASURE_AXES|ACCELEROMETER|AXES_|COMPARE_BELTS|CREATE_VIBRATIONS|EXCITATE)/,
    help: {
      CARTOGRAPHER_SCAN_CALIBRATE: 'Run the scan calibration',
      CARTOGRAPHER_TOUCH_CALIBRATE: 'Run the touch calibration',
      AUTOTUNE_TMC: 'Apply autotuning configuration to TMC stepper driver',
    },
    cams: 2,
    setup() {
      Object.assign(status.print_stats, { state: 'paused', filename: 'fan_duct.gcode' });
      status.virtual_sdcard.progress = 0.71;
      status.display_status.progress = 0.71;
      Object.assign(status.extruder, { target: 0 });
      status.toolhead.axis_maximum = [300, 300, 250, 0];
      status.configfile.config.printer.max_accel = '8000';
    },
  },
}[DEMO_HOST] || { hostname: DEMO_HOST.split('.')[0], cams: 1 };
if (PROFILE.remove) drop(PROFILE.remove);
for (const o of PROFILE.add || []) if (!objects.includes(o)) objects.push(o);
for (const o of PROFILE.add || []) status[o] ||= {};
if (PROFILE.heaters) {
  status.heaters.available_heaters = PROFILE.heaters;
  status.heaters.available_sensors = status.heaters.available_sensors.filter((x) => objects.includes(x));
}
PROFILE.setup?.();
// what the other demo printers answer on the All printers page (plain HTTP queries to their address)
const h = (temperature, target) => ({ temperature, target });
const FLEET = {
  main: {
    hostname: 'voyager-demo',
    cams: 3,
    status: {
      webhooks: { state: 'ready' },
      print_stats: { state: 'printing', filename: 'bracket_v3.gcode', print_duration: 3120 },
      display_status: { progress: 0.42 },
      extruder: h(249.8, 250),
      heater_bed: h(110.1, 110),
    },
  },
  'voron24.local': {
    hostname: 'voron24',
    cams: 1,
    status: {
      webhooks: { state: 'ready' },
      print_stats: { state: 'complete', filename: 'voron_cube.gcode', print_duration: 2840 },
      display_status: { progress: 1 },
      extruder: h(31, 0),
      heater_bed: h(104.6, 105),
    },
  },
  'ender3.local': {
    hostname: 'ender3v2',
    cams: 0,
    status: {
      webhooks: { state: 'ready' },
      print_stats: { state: 'standby', filename: '', print_duration: 0 },
      display_status: { progress: 0 },
      extruder: h(24, 0),
      heater_bed: h(23, 0),
    },
  },
  'trident.local': {
    hostname: 'trident',
    cams: 2,
    status: {
      webhooks: { state: 'ready' },
      print_stats: { state: 'paused', filename: 'fan_duct.gcode', print_duration: 5200 },
      display_status: { progress: 0.71 },
      extruder: h(212, 0),
      heater_bed: h(110, 110),
    },
  },
};
function fleetAnswer(host, path) {
  const f = FLEET[host === location.host ? 'main' : host];
  if (!f) return undefined;
  if (path === '/printer/info') return { hostname: f.hostname, state: 'ready' };
  if (path === '/server/webcams/list')
    return {
      webcams: Array.from({ length: f.cams }, (_, i) => ({
        name: 'cam' + (i + 1),
        enabled: true,
        snapshot_url: `/webcam${i ? i + 1 : ''}/?action=snapshot`,
      })),
    };
  return { status: f.status };
}

function demoHelp(base) {
  const h = { ...base };
  for (const k of Object.keys(h))
    if ((PROFILE.helpRemove && PROFILE.helpRemove.test(k)) || (PROFILE.helpKeep && !PROFILE.helpKeep.test(k)))
      delete h[k];
  return Object.assign(h, PROFILE.help || {});
}

function handle(m) {
  const p = m.params || {};
  switch (m.method) {
    case 'server.connection.identify':
      return { connection_id: 1 };
    case 'server.info':
      return {
        klippy_state: 'ready',
        moonraker_version: 'v0.9.3-41',
        components: ['klippy_connection', 'file_manager', 'history', 'update_manager', 'webcam', 'timelapse'],
        warnings: ['file_manager: Error adding inotify watch to root config'],
        failed_components: [],
      };
    case 'machine.device_power.devices':
      return {
        devices: [
          { device: 'printer', status: 'on', locked_while_printing: true, type: 'tasmota' },
          { device: 'chamber_light', status: 'off', locked_while_printing: false, type: 'shelly' },
          { device: 'exhaust_fan', status: 'on', locked_while_printing: false, type: 'gpio' },
        ],
      };
    case 'machine.device_power.post_device':
      return { [p.device]: p.action === 'toggle' ? 'on' : p.action };
    case 'server.notifiers.list':
      return {
        notifiers: [
          {
            name: 'telegram',
            url: 'tgram://123:ABC/456',
            events: ['complete', 'error'],
            body: '{event_message}',
            title: 'Ozan Lab: {event_name}',
            attach: null,
          },
        ],
      };
    case 'printer.objects.list':
      return { objects };
    case 'printer.objects.subscribe':
    case 'printer.objects.query': {
      const out = {};
      for (const [k, f] of Object.entries(p.objects || {})) {
        if (!status[k]) {
          out[k] = {};
          continue;
        }
        out[k] = f ? Object.fromEntries(f.filter((x) => x in status[k]).map((x) => [x, status[k][x]])) : status[k];
      }
      return { eventtime: 1, status: out };
    }
    case 'server.temperature_store':
      return {
        extruder: {
          temperatures: Array.from({ length: 300 }, (_, i) => 250 - 200 * Math.exp(-i / 40)),
          targets: Array(300).fill(250),
        },
      };
    case 'server.gcode_store':
      if (PROFILE.console)
        return {
          gcode_store: PROFILE.console.map((message, i) => ({
            message,
            type: /^[A-Z]\w*( |$)/.test(message) ? 'command' : 'response',
            time: Date.now() / 1000 - 300 + i * 20,
          })),
        };
      return {
        gcode_store: [
          {
            message:
              '// Gate : | 0 | 1 | 2 | 3 |\n// Avail: |<span style="color:#00ff00">■■■</span>|<span style="color:#e68a0a">■■■</span>|<span style="color:#ff0000">■■■</span>|<span style="color:#00ff00">■■■</span>|\n// <b><span style="color:#87CEEB">Happy</span> <span style="color:#FF69B4">Hare</span></b> Ready...',
            type: 'response',
            time: Date.now() / 1000 - 70,
          },
          { message: 'G28', type: 'command', time: Date.now() / 1000 - 60 },
          { message: 'ok', type: 'response', time: Date.now() / 1000 - 59 },
          { message: '!! Move out of range', type: 'response', time: Date.now() / 1000 - 30 },
          {
            message: "Fitted shaper 'zv' frequency = 58.4 Hz (vibrations = 8.7%, smoothing ~= 0.047)",
            type: 'response',
            time: Date.now() / 1000 - 20,
          },
          {
            message: "To avoid too much smoothing with 'zv', suggested max_accel <= 18000 mm/sec^2",
            type: 'response',
            time: Date.now() / 1000 - 19,
          },
          {
            message: "Fitted shaper 'mzv' frequency = 48.2 Hz (vibrations = 1.2%, smoothing ~= 0.087)",
            type: 'response',
            time: Date.now() / 1000 - 18,
          },
          {
            message: "To avoid too much smoothing with 'mzv', suggested max_accel <= 6900 mm/sec^2",
            type: 'response',
            time: Date.now() / 1000 - 17,
          },
          {
            message: "Fitted shaper 'ei' frequency = 56.0 Hz (vibrations = 0.9%, smoothing ~= 0.111)",
            type: 'response',
            time: Date.now() / 1000 - 16,
          },
          {
            message: "To avoid too much smoothing with 'ei', suggested max_accel <= 5400 mm/sec^2",
            type: 'response',
            time: Date.now() / 1000 - 15,
          },
          {
            message: 'Recommended shaper_type_x = mzv, shaper_freq_x = 48.2 Hz',
            type: 'response',
            time: Date.now() / 1000 - 14,
          },
          {
            message: "Fitted shaper 'zv' frequency = 41.0 Hz (vibrations = 11.2%, smoothing ~= 0.090)",
            type: 'response',
            time: Date.now() / 1000 - 13,
          },
          {
            message: "To avoid too much smoothing with 'zv', suggested max_accel <= 9200 mm/sec^2",
            type: 'response',
            time: Date.now() / 1000 - 12,
          },
          {
            message: "Fitted shaper 'mzv' frequency = 38.4 Hz (vibrations = 2.1%, smoothing ~= 0.139)",
            type: 'response',
            time: Date.now() / 1000 - 11,
          },
          {
            message: "To avoid too much smoothing with 'mzv', suggested max_accel <= 4300 mm/sec^2",
            type: 'response',
            time: Date.now() / 1000 - 10,
          },
          {
            message: 'Recommended shaper_type_y = mzv, shaper_freq_y = 38.4 Hz',
            type: 'response',
            time: Date.now() / 1000 - 9,
          },
        ],
      };
    case 'printer.gcode.help':
      return demoHelp({
        MMU_GATE_MAP: 'Gate map',
        MMU_CHANGE_TOOL: 'Change tool',
        MMU_TTG_MAP: 'Tool to gate map',
        MMU_ENDLESS_SPOOL: 'Endless spool',
        MMU_SELECT: 'Select gate',
        MMU_CHECK_GATE: 'Check gate',
        MMU_LOAD: 'Load',
        MMU_UNLOAD: 'Unload',
        MMU_EJECT: 'Eject',
        MMU_HOME: 'Home',
        MMU_RECOVER: 'Recover',
        MMU_SELECT_BYPASS: 'Bypass',
        CHANGE_TOOL: 'AFC change',
        TOOL_UNLOAD: 'AFC unload',
        LANE_UNLOAD: 'AFC eject',
        SHAPER_CALIBRATE: 'Simular to TEST_RESONANCES but suggest input shaper config',
        MEASURE_AXES_NOISE: 'Measures noise of all enabled accelerometer chips',
        AXES_SHAPER_CALIBRATION: 'Perform standard axis input shaper tests on one or both XY axes',
        COMPARE_BELTS_RESPONSES:
          'Perform a custom half-axis test to analyze and compare the frequency profiles of individual belts on CoreXY or CoreXZ printers',
        PROBE_EDDY_CURRENT_CALIBRATE: 'Calibrate eddy current probe',
        LDC_CALIBRATE_DRIVE_CURRENT: 'Calibrate LDC1612 DRIVE_CURRENT register',
        PROBE_ACCURACY: 'Probe Z-height accuracy at current XY position',
        PROBE_CALIBRATE: "Calibrate the probe's z_offset",
        QUAD_GANTRY_LEVEL: 'Conform a moving, twistable gantry to the shape of a stationary bed',
        SAVE_CONFIG: 'Overwrite config file and restart',
        G28: 'Home',
        Z_TILT_ADJUST: 'Tilt',
        CHAMBER: 'Chamber temp',
        SET_PAUSE_NEXT_LAYER: 'Enable a pause if the next layer is reached',
        SET_PAUSE_AT_LAYER: 'Enable/disable a pause if a given layer number is reached',
        BED_MESH_CALIBRATE: 'Perform Mesh Bed Leveling',
        PID_CALIBRATE: 'Run PID calibration test',
        ACCELEROMETER_QUERY: 'Query accelerometer for the current values',
        SCREWS_TILT_CALCULATE:
          'Tool to help adjust bed leveling screws by calculating the number of turns to level it.',
        AUTOTUNE_TMC: 'Apply autotuning configuration to TMC stepper driver',
        CREATE_VIBRATIONS_PROFILE: 'Run a vibrations profile test',
        AXES_MAP_CALIBRATION: 'Perform a set of movements to measure the orientation of the accelerometer',
        EXCITATE_AXIS_AT_FREQ: 'Maintain a specified excitation frequency for a period of time',
        FLOW_CALIBRATION: 'Prints a flow rate test pattern',
        BED_MESH_PROFILE: 'Bed Mesh Persistent Storage management',
        SET_HEATER_TEMPERATURE: 'Sets a heater temperature',
        SET_FAN_SPEED: 'Sets the speed of a fan',
      });
    case 'printer.info':
      return { software_version: 'v0.13.0-300', hostname: PROFILE.hostname || 'voyager-demo', state: 'ready' };
    case 'machine.update.upgrade':
      setTimeout(() => {
        let n = 0;
        const t = setInterval(() => {
          n++;
          wsAll({
            jsonrpc: '2.0',
            method: 'notify_update_response',
            params: [{ application: p.name, proc_id: 1, message: 'Updating step ' + n, complete: n >= 6 }],
          });
          if (n >= 6) {
            clearInterval(t);
            finishUpdate(p.name);
          }
        }, 300);
      }, 100);
      return 'ok';
    case 'server.files.delete_file': {
      if (/^timelapse_frames\//.test(p.path || '')) {
        TL_N = 0;
        return { item: { path: p.path, root: 'timelapse_frames' }, action: 'delete_file' };
      }
      const n = (p.path || '').replace(/^timelapse\//, '');
      const i = TL_FILES.findIndex((f) => f.path === n);
      if (i >= 0) TL_FILES.splice(i, 1);
      return { item: { path: p.path, root: 'timelapse' }, action: 'delete_file' };
    }
    case 'server.files.copy':
    case 'server.files.move':
    case 'server.files.post_directory':
      return { item: { path: p.dest || p.path, root: 'config' }, action: 'create_file' };
    case 'access.users.list':
      return { users: DEMO_USERS };
    case 'access.post_user':
      DEMO_USERS.push({ username: p.username, source: 'moonraker', created_on: Date.now() / 1000 });
      return { username: p.username, token: 'demo', refresh_token: 'demo', action: 'user_created' };
    case 'access.delete_user': {
      const i = DEMO_USERS.findIndex((u) => u.username === p.username);
      if (i >= 0) DEMO_USERS.splice(i, 1);
      return { username: p.username, action: 'user_deleted' };
    }
    case 'access.user.password':
      return { username: 'ozan', action: 'user_password_reset' };
    case 'access.get_api_key':
      return DEMO_KEY;
    case 'access.post_api_key':
      return (DEMO_KEY = Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''));
    case 'machine.timelapse.get_settings':
      return { ...TL };
    case 'machine.timelapse.post_settings':
      Object.assign(TL, p);
      return { ...TL };
    case 'machine.timelapse.lastframeinfo':
      return { framecount: TL_N, lastframefile: TL_N ? 'frame' + String(TL_N).padStart(6, '0') + '.jpg' : '' };
    case 'machine.timelapse.render':
      tlRender();
      return 'ok';
    case 'machine.timelapse.saveframes':
      setTimeout(
        () =>
          TL_FILES.unshift({ path: 'timelapse_bracket_v3_frames.zip', modified: Date.now() / 1000, size: 6.1e6 }) &&
          wsAll({
            jsonrpc: '2.0',
            method: 'notify_timelapse_event',
            params: [{ action: 'saveframes', status: 'success', filename: 'timelapse_bracket_v3_frames.zip' }],
          }),
        1500,
      );
      return 'ok';
    case 'server.files.metadata':
      // fan_duct is sliced for PETG and needs more than the active ABS spool has left: the pre-print check asks
      return /fan_duct/.test(p.filename || '')
        ? {
            estimated_time: 5400,
            layer_height: 0.2,
            object_height: 38,
            thumbnails: [],
            filament_type: 'PETG',
            filament_weight_total: 705,
            nozzle_diameter: 0.4,
          }
        : { estimated_time: 7400, layer_height: 0.2, object_height: 42, thumbnails: [] };
    case 'server.database.get_item': {
      if (p.namespace === 'mainsail') return { value: { printername: 'Voyager Demo' } };
      const k = p.namespace + '/' + p.key;
      if (!db[k]) throw { code: 404, message: "Namespace '" + p.namespace + "' not found" };
      return { value: db[k] };
    }
    case 'server.database.post_item':
      db[p.namespace + '/' + p.key] = p.value;
      return { value: p.value };
    case 'server.webcams.list':
      return {
        webcams: [
          {
            name: 'Chamber',
            service: 'mjpegstreamer-adaptive',
            target_fps: 15,
            stream_url: '/webcam/?action=stream',
            snapshot_url: '/webcam/?action=snapshot',
          },
          {
            name: 'Nozzle',
            service: 'mjpegstreamer-adaptive',
            target_fps: 10,
            stream_url: '/webcam2/?action=stream',
            snapshot_url: '/webcam2/?action=snapshot',
          },
          {
            name: 'Bed',
            service: 'mjpegstreamer-adaptive',
            target_fps: 5,
            stream_url: '/webcam3/?action=stream',
            snapshot_url: '/webcam3/?action=snapshot',
          },
        ].slice(0, PROFILE.cams ?? 3),
      };
    case 'server.config':
      return { config: PROFILE.noSpoolman ? {} : { spoolman: { server: 'http://127.0.0.1:7912' } } };
    case 'server.spoolman.get_spool_id':
      return { spool_id: 12 };
    case 'server.spoolman.proxy':
      return /^\/v1\/spool\?/.test(p.path || '') ? { response: SPOOLS } : { response: SPOOLS[0] };
    case 'server.files.list':
      if (p.root === 'timelapse') return TL_FILES;
      if (p.root === 'timelapse_frames')
        return Array.from({ length: TL_N }, (_, i) => ({
          path: 'frame' + String(i + 1).padStart(6, '0') + '.jpg',
          modified: Date.now() / 1000,
          size: 60000,
        }));
      return p.root === 'config'
        ? Object.keys(cfgText)
            .concat(['printer-20260923_121809.cfg'])
            .map((f, i) => ({ path: f, modified: Date.now() / 1000 - i * 3600, size: 1000 }))
            .concat(stFiles)
        : files.map((f) => ({ path: f.filename, modified: f.modified, size: f.size }));
    case 'server.files.get_directory':
      return {
        dirs: [{ dirname: 'archive', modified: Date.now() / 1000, size: 0 }],
        files,
        disk_usage: { total: 58e9, used: 40e9, free: 18e9 },
      };
    case 'server.history.list':
      return {
        jobs: [
          ...Array.from({ length: 30 }, (_, k) => ({
            job_id: 'x' + k,
            filename: 'Cube_ASA_' + k + '.gcode',
            status: k % 5 ? 'completed' : 'cancelled',
            start_time: Date.now() / 1000 - k * 40000,
            total_duration: 800,
            print_duration: 700 + k * 10,
            filament_used: 1200 + k * 50,
            exists: k % 3 > 0,
            metadata: { estimated_time: 660, slicer: 'OrcaSlicer', slicer_version: '2.4.2' },
          })),
          {
            job_id: '1',
            filename: 'bracket_v3.gcode',
            status: 'completed',
            start_time: Date.now() / 1000 - 86400,
            total_duration: 7000,
            print_duration: 6800,
            filament_used: 16000,
            exists: true,
            metadata: {},
          },
          {
            job_id: '2',
            filename: 'x.gcode',
            status: 'cancelled',
            start_time: Date.now() / 1000 - 3 * 86400,
            total_duration: 700,
            print_duration: 600,
            filament_used: 1000,
            exists: false,
            metadata: {},
          },
        ],
      };
    case 'server.history.totals':
      return {
        job_totals: {
          total_jobs: 148,
          total_print_time: 612 * 3600,
          total_filament_used: 3270000,
          longest_print: 30000,
        },
      };
    case 'machine.system_info':
      return {
        system_info: {
          distribution: { name: 'Debian GNU/Linux 13 (trixie)' },
          cpu_info: { model: 'Raspberry Pi 4', processor: 'aarch64', bits: '64bit' },
          network: { wlan0: { ip_addresses: [{ family: 'ipv4', address: '192.168.1.139' }] } },
        },
      };
    case 'server.files.roots':
      return [{ name: 'config' }, { name: 'gcodes' }, { name: 'logs' }];
    case 'machine.proc_stats':
      return {
        throttled_state: { bits: 0x50000, flags: ['Previously Under-Volted', 'Previously Throttled'] },
        network: {
          wlan0: { rx_bytes: 130e6, tx_bytes: 3.4e9, bandwidth: 12600 },
          can0: { rx_bytes: 6.6e6, tx_bytes: 538e3, bandwidth: 500 },
        },
        cpu_temp: 43,
        system_cpu_usage: { cpu: 18 },
        system_memory: { total: 4000000, used: 1200000 },
        system_uptime: 280000,
      };
    case 'machine.update.status':
    case 'machine.update.refresh':
      return updStatus();
    case 'printer.gcode.script':
      return gcodeScript(p.script);
    case 'server.job_queue.status':
      return { queued_jobs: queue.jobs, queue_state: queue.state };
    case 'server.job_queue.start':
      queue.state = 'ready';
      wsAll({
        jsonrpc: '2.0',
        method: 'notify_job_queue_changed',
        params: [{ action: 'state_changed', updated_queue: null, queue_state: 'ready' }],
      });
      return 'ok';
    case 'server.job_queue.pause':
      queue.state = 'paused';
      wsAll({
        jsonrpc: '2.0',
        method: 'notify_job_queue_changed',
        params: [{ action: 'state_changed', updated_queue: null, queue_state: 'paused' }],
      });
      return 'ok';
    case 'server.job_queue.post_job':
      for (const f of p.filenames)
        queue.jobs.push({ job_id: 'q' + Math.random().toString(36).slice(2, 6), filename: f });
      wsAll({
        jsonrpc: '2.0',
        method: 'notify_job_queue_changed',
        params: [{ action: 'jobs_added', updated_queue: queue.jobs, queue_state: queue.state }],
      });
      return { queued_jobs: queue.jobs, queue_state: queue.state };
    case 'server.job_queue.delete_job':
      queue.jobs = p.all ? [] : queue.jobs.filter((j) => !p.job_ids.includes(j.job_id));
      wsAll({
        jsonrpc: '2.0',
        method: 'notify_job_queue_changed',
        params: [{ action: 'jobs_removed', updated_queue: queue.jobs, queue_state: queue.state }],
      });
      return { queued_jobs: queue.jobs, queue_state: queue.state };
    case 'server.job_queue.jump': {
      const i = queue.jobs.findIndex((j) => j.job_id === p.job_id);
      if (i > 0) {
        const [j] = queue.jobs.splice(i, 1);
        queue.jobs.unshift(j);
      }
      wsAll({
        jsonrpc: '2.0',
        method: 'notify_job_queue_changed',
        params: [{ action: 'jobs_removed', updated_queue: queue.jobs, queue_state: queue.state }],
      });
      return {};
    }
    case 'printer.emergency_stop':
      // like Klipper: everything stops, heaters off, Klipper in shutdown until a firmware restart
      pidSim = null;
      emitLines(['!! Shutdown due to webhooks request']);
      pushStatus({
        webhooks: { state: 'shutdown', state_message: 'Shutdown due to webhooks request' },
        print_stats:
          status.print_stats.state === 'printing' || status.print_stats.state === 'paused'
            ? { state: 'error', message: 'Shutdown due to webhooks request' }
            : {},
        extruder: { target: 0, power: 0 },
        heater_bed: { target: 0, power: 0 },
      });
      wsAll({ jsonrpc: '2.0', method: 'notify_klippy_shutdown', params: [] });
      return 'ok';
    case 'printer.restart':
    case 'printer.firmware_restart':
      emitLines(['// demo: Klipper restarted']);
      pushStatus({ webhooks: { state: 'ready', state_message: 'Printer is ready' } });
      if (status.print_stats.state === 'error') pushStatus({ print_stats: { state: 'standby', message: '' } });
      wsAll({ jsonrpc: '2.0', method: 'notify_klippy_ready', params: [] });
      return 'ok';
    case 'printer.print.start':
      pushStatus({ print_stats: { state: 'printing', filename: p.filename, print_duration: 0 } });
      emitLines(['// demo: printing ' + p.filename]);
      return 'ok';
    case 'server.database.list':
      return { namespaces: ['moonraker', 'mainsail', 'voyager-ui', 'fluidd'] };
    default:
      throw { code: -32601, message: 'Method not found' };
  }
}
cfgText['crowsnest.conf'] = `[crowsnest]
log_path: ~/printer_data/logs/crowsnest.log
log_level: verbose
delete_log: false
no_proxy: false

[cam 1]
mode: ustreamer                         # ustreamer - Provides mjpg and snapshots. (All devices)
enable_rtsp: false                      # If camera-streamer is used, this enables also usage of an RTSP server
rtsp_port: 8554                         # Set different ports for each device!
port: 8080                              # HTTP/MJPG Stream/Snapshot Port
device: /dev/video0                     # See Log for available ...
resolution: 1280x720                    # widthxheight format
max_fps: 15                             # If Hardware Supports this it will be forced, otherwise ignored/coerced.
#custom_flags:                          # You can run the Stream Services with custom flags.
#v4l2ctl:                               # Add v4l2-ctl parameters to setup your camera, see Log what your cam is capable of.

[cam 2]
mode: ustreamer
port: 8081
device: /dev/v4l/by-id/usb-046d_Logitech_Webcam_C920-video-index0
resolution: 1920x1080
max_fps: 10
`;
cfgText['macros.cfg'] =
  cfgText['macros.cfg'] ||
  `[gcode_macro PRINT_START]
description: Heat, home, level and purge
gcode:
  {% set BED = params.BED|default(60)|float %}
  {% set EXTRUDER = params.EXTRUDER|default(200)|float %}
  M190 S{BED}
  G28
  {% if printer.quad_gantry_level.applied == False %}
    QUAD_GANTRY_LEVEL
    G28 Z
  {% endif %}
  BED_MESH_CALIBRATE ADAPTIVE=1
  M109 S{EXTRUDER}
  G1 X10 Y10 Z0.3 F6000  ; purge start

[gcode_macro PARK]
variable_z_hop: 10
gcode:
  {% if "xyz" in printer.toolhead.homed_axes %}
    G91
    G1 Z{printer["gcode_macro PARK"].z_hop} F900
  G90
`;
// ---- live printer: progress, layers, temperatures, occasional console lines ----
let tk = 0,
  GLEN = 0,
  pidSim = null;
function tick() {
  tk++;
  const st = status;
  // heaters with a target hover around it, the others stay where they are
  const hover = (h, spread) => {
    if (h.target) h.temperature = h.target - spread / 2 + Math.random() * spread;
  };
  if (pidSim) {
    // warming up, then damped swings around the target
    const h = st[pidSim.h];
    pidSim.t++;
    const rise = Math.min(1, pidSim.t / 8);
    h.target = pidSim.tg;
    h.temperature =
      pidSim.from +
      (pidSim.tg - pidSim.from) * rise +
      (rise === 1 ? 6 * Math.sin(pidSim.t / 1.7) * Math.exp(-(pidSim.t - 8) / 14) : 0);
    h.power = h.temperature < pidSim.tg ? 1 : 0;
  }
  if (!pidSim || pidSim.h !== 'extruder') hover(st.extruder, 0.8);
  if (!pidSim) st.extruder.power = st.extruder.target ? 0.4 + Math.random() * 0.04 : 0;
  if (!pidSim || pidSim.h !== 'heater_bed') hover(st.heater_bed, 0.3);
  hover(st['heater_generic chamber'], 0.5);
  st['temperature_sensor EBB_MCU'].temperature = 48 + Math.random() * 0.6;
  const ps = st.print_stats,
    vs = st.virtual_sdcard;
  if (ps.state === 'printing') {
    ps.print_duration += 1;
    ps.total_duration += 1;
    ps.filament_used += 4;
    vs.progress = Math.min(0.999, vs.progress + 1 / 7400);
    st.display_status.progress = vs.progress;
    vs.file_position = Math.floor(vs.progress * (GLEN ||= gcodeFile().length)); // lets the G-code viewer follow the print
    if (tk % 35 === 0 && ps.info.current_layer < ps.info.total_layer) {
      ps.info.current_layer++;
      tlFrame();
    }
  }
  const eb = st['mcu EBBCan'].last_stats;
  if (tk % 3 === 0) eb.bytes_retransmit += Math.round(Math.random() * 40);
  const mcu = st.mcu.last_stats;
  mcu.mcu_task_avg = 0.00002 + Math.random() * 0.00001;
  st.gcode_move.gcode_position = [
    150 + 40 * Math.sin(tk / 7),
    150 + 40 * Math.cos(tk / 9),
    ps.info.current_layer * 0.2,
    0,
  ];
  st.toolhead.position = st.gcode_move.gcode_position;
  wsAll({
    jsonrpc: '2.0',
    method: 'notify_status_update',
    params: [
      {
        extruder: { temperature: st.extruder.temperature, power: st.extruder.power },
        heater_bed: { temperature: st.heater_bed.temperature },
        'heater_generic chamber': { temperature: st['heater_generic chamber'].temperature },
        'temperature_sensor EBB_MCU': { temperature: st['temperature_sensor EBB_MCU'].temperature },
        print_stats: {
          print_duration: ps.print_duration,
          total_duration: ps.total_duration,
          filament_used: ps.filament_used,
          info: { ...ps.info },
        },
        virtual_sdcard: { progress: vs.progress, file_position: vs.file_position },
        display_status: { progress: vs.progress },
        gcode_move: { gcode_position: st.gcode_move.gcode_position },
        toolhead: { position: st.toolhead.position },
        motion_report: {
          live_velocity: 120 + 80 * Math.sin(tk / 3),
          live_extruder_velocity: (120 + 80 * Math.sin(tk / 3)) * 0.033,
        },
        'mcu EBBCan': { last_stats: { ...eb } },
        mcu: { last_stats: { ...mcu } },
      },
      tk,
    ],
  });
  if (tk % 40 === 0 && ps.state === 'printing')
    emitLines([`// layer ${ps.info.current_layer}/${ps.info.total_layer} done`]);
}

// a few macros react so the demo feels alive
const _gs = gcodeScript;
gcodeScript = function (sc) {
  const S = sc.trim().toUpperCase();
  if (S === 'PAUSE') {
    pushStatus({ print_stats: { state: 'paused' } });
    emitLines(['// Print paused']);
    return 'ok';
  }
  if (S === 'RESUME') {
    pushStatus({ print_stats: { state: 'printing' } });
    emitLines(['// Print resumed']);
    return 'ok';
  }
  if (S === 'CANCEL_PRINT') {
    pushStatus({ print_stats: { state: 'cancelled' } });
    emitLines(['// Print cancelled']);
    return 'ok';
  }
  if (S === 'TURN_OFF_HEATERS') {
    pushStatus({ extruder: { target: 0 }, heater_bed: { target: 0 }, 'heater_generic chamber': { target: 0 } });
    return 'ok';
  }
  let m;
  if ((m = S.match(/^M104 S(\d+)/)) || (m = S.match(/SET_HEATER_TEMPERATURE HEATER=EXTRUDER TARGET=(\d+)/))) {
    pushStatus({ extruder: { target: +m[1] } });
    return 'ok';
  }
  if ((m = S.match(/^M140 S(\d+)/)) || (m = S.match(/SET_HEATER_TEMPERATURE HEATER=HEATER_BED TARGET=(\d+)/))) {
    pushStatus({ heater_bed: { target: +m[1] } });
    return 'ok';
  }
  if ((m = S.match(/SET_HEATER_TEMPERATURE HEATER=CHAMBER TARGET=(\d+)/))) {
    pushStatus({ 'heater_generic chamber': { target: +m[1] } });
    return 'ok';
  }
  if ((m = S.match(/^M106 S(\d+)/))) {
    pushStatus({ fan: { speed: +m[1] / 255 } });
    return 'ok';
  }
  if ((m = S.match(/SET_FAN_SPEED FAN=(\w+) SPEED=([\d.]+)/))) {
    const k = Object.keys(status).find((x) => x.toLowerCase().endsWith(' ' + m[1].toLowerCase()));
    if (k) pushStatus({ [k]: { speed: +m[2] } });
    return 'ok';
  }
  if ((m = S.match(/SET_PIN PIN=(\w+) VALUE=([\d.]+)/))) {
    const k = Object.keys(status).find((x) => x.toLowerCase() === 'output_pin ' + m[1].toLowerCase());
    if (k) pushStatus({ [k]: { value: +m[2] } });
    return 'ok';
  }
  if ((m = S.match(/^MMU_TTG_MAP\b(.*)/))) {
    const x = status.mmu;
    const mp = /MAP=([\d,]+)/.exec(m[1]);
    if (/RESET=1/.test(m[1])) pushStatus({ mmu: { ttg_map: x.ttg_map.map((_, i) => i) } });
    else if (mp) pushStatus({ mmu: { ttg_map: mp[1].split(',').map(Number) } });
    emitLines(['// MMU TTG map updated']);
    return 'ok';
  }
  if ((m = S.match(/^MMU_ENDLESS_SPOOL\b.*ENABLE=(\d)/))) {
    pushStatus({ mmu: { endless_spool: +m[1] } });
    return 'ok';
  }
  if (/^MMU_GATE_MAP /.test(S)) {
    const a = {};
    for (const mm of S.matchAll(/(\w+)=("([^"]*)"|\S+)/g)) a[mm[1].toUpperCase()] = mm[3] ?? mm[2];
    const g = +a.GATE,
      x = status.mmu;
    if (x && g >= 0 && g < x.num_gates) {
      const set = (k, v) => {
        x[k] = [...x[k]];
        x[k][g] = v;
      };
      if (a.MATERIAL) set('gate_material', a.MATERIAL);
      if (a.COLOR && /^[0-9a-f]{6}$/i.test(a.COLOR))
        set(
          'gate_color_rgb',
          [0, 2, 4].map((i) => parseInt(a.COLOR.slice(i, i + 2), 16) / 255),
        );
      if (a.NAME) set('gate_name', a.NAME);
      if (a.TEMP) set('gate_temperature', +a.TEMP);
      if (a.SPOOLID) set('gate_spool_id', +a.SPOOLID);
      if (a.AVAILABLE != null) set('gate_status', +a.AVAILABLE);
      pushStatus({
        mmu: {
          gate_status: x.gate_status,
          gate_material: x.gate_material,
          gate_color_rgb: x.gate_color_rgb,
          gate_name: x.gate_name,
          gate_temperature: x.gate_temperature,
          gate_spool_id: x.gate_spool_id,
        },
      });
    }
    return 'ok';
  }
  if ((m = sc.match(/^EXCLUDE_OBJECT NAME="?([^"\s]+)"?/i))) {
    const eo = status.exclude_object;
    if (!eo.excluded_objects.includes(m[1])) eo.excluded_objects = [...eo.excluded_objects, m[1]];
    pushStatus({ exclude_object: { excluded_objects: eo.excluded_objects } });
    emitLines(['// Excluding object ' + m[1]]);
    return 'ok';
  }
  if (/^SHAPER_CALIBRATE\b/.test(S)) {
    // what Klipper's own input shaper calibration prints
    const axes = /AXIS=([XY])/.exec(S) ? [/AXIS=([XY])/.exec(S)[1].toLowerCase()] : ['x', 'y'];
    const out = [];
    for (const a of axes) {
      const f = a === 'x' ? 53.8 : 42.2;
      out.push(
        '// Wait for calculations..',
        `// Fitted shaper 'zv' frequency = ${(f - 6).toFixed(1)} Hz (vibrations = 6.2%, smoothing ~= 0.071)`,
        `// To avoid too much smoothing with 'zv', suggested max_accel <= ${a === 'x' ? 12800 : 9100} mm/sec^2`,
        `// Fitted shaper 'mzv' frequency = ${f} Hz (vibrations = 1.1%, smoothing ~= 0.085)`,
        `// To avoid too much smoothing with 'mzv', suggested max_accel <= ${a === 'x' ? 8300 : 5600} mm/sec^2`,
        `// Recommended shaper_type_${a} = mzv, shaper_freq_${a} = ${f} Hz`,
      );
    }
    out.push(
      '// The SAVE_CONFIG command will update the printer config file with these parameters and restart the printer.',
    );
    emitLines(out, 700);
    return new Promise((res) =>
      setTimeout(() => {
        pushStatus({ configfile: { save_config_pending: true } });
        res('ok');
      }, 700 * out.length),
    );
  }
  if (/^PID_CALIBRATE\b/.test(S)) {
    // the heater warms up and swings around the target a few times (tick() draws it), then the result
    const h = ((/HEATER=(\S+)/.exec(S) || [])[1] || 'EXTRUDER').toLowerCase();
    const tg = +((/TARGET=([\d.]+)/.exec(S) || [])[1] || 200);
    pidSim = { h, tg, t: 0, from: status[h]?.temperature ?? 25 };
    pushStatus({ [h]: { target: tg } });
    emitLines([`// PID calibrate: heating ${h} to ${tg}`]);
    const mine = pidSim;
    return new Promise((res, rej) =>
      setTimeout(() => {
        if (pidSim !== mine) return rej({ code: 400, message: 'PID calibration interrupted' }); // E-STOP
        pidSim = null;
        pushStatus({ [h]: { target: 0, power: 0 } });
        emitLines([
          '// PID parameters: pid_Kp=22.865 pid_Ki=1.292 pid_Kd=101.178',
          '// The SAVE_CONFIG command will update the printer config file with these parameters and restart the printer.',
        ]);
        pushStatus({ configfile: { save_config_pending: true } });
        res('ok');
      }, 24000),
    );
  }
  if (/^BED_MESH_CALIBRATE\b/.test(S)) {
    const [x0, y0] = [20, 20],
      [x1, y1] = [(status.toolhead.axis_maximum[0] || 300) - 20, (status.toolhead.axis_maximum[1] || 300) - 20];
    const n = 7,
      out = [],
      m = [];
    for (let j = 0; j < n; j++) {
      const row = [];
      for (let i = 0; i < n; i++) {
        const ii = j % 2 ? n - 1 - i : i; // serpentine like Klipper
        const x = x0 + ((x1 - x0) * ii) / (n - 1),
          y = y0 + ((y1 - y0) * j) / (n - 1);
        const z = 2.5 + 0.06 * Math.sin(ii / 1.6) - 0.04 * Math.cos(j / 2) + 0.01 * Math.random();
        row[ii] = z - 2.5;
        out.push(`// probe at ${x.toFixed(3)},${y.toFixed(3)} is z=${z.toFixed(6)}`);
      }
      m.push(row);
    }
    out.push('// Mesh Bed Leveling Complete', '// Bed Mesh state has been saved to profile [default]');
    emitLines(out, 180);
    return new Promise((res) =>
      setTimeout(() => {
        pushStatus({
          bed_mesh: { probed_matrix: m, profile_name: 'default' },
          configfile: { save_config_pending: true },
        });
        res('ok');
      }, 180 * out.length),
    );
  }
  if (/^PROBE_ACCURACY\b/.test(S)) {
    const n = +((/SAMPLES=(\d+)/.exec(S) || [])[1] || 10);
    const out = [
      `// PROBE_ACCURACY at X:175.000 Y:175.000 Z:10.000 (samples=${n} retract=2.000 speed=5.0 lift_speed=5.0)`,
    ];
    for (let i = 0; i < Math.min(n, 20); i++)
      out.push(`// probe at 175.000,175.000 is z=${(2.482 + Math.sin(i) * 0.003).toFixed(6)}`);
    out.push(
      '// probe accuracy results: maximum 2.485000, minimum 2.479000, range 0.006000, average 2.482200, median 2.482500, standard deviation 0.001720',
    );
    emitLines(out, 350);
    return new Promise((res) => setTimeout(() => res('ok'), 350 * out.length));
  }
  if (S === 'QUAD_GANTRY_LEVEL' || S === 'Z_TILT_ADJUST') {
    emitLines(
      [
        '// Retries: 0/5 Probed points range: 0.214000 tolerance: 0.007500',
        '// Retries: 1/5 Probed points range: 0.031000 tolerance: 0.007500',
        '// Retries: 2/5 Probed points range: 0.004000 tolerance: 0.007500',
      ],
      1500,
    );
    return new Promise((res) => setTimeout(() => res('ok'), 4600));
  }
  if (S === 'MEASURE_AXES_NOISE') {
    emitLines(['// Axes noise for xy-axis accelerometer: 38.211 (x), 45.093 (y), 81.502 (z)'], 600);
    return 'ok';
  }
  if (S === 'ACCELEROMETER_QUERY') {
    emitLines(['// accelerometer values (x, y, z): 470.719200, 941.438400, 9728.196800'], 100);
    return 'ok';
  }
  if (/^AXES_SHAPER_CALIBRATION\b/i.test(S)) {
    // a pretend Shake&Tune run: its console output, then two new graphs
    const f = (x, y) => `    -> ${x} @ ${y} Hz (with a damping ratio of 0.050)`;
    emitLines(
      [
        '// Measuring X axis...',
        '// X axis frequency profile generation...',
        '// This may take some time (1-3min)',
        '// Recommended filters:',
        '// ' + f('For performance: MZV', '52.4'),
        '// ' + f('For low vibrations: EI', '61.8'),
        '// Measuring Y axis...',
        '// Y axis frequency profile generation...',
        '// Recommended filters:',
        '// ' + f('Best shaper: MZV', '41.6'),
      ],
      400,
    );
    setTimeout(() => {
      const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
      const d = ts.slice(0, 8) + '_' + ts.slice(8);
      for (const a of ['X', 'Y'])
        stFiles.unshift({
          path: `ShakeTune_results/input_shaper/IS_${a}_${d}.png`,
          modified: Date.now() / 1000,
          size: 1000,
        });
      wsAll({
        jsonrpc: '2.0',
        method: 'notify_filelist_changed',
        params: [{ action: 'create_file', item: { root: 'config', path: 'ShakeTune_results/input_shaper/new.png' } }],
      });
    }, 4400);
    return 'ok';
  }
  if ((m = S.match(/^SET_PAUSE_NEXT_LAYER\b.*?ENABLE=(\d)/))) {
    pushStatus({ 'gcode_macro SET_PAUSE_NEXT_LAYER': { pause_next_layer: { enable: m[1] === '1', call: 'PAUSE' } } });
    return 'ok';
  }
  if ((m = S.match(/^SET_PAUSE_AT_LAYER\b.*?ENABLE=(\d)(?:.*?LAYER=(\d+))?/))) {
    pushStatus({
      'gcode_macro SET_PAUSE_AT_LAYER': {
        pause_at_layer: { enable: m[1] === '1', layer: +(m[2] || 0), call: 'PAUSE' },
      },
    });
    return 'ok';
  }
  if ((m = S.match(/^SET_GCODE_OFFSET\b(.*)/))) {
    const z = /Z=(-?[\d.]+)/.exec(m[1]),
      adj = /Z_ADJUST=(-?[\d.]+)/.exec(m[1]);
    const cur = status.gcode_move.homing_origin || [0, 0, 0, 0];
    const nz = z ? +z[1] : adj ? Math.round((cur[2] + +adj[1]) * 1000) / 1000 : cur[2];
    pushStatus({ gcode_move: { homing_origin: [cur[0], cur[1], nz, cur[3]] } });
    return 'ok';
  }
  if ((m = S.match(/^M220 S(\d+)/))) {
    pushStatus({ gcode_move: { speed_factor: +m[1] / 100 } });
    return 'ok';
  }
  if ((m = S.match(/^M221 S(\d+)/))) {
    pushStatus({ gcode_move: { extrude_factor: +m[1] / 100 } });
    return 'ok';
  }
  if (S.startsWith('G28')) {
    pushStatus({ toolhead: { homed_axes: 'xyz' } });
    emitLines(['// homed']);
    return 'ok';
  }
  return _gs(sc);
};

// ---- transport ----
const DELAY = { 'printer.objects.subscribe': 400, 'server.history.list': 300 };
class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    sockets.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen && this.onopen({});
    }, 60);
  }
  _recv(s) {
    this.readyState === 1 && this.onmessage && this.onmessage({ data: s });
  }
  send(d) {
    const m = JSON.parse(d);
    setTimeout(async () => {
      try {
        const result = await handle(m); // long commands (PID, mesh) answer when they end, like Klipper
        if (m.id !== undefined) this._recv(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }));
      } catch (e) {
        if (m.id !== undefined)
          this._recv(
            JSON.stringify({
              jsonrpc: '2.0',
              id: m.id,
              error: { code: e.code || 500, message: e.message || String(e) },
            }),
          );
      }
    }, DELAY[m.method] || 30);
  }
  close() {
    this.readyState = 3;
    sockets = sockets.filter((x) => x !== this);
    this.onclose && this.onclose({});
  }
  addEventListener(t, f) {
    this['on' + t] = f;
  }
  removeEventListener(t) {
    this['on' + t] = null;
  }
}
const camSvg = (n, v = 1) =>
  v === 2
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#101317"/><rect x="200" y="0" width="240" height="190" rx="10" fill="#2a2f36"/><path d="M280 190 h80 l-22 70 h-36z" fill="#c9a24a"/><circle cx="320" cy="${272 + (n % 6)}" r="${6 + (n % 3)}" fill="#ff6b1a"/><rect x="0" y="300" width="640" height="60" fill="#2c3138"/><text x="20" y="30" fill="#8b919b" font-family="monospace" font-size="16">nozzle cam · frame ${n}</text></svg>`
    : v === 3
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#15181c"/><rect x="80" y="40" width="480" height="280" rx="8" fill="#3b3a34"/><g fill="#f5b23a" opacity=".9"><rect x="${150 + (n % 40)}" y="120" width="60" height="60" rx="4"/><rect x="330" y="140" width="90" height="40" rx="4"/></g><text x="20" y="345" fill="#8b919b" font-family="monospace" font-size="16">bed cam · frame ${n}</text></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2027"/><stop offset="1" stop-color="#0d0f12"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><rect x="120" y="230" width="400" height="14" rx="3" fill="#3a3f47"/><rect x="250" y="150" width="140" height="80" rx="6" fill="#f5b23a" opacity=".85"/><rect x="300" y="60" width="40" height="90" fill="#4a5058"/><path d="M310 150 h20 l-10 14z" fill="#8b919b"/><text x="20" y="340" fill="#8b919b" font-family="monospace" font-size="16">demo camera · ${new Date().toLocaleTimeString()} · frame ${n}</text></svg>`;
let frame = 0;
function gcodeFile() {
  let g = ';gcode\nG28\nG90\nM83\n';
  for (let z = 1; z <= 40; z++) {
    g += `;LAYER_CHANGE\n;Z:${(z * 0.2).toFixed(2)}\nG1 Z${(z * 0.2).toFixed(2)} F600\n`;
    for (let k = 0; k < 4; k++) {
      const r = 30 + 10 * Math.sin(z / 5) - k * 2;
      // slicer feature comments and speeds, so the viewer's colour modes have something to show
      g += k === 0 ? ';TYPE:Outer wall\n' : k === 1 ? ';TYPE:Inner wall\n' : ';TYPE:Sparse infill\n';
      const f = k === 0 ? 2400 : k === 1 ? 4800 : 9000;
      g += `G1 X${150 + r} Y150 F${f}\nG1 X${150 + r} Y${150 + r} E1\nG1 X150 Y${150 + r} E1\nG1 X150 Y150 E1\n`;
    }
  }
  return g;
}
// a .gcode.3mf like OrcaSlicer makes: a stored (uncompressed) zip with the plate's G-code in Metadata/
function zip3mf(text) {
  const enc = new TextEncoder();
  const name = enc.encode('Metadata/plate_1.gcode');
  const data = enc.encode(text);
  let crc = 0xffffffff;
  for (const b of data) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const le = (n, w) => Array.from({ length: w }, (_, i) => (n >>> (8 * i)) & 255);
  const local = [
    ...le(0x04034b50, 4),
    ...le(20, 2),
    ...le(0, 2),
    ...le(0, 2),
    ...le(0, 4),
    ...le(crc, 4),
    ...le(data.length, 4),
    ...le(data.length, 4),
    ...le(name.length, 2),
    ...le(0, 2),
    ...name,
  ];
  const cdOff = local.length + data.length;
  const cd = [
    ...le(0x02014b50, 4),
    ...le(20, 2),
    ...le(20, 2),
    ...le(0, 2),
    ...le(0, 2),
    ...le(0, 4),
    ...le(crc, 4),
    ...le(data.length, 4),
    ...le(data.length, 4),
    ...le(name.length, 2),
    ...le(0, 2),
    ...le(0, 2),
    ...le(0, 2),
    ...le(0, 2),
    ...le(0, 4),
    ...le(0, 4),
    ...name,
  ];
  const eocd = [
    ...le(0x06054b50, 4),
    ...le(0, 2),
    ...le(0, 2),
    ...le(1, 2),
    ...le(1, 2),
    ...le(cd.length, 4),
    ...le(cdOff, 4),
    ...le(0, 2),
  ];
  const out = new Uint8Array(cdOff + cd.length + eocd.length);
  out.set(local, 0);
  out.set(data, local.length);
  out.set(cd, cdOff);
  out.set(eocd, cdOff + cd.length);
  return out;
}
// a log for the viewer: a few thousand plausible lines, with the odd warning and one shutdown
function demoLog(name) {
  const out = [];
  const t0 = Date.now() - 3600e3;
  const ts = (i) => new Date(t0 + i * 900).toISOString().replace('T', ' ').slice(0, 19);
  for (let i = 0; i < 3000; i++) {
    if (name === 'klippy.log') {
      if (i % 250 === 0)
        out.push(
          `Stats ${i}: gcodein=0  mcu: mcu_awake=0.012 mcu_task_avg=0.000018 bytes_retransmit=${i % 1000 === 0 ? 9 : 0} freq=180000000 EBBCan: temp=46.2 heater_bed: target=110 temp=109.9 pwm=0.612`,
        );
      else if (i === 1700) out.push("Transition to shutdown state: Lost communication with MCU 'EBBCan'");
      else if (i === 1701) out.push('Reactor garbage collection: (3.2, 0.1, 0.0)');
      else if (i === 1900) out.push('Firmware restart');
      else if (i % 37 === 0)
        out.push(`Received ${i}: G1 X${(100 + (i % 200)).toFixed(3)} Y${(120 + (i % 150)).toFixed(3)} E0.0421`);
      else
        out.push(
          `Stats ${i}: sd_pos=${i * 1024} heater_bed: target=110 temp=${(109.7 + Math.sin(i / 50) * 0.3).toFixed(1)} pwm=0.6`,
        );
    } else if (name === 'moonraker.log') {
      if (i % 400 === 0)
        out.push(`${ts(i)} [websockets:_handle_close()] - Websocket Closed: ID: ${281000 + i} Close Code: 1001`);
      else if (i === 1200) out.push(`${ts(i)} [klippy_connection:_check_ready()] - Klippy Host not ready: timeout`);
      else
        out.push(
          `${ts(i)} [file_manager:_handle_metadata_request()] - Metadata request: ${['bracket_v3.gcode', 'fan_duct.gcode', 'calicat_PLA.gcode.3mf'][i % 3]}`,
        );
    } else
      out.push(
        `${ts(i)} crowsnest: ${i % 300 === 0 ? 'WARN: Camera cam1 lost frames' : 'Camera cam1 running at 15 fps'}`,
      );
  }
  return out.join('\n') + '\n';
}
let realFetch;
function fakeFetch(input, init) {
  const u = new URL(typeof input === 'string' ? input : input.url, location.href);
  const p = u.pathname.replace(/^.*?(?=\/(server|printer|machine|access|api|webcam)\b)/, '');
  const json = (o, code = 200) =>
    Promise.resolve(new Response(JSON.stringify(o), { status: code, headers: { 'content-type': 'application/json' } }));
  // an address that is neither this page nor one of the demo printers: nobody answers, like a wrong IP
  if (u.host !== location.host && u.host !== DEMO_HOST && !FLEET[u.host])
    return Promise.reject(new TypeError('Failed to fetch'));
  if (
    ['/printer/objects/query', '/printer/info', '/server/webcams/list'].includes(p) &&
    u.host !== (DEMO_HOST || location.host)
  ) {
    const r = fleetAnswer(u.host, p);
    if (r) return json({ result: r });
  }
  if (p === '/server/info') return json({ result: handle({ method: 'server.info' }) });
  if (p === '/printer/info') return json({ result: handle({ method: 'printer.info' }) });
  if (p === '/access/info') return json({ result: { default_source: 'moonraker', available_sources: ['moonraker'] } });
  if (p === '/access/oneshot_token') return json({ result: 'demo' });
  if (p.startsWith('/server/files/upload')) {
    emitLines(['// demo: uploads are not stored']);
    return json({ result: {} });
  }
  if (p.startsWith('/server/files/logs/')) {
    const name = decodeURIComponent(p.slice(19));
    const body = demoLog(name);
    const range = /bytes=-(\d+)/.exec((init && init.headers && (init.headers.Range || init.headers.range)) || '');
    if (range && +range[1] < body.length) {
      const part = body.slice(-+range[1]);
      return Promise.resolve(
        new Response(part, {
          status: 206,
          headers: {
            'content-type': 'text/plain',
            'Content-Range': `bytes ${body.length - part.length}-${body.length - 1}/${body.length}`,
          },
        }),
      );
    }
    return Promise.resolve(
      new Response(body, { headers: { 'content-type': 'text/plain', 'Content-Length': String(body.length) } }),
    );
  }
  if (p.startsWith('/server/files/config/')) {
    const n = decodeURIComponent(p.slice(21));
    const body =
      cfgText[n] ??
      (/^printer-\d{8}_\d{6}\.cfg$/.test(n)
        ? cfgText['printer.cfg'].replace('shaper_freq_x: 58.2', 'shaper_freq_x: 55.0')
        : undefined);
    return Promise.resolve(
      new Response(body || '', { status: body != null ? 200 : 404, headers: { 'content-type': 'text/plain' } }),
    );
  }
  if (p.startsWith('/server/files/gcodes/'))
    return Promise.resolve(
      /\.3mf$/i.test(p)
        ? new Response(zip3mf(gcodeFile()), { headers: { 'content-type': 'application/zip' } })
        : new Response(gcodeFile(), { headers: { 'content-type': 'text/plain' } }),
    );
  if (p.startsWith('/server/files/')) return json({ error: { code: 404, message: 'not in the demo' } }, 404);
  if (p.startsWith('/webcam'))
    return Promise.resolve(
      new Response(camSvg(++frame, +(p.match(/^\/webcam(\d)/)?.[1] || 1)), {
        headers: { 'content-type': 'image/svg+xml' },
      }),
    );
  if (p.startsWith('/printer/') || p.startsWith('/machine/') || p.startsWith('/api/')) return json({ result: {} });
  return realFetch(input, init);
}
export function installDemo() {
  realFetch = window.fetch.bind(window);
  // <video> and <img> do not go through fetch: timelapse clips and frames get their own addresses
  const fileUrl = api.fileUrl.bind(api);
  api.fileUrl = (root, path) => {
    if (root === 'timelapse' && /\.mp4$/i.test(path))
      return document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"') ? demoMp4 : demoWebm;
    if (root === 'timelapse' && /\.jpg$/i.test(path))
      return svgUrl(tlSvg(TL_FILES.findIndex((f) => f.path === path) * 37 + 150, 'clip'));
    if (root === 'timelapse_frames') return svgUrl(tlSvg(+(path.match(/\d+/)?.[0] || 0)));
    return fileUrl(root, path);
  };
  setInterval(tick, 1000);
  window.WebSocket = FakeSocket;
  window.fetch = fakeFetch;
  // uploads go through XMLHttpRequest (for the progress bar): answer them here too. A config file that is
  // uploaded replaces the demo's copy, so saving from the editor or the Shake&Tune page shows the change.
  const xOpen = XMLHttpRequest.prototype.open,
    xSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url, ...r) {
    this.__demoUpload = /\/server\/files\/upload/.test(String(url));
    return this.__demoUpload ? undefined : xOpen.call(this, m, url, ...r);
  };
  XMLHttpRequest.prototype.setRequestHeader = ((orig) =>
    function (...a) {
      if (!this.__demoUpload) return orig.apply(this, a);
    })(XMLHttpRequest.prototype.setRequestHeader);
  XMLHttpRequest.prototype.send = function (body) {
    if (!this.__demoUpload) return xSend.call(this, body);
    const done = async () => {
      const f = body?.get?.('file'),
        root = body?.get?.('root'),
        dir = body?.get?.('path') || '';
      if (root === 'config' && f) cfgText[(dir ? dir + '/' : '') + f.name] = await f.text();
      Object.defineProperty(this, 'status', { value: 201 });
      Object.defineProperty(this, 'responseText', { value: JSON.stringify({ item: { path: f?.name, root } }) });
      this.onload && this.onload();
    };
    setTimeout(done, 150);
  };
  window.__demo = true;
  // <img> tags cannot go through fetch: serve the camera as a data URL by rewriting Moonraker image URLs
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    get() {
      return desc.get.call(this);
    },
    set(v) {
      if (typeof v === 'string' && /\/server\/files\/config\/.*\.png/.test(v))
        v =
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(graphSvg(decodeURIComponent(v.split('/').pop().split('?')[0])));
      if (typeof v === 'string' && /\/webcam/.test(v))
        v = 'data:image/svg+xml;utf8,' + encodeURIComponent(camSvg(++frame, +(v.match(/\/webcam(\d)/)?.[1] || 1)));
      desc.set.call(this, v);
    },
  });
}

// a made-up resonance graph for the demo Shake&Tune pngs
function graphSvg(name) {
  const W = 900,
    H = 500,
    seed = name.length;
  const pts = (f, a) =>
    Array.from({ length: 120 }, (_, i) => {
      const x = i / 119,
        y = a / (1 + ((x - f) * 14) ** 2) + 0.04 * Math.sin(i * 0.7 + seed);
      return `${60 + x * (W - 90)},${H - 50 - y * (H - 110)}`;
    }).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/><text x="60" y="34" font-family="sans-serif" font-size="18" fill="#333">${name}  (demo)</text><path d="M60 ${H - 50}H${W - 30}M60 ${H - 50}V50" stroke="#888" fill="none"/><polyline points="${pts(0.38, 0.9)}" fill="none" stroke="#5b3fd6" stroke-width="2.5"/><polyline points="${pts(0.44, 0.6)}" fill="none" stroke="#e8743b" stroke-width="2.5"/></svg>`;
}
