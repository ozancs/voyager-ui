// Lightspeed (lightspeed.js): which Klipper object a strip drives, the effect specs sent to the printer, and the
// pixels the tiles draw with the plugin's own engine
import { describe, it, expect, vi } from 'vitest';
const { state } = vi.hoisted(() => ({ state: { objects: [], settings: {} } }));
vi.mock('../src/store', () => ({ state, S: () => ({}), gcode: async () => {}, toast: () => {} }));
vi.mock('../src/printers', () => ({ currentHost: () => '' }));
import { stripObject, specOf, parseEffect, frame, frameCss, effectsFor } from '../src/lightspeed.js';

describe('lightspeed', () => {
  it('finds the object a strip drives, as the printer spells it', () => {
    state.objects = ['neopixel hotend_rgb', 'output_pin Kasa_Ledi_Guc'];
    expect(stripObject({ output: 'neopixel hotend_rgb' })).toBe('neopixel hotend_rgb');
    expect(stripObject({ output: 'pin kasa_ledi_guc' })).toBe('output_pin Kasa_Ledi_Guc');
    expect(stripObject({ output: 'wled 192.168.1.60' })).toBe('');
    expect(stripObject({ output: 'esp_bridge led' })).toBe('');
  });
  it('writes colours without # (a G-code comment) and leaves defaults out', () => {
    expect(specOf('breathe', { color: '#FF6B1A', period: 3 })).toBe('breathe color=ff6b1a');
    expect(specOf('solid', { color: '20c0ff' })).toBe('solid color=20c0ff');
  });
  it('keeps an effect a newer plugin knows as plain text', () => {
    expect(parseEffect('aurora speed=2')).toEqual(['aurora', {}]);
    expect(frame('aurora speed=2', 10, 1)).toEqual([]);
  });
  it('draws a rainbow as a gradient and a solid colour as one colour', () => {
    expect(frameCss(frame('rainbow period=5', 20, 1))).toMatch(/^linear-gradient/);
    expect(frameCss(frame('solid color=ff0000', 5, 1))).toBe('#ff0000');
  });
  it('offers a plain pin only what it can show', () => {
    expect(effectsFor('pin')).toEqual(['off', 'solid', 'blink', 'breathe']);
    expect(effectsFor('esp_bridge')).not.toContain('follow');
  });
});
