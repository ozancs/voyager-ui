// The dashboard grid on a narrow window (Dashboard.vue): a card whose columns came out narrower than minCol px
// takes more columns, and the cards are packed again in their order (top to bottom, left to right), each into
// the highest free place, the column closest to where it was winning a tie, so no holes are left behind.
// Only for showing: the layout as arranged is kept, and returned as it is when every card is wide enough.
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export function reflow(l, colW, minCol, cols = 12) {
  if (!colW || colW >= minCol) return l;
  const need = (x) => Math.min(cols, Math.max(x.w, Math.ceil((x.w * minCol) / colW - 0.05)));
  if (l.every((x) => need(x) === x.w)) return l;
  const placed = [];
  // the lowest free place for a card w wide at column x
  const lowest = (c) => {
    for (let b = placed.find((p) => hits(p, c)); b; b = placed.find((p) => hits(p, c))) c.y = b.y + b.h;
    return c;
  };
  for (const it of [...l].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const w = need(it);
    const pref = Math.min(it.x, cols - w);
    // every column it can start at: the highest place wins, then the one closest to where it was
    let best = null;
    for (let x = 0; x <= cols - w; x++) {
      const c = lowest({ ...it, w, x, y: 0 });
      if (!best || c.y < best.y || (c.y === best.y && Math.abs(x - pref) < Math.abs(best.x - pref))) best = c;
    }
    placed.push(best);
  }
  return placed;
}
