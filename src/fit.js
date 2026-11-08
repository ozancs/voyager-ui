// v-fit: when a dashboard card is only a little too small for its content, shrink the content (CSS zoom) instead of
// showing a scrollbar. Up to 25% smaller; beyond that the card stays at 75% and scrolls (it used to jump back to
// 100%, so opening something inside a card, like an MMU gate menu, suddenly blew the whole card up). Measured on the card itself and on
// inner scroll areas marked data-fit (the temperatures table). Console logs and editors are not touched.
// Cards marked data-scale (controls: toolhead, extruder, system loads...) keep shrinking as a whole, much further.
const MIN = 0.75,
  MIN_SCALE = 0.35;
function measure(card) {
  let need = 1;
  const cH = card.clientHeight,
    cW = card.clientWidth;
  if (!cH || !cW) return 1;
  need = Math.max(need, (card.scrollHeight - 1) / cH, (card.scrollWidth - 1) / cW);
  for (const el of card.querySelectorAll('[data-fit]')) {
    const extra = Math.max(0, el.scrollHeight - el.clientHeight - 1);
    if (extra) need = Math.max(need, (cH + extra) / cH);
    const extraW = Math.max(0, el.scrollWidth - el.clientWidth - 1);
    if (extraW) need = Math.max(need, (cW + extraW) / cW);
  }
  return need;
}
// the header on one row: when its buttons would wrap to a second row (a card made narrow), they show only their
// icons (hd-tight), and when that is still too wide, the header's optional extras ([data-opt]) go too (hd-tighter).
// Checked at zoom 1, before the card is measured. The classes go on the card: the cell's own class is watched.
function wraps(hd) {
  const els = [...hd.children, ...hd.querySelectorAll(':scope > .acts > *')].filter((e) => e.offsetHeight);
  const mids = els
    .filter((e) => !e.classList.contains('acts'))
    .map((e) => {
      const r = e.getBoundingClientRect();
      return r.top + r.height / 2;
    });
  return mids.length > 1 && Math.max(...mids) - Math.min(...mids) > 8;
}
function fitHeader(card) {
  const hd = card.querySelector(':scope > .card-h');
  card.classList.remove('hd-tight', 'hd-tighter');
  if (!hd) return;
  const acts = hd.querySelector(':scope > .acts');
  // too wide: on two rows, or cut (a narrow card keeps them on one row and hides what does not fit)
  const cut = () => {
    const kids = acts ? [...acts.children].filter((e) => e.offsetWidth) : [];
    if (!kids.length) return false;
    const r = acts.getBoundingClientRect();
    // right aligned, what does not fit sticks out on the left
    return kids.some((e) => {
      const k = e.getBoundingClientRect();
      return k.right > r.right + 1 || k.left < r.left - 1;
    });
  };
  // or simply wider than the header (a folded card: nothing wraps there, the overflow is hidden instead)
  const over = () => wraps(hd) || cut() || hd.scrollWidth > hd.clientWidth + 1;
  if (!over()) return;
  card.classList.add('hd-tight');
  if (over()) card.classList.add('hd-tighter');
}
function fit(cell) {
  const card = cell.querySelector(':scope > .card, :scope > * > .card, :scope > .card, .card');
  if (!card) return;
  if (cell.classList.contains('collapsed')) {
    // only the header shows: nothing to zoom (a zoomed header would slide away from the chevron), but the header
    // itself still has to fit, so its extras give way and the chevron stays in view
    card.style.zoom = '';
    card.classList.remove('fitted');
    fitHeader(card);
    return;
  }
  const min = cell.hasAttribute('data-scale') ? MIN_SCALE : MIN;
  const cur = parseFloat(card.style.zoom) || 1;
  // measure at zoom 1 so the result does not drift
  card.style.zoom = '';
  card.style.overflowY = '';
  for (const el of card.querySelectorAll('[data-fit]')) el.style.overflowY = '';
  fitHeader(card);
  const need = measure(card);
  let z = 1;
  if (need > 1.005) z = 1 / need;
  if (z < min) z = min; // too much: smallest size, the rest scrolls
  z = Math.floor(z * 200) / 200;
  card.style.zoom = z === 1 ? '' : String(z);
  // smaller text can wrap differently: check again and step down while it still does not fit
  for (let k = 0; k < 4 && z > min && measure(card) > 1.002; k++) {
    z = Math.max(min, Math.floor((z - 0.02) * 200) / 200);
    card.style.zoom = String(z);
  }
  // and the other way: zoomed out, a card has more room inside and its content reflows (fields side by side
  // instead of below each other), so a larger zoom may fit too. Find the largest one that does.
  if (z < 1 && measure(card) <= 1.002) {
    let lo = z,
      hi = 1;
    for (let k = 0; k < 6; k++) {
      const mid = (lo + hi) / 2;
      card.style.zoom = String(mid);
      if (measure(card) <= 1.002) lo = mid;
      else hi = mid;
    }
    z = Math.floor(lo * 200) / 200;
    card.style.zoom = z >= 1 ? '' : String(z);
  }
  // a pixel or two left over (rounding) would only show an empty scrollbar
  for (const el of [card, ...card.querySelectorAll('[data-fit]')])
    if (el.scrollHeight > el.clientHeight && el.scrollHeight - el.clientHeight <= 3) el.style.overflowY = 'hidden';
  if (z !== cur) card.classList.toggle('fitted', z !== 1);
}
export const vfit = {
  mounted(el) {
    let t;
    const run = () => {
      cancelAnimationFrame(t);
      t = requestAnimationFrame(() => fit(el));
      el.__t = t;
    };
    el.__fit = run;
    el.__ro = new ResizeObserver(run);
    el.__ro.observe(el);
    el.__mo = new MutationObserver(run);
    el.__mo.observe(el, { childList: true, subtree: true, characterData: true });
    el.__co = new MutationObserver(run); // the cell's own class: collapsed on / off
    el.__co.observe(el, { attributes: true, attributeFilter: ['class'] });
    run();
  },
  updated(el) {
    el.__fit && el.__fit();
  },
  unmounted(el) {
    el.__ro?.disconnect();
    el.__mo?.disconnect();
    el.__co?.disconnect();
    cancelAnimationFrame(el.__t);
  },
};
