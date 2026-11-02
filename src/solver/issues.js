// Errors this printer ran into, kept for the Problem Solver: a Klipper shutdown or error state, a print that ended
// with an error, and console errors that have a guide. Each is kept once (the same message again only counts up),
// raises one notification with a Solve button, and stays listed on the Problem Solver page until it is marked as
// solved, which also takes the notification away. Kept in the settings (Moonraker's database), so every browser
// sees the same list. Errors that are only a wrong command (Unknown command, Must home first...) are not kept.
// Dismissing the notification keeps the issue listed but quiet: it is raised again only when the error happens
// again, not when a page is reloaded while Klipper still shows the same error.
import { watch } from 'vue';
import { state, S, notify, unnotify } from '../store';
import { go } from '../router';
import { t } from '../i18n';
import { forError } from './problems';

const SKIP =
  /^(disconnected|error|shutdown|startup|ready)$|Unknown command|Must home axis first|must home|Move out of range|Extrude below minimum temp|Extrude only move too long|Shutdown due to webhooks request|Emergency stop/i;
const MAX = 30;
// one id per message, numbers and quoted names kept (an MCU name tells boards apart), timestamps dropped
export function issueId(msg) {
  const s = String(msg)
    .split('\n')[0]
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '')
    .trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 'i' + (h >>> 0).toString(36);
}
const list = () => state.settings.issues || [];
export const openIssues = () => list().filter((x) => !x.solved);

// again: false when the error is only seen again (a page loaded while Klipper still shows it), not a new time
export function recordIssue(msg, source, again = true) {
  msg = String(msg || '').trim();
  if (!msg || SKIP.test(msg)) return null;
  const p = forError(msg);
  // console errors only when a guide knows them; a shutdown or a failed print always
  if (source === 'console' && !p) return null;
  const id = issueId(msg);
  const now = Date.now();
  const all = list();
  const old = all.find((x) => x.id === id);
  if (old && !old.solved) {
    if (!again || now - old.at < 5000) return old; // still the same one, or reported by two paths at once
    state.settings.issues = all.map((x) =>
      x.id === id ? { ...x, at: now, count: (x.count || 1) + 1, quiet: undefined } : x,
    );
  } else {
    const it = { id, msg: msg.slice(0, 600), source, problem: p?.id || null, at: now, count: 1 };
    state.settings.issues = [it, ...all.filter((x) => x.id !== id)].slice(0, MAX);
  }
  raise(state.settings.issues.find((x) => x.id === id));
  return id;
}
function raise(it) {
  if (it.quiet) return;
  const p = forError(it.msg);
  notify('issue:' + it.id, (p ? t(p.name) + ': ' : '') + it.msg.split('\n')[0].slice(0, 160), 'error', {
    label: t('Solve'),
    run: () => go('solver', it.id),
  });
}
export function solveIssue(id) {
  state.settings.issues = list().map((x) => (x.id === id ? { ...x, solved: Date.now() } : x));
  unnotify('issue:' + id);
}

// watch the printer: Klipper stopping with a message, and a print ending in an error
export function startIssues() {
  // the error Klipper shows when the page connects is not a new one when it is already listed: only after Klipper
  // was seen running (ready or starting) does an error count as happening again
  let ran = false;
  watch(
    () => [state.klippy, state.klippyMessage],
    ([k, m]) => {
      if ((k === 'shutdown' || k === 'error') && m) recordIssue(m, 'klippy', ran);
      if (k === 'ready' || k === 'startup') ran = true;
    },
  );
  watch(
    () => [S('print_stats').state, S('print_stats').message],
    ([st, m], old) => {
      if (st === 'error' && m && old?.[0] !== 'error')
        recordIssue(m, 'print', ['printing', 'paused'].includes(old?.[0]));
    },
  );
  // the open ones come back as notifications after a reload
  let done = false;
  watch(
    () => state.settingsLoaded,
    (ok) => {
      if (!ok || done) return;
      done = true;
      for (const it of openIssues()) raise(it);
    },
    { immediate: true },
  );
}
