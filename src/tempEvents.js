// Moments worth marking on the temperature graph: a print starting, pausing, resuming, finishing, being cancelled
// or failing, and Klipper shutting down. Kept a day, in this browser, per printer (like the long temperature
// history), so the 1h / 6h / 24h ranges can show them. Only changes seen while the page is open are recorded: the
// state found when the page loads is not an event.
import { reactive, watch } from 'vue';

export const MAX_AGE = 24 * 3600;
export const tempEvents = reactive([]); // { ts (seconds), kind, text }
let key = 'voyager-ui-tempevents';

function save() {
  try {
    localStorage.setItem(key, JSON.stringify(tempEvents));
  } catch {}
}
function trim() {
  const cut = Date.now() / 1000 - MAX_AGE;
  let i = 0;
  while (i < tempEvents.length && tempEvents[i].ts < cut) i++;
  if (i) tempEvents.splice(0, i);
  if (tempEvents.length > 300) tempEvents.splice(0, tempEvents.length - 300);
}
export function addTempEvent(kind, text = '') {
  const ts = Math.floor(Date.now() / 1000);
  const last = tempEvents[tempEvents.length - 1];
  if (last && last.kind === kind && ts - last.ts < 5) return; // the same change reported twice
  tempEvents.push({ ts, kind, text: String(text || '').slice(0, 120) });
  trim();
  save();
}

// printState(), klippy() and klippyMessage() read the store; passed in so this module does not import it
export function startTempEvents(storageKey, { printState, klippy, klippyMessage }) {
  key = storageKey || key;
  tempEvents.splice(0);
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(raw))
      for (const e of raw) if (e && Number.isFinite(e.ts) && typeof e.kind === 'string') tempEvents.push(e);
  } catch {}
  trim();
  watch(printState, (s, prev) => {
    if (!s || !prev || s === prev) return; // nothing known yet: the page just loaded
    if (s === 'printing') addTempEvent(prev === 'paused' ? 'resume' : 'start');
    else if (s === 'paused') addTempEvent('pause');
    else if (s === 'complete') addTempEvent('done');
    else if (s === 'cancelled') addTempEvent('cancel');
    else if (s === 'error') addTempEvent('error', klippyMessage());
  });
  watch(klippy, (k, prev) => {
    if (prev === 'ready' && (k === 'shutdown' || k === 'error'))
      addTempEvent('error', (klippyMessage() || '').split('\n')[0]);
  });
}
