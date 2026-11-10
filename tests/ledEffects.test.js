import { it, expect } from 'vitest';
import { effectNames, hasLedEffects } from '../src/ledEffects';
it('discovers effects from status or config without duplicates', () => {
  expect(
    effectNames(['led_effect rainbow'], { 'led_effect rainbow': {}, 'led_effect idle': {}, 'led lights': {} }),
  ).toEqual(['led_effect idle', 'led_effect rainbow']);
});
it('offers a card when the plugin command exists but no effect is exported', () => {
  expect(hasLedEffects([], {}, { SET_LED_EFFECT: 'help' })).toBe(true);
  expect(hasLedEffects([], {}, {})).toBe(false);
});
