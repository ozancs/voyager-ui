// Per-printer icon: shown as the browser tab icon and as the logo in the top bar, so several printers open in
// tabs can be told apart. Kept in the printer's own settings (Moonraker database), so every printer has its own.
//   kind 'voyager'  the Voyager UI mark (default)
//   kind 'letters'  1 to 3 letters on a coloured tile
//   kind 'image'    an image the user uploaded (their own printer logo), scaled down to 128 px
import { watch } from 'vue'
import { state, printerName } from './store'

export const ICON_DEFAULT = () => ({ kind: 'voyager', text: '', color: '#38d6ff', img: '' })

export const initials = (name) => (String(name || '').match(/[A-Za-z0-9]+/g) || ['?']).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// dark or light text, whichever reads better on the tile colour
function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#fff'
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#15171a' : '#fff'
}

export function lettersSvg(text, color) {
  const tx = esc(String(text || '?').slice(0, 3))
  const size = tx.length > 2 ? 24 : tx.length > 1 ? 30 : 38
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${esc(color)}"/><text x="32" y="33" dominant-baseline="central" text-anchor="middle" font-family="Onest,Arial,sans-serif" font-weight="800" font-size="${size}" fill="${textOn(color)}">${tx}</text></svg>`
}

// the icon as a URL an <img> or <link rel=icon> can use, or null for the Voyager mark
export function iconUrl(pi = state.settings.printerIcon) {
  if (!pi || pi.kind === 'voyager') return null
  if (pi.kind === 'image') return pi.img || null
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(lettersSvg(pi.text || initials(printerName.value), pi.color))
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
        const S = 128, k = Math.min(1, S / Math.max(im.width, im.height))
        const w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k))
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
    if (u) { link.setAttribute('href', u); link.setAttribute('type', u.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png') }
    else { link.setAttribute('href', orig.href); link.setAttribute('type', orig.type) }
  }, { immediate: true })
}
