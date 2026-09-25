// While dragging on the dashboard, keep scrolling when the pointer sits near the top or bottom edge
// of the page. After each scroll step the last pointer event is replayed so the dragged card follows.
export function useEdgeAutoScroll(getScroller, active, { pointer = true, onScroll = null, getBox = null } = {}) {
  let last = null, raf = 0, down = false
  const EDGE = 80, MAX = 22
  function speed() {
    const el = getScroller()
    if (!el || !last) return 0
    const r = el.getBoundingClientRect()
    // use the dragged card's own edges when we know it (and it fits on screen), else the pointer
    let top = last.clientY, bot = last.clientY
    const b = getBox?.()
    if (b && b.height < r.height - EDGE) { top = b.top; bot = b.bottom }
    if (top < r.top + EDGE) return -MAX * Math.min(1, (r.top + EDGE - top) / EDGE)
    if (bot > r.bottom - EDGE) return MAX * Math.min(1, (bot - (r.bottom - EDGE)) / EDGE)
    return 0
  }
  function tick() {
    raf = 0
    if (!down || !active()) return
    const v = speed()
    const el = getScroller()
    if (v && el) {
      const before = el.scrollTop
      el.scrollTop += v
      if (el.scrollTop !== before && onScroll) onScroll()
      else if (el.scrollTop !== before && last) {
        // replay the pointer position so the grid recalculates where the card is
        const init = { clientX: last.clientX, clientY: last.clientY, screenX: last.screenX, screenY: last.screenY, bubbles: true, cancelable: true, buttons: 1, pointerId: last.pointerId, pointerType: last.pointerType, isPrimary: true }
        const target = document.elementFromPoint(last.clientX, last.clientY) || document
        target.dispatchEvent(last.pointerType ? new PointerEvent('pointermove', init) : new MouseEvent('mousemove', init))
      }
    }
    raf = requestAnimationFrame(tick)
  }
  const onDown = (e) => { if (pointer && active()) { down = true; last = e; if (!raf) raf = requestAnimationFrame(tick) } }
  const onMove = (e) => { if (e.isTrusted) last = e }
  const onUp = () => { down = false; last = null }
  // native HTML5 drag (top strip reorder) only reports dragover
  const onDragOver = (e) => { if (!active()) return; last = e; if (!down) { down = true; if (!raf) raf = requestAnimationFrame(tick) } }
  const onDragEnd = () => { down = false; last = null }
  function start() {
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('pointerup', onUp, true)
    document.addEventListener('pointercancel', onUp, true)
    document.addEventListener('dragover', onDragOver, true)
    document.addEventListener('dragend', onDragEnd, true)
    document.addEventListener('drop', onDragEnd, true)
  }
  function stop() {
    document.removeEventListener('pointerdown', onDown, true)
    document.removeEventListener('pointermove', onMove, true)
    document.removeEventListener('pointerup', onUp, true)
    document.removeEventListener('pointercancel', onUp, true)
    document.removeEventListener('dragover', onDragOver, true)
    document.removeEventListener('dragend', onDragEnd, true)
    document.removeEventListener('drop', onDragEnd, true)
    cancelAnimationFrame(raf); raf = 0
  }
  return { start, stop }
}
