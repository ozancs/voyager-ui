// Pre-print check: before a print starts, compare the file's slicer metadata with the printer. Only facts that
// both sides report are compared; anything unknown (no Spoolman, no active spool, no weight, no metadata) is
// skipped, never guessed. Problems open a dialog (PreprintDialog.vue) with "Print anyway" and "Cancel".
// Every place that starts a print goes through startPrint().
import { state, S, toast, askConfirm } from './store';
import { api } from './api/moonraker';
import { t } from './i18n';
import { checkPrint } from './preprintCheck';

function context(meta) {
  const sensors = (state.objects || [])
    .filter((o) => /^filament_(switch|motion)_sensor /.test(o))
    .map((o) => ({ name: o.split(' ').pop(), enabled: S(o).enabled, detected: S(o).filament_detected }));
  return {
    meta,
    // no Spoolman or no active spool: the spool checks are skipped
    spool: state.spoolman.server && state.spoolman.spool?.id ? state.spoolman.spool : null,
    settings: S('configfile').settings || {},
    toolhead: S('toolhead'),
    sensors,
    multiMaterial: (state.objects || []).some((o) => o === 'mmu' || o === 'AFC'),
  };
}

async function start(filename) {
  try {
    await api.call('printer.print.start', { filename });
    toast(t('Print started'));
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}

// check the file, ask when something does not fit, then start. Resolves to true when the print started.
export async function startPrint(filename) {
  if (!filename) return false;
  if (state.settings.preprintCheck === false) return start(filename);
  let meta = null;
  try {
    meta = await api.call('server.files.metadata', { filename });
  } catch {
    // no metadata (file not scanned yet): nothing to compare, start as before
  }
  const issues = meta ? checkPrint(context(meta)) : [];
  if (!issues.length) return start(filename);
  state.preprint?.resolve(false); // an older question still open counts as "no"
  const go = await new Promise((resolve) => {
    const q = {
      id: Math.random(),
      filename,
      issues,
      resolve: (v) => {
        if (state.preprint?.id === q.id) state.preprint = null;
        resolve(v);
      },
    };
    state.preprint = q;
  });
  return go ? start(filename) : false;
}

// Reprint starts the same file again with one click: ask first, the last part may still be on the bed
export function askReprint(filename) {
  return askConfirm({
    title: t('Print again?'),
    text: t('{file} starts again. Take the last print off the bed first.', { file: filename.split('/').pop() }),
    ok: t('Print'),
  });
}
