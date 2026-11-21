// Lightspeed (lightspeed.js): which Klipper object a strip drives, the effect specs sent to the printer, and the
// pixels the tiles draw with the plugin's own engine
import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
vi.mock('../src/store', async () => {
  const { reactive } = await import('vue');
  return { state: reactive({ objects: [], settings: {} }), S: () => ({}), gcode: async () => {}, toast: () => {} };
});
import { state } from '../src/store';
import {
  stripObject,
  specOf,
  parseEffect,
  frame,
  frameCss,
  effectsFor,
  startLightspeedDiscovery,
  pageUrl,
} from '../src/lightspeed.js';

describe('lightspeed', () => {
  it.each([
    ['printer-b.local:7125', 'http://printer-b.local:81', 'printer-b.local'],
    ['printer-b.local:8087', 'http://printer-b.local:8087', 'printer-b.local'],
    ['', 'http://printer-a.local:1977', 'printer-a.local'],
  ])('opens the designer for the active connection %s', async (host, expectedOrigin, expectedHost) => {
    const origins = [];
    vi.stubGlobal('location', new URL('http://printer-a.local:1977'));
    vi.stubGlobal(
      'Image',
      class {
        set src(url) {
          const origin = new URL(url).origin;
          origins.push(origin);
          this.naturalWidth = [location.origin, expectedOrigin].includes(origin) ? 64 : 0;
          queueMicrotask(() => (this.naturalWidth ? this.onload() : this.onerror()));
        }
      },
    );
    state.objects = ['lightspeed'];
    const stop = startLightspeedDiscovery(host);
    try {
      await vi.waitFor(() => expect(pageUrl.value).toBe(expectedOrigin + '/lightspeed/lightspeed.html'));
      expect(origins.length).toBeGreaterThan(0);
      expect(origins.every((origin) => new URL(origin).hostname === expectedHost)).toBe(true);
      state.settings.lightspeedUrl = 'https://my-proxy.local/designer';
      await nextTick();
      expect(pageUrl.value).toBe('https://my-proxy.local/designer');
    } finally {
      stop();
      delete state.settings.lightspeedUrl;
      vi.unstubAllGlobals();
    }
  });

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
