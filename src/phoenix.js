// Phoenix print recovery (a separate Klipper module, github: phoenix-for-klipper). Shown only on printers that
// have the `phoenix` object; its status arrives with the rest of the subscription (every listed object is
// subscribed in store.js). The UI only reads that status and sends the module's own commands, one per button:
// opening a toast, the wizard or a step never moves, heats or resumes anything.
// API v1 contract: phoenix-for-klipper/docs/API.md.
import { computed, watch } from 'vue';
import { state, S, toast, closeToast, notify, unnotify } from './store';
import { currentHost } from './printers';
import { t } from './i18n';

export const API = 1;
export const CHECKS = Object.freeze([
  'bed_attached',
  'axes_unmoved',
  'plate_unmoved',
  'nozzle_free',
  'path_clear',
  'uncertainty_accepted',
]);

export const ph = computed(() => S('phoenix'));
export const hasPhoenix = computed(() => (state.objects || []).includes('phoenix'));
// an api_version this UI was not written for: show what it says, send nothing
export const phoenixKnown = computed(() => ph.value.api_version === API);

// ---- commands: built only from fixed words and checked numbers, never from file names or error text ----
export function checkCommand(item, checked) {
  if (!CHECKS.includes(item) || typeof checked !== 'boolean') throw new Error('Invalid checklist input');
  return `PHOENIX_CHECK ITEM=${item} VALUE=${checked ? 1 : 0}`;
}
export function selectCommand(index) {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid checkpoint index');
  return `PHOENIX_SELECT INDEX=${index}`;
}
export const allChecked = (s) => CHECKS.every((k) => s?.checks?.[k] === true);
export function canPrepare(s) {
  return s?.api_version === API && s.phase === 'detected' && !s.busy && !!s.profile_ready && allChecked(s);
}
export function canResume(s, cleaned, pathClear) {
  return s?.api_version === API && s.phase === 'prepared' && !s.busy && cleaned === true && pathClear === true;
}
// setup (backend 0.2, same API): the park point and the slicer acknowledgement; idle only, no motion or heat
export const SETUP_RECHECK = 'PHOENIX_SETUP PROMPT=0';
export const SETUP_SLICER = 'PHOENIX_SETUP_SLICER CONFIRM=1';
export function setupProfileCommand(s, { x, y, clearance, useCurrent = false, confirmed = false }) {
  if (s?.api_version !== API || s.phase !== 'idle' || s.busy || confirmed !== true) {
    throw new Error('Setup requires idle state and explicit profile confirmation');
  }
  const xy = useCurrent ? [] : [x, y];
  if (xy.some((v) => !Number.isFinite(v))) throw new Error('Invalid park coordinates');
  if (!Number.isFinite(clearance) || clearance <= 0) throw new Error('Invalid clearance');
  return `PHOENIX_SETUP_PROFILE ${useCurrent ? 'USE_CURRENT=1' : `X=${x} Y=${y}`} CLEARANCE=${clearance} CONFIRM=1`;
}
export const openSetup = () => (state.phoenixSetupOpen = true);
export const PREPARE = 'PHOENIX_PREPARE';
export const RESUME = 'PHOENIX_RESUME CLEANED=1 PATH_CLEAR=1';
export const DISCARD = 'PHOENIX_DISCARD CONFIRM=1';

// ---- the alert: once per printer + job + phase + error ----
// Kept in sessionStorage, so a reload, a reconnect or a status update does not bring the same toast back; a new
// job, another phase or another printer (another address) does.
const SEEN = 'voyager-ui-phoenix-seen';
function seen() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN) || '[]'));
  } catch {
    return new Set();
  }
}
function remember(key) {
  const s = seen();
  s.add(key);
  try {
    sessionStorage.setItem(SEEN, JSON.stringify([...s].slice(-50)));
  } catch {}
}
let toastId = null;
export const openWizard = () => (state.phoenixOpen = true);

export function startPhoenix() {
  watch(
    () => {
      const s = ph.value;
      return hasPhoenix.value && s.api_version != null ? [s.api_version, s.phase, s.job_id, s.error] : null;
    },
    (v) => {
      if (!v) return;
      const [ver, phase, job, err] = v;
      // a recovery already under way (after a reload or on another device): a way back into the wizard
      const going = ['preparing', 'prepared', 'heating', 'returning'].includes(phase);
      if (!going && !['detected', 'blocked'].includes(phase)) {
        // recovered, discarded or a new print: the old alert has nothing left to say
        unnotify('phoenix:');
        if (toastId) closeToast(toastId);
        toastId = null;
        return;
      }
      const key = JSON.stringify([currentHost() || location.host, job, going ? 'going' : phase, err || '']);
      const blocked = phase === 'blocked';
      const msg = blocked
        ? t('Print recovery needs attention')
        : going
          ? t('Print recovery in progress')
          : t('Interrupted print detected');
      const hint =
        ver !== API
          ? t('Phoenix API version {v} is not supported by this Voyager version.', { v: ver })
          : blocked
            ? err || t('Recovery stopped. Review the printer before doing anything else.')
            : going
              ? t('Open it to see the current step.')
              : t('Possible power loss or restart. Review the print before recovering it.');
      const action = { label: t('Review recovery'), run: openWizard };
      unnotify('phoenix:');
      notify('phoenix:' + key, msg + ': ' + hint, blocked ? 'error' : going ? 'info' : 'warn', action);
      if (seen().has(key)) return;
      remember(key);
      if (toastId) closeToast(toastId);
      toastId = null;
      if (state.phoenixOpen) return; // the wizard is open and already shows it
      toastId = toast(msg, blocked ? 'error' : going ? 'info' : 'warn', { hint, ms: 0, action });
    },
    { immediate: true },
  );
}
