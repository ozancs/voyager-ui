// Option groups (.seg): the highlight slides from the old option to the picked one instead of jumping. Works for
// every .seg in the app without touching the components: on a click inside one, the highlighted option is noted;
// once Vue has moved the `on` class, a stand-in with the same background is drawn over the old place and moved to
// the new one, then removed, and the picked option shows its own background again. Nothing is left behind, so a
// group that changes some other way (a setting restored, another browser) just switches as before.
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function slide(seg, from) {
  const to = seg.querySelector(':scope > button.on');
  if (!to || to === from || !from.isConnected) return;
  const box = seg.getBoundingClientRect();
  const zoom = box.width / (seg.offsetWidth || box.width) || 1; // the interface scale zooms the page
  const a = from.getBoundingClientRect(),
    b = to.getBoundingClientRect();
  if (!a.width || !b.width) return;
  const cs = getComputedStyle(to);
  const pill = document.createElement('span');
  pill.className = 'seg-pill';
  const at = (r) => ({
    left: (r.left - box.left) / zoom - seg.clientLeft + 'px',
    top: (r.top - box.top) / zoom - seg.clientTop + 'px',
    width: r.width / zoom + 'px',
    height: r.height / zoom + 'px',
  });
  Object.assign(pill.style, at(a), { background: cs.backgroundColor, borderRadius: cs.borderRadius });
  const staticPos = getComputedStyle(seg).position === 'static';
  if (staticPos) seg.style.position = 'relative';
  seg.prepend(pill);
  to.classList.add('seg-to');
  const done = () => {
    pill.remove();
    to.classList.remove('seg-to');
    if (staticPos) seg.style.position = '';
  };
  const anim = pill.animate([at(a), at(b)], { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
  anim.onfinish = done;
  anim.oncancel = done;
}

export function startSegSlide() {
  document.addEventListener(
    'click',
    (e) => {
      if (reduced()) return;
      const btn = e.target.closest?.('.seg > button');
      const seg = btn?.parentElement;
      // a group where several options can be on at once (.multi) has nothing to slide
      if (seg?.classList.contains('multi')) return;
      const from = seg?.querySelector(':scope > button.on');
      if (!from || from === btn) return;
      // Vue updates the classes in its next tick, after this click's handlers ran
      requestAnimationFrame(() => slide(seg, from));
    },
    true,
  );
}
