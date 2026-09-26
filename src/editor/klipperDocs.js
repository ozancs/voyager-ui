// Common Klipper config sections and their options, for autocomplete and doc links.
// Not the full reference; options the printer already uses are added at runtime.
const STEPPER =
  'step_pin dir_pin enable_pin microsteps rotation_distance full_steps_per_rotation gear_ratio step_pulse_duration endstop_pin position_min position_endstop position_max homing_speed homing_retract_dist homing_retract_speed second_homing_speed homing_positive_dir';
const HEATER =
  'heater_pin max_power sensor_type sensor_pin pullup_resistor smooth_time control pid_Kp pid_Ki pid_Kd max_delta pwm_cycle_time min_temp max_temp min_extrude_temp';
const FAN =
  'pin max_power shutdown_speed cycle_time hardware_pwm kick_start_time off_below tachometer_pin tachometer_ppr tachometer_poll_interval enable_pin';
const TMC =
  'uart_pin cs_pin spi_bus spi_speed spi_software_sclk_pin spi_software_mosi_pin spi_software_miso_pin tx_pin select_pins interpolate run_current hold_current home_current current_change_dwell_time sense_resistor stealthchop_threshold coolstep_threshold high_velocity_threshold driver_TBL driver_TOFF driver_HSTRT driver_HEND driver_SGTHRS driver_SGT diag_pin diag0_pin diag1_pin';
