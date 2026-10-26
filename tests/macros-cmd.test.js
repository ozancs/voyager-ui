import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/store', () => ({ S: () => ({}) }));
const { parseCmd, withArgs } = await import('../src/macros.js');
describe('macro command editing', () => {
  it('parses shell-like', () => {
    expect(parseCmd("SET_LED_TEXT TEXT='hello world' SPEED=2")).toEqual({
      word: 'SET_LED_TEXT',
      args: { TEXT: 'hello world', SPEED: '2' },
    });
    expect(parseCmd('A\nB').word).toBe('');
    expect(parseCmd('M X={{ 1 }}').word).toBe('');
  });
  it('changes one value and keeps the rest as written', () => {
    expect(withArgs("SET_LED_TEXT TEXT='hello world' SPEED=2", { SPEED: '5' })).toBe(
      "SET_LED_TEXT TEXT='hello world' SPEED=5",
    );
    expect(withArgs('MY MSG="\'abc\'" A=1', { A: '2' })).toBe('MY MSG="\'abc\'" A=2');
    expect(withArgs('MY A=1 ; B=2', { A: '3' })).toBe('MY A=3 ; B=2');
    expect(withArgs('MY A=1', { B: 'x y' })).toBe("MY A=1 B='x y'");
    expect(withArgs('MY A=1 B=2', { A: '' })).toBe('MY B=2');
    expect(withArgs('my_macro value=1', { VALUE: '9' })).toBe('my_macro value=9');
  });
});
const { isOn } = await import('../src/controls.js');
describe('switch state test', () => {
  it('compares', () => {
    expect(isOn(0.5)).toBe(true);
    expect(isOn(0)).toBe(false);
    expect(isOn(true, '= on')).toBe(true);
    expect(isOn('standby', '= standby')).toBe(true);
    expect(isOn(42, '>= 50')).toBe(false);
    expect(isOn(1, '!= 0')).toBe(true);
    expect(isOn(undefined)).toBe(false);
  });
});

const { pyLiteral, typedLiteral, setVarCommand } = await import('../src/macros.js');
describe('macro variables', () => {
  it('writes Klipper values back as Python literals', () => {
    expect(pyLiteral(10)).toBe('10');
    expect(pyLiteral('back')).toBe('"back"');
    expect(pyLiteral(true)).toBe('True');
    expect(pyLiteral(null)).toBe('None');
    expect(pyLiteral([1, 'a', false])).toBe('[1, "a", False]');
    expect(pyLiteral({ enable: false, layer: 0 })).toBe('{"enable": False, "layer": 0}');
  });
  it('reads what was typed by the type the variable has', () => {
    expect(typedLiteral('front left', 'back')).toEqual({ value: '"front left"' });
    expect(typedLiteral('"x"', 'back')).toEqual({ value: '"x"' });
    expect(typedLiteral('false', true)).toEqual({ value: 'False' });
    expect(typedLiteral('12.5', 10)).toEqual({ value: '12.5' });
    expect(typedLiteral('abc', 10).error).toBeTruthy();
    expect(typedLiteral('a;b', 'x').error).toBeTruthy();
  });
  it('quotes the value for the command line', () => {
    expect(setVarCommand('PARK', 'z_hop', '25')).toBe('SET_GCODE_VARIABLE MACRO=PARK VARIABLE=z_hop VALUE=25');
    expect(setVarCommand('PARK', 'at', '"it\'s ok"')).toBe(
      'SET_GCODE_VARIABLE MACRO=PARK VARIABLE=at VALUE="\\"it\'s ok\\""',
    );
    expect(setVarCommand('P', 'l', '[1, 2]')).toBe('SET_GCODE_VARIABLE MACRO=P VARIABLE=l VALUE="[1, 2]"');
  });
});
