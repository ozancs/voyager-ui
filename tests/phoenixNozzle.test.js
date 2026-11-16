import { describe, it, expect } from 'vitest';
import { recoveryNozzle } from '../src/phoenixNozzle.js';

describe('Phoenix saved-temperature recovery', () => {
  it('does not guess a temperature for older modules or invalid records', () => {
    for (const target of [undefined, null, 0, -1, NaN, Infinity, '240']) {
      expect(recoveryNozzle(target, { target: 240, temperature: 240, can_extrude: true }).target).toBeNull();
    }
    expect(recoveryNozzle(320, {}, 300).target).toBeNull();
  });
  it('keeps cold priming locked even when Klipper permits low-temperature extrusion', () => {
    expect(recoveryNozzle(240, { temperature: 180, target: 240, can_extrude: true })).toMatchObject({
      ready: false,
      heating: true,
    });
    expect(recoveryNozzle(240, { temperature: 240, target: 240, can_extrude: false }).ready).toBe(false);
  });
  it('uses existing heat across steps and reconnects without resetting the target', () => {
    const heater = { temperature: 240, target: 240, can_extrude: true };
    expect(recoveryNozzle(240, heater)).toMatchObject({ ready: true, heating: false, holding: true });
    expect(recoveryNozzle(260, heater)).toMatchObject({ target: 260, ready: false, holding: false });
    expect(heater.target).toBe(240);
  });
  it('requires a real live temperature and permits already-hot priming', () => {
    expect(recoveryNozzle(240, { target: 240, can_extrude: true }).ready).toBe(false);
    expect(recoveryNozzle(240, { temperature: 240, target: 0, can_extrude: true })).toMatchObject({
      ready: true,
      holding: false,
    });
  });
});
