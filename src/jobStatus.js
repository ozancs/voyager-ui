// How a print job's end (Moonraker history status) is shown: colour and icon. Used by History and by the status
// mark next to each file in G-code Files. The text is t(status with the underscore as a space).
export const JOB_STATUS = {
  completed: { c: 'var(--ok)', i: 'check' },
  cancelled: { c: 'var(--wn)', i: 'x' },
  error: { c: 'var(--dg)', i: 'warn' },
  klippy_shutdown: { c: 'var(--dg)', i: 'warn' },
  klippy_disconnect: { c: 'var(--dg)', i: 'warn' },
  interrupted: { c: 'var(--dg)', i: 'warn' },
  server_exit: { c: 'var(--dg)', i: 'warn' },
  in_progress: { c: 'var(--bl)', i: 'play' },
};
export const jobStatus = (s) => JOB_STATUS[s] || { c: 'var(--mu)', i: 'info' };

// The print history by file: for each file (path from the gcodes root) how often it printed to the end and its
// latest job. `jobs` newest first, as server.history.list gives them.
export function jobsByFile(jobs) {
  const m = {};
  for (const j of jobs || []) {
    const e = (m[j.filename] ||= { done: 0, last: j });
    if (j.status === 'completed') e.done++;
  }
  return m;
}
