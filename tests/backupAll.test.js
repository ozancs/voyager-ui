// One backup file for all printers (backupAll.js)
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('location', { protocol: 'http:', host: '192.168.0.208:1977', hostname: '192.168.0.208' });
});
vi.mock('../src/store', () => ({ APP: 'voyager-ui' }));

const list = [
  { id: '', name: '', host: '' },
  { id: 'a', name: 'VC4', host: '192.168.0.243:1977' },
  { id: 'b', name: 'Salad Fork', host: '192.168.0.208:1977' },
];

describe('backupAll', () => {
  it('lists every printer once, the page itself first', async () => {
    const { printersToBackUp } = await import('../src/backupAll.js');
    expect(printersToBackUp(list, '192.168.0.208:1977')).toEqual([
      { host: '192.168.0.208:1977', name: '', own: true },
      { host: '192.168.0.243:1977', name: 'VC4', own: false },
    ]);
  });
  it('reads each printer and writes each part back where it came from', async () => {
    const { readPrinter, writePrinter, matchPrinters, isAllPrinters } = await import('../src/backupAll.js');
    const db = {
      'voyager-ui': { settings: { lang: 'en', layout: ['pc'] } },
      'voyager-ui-layouts': { tab1: { name: 'Tablet', data: { layout: ['tab'] } } },
    };
    const call = async (m, p) => {
      if (m === 'server.database.get_item') {
        const ns = db[p.namespace];
        if (!ns || (p.key && !(p.key in ns))) throw Object.assign(new Error('not found'), { code: 404 });
        return { value: p.key ? ns[p.key] : ns };
      }
      (db[p.namespace] ||= {})[p.key] = p.value;
      return {};
    };
    const part = await readPrinter(call);
    expect(part.settings.layout).toEqual(['pc']);
    expect(part.layouts.tab1.data.layout).toEqual(['tab']);

    db['voyager-ui'].settings = { lang: 'de' };
    db['voyager-ui-layouts'] = {};
    await writePrinter(call, part);
    expect(db['voyager-ui'].settings.layout).toEqual(['pc']);
    expect(db['voyager-ui'].settings_prev.settings).toEqual({ lang: 'de' });
    expect(db['voyager-ui-layouts'].tab1.data.layout).toEqual(['tab']);

    const file = {
      printers: [
        { host: '192.168.0.208:1977', settings: {} },
        { host: '192.168.0.243:1977', settings: {} },
        { host: '10.0.0.9', settings: {} },
      ],
    };
    expect(isAllPrinters(file)).toBe(true);
    expect(isAllPrinters({ settings: {} })).toBe(false);
    expect(matchPrinters(file, list, '192.168.0.208:1977')).toEqual(['', '192.168.0.243:1977', null]);
  });
});
