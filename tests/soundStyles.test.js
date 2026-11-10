import { it, expect } from 'vitest';
import { SOUND_STYLES, soundNotes } from '../src/soundStyles';
it('provides five ordered styles with finite, bounded envelopes for every event', () => {
  expect(SOUND_STYLES).toHaveLength(5);
  for (const kind of ['complete', 'error', 'paused', 'heated', 'partReady']) {
    let previous = 0;
    for (const style of SOUND_STYLES) {
      const notes = soundNotes(kind, style.id);
      expect(notes.length).toBeGreaterThanOrEqual(previous);
      previous = notes.length;
      for (const n of notes) {
        expect(n.hz).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(1);
        expect(n.length).toBeGreaterThan(0.015);
        expect(n.at).toBeGreaterThanOrEqual(0);
      }
    }
  }
});
