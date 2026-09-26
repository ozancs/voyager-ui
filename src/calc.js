// Small pure helpers for the Health page and the dashboard grid, unit tested in tests/utils.test.js.

// increase of a counter over the samples. Klipper resets the MCU counters on a restart, so a drop is a new
// start and not a negative change: only the steps up are added
export function counterGrowth(h, key) {
  let sum = 0;
  for (let i = 1; i < h.length; i++) {
    const d = h[i][key] - h[i - 1][key];
    sum += d > 0 ? d : 0;
  }
  return sum;
}

// Grid layout: after a card was resized from a left or top corner, push every card it now overlaps (and what
// those then overlap) down below it, the way the grid does it for the bottom-right corner. Mutates the items.
const hit = (a, b) => a !== b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export function pushDown(layout, id) {
  const moved = layout.find((l) => l.i === id);
  if (!moved) return layout;
  const queue = [moved];
  for (let guard = 0; queue.length && guard < 500; guard++) {
    const a = queue.shift();
    for (const b of layout)
      if (b !== moved && hit(a, b) && b.y < a.y + a.h) {
        b.y = a.y + a.h;
        queue.push(b);
      }
  }
  return layout;
}
