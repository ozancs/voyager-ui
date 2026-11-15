// Phone preview (Customize > Phone): a mouse cannot swipe, so in the preview a press and drag scrolls the area
// under the pointer the way a finger does on the phone. A short press stays a click; after a drag the click that
// follows is swallowed, so letting go over a button does not press it. Fields, sliders and drag handles keep
// their own mouse behaviour.
const SKIP = 'input, textarea, select, [contenteditable], .hd, .rz, .no-drag-scroll';
const MOVE = 6; // px before a press becomes a drag

function scroller(el) {
  for (let x = el; x && x !== document.documentElement; x = x.parentElement) {
    const cs = getComputedStyle(x);
    const y = /auto|scroll/.test(cs.overflowY) && x.scrollHeight > x.clientHeight + 1;
    const h = /auto|scroll/.test(cs.overflowX) && x.scrollWidth > x.clientWidth + 1;
    if (y || h) return x;
  }
  return document.scrollingElement;
}

export function mouseDragScroll() {
  let s = null;
  let swallow = false;
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest?.(SKIP)) return;
      const el = scroller(e.target);
      s = { el, x: e.clientX, y: e.clientY, top: el.scrollTop, left: el.scrollLeft, moved: false };
    },
    true,
  );
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!s) return;
      const dx = e.clientX - s.x,
        dy = e.clientY - s.y;
      if (!s.moved && Math.hypot(dx, dy) < MOVE) return;
      if (!s.moved) {
        s.moved = true;
        document.documentElement.style.userSelect = 'none';
        window.getSelection?.()?.removeAllRanges();
      }
      s.el.scrollTop = s.top - dy;
      s.el.scrollLeft = s.left - dx;
    },
    true,
  );
  const end = () => {
    if (s?.moved) {
      swallow = true;
      setTimeout(() => (swallow = false), 0);
      document.documentElement.style.userSelect = '';
    }
    s = null;
  };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
  document.addEventListener(
    'click',
    (e) => {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}
