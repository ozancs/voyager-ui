import { it, expect } from 'vitest';
import { soundStylesFor, resolveSoundStyle, soundNotes } from '../src/soundStyles';
it('keeps notification, attention and error choices separate', () => {
  const groups = ['complete', 'paused', 'error'].map((k) => soundStylesFor(k).map((s) => s.id));
  expect(new Set(groups.flat()).size).toBe(groups.flat().length);
  expect(resolveSoundStyle('error', 'soft')).toBe('urgent');
  expect(resolveSoundStyle('paused', 'chime')).toBe('attention');
  expect(resolveSoundStyle('complete', 'urgent')).toBe('chime');
  expect(soundNotes('error', 'soft')).toEqual(soundNotes('error', 'urgent'));
});
it('offers distinct, bounded sounds in each category', () => {
  for (const kind of ['complete', 'error', 'paused', 'heated', 'partReady']) {
    const signatures = new Set();
    for (const style of soundStylesFor(kind)) {
      const notes = soundNotes(kind, style.id);
      signatures.add(JSON.stringify(notes.map(({ gain, ...pattern }) => pattern)));
      for (const n of notes) {
        expect(n.hz).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(1);
        expect(n.length).toBeGreaterThan(0.015);
        expect(n.at).toBeGreaterThanOrEqual(0);
      }
    }
    expect(signatures.size).toBe(soundStylesFor(kind).length);
  }
});
