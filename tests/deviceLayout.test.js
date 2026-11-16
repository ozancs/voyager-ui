import { describe, it, expect } from 'vitest';
import { pickLayout, withOwnLayout, toStored } from '../src/deviceLayout';

const KEYS = ['layout', 'layoutWidths', 'hiddenCards'];
const DEF = { layout: null, layoutWidths: null, hiddenCards: [] };
const shared = { layout: [{ i: 'temps', x: 0, w: 6 }], layoutWidths: { idle: 1900 }, hiddenCards: ['macros'] };
const tablet = { layout: [{ i: 'temps', x: 0, w: 12 }], layoutWidths: { idle: 1000 }, hiddenCards: [] };
const dev = { id: 'tab1', name: 'Tablet' };

describe('own dashboard layout on a device', () => {
  it('shows the shared layout without an own one', () => {
    const merged = { ...shared, lang: 'en' };
    expect(withOwnLayout(merged, merged, null, KEYS, DEF)).toEqual({ ...shared, lang: 'en' });
    expect(withOwnLayout({ ...shared }, { ...shared }, 'tab1', KEYS, DEF)).toEqual(shared);
  });

  it("shows the device's own layout and keeps the other settings", () => {
    const stored = { ...shared, lang: 'de', deviceLayouts: { tab1: { name: 'Tablet', data: tablet } } };
    const shown = withOwnLayout({ ...stored }, stored, 'tab1', KEYS, DEF);
    expect(pickLayout(shown, KEYS)).toEqual(tablet);
    expect(shown.lang).toBe('de');
  });

  it('stores the shared layout unchanged and the device layout under its id', () => {
    const shown = { ...tablet, lang: 'fr' };
    const v = toStored(shown, shared, dev, KEYS, 123);
    expect(pickLayout(v, KEYS)).toEqual(shared);
    expect(v.deviceLayouts.tab1).toEqual({ name: 'Tablet', t: 123, data: tablet });
    expect(v.lang).toBe('fr');
    expect(shown.layout[0].w).toBe(12); // the shown settings are not modified
  });

  it("keeps other devices' layouts", () => {
    const other = { name: 'Phone', t: 1, data: { ...shared, hiddenCards: ['webcam'] } };
    const v = toStored({ ...tablet, deviceLayouts: { ph: other } }, shared, dev, KEYS, 5);
    expect(v.deviceLayouts.ph).toEqual(other);
    expect(v.deviceLayouts.tab1.data).toEqual(tablet);
  });

  it('stores what is shown when the device uses the shared layout', () => {
    expect(toStored({ ...tablet }, shared, null, KEYS)).toEqual(tablet);
    expect(toStored({ ...tablet }, null, dev, KEYS)).toEqual(tablet); // shared layout not known yet: unchanged
  });

  it('round-trips: stored -> shown -> stored keeps both layouts', () => {
    const stored = { ...shared, deviceLayouts: { tab1: { name: 'Tablet', t: 1, data: tablet } } };
    const shown = withOwnLayout(JSON.parse(JSON.stringify(stored)), stored, 'tab1', KEYS, DEF);
    const back = toStored(shown, pickLayout(stored, KEYS), dev, KEYS, 1);
    expect(back).toEqual(stored);
  });
});
