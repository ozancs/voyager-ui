// v-away="fn": calls fn when the user clicks or taps anywhere outside the element. Pop-ups that only
// closed on mouseleave stayed open on touch screens; this closes them everywhere. Clicks older than the
// mount (the one that opened the pop-up) are ignored.
export const away = {
  mounted(el, { value }) {
    const t0 = performance.now();
    el.__awayFn = value;
    el.__away = (e) => {
      if (e.timeStamp > t0 && !el.contains(e.target) && typeof el.__awayFn === 'function') el.__awayFn(e);
    };
    document.addEventListener('click', el.__away, true);
  },
  updated(el, { value }) {
    el.__awayFn = value;
  },
  unmounted(el) {
    document.removeEventListener('click', el.__away, true);
    delete el.__away;
  },
};
