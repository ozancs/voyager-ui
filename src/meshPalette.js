// Colour scales for the bed mesh, low (-lim) to high (+lim). Shared by the 2D grid, the 3D surface, the legend
// and the mini mesh card. 'voyager' is the original orange / grey / blue.
export const PALETTES = {
  voyager: { name: 'Voyager', stops: ['#3878ff', '#2e3238', '#ff6b1a'] },
  mainsail: { name: 'Blue / green / red', stops: ['#2c7bb6', '#abd9e9', '#3dd68c', '#fdae61', '#d7191c'] },
  viridis: { name: 'Viridis', stops: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
  deviation: { name: 'Green is flat', stops: ['#e5484d', '#f5c451', '#3dd68c', '#f5c451', '#e5484d'] },
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
export function paletteOf(key) { return PALETTES[key] || PALETTES.voyager }
// colour for f in -1..1
export function paletteColor(key, f) {
  const st = paletteOf(key).stops.map(hex)
  const x = (Math.max(-1, Math.min(1, f)) + 1) / 2 * (st.length - 1)
  const i = Math.min(st.length - 2, Math.floor(x)), k = x - i
  return `rgb(${st[i].map((c, j) => Math.round(c + (st[i + 1][j] - c) * k)).join(',')})`
}
export const plotlyScale = (key) => { const st = paletteOf(key).stops; return st.map((c, i) => [i / (st.length - 1), c]) }
export const cssGradient = (key) => `linear-gradient(${[...paletteOf(key).stops].reverse().join(', ')})`
