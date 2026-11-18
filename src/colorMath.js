import { hexToHsl } from './baseColor';
export { hexToHsl };
export const clamp = (v, max = 100) => Math.max(0, Math.min(max, Number(v) || 0));
export function normalizeHex(value) {
  const v = String(value || '')
    .trim()
    .replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(v))
    return (
      '#' +
      [...v]
        .map((c) => c + c)
        .join('')
        .toLowerCase()
    );
  return /^[\da-f]{6}$/i.test(v) ? '#' + v.toLowerCase() : null;
}
export const rgbHex = (rgb) => '#' + rgb.map((v) => Math.round(clamp(v, 255)).toString(16).padStart(2, '0')).join('');
export function hexRgb(hex) {
  const n = parseInt(normalizeHex(hex)?.slice(1) || '000000', 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
export function hslHex(h, s, l) {
  h = (((Number(h) || 0) % 360) + 360) % 360;
  s = clamp(s) / 100;
  l = clamp(l) / 100;
  const a = s * Math.min(l, 1 - l);
  return rgbHex(
    [0, 8, 4].map((n) => {
      const k = (n + h / 30) % 12;
      return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    }),
  );
}
export const COLOR_SWATCHES = [
  '#ff0000',
  '#ff8000',
  '#ffff00',
  '#80ff00',
  '#00c853',
  '#00ffff',
  '#0080ff',
  '#0000ff',
  '#8000ff',
  '#ff00ff',
  '#ff80c0',
  '#ffffff',
  '#c0c0c0',
  '#808080',
  '#404040',
  '#000000',
];
