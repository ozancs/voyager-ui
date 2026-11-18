import { describe, it, expect } from 'vitest';
import { pickLayout, withOwnLayout, toStored, fitToDevice } from '../src/deviceLayout';

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

describe('fitting a copied layout to the device', () => {
  it("forgets the other browser's width while the layout is still the shared copy", () => {
    const shown = JSON.parse(JSON.stringify(shared));
    expect(fitToDevice(shown, shared).layoutWidths).toBeNull();
    expect(shown.layout).toEqual(shared.layout);
  });

  it("keeps the width once the device's layout was arranged on the device", () => {
    const shown = JSON.parse(JSON.stringify(tablet));
    expect(fitToDevice(shown, shared).layoutWidths).toEqual({ idle: 1000 });
  });
});

// settings backup: made on a device with its own layout, it holds the shared layout at the top and the device's
// own under deviceLayouts; restoring the dashboard part brings both back
import { restoreParts, partOf } from '../src/settingsParts.js';
describe('settings backup with a device layout', () => {
  it('stores the shared layout and the device one, and the dashboard part restores both', () => {
    const shared = { layout: ['pc'] };
    const tablet = { layout: ['tab'] };
    const file = toStored({ ...tablet, lang: 'en' }, shared, { id: 'tab1', name: 'Tablet' }, ['layout'], 7);
    expect(file.layout).toEqual(['pc']);
    expect(file.deviceLayouts.tab1.data).toEqual(tablet);
    expect(partOf('deviceLayouts')).toBe('dash');
    const back = restoreParts({ layout: ['x'], deviceLayouts: {} }, file, ['dash'], {});
    expect(back.layout).toEqual(['pc']);
    expect(back.deviceLayouts.tab1.data).toEqual(tablet);
  });
});
