// "Ask when clicked" on a command over several lines: only the macro lines with parameters are asked
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/store', () => ({
  S: () => ({
    config: {
      'gcode_macro _NOZZLE_COOL_WAIT': { gcode: '{% set max = params.MAX|default(60)|float %}' },
      'gcode_macro chamber': { gcode: 'SET_HEATER_TEMPERATURE HEATER=chamber TARGET={params.TEMP}' },
    },
  }),
}));
const { askLines, withLineArgs } = await import('../src/macros.js');

describe('askLines', () => {
  it('finds the macro line of a command over several lines', () => {
    expect(askLines('M104 S0\n_NOZZLE_COOL_WAIT MAX=60')).toEqual([
      { i: 1, word: '_NOZZLE_COOL_WAIT', params: [{ name: 'MAX', def: '60' }], args: { MAX: '60' } },
    ]);
  });
  it('reads a one-line command as before, and skips lines without parameters', () => {
    expect(askLines('CHAMBER TEMP=50').map((g) => [g.i, g.word, g.args])).toEqual([[0, 'CHAMBER', { TEMP: '50' }]]);
    expect(askLines('G28\nM104 S0')).toEqual([]);
  });
});
describe('withLineArgs', () => {
  it('changes only that line', () => {
    expect(withLineArgs('M104 S0\n_NOZZLE_COOL_WAIT MAX=60', 1, { MAX: '150' })).toBe(
      'M104 S0\n_NOZZLE_COOL_WAIT MAX=150',
    );
  });
});
