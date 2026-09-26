// Browser-side fake Moonraker for the live demo (npm run build:demo). Replaces WebSocket and fetch so the UI runs
// without a printer. Everything is in memory: settings reset on reload, g-code is only echoed to the console card.
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
  'gcode_macro OZNLAB_SENSOR_MENU',
  'gcode_macro BED_MESH_AUTO',
  'gcode_macro CLEAN_NOZZLE',
  'gcode_macro HEAT_SOAK',
  'gcode_macro PARK',
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
      'gcode_macro CHAMBER': {
        gcode: '{% set t = params.TEMP|default(50)|int %}\nSET_HEATER_TEMPERATURE HEATER=chamber TARGET={t}',
      },
      'gcode_macro HEAT_SOAK': {
        gcode: '{% set m = params.MINUTES|default(10) %}{% set b = params.BED|default(110) %}',
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
    profiles: { default: {}, abs_110: {} },
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
  'heater_fan hotend_fan': { speed: 1 },
  'fan_generic chamber_fan': { speed: 1 },
  'fan_generic Intake_Fan': { speed: 0 },
  'fan_generic Aux_Fan': { speed: 0.35 },
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
  'gcode_macro OZNLAB_SENSOR_MENU': { description: 'OznLab Sensor setup menu' },
  firmware_retraction: { retract_length: 0.8, retract_speed: 35, unretract_extra_length: 0, unretract_speed: 30 },
  'gcode_macro BED_MESH_AUTO': {},
  'gcode_macro CLEAN_NOZZLE': {},
  'gcode_macro HEAT_SOAK': {},
  'gcode_macro PARK': {},
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
      { id: 'x2', name: 'Sensor Menu', icon: 'grip', gcode: 'OZNLAB_SENSOR_MENU', highlight: true },
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
    autoLayout: false,
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
    layout: [
      { i: 'temps', x: 0, y: 0, w: 3, h: 6 },
      { i: 'console', x: 3, y: 0, w: 6, h: 11 },
      { i: 'webcam', x: 9, y: 0, w: 3, h: 11 },
      { i: 'tempchart', x: 0, y: 6, w: 3, h: 5 },
      { i: 'system', x: 0, y: 11, w: 3, h: 4 },
      { i: 'toolhead', x: 3, y: 11, w: 6, h: 8 },
      { i: 'extruder', x: 9, y: 11, w: 3, h: 8 },
      { i: 'mmu', x: 0, y: 15, w: 3, h: 7 },
      { i: 'print', x: 3, y: 19, w: 4, h: 7 },
      { i: 'limits', x: 7, y: 19, w: 5, h: 7 },
      { i: 'objects', x: 0, y: 22, w: 3, h: 7 },
      { i: 'mesh', x: 3, y: 26, w: 4, h: 7 },
      { i: 'macros', x: 7, y: 26, w: 5, h: 7 },
      { i: 'queue', x: 0, y: 29, w: 3, h: 6 },
      { i: 'devices', x: 3, y: 33, w: 4, h: 7 },
      { i: 'health', x: 7, y: 33, w: 5, h: 7 },
      { i: 'spool', x: 0, y: 35, w: 3, h: 6 },
      { i: 'files', x: 3, y: 40, w: 4, h: 7 },
      { i: 'jobs', x: 7, y: 40, w: 5, h: 7 },
      { i: 'retraction', x: 0, y: 41, w: 3, h: 6 },
      { i: 'power', x: 0, y: 47, w: 3, h: 5 },
    ],
    sound: { enabled: true, volume: 0.6, complete: true, error: true, paused: true, heated: false },
    heaterBase: { 'extruder@250': { power: 0.28, t: Date.now() - 40 * 86400e3 } },
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
let queue = {
  state: 'paused',
  jobs: [
    { job_id: 'q1', filename: 'fan_duct.gcode', time_added: 0, time_in_queue: 0 },
    { job_id: 'q2', filename: 'bracket_v3.gcode', time_added: 0, time_in_queue: 0 },
  ],
};
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
  if (S === 'OZNLAB_SENSOR_MENU')
    emitLines([
      '// action:prompt_begin OznLab Sensor',
      '// action:prompt_text Eddy sensor found on EBBCan. Frequency 3.42 MHz, drive current 15.',
      '// action:prompt_text What do you want to do?',
      '// action:prompt_button_group_start',
      '// action:prompt_button Calibrate drive current|LDC_CALIBRATE_DRIVE_CURRENT CHIP=oznlab|primary',
      '// action:prompt_button Map height|PROBE_EDDY_CURRENT_CALIBRATE CHIP=oznlab|primary',
      '// action:prompt_button_group_end',
      '// action:prompt_button Probe accuracy test|PROBE_ACCURACY|info',
      '// action:prompt_button Temperature compensation|TEMPERATURE_PROBE_CALIBRATE|warning',
      '// action:prompt_footer_button Close|RESPOND TYPE=command MSG=action:prompt_end|secondary',
      '// action:prompt_show',
    ]);
  else if (S.startsWith('RESPOND') && S.includes('PROMPT_END')) emitLines(['// action:prompt_end']);
  else if (S === 'PROBE_CALIBRATE')
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
  } else if (S === 'ACCEPT' || S === 'ABORT') pushStatus({ manual_probe: { is_active: false } });
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
function handle(m) {
  const p = m.params || {};
  switch (m.method) {
    case 'server.connection.identify':
      return { connection_id: 1 };
    case 'server.info':
      return {
        klippy_state: 'ready',
        moonraker_version: 'v0.9.3-41',
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
      return {
        MMU_GATE_MAP: 'Gate map',
        MMU_CHANGE_TOOL: 'Change tool',
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
        BED_MESH_CALIBRATE: 'Perform Mesh Bed Leveling',
        BED_MESH_PROFILE: 'Bed Mesh Persistent Storage management',
        SET_HEATER_TEMPERATURE: 'Sets a heater temperature',
        SET_FAN_SPEED: 'Sets the speed of a fan',
      };
    case 'printer.info':
      return { software_version: 'v0.13.0-300', hostname: 'voyager-demo' };
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
    case 'server.files.metadata':
      return { estimated_time: 7400, layer_height: 0.2, object_height: 42, thumbnails: [] };
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
        ],
      };
    case 'server.config':
      return { config: { spoolman: { server: 'http://127.0.0.1:7912' } } };
    case 'server.spoolman.get_spool_id':
      return { spool_id: 12 };
    case 'server.spoolman.proxy':
      return /^\/v1\/spool\?/.test(p.path || '') ? { response: SPOOLS } : { response: SPOOLS[0] };
    case 'server.files.list':
      return p.root === 'config'
        ? Object.keys(cfgText)
            .concat([
              'printer-20260923_121809.cfg',
              'ShakeTune_results/belts/belts_20260920_101000.png',
              'ShakeTune_results/input_shaper/IS_X_20260920_102000.png',
              'ShakeTune_results/input_shaper/IS_Y_20260920_102500.png',
            ])
            .map((f, i) => ({ path: f, modified: Date.now() / 1000 - i * 3600, size: 1000 }))
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
    case 'server.database.list':
      return { namespaces: ['moonraker', 'mainsail', 'voyager-ui', 'fluidd'] };
    default:
      throw { code: -32601, message: 'Method not found' };
  }
}
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
  GLEN = 0;
