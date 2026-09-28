// Tablet mode, for a tablet or touch screen that stays next to the printer: larger touch targets, no hover
// tooltips, full screen and the screen kept on (Wake Lock) while the page is visible. Kept per browser.
import { watch } from 'vue';
import { state } from './store';

const KEY = 'voyager-ui-tablet';
try {
  state.tablet = localStorage.getItem(KEY) === '1';
} catch {}

let lock = null;
async function wake() {
  if (!state.tablet || document.hidden || lock || !navigator.wakeLock) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => (lock = null));
  } catch {}
}
document.addEventListener('visibilitychange', wake);

// called from a click (browsers allow full screen only then)
export function setTablet(on) {
  state.tablet = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {}
  const d = document.documentElement;
  if (on) d.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
export const toggleFullscreen = () =>
  document.fullscreenElement
    ? document.exitFullscreen?.().catch(() => {})
    : document.documentElement.requestFullscreen?.().catch(() => {});

watch(
  () => state.tablet,
  (on) => {
    document.documentElement.classList.toggle('tablet', on);
    if (on) wake();
    else lock?.release().catch(() => {});
  },
  { immediate: true },
);
