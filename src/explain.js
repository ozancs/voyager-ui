// "What does this error mean": common Klipper errors in plain words, with what usually causes them and what to
// check. Used under the Klipper error banner and behind the ? on error lines in the console. The texts are
// general advice for the error as Klipper words it; they do not know the printer, so they say "usually".

const E = [
  {
    re: /Timer too close|Rescheduled timer in the past|Stepper too far in past|Missed scheduling of next/i,
    title: 'The host or a board could not keep up',
    cause:
      'Klipper sent a step or timer too late. Usually an overloaded Raspberry Pi (webcam streams, other programs), a slow SD card, a busy USB or CAN bus, or a board running at its limit.',
    fix: 'Look at host load and throttling on the Health page, lower webcam resolution or frame rate, and check the USB or CAN cable. If it happens at high speed, lower the microsteps.',
  },
  {
    re: /Lost communication with MCU|Serial connection closed|Timeout on connect|Unable to connect|Unable to open (serial|CAN)/i,
    title: 'A board stopped answering',
    cause:
      'Klipper lost the connection to one of the boards: a loose or noisy USB or CAN cable, a board that lost power or reset, or a wrong serial or canbus_uuid in the config.',
    fix: 'Check the cable and the board power, check that the serial path or canbus_uuid still matches, then do a Firmware Restart. The Health page shows link errors over time.',
  },
  {
    re: /ADC out of range/i,
    title: 'A temperature reading is impossible',
    cause:
      'A thermistor reads below min_temp or above max_temp. Usually a loose, broken or shorted thermistor wire, or the wrong sensor_type in the config.',
    fix: 'Look at the temperature graph: a jump to a very high or low value points at the wiring. Check the connector and sensor_type, then Firmware Restart.',
  },
  {
    re: /not heating at expected rate/i,
    title: 'A heater is not warming up as expected',
    cause:
      'verify_heater saw the temperature rise too slowly or fall while heating. Usually a thermistor that slipped out of the block, a loose heater wire, a fan blowing on the heater block or a missing silicone sock.',
    fix: 'Check that the thermistor sits in the block and the heater wires are tight. If the heater is simply slow, run PID tuning; raising the verify_heater limits is the last step.',
  },
  {
    re: /Thermocouple reader fault|MAX31865 RTD input is disconnected|max31865.*fault/i,
    title: 'The temperature amplifier reports a fault',
    cause: 'The thermocouple or PT100/PT1000 amplifier reports a broken or shorted probe, or a wrong wiring mode.',
    fix: 'Check the probe wires and the rtd_nominal_r, rtd_num_of_wires and sensor_type options.',
  },
  {
    re: /Move out of range/i,
    title: 'A move goes past the axis limits',
    cause:
      'The move would go below position_min or above position_max. Usually a print that is too big or placed off the bed, a wrong bed size in the slicer, or a macro moving too far.',
    fix: 'Check the part placement and bed size in the slicer, and position_min and position_max in the config.',
  },
  {
    re: /Must home axis first|must home/i,
    title: 'The printer is not homed',
    cause: 'Klipper does not know where the axes are, so it refuses to move them.',
    fix: 'Home all axes (G28) first. If homing was done before, the motors were probably turned off since.',
  },
  {
    re: /Extrude below minimum temp/i,
    title: 'The hotend is too cold to extrude',
    cause: 'Klipper blocks extrusion below min_extrude_temp to protect the extruder.',
    fix: 'Heat the hotend to printing temperature first.',
  },
  {
    re: /Extrude only move too long/i,
    title: 'Too much filament in one move',
    cause: 'A single extrude-only move is longer than max_extrude_only_distance. Usually a load or unload macro.',
    fix: 'Extrude in smaller steps, or raise max_extrude_only_distance in [extruder] if the macro is right.',
  },
  {
    re: /Move exceeds maximum extrusion/i,
    title: 'The file extrudes more than the limit',
    cause:
      'A move pushes more plastic than max_extrude_cross_section allows. Usually a wrong filament diameter or extrusion multiplier in the slicer, or relative and absolute extrusion mixed up.',
    fix: 'Check filament diameter, extrusion multiplier and relative extrusion (M83) in the slicer settings.',
  },
  {
    re: /Unknown command/i,
    title: 'Klipper does not know this command',
    cause:
      'The command or macro is not defined, or its name is spelled differently. A slicer start G-code often calls a macro the config does not have.',
    fix: 'Check the spelling, and that the macro exists in your config (Ctrl+K searches the config).',
  },
  {
    re: /Probe triggered prior to movement/i,
    title: 'The probe was already triggered',
    cause:
      'The probe reported a trigger before moving down: the nozzle or probe is already touching the bed, or the probe pin is inverted in the config.',
    fix: 'Raise Z, check that QUERY_PROBE says open, and check the ! or ^ on the probe pin.',
  },
  {
    re: /No trigger on probe after full movement/i,
    title: 'The probe never triggered',
    cause:
      'The probe went down the whole distance without a trigger: it is not reaching the bed, is disconnected, or the pin is wrong.',
    fix: 'Check QUERY_PROBE with the probe touched and untouched, the wiring, and that the bed is within reach.',
  },
  {
    re: /Probe samples exceed (samples_)?tolerance/i,
    title: 'Probe readings do not agree',
    cause:
      'Repeated probes of the same point differ more than samples_tolerance. Usually a dirty nozzle, a loose probe mount or play in the toolhead.',
    fix: 'Clean the nozzle and probe, check the mount and run PROBE_ACCURACY. Raise samples_tolerance_retries if it happens rarely.',
  },
  {
    re: /Endstop \w+ still triggered after retract/i,
    title: 'An endstop stays triggered',
    cause: 'After backing off, the endstop still reports pressed: a stuck switch, a broken wire or an inverted pin.',
    fix: 'Check QUERY_ENDSTOPS with the switch pressed and released, and the ! or ^ on endstop_pin.',
  },
  {
    re: /TMC '?[\w ]+'? reports error|Unable to read tmc|Unable to write tmc/i,
    title: 'A stepper driver reports a problem',
    cause:
      'The TMC driver did not answer or reports a fault: loose or missing UART or SPI wiring, no motor power, or a real driver fault (over temperature, short).',
    fix: 'Check that the motor power supply is on, the driver jumpers and uart_pin, and the motor cable. The Health page lists driver flags.',
  },
  {
    re: /is not a valid config section|is not valid in section|Unable to parse option|must be specified|Option '.*' in section/i,
    title: 'There is an error in the config',
    cause: 'A section or option name is wrong, a value cannot be read, or a required option is missing.',
    fix: 'The message names the section and option. Open it from Ctrl+K, fix it, save and restart.',
  },
  {
    re: /pin .* used multiple times|Unknown pin|Invalid pin|is not a valid pin name/i,
    title: 'A pin name is wrong or used twice',
    cause: 'Two config sections use the same pin, or the pin name does not exist on that board.',
    fix: 'Check the pin against the board pinout, and search the config for the pin name (Ctrl+K).',
  },
  {
    re: /Command format mismatch|MCU Protocol error|mcu '.*': Unable to .* protocol|is out of date/i,
    title: 'Board firmware and Klipper do not match',
    cause: 'The firmware on a board was built from a different Klipper version than the one running on the host.',
    fix: 'Rebuild and flash the firmware of that board with the Klipper version that runs on the host.',
  },
  {
    re: /Shutdown due to webhooks request|Emergency stop/i,
    title: 'Emergency stop',
    cause: 'Somebody or something pressed the emergency stop (M112).',
    fix: 'Check the printer, then Firmware Restart.',
  },
  {
    re: /Retries exceeds max|Too many retries/i,
    title: 'Leveling did not converge',
    cause:
      'Z tilt or quad gantry level did not get within retry_tolerance after all retries. Usually a probe that is not repeatable, or a gantry that binds.',
    fix: 'Run PROBE_ACCURACY, check that the gantry moves freely, or raise retries or retry_tolerance a little.',
  },
  {
    re: /Internal error on command|Unhandled exception/i,
    title: 'Klipper hit an internal error',
    cause: 'A Python error inside Klipper or a plugin, often from a plugin that does not match the Klipper version.',
    fix: 'The details are in klippy.log (the Machine page can download it). Update or remove the plugin named there.',
  },
];

// { title, cause, fix } in English (ExplainBox translates them), or null when the message is not known
export function explain(msg) {
  const e = E.find((x) => x.re.test(String(msg || '')));
  return e ? { title: e.title, cause: e.cause, fix: e.fix } : null;
}
export const EXPLAIN_TEXTS = E.flatMap((e) => [e.title, e.cause, e.fix]);