function tick() {
  tk++;
  const st = status;
  st.extruder.temperature = 249.6 + Math.random() * 0.8;
  st.extruder.power = 0.4 + Math.random() * 0.04;
  st.heater_bed.temperature = 110 + Math.random() * 0.3;
  st['heater_generic chamber'].temperature = 49.4 + Math.random() * 0.5;
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
    if (tk % 35 === 0 && ps.info.current_layer < ps.info.total_layer) ps.info.current_layer++;
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
  if (tk % 40 === 0) emitLines([`// layer ${ps.info.current_layer}/${ps.info.total_layer} done`]);
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
      pushStatus({
        mmu: {
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
    setTimeout(() => {
      try {
        const result = handle(m);
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
      const r = 30 + 10 * Math.sin(z / 5);
      g += `G1 X${150 + r} Y150 F3000\nG1 X${150 + r} Y${150 + r} E1\nG1 X150 Y${150 + r} E1\nG1 X150 Y150 E1\n`;
    }
  }
  return g;
}
let realFetch;
function fakeFetch(input, init) {
  const u = new URL(typeof input === 'string' ? input : input.url, location.href);
  const p = u.pathname.replace(/^.*?(?=\/(server|printer|machine|access|api|webcam)\b)/, '');
  const json = (o, code = 200) =>
    Promise.resolve(new Response(JSON.stringify(o), { status: code, headers: { 'content-type': 'application/json' } }));
  if (p === '/server/info') return json({ result: handle({ method: 'server.info' }) });
  if (p === '/access/info') return json({ result: { default_source: 'moonraker', available_sources: ['moonraker'] } });
  if (p === '/access/oneshot_token') return json({ result: 'demo' });
  if (p.startsWith('/server/files/upload')) {
    emitLines(['// demo: uploads are not stored']);
    return json({ result: {} });
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
    return Promise.resolve(new Response(gcodeFile(), { headers: { 'content-type': 'text/plain' } }));
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
  setInterval(tick, 1000);
  window.WebSocket = FakeSocket;
  window.fetch = fakeFetch;
  window.__demo = true;
  // <img> tags cannot go through fetch: serve the camera as a data URL by rewriting Moonraker image URLs
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    get() {
      return desc.get.call(this);
    },
    set(v) {
      if (typeof v === 'string' && /\/server\/files\/config\/.*\.png/.test(v))
        v = 'data:image/svg+xml;utf8,' + encodeURIComponent(graphSvg(decodeURIComponent(v.split('/').pop())));
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