const SENSOR = 'sensor_type sensor_pin pullup_resistor min_temp max_temp gcode_id';
export const SECTIONS = {
  printer: 'kinematics max_velocity max_accel minimum_cruise_ratio square_corner_velocity max_z_velocity max_z_accel',
  mcu: 'serial canbus_uuid canbus_interface baud restart_method',
  stepper: STEPPER,
  extruder:
    STEPPER +
    ' ' +
    HEATER +
    ' nozzle_diameter filament_diameter max_extrude_cross_section instantaneous_corner_velocity max_extrude_only_distance max_extrude_only_velocity max_extrude_only_accel pressure_advance pressure_advance_smooth_time',
  heater_bed: HEATER,
  heater_generic: HEATER + ' gcode_id',
  verify_heater: 'max_error check_gain_time hysteresis heating_gain',
  fan: FAN,
  heater_fan: FAN + ' heater heater_temp fan_speed',
  controller_fan: FAN + ' fan_speed idle_timeout idle_speed heater stepper',
  fan_generic: FAN,
  temperature_fan:
    FAN +
    ' ' +
    SENSOR +
    ' target_temp control pid_Kp pid_Ki pid_Kd pid_deriv_time max_delta min_speed max_speed reverse',
  temperature_sensor: SENSOR,
  tmc2209: TMC,
  tmc2208: TMC,
  tmc2130: TMC,
  tmc2240: TMC + ' driver_CS rref',
  tmc5160: TMC + ' driver_CS',
  probe:
    'pin deactivate_on_each_sample x_offset y_offset z_offset speed samples sample_retract_dist lift_speed samples_result samples_tolerance samples_tolerance_retries activate_gcode deactivate_gcode',
  bltouch:
    'sensor_pin control_pin pin_move_time stow_on_each_sample probe_with_touch_mode pin_up_reports_not_triggered pin_up_touch_mode_reports_triggered x_offset y_offset z_offset speed samples',
  probe_eddy_current:
    'sensor_type i2c_address i2c_mcu i2c_bus x_offset y_offset z_offset speed lift_speed descend_z samples',
  safe_z_home: 'home_xy_position speed z_hop z_hop_speed move_to_previous',
  homing_override: 'axes set_position_x set_position_y set_position_z gcode',
  bed_mesh:
    'speed horizontal_move_z mesh_radius mesh_origin mesh_min mesh_max probe_count round_probe_count fade_start fade_end fade_target split_delta_z move_check_distance mesh_pps algorithm bicubic_tension zero_reference_position faulty_region_1_min faulty_region_1_max adaptive_margin scan_overshoot',
  z_tilt: 'z_positions points speed horizontal_move_z retries retry_tolerance',
  quad_gantry_level: 'gantry_corners points speed horizontal_move_z max_adjust retries retry_tolerance',
  screws_tilt_adjust:
    'screw1 screw1_name screw2 screw2_name screw3 screw3_name screw4 screw4_name speed horizontal_move_z screw_thread',
  bed_screws:
    'screw1 screw1_name screw1_fine_adjust screw2 screw3 screw4 probe_height probe_speed horizontal_move_z speed',
  input_shaper: 'shaper_freq_x shaper_freq_y shaper_type shaper_type_x shaper_type_y damping_ratio_x damping_ratio_y',
  resonance_tester:
    'probe_points accel_chip accel_chip_x accel_chip_y min_freq max_freq accel_per_hz hz_per_sec sweeping_accel sweeping_period',
  adxl345: 'cs_pin spi_bus spi_speed spi_software_sclk_pin spi_software_mosi_pin spi_software_miso_pin axes_map rate',
  lis2dw: 'cs_pin spi_bus i2c_address i2c_mcu i2c_bus axes_map rate',
  gcode_macro: 'gcode description rename_existing variable_',
  delayed_gcode: 'gcode initial_duration',
  idle_timeout: 'gcode timeout',
  virtual_sdcard: 'path on_error_gcode',
  pause_resume: 'recover_velocity',
  exclude_object: '',
  firmware_retraction: 'retract_length retract_speed unretract_extra_length unretract_speed',
  filament_switch_sensor: 'switch_pin pause_on_runout runout_gcode insert_gcode event_delay pause_delay',
  filament_motion_sensor:
    'switch_pin detection_length extruder pause_on_runout runout_gcode insert_gcode event_delay pause_delay',
  output_pin: 'pin pwm value shutdown_value cycle_time hardware_pwm scale maximum_mcu_duration',
  neopixel: 'pin chain_count color_order initial_RED initial_GREEN initial_BLUE initial_WHITE',
  led: 'red_pin green_pin blue_pin white_pin cycle_time hardware_pwm initial_RED initial_GREEN initial_BLUE initial_WHITE',
  save_variables: 'filename',
  respond: 'default_type default_prefix',
  gcode_arcs: 'resolution',
  skew_correction: '',
  force_move: 'enable_force_move',
  board_pins: 'mcu aliases',
  manual_stepper: STEPPER + ' velocity accel endstop_pin',
  display_status: '',
  include: '',
  duplicate_pin_override: 'pins',
  temperature_probe:
    SENSOR +
    ' speed horizontal_move_z resting_z calibration_position calibration_bed_temp calibration_extruder_temp extruder_heating_z',
  axis_twist_compensation: 'speed horizontal_move_z calibrate_start_x calibrate_end_x calibrate_y',
  z_thermal_adjust:
    'temp_coeff smooth_time z_adjust_off_above max_z_adjustment sensor_type sensor_pin min_temp max_temp gcode_id',
};
// [stepper_x] -> stepper, [tmc2209 stepper_x] -> tmc2209, [extruder1] -> extruder
export function sectionType(name) {
  const first = (name || '').trim().split(/\s+/)[0].toLowerCase();
  if (/^stepper_/.test(first)) return 'stepper';
  if (/^extruder\d*$/.test(first)) return 'extruder';
  return first;
}
export const docUrl = (name) =>
  'https://www.klipper3d.org/Config_Reference.html#' + encodeURIComponent(sectionType(name));
export function optionsFor(name) {
  return (SECTIONS[sectionType(name)] || '').split(/\s+/).filter(Boolean);
}
export const SECTION_NAMES = Object.keys(SECTIONS).concat([
  'stepper_x',
  'stepper_y',
  'stepper_z',
  'stepper_z1',
  'extruder1',
  'tmc2209 stepper_x',
  'gcode_macro NAME',
  'temperature_sensor NAME',
  'heater_fan hotend_fan',
  'controller_fan NAME',
  'mcu NAME',
]);
