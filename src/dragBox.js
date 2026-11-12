// Dragging a dialog or a pop-up panel out of the way, to see what it changes on the page. The box moves by a
// translate on top of where it was placed; a drag starts only past a few pixels, so clicks still work, and never
// on a control (a field, a button, a list being reordered).
import { ref } from 'vue';

const NO_DRAG = 'button, input, select, textarea, a, label, [contenteditable], [data-nodrag], .sl-row, .grip';

export function useDragBox(boxRef, { anywhere = false } = {}) {
  const off = ref({ x: 0, y: 0 });
  let start = null;
  function move(e) {
    if (!start) return;
    const dx = e.clientX - start.x,
      dy = e.clientY - start.y;
    if (!start.on && Math.hypot(dx, dy) < 4) return;
    start.on = true;
    // the interface scale is a CSS zoom on <html>: pointer pixels are screen pixels
    off.value = { x: start.ox + dx / start.k, y: start.oy + dy / start.k };
  }
  function up() {
    start = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  }
  function down(e) {
    if (e.button !== 0) return;
    if (e.target.closest(NO_DRAG)) return;
    if (!anywhere && !e.target.closest('.card-h, .drag-h')) return;
    const box = boxRef.value;
    if (!box) return;
    const k = box.getBoundingClientRect().width / (box.offsetWidth || 1) || 1;
    start = { x: e.clientX, y: e.clientY, ox: off.value.x, oy: off.value.y, k, on: false };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }
  const style = () => (off.value.x || off.value.y ? { translate: `${off.value.x}px ${off.value.y}px` } : null);
  return { down, style, off };
}
