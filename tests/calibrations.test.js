import { describe, it, expect } from 'vitest';
import { availableGroups, buildCommand, missingParams, parseResult, GROUPS } from '../src/calibrations.js';

describe('calibrations', () => {
  it('shows only the tabs the printer has', () => {
    const g = availableGroups({ PID_CALIBRATE: '', _AXES_SHAPER_CALIBRATION: '', FLOW_CALIBRATION: 'macro', G28: '' });
    expect(g.map((x) => x.key)).toEqual(['shaketune', 'heaters', 'other']);
    expect(g[2].items.map((i) => i.cmd)).toEqual(['FLOW_CALIBRATION']);
  });
  it('builds a command from single-word values only', () => {
    const pid = GROUPS.find((g) => g.key === 'heaters').items[0];
    expect(buildCommand(pid, { HEATER: 'extruder', TARGET: '210' })).toBe('PID_CALIBRATE HEATER=extruder TARGET=210');
    expect(buildCommand(pid, { HEATER: 'extruder; G28', TARGET: '' })).toBe('PID_CALIBRATE');
    expect(missingParams(pid, { HEATER: 'extruder' })).toEqual(['TARGET']);
  });
  it('reads results from Klipper output', () => {
    const r = parseResult('SHAPER_CALIBRATE', [
      "To avoid too much smoothing with 'mzv', suggested max_accel <= 8300 mm/sec^2",
      'Recommended shaper_type_x = mzv, shaper_freq_x = 53.8 Hz',
    ]);
    expect(r.shapers).toEqual([{ axis: 'x', type: 'mzv', freq: 53.8, maxAccel: 8300 }]);
    expect(parseResult('PID_CALIBRATE', ['PID parameters: pid_Kp=22.865 pid_Ki=1.292 pid_Kd=101.178']).rows).toEqual([
      ['pid_Kp', '22.865'],
      ['pid_Ki', '1.292'],
      ['pid_Kd', '101.178'],
    ]);
    const pa = parseResult('PROBE_ACCURACY', [
      'probe accuracy results: maximum 2.485000, minimum 2.479000, range 0.006000, average 2.482200, median 2.482500, standard deviation 0.001720',
    ]).rows;
    expect(pa).toContainEqual(['standard deviation', '0.001720']);
    const q = parseResult('QUAD_GANTRY_LEVEL', [
      'Retries: 0/5 Probed points range: 0.214000 tolerance: 0.007500',
      'Retries: 1/5 Probed points range: 0.004000 tolerance: 0.007500',
    ]).rows;
    expect(q).toEqual([
      ['Retries', '1/5'],
      ['range', '0.004000'],
      ['tolerance', '0.007500'],
    ]);
  });
});
