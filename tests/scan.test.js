// Scan network (fleet.js): finds Moonraker on the printer's /24, skips known and own addresses, keeps login ones
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.stubGlobal('location', { protocol: 'http:', host: 'page' });
  vi.stubGlobal('fetch', async (url, o) => {
    if (url === 'http://192.168.1.42/server/info')
      return { ok: true, status: 200, json: async () => ({ result: { klippy_state: 'ready' } }) };
    if (url === 'http://192.168.1.42/printer/info')
      return { ok: true, status: 200, json: async () => ({ result: { hostname: 'rxvoron' } }) };
    if (url === 'http://192.168.1.77/server/info') return { ok: false, status: 401, json: async () => ({}) };
    if (url === 'http://192.168.1.80/server/info')
      return { ok: true, status: 200, json: async () => ({ result: { klippy_state: 'ready' } }) };
    if (url === 'http://192.168.1.99/server/info') return { ok: true, status: 200, json: async () => ({ hello: 1 }) };
    throw new Error('nothing there');
  });
});

describe('scanNetwork', () => {
  it('finds the printers that answer', async () => {
    const { scanNetwork } = await import('../src/fleet.js');
    let last = '';
    const r = await scanNetwork(['192.168.1.50'], {
      skip: ['192.168.1.80'],
      onProgress: (d, t) => (last = d + '/' + t),
    });
    expect(r).toEqual([
      { host: '192.168.1.42', name: 'rxvoron', login: false },
      { host: '192.168.1.77', name: '192.168.1.77', login: true },
    ]);
    expect(last).toBe('253/253'); // 254 addresses less its own
  });
});
