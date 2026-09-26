// Per-printer icon: shown as the browser tab icon and as the logo in the top bar, so several printers open in
// tabs can be told apart. Kept in the printer's own settings (Moonraker database), so every printer has its own.
//   kind 'voyager'  the Voyager UI mark (default)
//   kind 'logo'     a logo from src/img/logos (bundled with the UI, see the README there)
//   kind 'image'    an image the user uploaded (their own printer logo), fitted into a 128 px square
// Older settings ('letters', 'mainsail') fall back to the Voyager mark.
import { watch } from 'vue'
import { state, printerName } from './store'

// every svg/png/webp in src/img/logos becomes an entry; the file name is the name shown
// (voron-design.svg -> "Voron Design", a name in the manifest wins)
const files = import.meta.glob('./img/logos/*.{svg,png,webp}', { eager: true, query: '?url', import: 'default' })
import names from './img/logos/names.json'
const nice = (id) => id.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
export const LOGOS = Object.entries(files)
  .map(([f, url]) => { const id = f.split('/').pop().replace(/\.[a-z]+$/i, ''); return { id, name: names[id] || nice(id), url } })
  .sort((a, b) => a.name.localeCompare(b.name))

// the icon as a URL an <img> or <link rel=icon> can use, or null for the Voyager mark
export function iconUrl(pi = state.settings.printerIcon) {
  if (!pi) return null
  if (pi.kind === 'image') return pi.img || null
  if (pi.kind === 'logo') return LOGOS.find((l) => l.id === pi.logo)?.url || null
  return null
}

// read an uploaded image and scale it to fit 128 x 128 (keeps the settings small)
export function readIcon(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onerror = () => rej(new Error('read failed'))
    r.onload = () => {
      const im = new Image()
      im.onerror = () => rej(new Error('not an image'))
      im.onload = () => {
        const S = 128, iw = im.naturalWidth || S, ih = im.naturalHeight || S, k = S / Math.max(iw, ih) // any size or shape ends up fitted into the square
        const w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k))
        const c = document.createElement('canvas')
        c.width = S; c.height = S
        c.getContext('2d').drawImage(im, (S - w) / 2, (S - h) / 2, w, h)
        res(c.toDataURL('image/png'))
      }
      im.src = r.result
    }
    r.readAsDataURL(file)
  })
}

// keep the tab icon in sync
export function startTabIcon() {
  const link = document.querySelector('link[rel="icon"]')
  if (!link) return
  const orig = { href: link.getAttribute('href'), type: link.getAttribute('type') }
  watch(() => [iconUrl(), printerName.value], ([u]) => {
    if (u) { link.setAttribute('href', u); link.setAttribute('type', /^data:image\/svg|\.svg(\?|$)/.test(u) ? 'image/svg+xml' : 'image/png') }
    else { link.setAttribute('href', orig.href); link.setAttribute('type', orig.type) }
  }, { immediate: true })
}
