// Keep the real selection on the button. A single highlight moves behind its label until it arrives.
const moving = new WeakMap();

function bounds(button) {
  // Offsets use the positioned group's own CSS pixels, even inside a zoomed page or a transformed dialog.
  return {
    left: button.offsetLeft + 'px',
    top: button.offsetTop + 'px',
    width: button.offsetWidth + 'px',
    height: button.offsetHeight + 'px',
  };
}

function slide(group, from) {
  const to = group.querySelector(':scope > button.on');
  const previous = moving.get(group);
  const start = bounds(from);
  if (previous) {
    // A second choice starts at the visible highlight, which may be between two buttons.
    const style = getComputedStyle(previous.pill);
    for (const key of Object.keys(start)) start[key] = style[key];
    previous.stop();
  }
  if (!to || !to.offsetWidth || !from.offsetWidth || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return;

  const end = bounds(to);
  const pill = document.createElement('span');
  pill.className = 'seg-pill';
  pill.setAttribute('aria-hidden', 'true');
  Object.assign(pill.style, end, { borderRadius: getComputedStyle(to).borderRadius });
  group.append(pill);
  group.setAttribute('data-seg-sliding', '');
  const animation = pill.animate([start, end], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
  const resize = new ResizeObserver(() => {
    const box = bounds(to);
    if (Object.keys(end).some((key) => box[key] !== end[key])) stop();
  });
  resize.observe(group);
  for (const button of group.querySelectorAll(':scope > button')) resize.observe(button);
  function stop() {
    if (moving.get(group)?.pill !== pill) return;
    moving.delete(group);
    resize.disconnect();
    animation.cancel();
    pill.remove();
    group.removeAttribute('data-seg-sliding');
  }
  moving.set(group, { pill, stop });
  animation.onfinish = animation.oncancel = stop;
}

export function startSegSlide() {
  if (!Element.prototype.animate) return;
  // Vue may switch the active class after a click, a keyboard action, or an asynchronous printer update.
  // Read the final selection once after the DOM update and before the browser paints.
  new MutationObserver((changes) => {
    const groups = new Map();
    for (const { target, oldValue } of changes) {
      if (target.localName !== 'button' || !oldValue?.split(/\s+/).includes('on') || target.classList.contains('on'))
        continue;
      const group = target.parentElement;
      if (group?.matches('.seg:not(.multi)') && group.isConnected && !groups.has(group)) groups.set(group, target);
    }
    for (const [group, from] of groups) slide(group, from);
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
}
