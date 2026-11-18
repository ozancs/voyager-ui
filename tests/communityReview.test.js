import { describe, it, expect } from 'vitest';
import { readDeviceLayouts, writeDeviceLayout, LAYOUT_NAMESPACE } from '../src/deviceLayoutStorage';
import { groupTemperatures } from '../src/temperatureGroups';

describe('independent browser layout persistence', () => {
  it('two browsers saving stale settings cannot overwrite each other’s layouts', async () => {
    const db = {};
    const api = {
      call: async (method, p) => {
        if (method.endsWith('post_item')) {
          (db[p.namespace] ||= {})[p.key] = structuredClone(p.value);
          return { value: p.value };
        }
        return { value: structuredClone(db[p.namespace] || {}) };
      },
    };
    const desktop = { data: { layout: ['temps', 'toolhead'] } };
    const tablet = { data: { layout: ['toolhead', 'temps'] } };
    await Promise.all([writeDeviceLayout(api, 'desktop', desktop), writeDeviceLayout(api, 'tablet', tablet)]);
    await api.call('server.database.post_item', {
      namespace: 'voyager-ui',
      key: 'settings',
      value: { layout: ['old'] },
    });
    expect(await readDeviceLayouts(api)).toEqual({ desktop, tablet });
    expect(Object.keys(db[LAYOUT_NAMESPACE])).toHaveLength(2);
  });
  it('treats first use as empty but propagates connection errors', async () => {
    expect(
      await readDeviceLayouts({
        call: async () => {
          throw { code: 404 };
        },
      }),
    ).toEqual({});
    await expect(
      readDeviceLayouts({
        call: async () => {
          throw new Error('disconnected');
        },
      }),
    ).rejects.toThrow('disconnected');
  });
});

describe('compact temperature groups', () => {
  it('keeps the same group heading in both the heater and sensor sections', () => {
    const groups = { bed: 'Chamber', sensor: 'Chamber', extruder: 'Toolhead' };
    const list = [{ name: 'bed', heater: true }, { name: 'sensor' }, { name: 'extruder', heater: true }];
    expect(
      groupTemperatures(
        list.filter((s) => s.heater),
        groups,
      ).map((s) => s.head),
    ).toEqual(['Chamber', 'Toolhead']);
    expect(
      groupTemperatures(
        list.filter((s) => !s.heater),
        groups,
      )[0].head,
    ).toBe('Chamber');
  });
});
