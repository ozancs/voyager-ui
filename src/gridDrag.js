// Reordering a grid by dragging, for the small tiles of Customize > Phone: the item follows the pointer and, on
// release, goes where the item whose middle is nearest to the pointer was. A press that does not move (or one on a
// button inside the item) stays a click. Items are the grid's children with a data-id; others are left alone.
import { ref } from 'vue';

export function useGridDrag(onDrop) {
  const grid = ref(null);
  const drag = ref(null); // { id, dx, dy, over } while an item is dragged
  let start = null;
  let rects = [];
  function down(id, e) {
    if (e.button !== 0 || e.target.closest('button')) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    // pointer moves come in screen pixels, the item moves in the page's CSS pixels (interface scale)
    start = { id, x: e.clientX, y: e.clientY, zoom: r.width / (el.offsetWidth || r.width) || 1, moved: false };
    rects = [...(grid.value?.children || [])]
      .filter((c) => c.dataset.id)
      .map((c) => ({ id: c.dataset.id, r: c.getBoundingClientRect() }));
    el.setPointerCapture?.(e.pointerId);
  }
  function move(e) {
    if (!start) return;
    const dx = e.clientX - start.x,
      dy = e.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 5) return;
    start.moved = true;
    let over = null,
      best = Infinity;
    for (const { id, r } of rects) {
      const dd = (r.left + r.width / 2 - e.clientX) ** 2 + (r.top + r.height / 2 - e.clientY) ** 2;
      if (dd < best) [best, over] = [dd, id];
    }
    drag.value = { id: start.id, dx: dx / start.zoom, dy: dy / start.zoom, over };
  }
  function up() {
    const d = drag.value;
    if (start?.moved && d?.over && d.over !== d.id) onDrop(d.id, d.over);
    start = null;
    drag.value = null;
  }
  return { grid, drag, down, move, up };
}

// a list of ids with `id` moved to where `over` is
export function moveId(ids, id, over) {
  const out = [...ids];
  const from = out.indexOf(id),
    to = out.indexOf(over);
  if (from < 0 || to < 0 || from === to) return out;
  out.splice(from, 1);
  out.splice(to, 0, id);
  return out;
}
