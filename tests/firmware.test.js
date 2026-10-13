import { describe, it, expect } from 'vitest';
import { cmpVer, linkOf, flashSteps } from '../src/firmware.js';

describe('mcu firmware check', () => {
  it('compares Klipper versions by tag, then commits', () => {
    expect(cmpVer('v0.13.0-280-g373f200c', 'v0.13.0-300')).toBeLessThan(0);
    expect(cmpVer('v0.13.0-300-gdb88a336-dirty', 'v0.13.0-300')).toBe(0);
    expect(cmpVer('v0.12.0-450-gabc', 'v0.13.0-2')).toBeLessThan(0);
    expect(cmpVer('v0.13.0', 'v0.13.0-5-gaa')).toBeLessThan(0);
    expect(cmpVer('?', 'v0.13.0')).toBe(null);
  });
  it('knows how a board is connected', () => {
    expect(linkOf({ canbus_uuid: 'abc' })).toEqual({ kind: 'can', uuid: 'abc', iface: 'can0' });
    expect(linkOf({ serial: '/tmp/klipper_host_mcu' }).kind).toBe('host');
    expect(linkOf({ serial: '/dev/serial/by-id/x' })).toEqual({ kind: 'serial', path: '/dev/serial/by-id/x' });
  });
  it('fills the board into the flash command', () => {
    const can = flashSteps({ kind: 'can', uuid: '0e5f', iface: 'can0' }, 'stm32g0b1xx');
    expect(can.map((s) => s.cmd)).toContain(
      'python3 ~/katapult/scripts/flashtool.py -i can0 -u 0e5f -f ~/klipper/out/klipper.bin',
    );
    expect(can[0].cmd).toBe('sudo service klipper stop');
    expect(can[can.length - 1].cmd).toBe('sudo service klipper start');
    const usb = flashSteps({ kind: 'serial', path: '/dev/serial/by-id/usb-Klipper' });
    expect(usb.map((s) => s.cmd)).toContain('make flash FLASH_DEVICE=/dev/serial/by-id/usb-Klipper');
  });
});
