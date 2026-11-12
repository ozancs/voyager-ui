// Appearance > Theme colour: one colour that tints the whole interface, not only the page behind the cards. The
// built-in themes are a set of greys a little towards blue, each surface a step lighter or darker than the next
// (page, cards, inner panels, borders, hover). This keeps those steps and takes the picked colour's hue, its
// saturation and, in the dark theme, its brightness (the pick is the page, the rest step up from it). Custom
// card colours stay as they are.

// the steps of the built-in themes, as lightness in %
const DARK = {
  '--bg': 10,
  '--s1': 13.5,
  '--s2': 17.6,
  '--s3': 21.6,
  '--bd': 19.4,
  '--hover': 15,
  '--grid': 20,
  '--plate': 9.2,
  '--base-s2': 16.9,
  '--base-s3': 21,
  '--base-bd': 19.4,
};
const DARKER = { '--bg': 5.5, '--plate': 6, '--grid': 18.5 }; // Background: Darker
const LIGHT = {
  '--bg': 94.3,
  '--s1': 99.3,
  '--s2': 95.4,
  '--s3': 88.6,
  '--bd': 86.7,
  '--hover': 96.3,
  '--grid': 89.2,
  '--plate': 96,
  '--base-s2': 95.4,
  '--base-s3': 88.6,
  '--base-bd': 86.7,
};
export const BASE_KEYS = [...Object.keys(DARK), '--mu', '--mu2'];

export function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}
const hsl = (h, s, l) => `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`;

// the tokens for one colour in one mode; null for the built-in theme
export function basePalette(hex, mode, darker = false) {
  const c = hexToHsl(hex);
  if (!c) return null;
  // a very saturated pick would make the page loud: its saturation is capped, more so for the light theme's
  // near-white surfaces where a little goes a long way
  // the saturation is followed up to a point (a fully saturated page would be loud)
  const s = Math.min(c.s, mode === 'light' ? 55 : 80);
  // and the brightness: in the dark theme the picked colour is the page itself, every surface keeps its step
  // above it; the light theme stays light and only follows a darker pick a little
  const lift =
    mode === 'light'
      ? Math.max(-10, Math.min(0, (c.l - 50) * 0.12))
      : Math.max(-7, Math.min(22, c.l - (darker ? DARKER['--bg'] : DARK['--bg'])));
  const steps = mode === 'light' ? LIGHT : { ...DARK, ...(darker ? DARKER : {}) };
  const out = {};
  for (const [k, l] of Object.entries(steps)) {
    // lighter surfaces carry a little less colour, like the built-in greys
    const sk = mode === 'light' ? s * (l > 97 ? 0.6 : 1) : s * (l > 15 ? 0.85 : 1);
    out[k] = hsl(c.h, sk, Math.max(1, Math.min(99, l + lift)));
  }
  // grey text keeps its contrast on a lighter page
  out['--mu'] = hsl(c.h, Math.min(s, 12) * 0.6, mode === 'light' ? 35 : Math.min(80, 68 + Math.max(0, lift) * 0.5));
  out['--mu2'] = hsl(c.h, Math.min(s, 12) * 0.6, mode === 'light' ? 46 : Math.min(72, 58 + Math.max(0, lift) * 0.5));
  return out;
}

// Accent strength normal / strong: the surfaces lean a little towards the accent too, so the colour belongs to the
// whole theme and not only to its buttons. Borders take a bit more, so the steps between surfaces stay visible.
const LEAN = { normal: [4, 7], strong: [8, 13] }; // % of accent in surfaces, in borders
const LEAN_LIGHT = { normal: [3, 6], strong: [6, 10] };

export function applyBase(hex, mode, darker, reach = 'subtle') {
  const st = document.documentElement.style;
  const lean = (mode === 'light' ? LEAN_LIGHT : LEAN)[reach];
  // the built-in greys, as a palette, when only the accent asks for a lean
  let p = basePalette(hex || (lean ? '#16181c' : ''), mode, darker);
  if (p && lean)
    for (const k of Object.keys(p))
      if (!k.startsWith('--mu'))
        p[k] = `color-mix(in srgb, var(--ac-raw) ${/bd$/.test(k) ? lean[1] : lean[0]}%, ${p[k]})`;
  for (const k of BASE_KEYS) p ? st.setProperty(k, p[k]) : st.removeProperty(k);
  // the first paint of the next visit uses it before the settings arrive (index.html)
  try {
    p ? localStorage.setItem('voyager-ui-base', JSON.stringify(p)) : localStorage.removeItem('voyager-ui-base');
  } catch {}
}
