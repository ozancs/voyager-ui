// Lock: a read-only mode for this browser, for a tablet next to the printer, children or a shared workshop.
// While locked, everything that would move, heat, print, restart or change files is refused in the Moonraker
// client (api.lockedMsg), so no button can get around it. E-STOP keeps working. An optional PIN is asked to
// unlock. It keeps hands off the buttons; it is not a login (clearing the browser's site data removes it).
import { watch } from 'vue';
import { state } from './store';
import { api } from './api/moonraker';
import { t } from './i18n';

const KEY = 'voyager-ui-lock';
async function hash(pin) {
  const s = 'voyager-lock:' + pin;
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    // http pages on some browsers have no crypto.subtle: a plain checksum is enough for a deterrent
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
    return 'x' + h;
  }
}
function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}
const saved = read();
state.locked = !!saved?.on;
export const lockHasPin = () => !!read()?.pin;

export async function lockUi(pin = '') {
  pin = String(pin || '').trim();
  const v = { on: true, pin: pin ? await hash(pin) : '' };
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
  state.locked = true;
}
// true when unlocked; false when the PIN is wrong
export async function unlockUi(pin = '') {
  const cur = read();
  if (cur?.pin && (await hash(String(pin || '').trim())) !== cur.pin) return false;
  try {
    localStorage.removeItem(KEY);
  } catch {}
  state.locked = false;
  return true;
}

// locked or unlocked in another tab of this browser
window.addEventListener('storage', (e) => {
  if (e.key === KEY) state.locked = !!read()?.on;
});

api.lockedMsg = () => (state.locked ? t('Controls are locked. Unlock them with the lock button at the top.') : null);
watch(
  () => state.locked,
  (v) => document.documentElement.classList.toggle('locked', v),
  { immediate: true },
);
