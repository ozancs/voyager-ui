// v-away="fn": calls fn when the user clicks or taps anywhere outside the element, or presses Escape. Pop-ups
// that only closed on mouseleave stayed open on touch screens; this closes them everywhere. Clicks older than
// the mount (the one that opened the pop-up) are ignored. Escape is left to a dialog that is open on top.
export const away = {
  // v-away:name="fn" leaves clicks on [data-away="name"] alone: that is the button that toggles the pop-up, and
  // closing here first made its own click open the pop-up again
  mounted(el, { value, arg }) {
    const t0 = performance.now();
    el.__awayFn = value;
    el.__away = (e) => {
      if (arg && e.target.closest?.(`[data-away="${arg}"]`)) return;
      if (e.timeStamp > t0 && !el.contains(e.target) && typeof el.__awayFn === 'function') el.__awayFn(e);
    };
    document.addEventListener('click', el.__away, true);
    el.__esc = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.ov')) return;
      if (typeof el.__awayFn === 'function') el.__awayFn(e);
    };
    window.addEventListener('keydown', el.__esc);
  },
  updated(el, { value }) {
    el.__awayFn = value;
  },
  unmounted(el) {
    document.removeEventListener('click', el.__away, true);
    window.removeEventListener('keydown', el.__esc);
    delete el.__away;
    delete el.__esc;
  },
};
