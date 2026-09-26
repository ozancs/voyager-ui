import { describe, it, expect } from 'vitest';
import { checkPrint, sameMaterial, gramsFor } from '../src/preprintCheck.js';
import { holdFindings, heatFinding } from '../src/heaterHealth.js';
import { explain } from '../src/explain.js';

const spool = { id: 12, remaining_weight: 300, filament: { material: 'ABS', density: 1.04, diameter: 1.75 } };
const settings = { extruder: { nozzle_diameter: 0.4, max_temp: 300 }, heater_bed: { max_temp: 120 } };
const toolhead = { axis_maximum: [300, 300, 250, 0] };

describe('pre-print check', () => {
  it('says nothing when it knows nothing', () => {
    expect(checkPrint({ meta: {}, spool: null, settings: {}, toolhead: {}, sensors: [] })).toEqual([]);
  });
  it('without Spoolman only compares the printer', () => {
    const r = checkPrint({
      meta: { filament_type: 'PETG', filament_weight_total: 900 },
      spool: null,
      settings,
      toolhead,
    });
    expect(r).toEqual([]);
  });
  it('finds material, weight, nozzle, temperature and height problems', () => {
    const r = checkPrint({
      meta: {
        filament_type: 'PETG',
        filament_weight_total: 500,
        nozzle_diameter: 0.6,
        first_layer_extr_temp: 320,
        object_height: 260,
      },
      spool,
      settings,
      toolhead,
    });
    expect(r.length).toBe(5);
    expect(r.filter((x) => x.level === 'error').length).toBe(2);
  });
  it('matches similar materials and skips multi-material files', () => {
    expect(sameMaterial('PLA', 'PLA+')).toBe(true);
    expect(sameMaterial('ABS', 'ASA')).toBe(false);
    const r = checkPrint({ meta: { filament_type: 'PLA;PETG' }, spool, settings, toolhead });
    expect(r).toEqual([]);
  });
  it('works out grams from length when the slicer gives no weight', () => {
    expect(Math.round(gramsFor(1000, 1.75, 1.24))).toBe(3);
    const r = checkPrint({ meta: { filament_type: 'ABS', filament_total: 150000 }, spool, settings, toolhead });
    expect(r.length).toBe(1);
  });
  it('filament sensors: empty is a warning, skipped with an MMU', () => {
    const sensors = [{ name: 'runout', enabled: true, detected: false }];
    expect(checkPrint({ meta: {}, sensors }).length).toBe(1);
    expect(checkPrint({ meta: {}, sensors, multiMaterial: true }).length).toBe(0);
  });
});

describe('heater health', () => {
  it('compares power only at the same fan speed', () => {
    const base = { power: 0.3, fan: 0.6, t: 1 };
    expect(holdFindings(base, { power: 0.45, fan: 0.6, std: 0.2 }).map((f) => f.kind)).toEqual(['power']);
    expect(holdFindings(base, { power: 0.45, fan: 1, std: 0.2 })).toEqual([]);
    expect(holdFindings(base, { power: 0.33, fan: 0.6, std: 1.4 }).map((f) => f.kind)).toEqual(['swing']);
  });
  it('compares heat-up only from a similar start', () => {
    const base = { heat: 200, from: 22, t: 1 };
    expect(heatFinding(base, 300, 24)?.kind).toBe('heat');
    expect(heatFinding(base, 300, 40)).toBe(null);
    expect(heatFinding(base, 210, 22)).toBe(null);
  });
});

describe('explain', () => {
  it('knows common Klipper errors', () => {
    expect(explain("MCU 'mcu' shutdown: Timer too close")).toBeTruthy();
    expect(explain('!! Move out of range: 999.000 177.000 16.800 [0.000]').title).toBeTruthy();
    expect(explain('something else')).toBe(null);
  });
});
