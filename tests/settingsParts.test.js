import { describe, it, expect } from 'vitest';
import { restoreParts, partsIn, partOf } from '../src/settingsParts.js';

const def = {
  layout: null,
  hiddenCards: [],
  presets: [],
  theme: 'dark',
  printerName: '',
  setupDone: false,
  favorites: [],
};
const cur = {
  ...def,
  layout: [{ i: 'temps' }],
  presets: ['mine'],
  theme: 'light',
  printerName: 'B',
  setupDone: true,
  favorites: ['f'],
};
const file = {
  layout: [{ i: 'console' }],
  hiddenCards: ['temps'],
  presets: ['theirs'],
  theme: 'dark',
  printerName: 'A',
  setupDone: false,
  sync: 1,
};

describe('selective restore', () => {
  it('only the cards: the layout and hidden cards come over, the rest stays', () => {
    const r = restoreParts(cur, file, ['dash'], def);
    expect(r.layout).toEqual([{ i: 'console' }]);
    expect(r.hiddenCards).toEqual(['temps']);
    expect(r.presets).toEqual(['mine']);
    expect(r.theme).toBe('light');
    expect(r.printerName).toBe('B');
  });
  it('a picked part the file has nothing for goes to the default', () => {
    expect(restoreParts(cur, file, ['fav'], def).favorites).toEqual([]);
  });
  it('setup state is never taken from the file', () => {
    expect(restoreParts(cur, file, ['dash', 'other', 'printer'], def).setupDone).toBe(true);
  });
  it('lists the parts a file has, unknown keys under other', () => {
    expect(partsIn(file).map((p) => p.id)).toEqual(['dash', 'presets', 'look', 'printer', 'other']);
    expect(partOf('somethingNew')).toBe('other');
  });
});
