import { describe, it, expect } from 'vitest';
import { sectionType, optionsFor, docUrl } from '../src/editor/klipperDocs.js';

describe('config reference', () => {
  it('maps section names to their type', () => {
    expect(sectionType('stepper_z1')).toBe('stepper');
    expect(sectionType('extruder1')).toBe('extruder');
    expect(sectionType('tmc2209 stepper_x')).toBe('tmc2209');
    expect(sectionType('gcode_macro PRINT_START')).toBe('gcode_macro');
  });
  it('knows common options', () => {
    expect(optionsFor('stepper_x')).toContain('rotation_distance');
    expect(optionsFor('printer')).toContain('max_accel');
  });
  it('links to the Klipper docs', () => {
    expect(docUrl('heater_fan hotend_fan')).toBe('https://www.klipper3d.org/Config_Reference.html#heater_fan');
  });
});
