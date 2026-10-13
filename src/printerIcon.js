// Per-printer icon: shown as the browser tab icon and as the logo in the top bar, so several printers open in
// tabs can be told apart. Kept in the printer's own settings (Moonraker database), so every printer has its own.
//   kind 'voyager'  the Voyager UI mark (default)
//   kind 'logo'     a logo from src/img/logos (bundled with the UI, see the README there)
//   kind 'mainsail' a maker logo that ships with Mainsail (Voron, VzBot, LDO...). Not bundled here: loaded from
//                   the Mainsail install on the same host (port 80), listed only when that Mainsail answers
//   kind 'image'    an image the user uploaded (their own printer logo), fitted into a 128 px square
// Older 'letters' settings fall back to the Voyager mark.
import { watch, ref } from 'vue';
import { state, printerName } from './store';
import { currentPrinter } from './printers';

// every svg/png/webp in src/img/logos becomes an entry; the file name is the name shown
// (voron-design.svg -> "Voron Design", a name in the manifest wins)
const files = import.meta.glob('./img/logos/*.{svg,png,webp}', { eager: true, query: '?url', import: 'default' });
import names from './img/logos/names.json';
const nice = (id) =>
  id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
export const LOGOS = Object.entries(files)
  .map(([f, url]) => {
    const id = f
      .split('/')
      .pop()
      .replace(/\.[a-z]+$/i, '');
    return { id, name: names[id] || nice(id), url };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// Mainsail's theme logos (public/img/themes/sidebarLogo-<id>.svg) with the names Mainsail gives them
export const MAINSAIL_LOGOS = [
  ['voron', 'Voron Design'],
  ['vzbot', 'VzBot'],
  ['ldo', 'LDO Motion'],
  ['btt', 'BigTreeTech'],
  ['prusa', 'Prusa Research'],
  ['yumi', 'YUMI'],
  ['multec', 'Multec'],
  ['klipper', 'Klipper'],
];
export const mainsailLogoUrl = (id) => `${location.protocol}//${location.hostname}/img/themes/sidebarLogo-${id}.svg`;
// which of them the local Mainsail serves (checked once, by loading each as an image)
let probed = null;
export function probeMainsailLogos() {
  return (probed ||= Promise.all(
    MAINSAIL_LOGOS.map(
      ([id, name]) =>
        new Promise((res) => {
          const im = new Image();
          const done = (ok) => {
            clearTimeout(tm);
            res(ok ? { id, name } : null);
          };
          const tm = setTimeout(() => done(false), 4000);
          im.onload = () => done(im.naturalWidth > 0);
          im.onerror = () => done(false);
          im.src = mainsailLogoUrl(id);
        }),
    ),
  ).then((l) => l.filter(Boolean)));
}

// the icon as a URL an <img> or <link rel=icon> can use, or null for the Voyager mark
export function iconUrl(pi = state.settings.printerIcon) {
  if (!pi) return null;
  if (pi.kind === 'image') return pi.img || null;
  if (pi.kind === 'mainsail') return pi.theme ? mainsailLogoUrl(pi.theme) : null;
  if (pi.kind === 'logo') return LOGOS.find((l) => l.id === pi.logo)?.url || null;
  return null;
}

// read an uploaded image and scale it to fit 128 x 128 (keeps the settings small)
export function readIcon(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error('read failed'));
    r.onload = () => {
      const im = new Image();
      im.onerror = () => rej(new Error('not an image'));
      im.onload = () => {
        const S = 128,
          iw = im.naturalWidth || S,
          ih = im.naturalHeight || S,
          k = S / Math.max(iw, ih); // any size or shape ends up fitted into the square
        const w = Math.max(1, Math.round(iw * k)),
          h = Math.max(1, Math.round(ih * k));
        const c = document.createElement('canvas');
        c.width = S;
        c.height = S;
        c.getContext('2d').drawImage(im, (S - w) / 2, (S - h) / 2, w, h);
        res(c.toDataURL('image/png'));
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

// Keep the tab icon in sync. Some browsers (Safari) keep the first icon when only the href of the link changes,
// so the link is replaced by a new one, and the icon is drawn into a PNG where it can be (Safari does not show
// SVG tab icons, and a cross-origin image stays a plain URL).
function toPng(u) {
  return new Promise((res) => {
    if (!/^data:image\/svg|\.svg(\?|$)/.test(u)) return res(u);
    const im = new Image();
    im.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const k = 64 / Math.max(im.naturalWidth || 64, im.naturalHeight || 64);
        const w = (im.naturalWidth || 64) * k,
          h = (im.naturalHeight || 64) * k;
        c.getContext('2d').drawImage(im, (64 - w) / 2, (64 - h) / 2, w, h);
        res(c.toDataURL('image/png'));
      } catch {
        res(u);
      }
    };
    im.onerror = () => res(u);
    im.src = u;
  });
}
export function startTabIcon() {
  const first = document.querySelector('link[rel="icon"]');
  if (!first) return;
  const orig = { href: first.getAttribute('href'), type: first.getAttribute('type') };
  let seq = 0;
  const put = (href, type) => {
    for (const l of document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')) l.remove();
    const l = document.createElement('link');
    l.rel = 'icon';
    l.type = type;
    l.href = href;
    document.head.appendChild(l);
  };
  watch(
    () => [iconUrl(), printerName.value],
    async ([u]) => {
      const n = ++seq;
      if (!u) return put(orig.href, orig.type);
      const href = await toPng(u);
      if (n !== seq) return; // a newer pick won
      put(href, /^data:image\/svg|\.svg(\?|$)/.test(href) ? 'image/svg+xml' : 'image/png');
    },
    { immediate: true },
  );
  syncListIcon();
}

// ---------- icons of every printer in this browser's list ----------
// The printer menu and the Printers dialog show each printer's icon, so this browser keeps a copy of them:
// { [printer id]: { icon, pending } }, id '' being the page's own address. The open printer's copy follows its
// settings. An icon picked in the Printers dialog for another printer is marked pending and moves into that
// printer's settings the next time it is opened.
const ICONS = 'voyager-ui-printer-icons';
function readIcons() {
  try {
    const v = JSON.parse(localStorage.getItem(ICONS) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export const printerIcons = ref(readIcons());
function writeIcons() {
  try {
    localStorage.setItem(ICONS, JSON.stringify(printerIcons.value));
  } catch {}
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === ICONS) printerIcons.value = readIcons();
  });
const curId = () => currentPrinter()?.id || '';
const isDefault = (pi) => !pi || !pi.kind || pi.kind === 'voyager' || pi.kind === 'letters';
const clean = (pi) => ({
  kind: pi?.kind || 'voyager',
  logo: pi?.logo || '',
  theme: pi?.theme || '',
  img: pi?.img || '',
});

// URL of a listed printer's icon, or null for the Voyager mark. A Mainsail theme logo lives on that printer's
// own web server, so the copy bundled here is used instead.
export function listIconUrl(id) {
  if (id === curId()) return iconUrl();
  const pi = printerIcons.value[id]?.icon;
  if (!pi) return null;
  if (pi.kind === 'mainsail') return LOGOS.find((l) => l.id === 'sidebarLogo-' + pi.theme)?.url || null;
  return iconUrl(pi);
}
export function listIcon(id) {
  return id === curId() ? clean(state.settings.printerIcon) : clean(printerIcons.value[id]?.icon);
}
// pick an icon for a printer in the list (the open one changes right away)
export function setListIcon(id, pi) {
  pi = clean(pi);
  if (id === curId()) {
    state.settings.printerIcon = { ...pi, img: pi.img || state.settings.printerIcon?.img || '' };
    printerIcons.value = { ...printerIcons.value, [id]: { icon: pi } };
  } else printerIcons.value = { ...printerIcons.value, [id]: { icon: pi, pending: true } };
  writeIcons();
}
// forget the icons of printers that left the list
export function pruneListIcons(ids) {
  const keep = new Set(['', ...ids]);
  const next = Object.fromEntries(Object.entries(printerIcons.value).filter(([k]) => keep.has(k)));
  if (Object.keys(next).length !== Object.keys(printerIcons.value).length) {
    printerIcons.value = next;
    writeIcons();
  }
}
function syncListIcon() {
  watch(
    () => state.settingsLoaded && JSON.stringify(state.settings.printerIcon),
    (ready) => {
      if (!ready) return;
      const id = curId(),
        e = printerIcons.value[id];
      if (e?.pending) {
        // picked in the Printers dialog while another printer was open
        state.settings.printerIcon = clean(e.icon);
        printerIcons.value = { ...printerIcons.value, [id]: { icon: clean(e.icon) } };
      } else {
        const pi = clean(state.settings.printerIcon);
        if (e ? JSON.stringify(e.icon) === JSON.stringify(pi) : isDefault(pi)) return;
        printerIcons.value = { ...printerIcons.value, [id]: { icon: pi } };
      }
      writeIcons();
    },
    { immediate: true },
  );
}
