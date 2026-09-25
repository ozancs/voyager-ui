// v-fit: when a dashboard card is only a little too small for its content, shrink the content (CSS zoom) instead of
// showing a scrollbar. Up to 25% smaller; beyond that the card scrolls as before. Measured on the card itself and on
// inner scroll areas marked data-fit (the temperatures table). Console logs and editors are not touched.
const MIN = 0.75
function measure(card) {
  let need = 1
  const cH = card.clientHeight, cW = card.clientWidth
  if (!cH || !cW) return 1
  need = Math.max(need, (card.scrollHeight - 1) / cH, (card.scrollWidth - 1) / cW)
  for (const el of card.querySelectorAll('[data-fit]')) {
    const extra = Math.max(0, el.scrollHeight - el.clientHeight - 1)
    if (extra) need = Math.max(need, (cH + extra) / cH)
    const extraW = Math.max(0, el.scrollWidth - el.clientWidth - 1)
    if (extraW) need = Math.max(need, (cW + extraW) / cW)
  }
  return need
}
function fit(cell) {
  const card = cell.querySelector(':scope > .card, :scope > * > .card, :scope > .card, .card')
  if (!card) return
  const cur = parseFloat(card.style.zoom) || 1
  // measure at zoom 1 so the result does not drift
  card.style.zoom = ''
  const need = measure(card)
  let z = 1
  if (need > 1.005) z = 1 / need
  if (z < MIN) z = 1 // too much: let it scroll
  z = Math.floor(z * 200) / 200
  card.style.zoom = z === 1 ? '' : String(z)
  if (z !== cur) card.classList.toggle('fitted', z !== 1)
}
export const vfit = {
  mounted(el) {
    let t
    const run = () => { cancelAnimationFrame(t); t = requestAnimationFrame(() => fit(el)) }
    el.__fit = run
    el.__ro = new ResizeObserver(run); el.__ro.observe(el)
    el.__mo = new MutationObserver(run); el.__mo.observe(el, { childList: true, subtree: true, characterData: true })
    run()
  },
  updated(el) { el.__fit && el.__fit() },
  unmounted(el) { el.__ro?.disconnect(); el.__mo?.disconnect(); cancelAnimationFrame(el.__t) },
}
