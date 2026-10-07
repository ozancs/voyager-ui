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
