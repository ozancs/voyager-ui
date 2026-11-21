import { it, expect, vi } from 'vitest';
import { compactStoredHistories } from '../src/deviceLayout';
import {
  applyDeviceLayouts,
  previousDeviceLayouts,
  readStoredSettings,
  LAYOUT_NAMESPACE,
} from '../src/deviceLayoutStorage';

it('keeps five usable historical layouts per device and drops their nested backup trees', () => {
  const a = { layout: ['console'], layoutBackups: [{ data: { layout: ['nested'] } }] };
  const history = Array.from({ length: 6 }, (_, t) => ({ t, label: 'before', data: a }));
  const layout = { layout: ['temps'], layoutBackups: history };
  const record = compactStoredHistories({ ...layout, deviceLayouts: { desk: { data: layout } } });
  for (const value of [record, record.deviceLayouts.desk.data]) {
    expect(value.layoutBackups).toHaveLength(5);
    expect(value.layoutBackups[0]).toEqual({ t: 0, label: 'before', data: { layout: ['console'] } });
  }
  expect(history[0].data.layoutBackups).toHaveLength(1);
});

it('propagates failed shared/legacy reads instead of treating them as an empty install', async () => {
  const failure = Object.assign(new Error('database file not found'), { code: 500 });
  const api = { call: vi.fn().mockRejectedValue(failure) };
  const cached = vi.fn();
  await expect(readStoredSettings(api, 'ui', ['old'], cached)).rejects.toBe(failure);
  api.call.mockRejectedValueOnce({ code: 404 });
  await expect(readStoredSettings(api, 'ui', ['old'], cached)).rejects.toBe(failure);
  expect(cached).not.toHaveBeenCalled();
  expect(api.call.mock.calls.every(([method]) => method.endsWith('get_item'))).toBe(true);
});

it('uses the browser cache to seed a genuinely empty database and propagates a failed layout read', async () => {
  const cached = () => ({ favorites: ['Lights'], lang: 'tr' });
  const api = { call: vi.fn().mockRejectedValue({ code: 404 }) };
  expect(await readStoredSettings(api, 'ui', ['old'], cached)).toMatchObject({ favorites: ['Lights'], lang: 'tr' });
  api.call
    .mockResolvedValueOnce({ value: { lang: 'en', migratedCarbon: true } })
    .mockRejectedValueOnce(new Error('down'));
  await expect(readStoredSettings(api, 'ui', ['old'], cached)).rejects.toThrow('down');
});

it('undo restores only touched device records, including removal of an imported new device', async () => {
  const db = { tablet: { data: { layout: ['console'] } }, phone: { data: { layout: ['temps'] } } };
  const api = {
    call: async (method, { namespace, key, value }) => {
      expect(namespace).toBe(LAYOUT_NAMESPACE);
      if (method.endsWith('get_item')) return { value: structuredClone(db) };
      if (method.endsWith('delete_item')) delete db[key];
      else db[key] = value;
    },
  };
  const changes = { tablet: { data: { layout: ['webcam'] } }, desk: { data: { layout: ['mmu'] } } };
  const before = await previousDeviceLayouts(api, changes);
  await applyDeviceLayouts(api, changes);
  db.phone.data.layout = ['toolhead'];
  await applyDeviceLayouts(api, before);
  expect(db).toEqual({ tablet: { data: { layout: ['console'] } }, phone: { data: { layout: ['toolhead'] } } });
});
