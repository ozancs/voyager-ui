// Pre-print check: before a print starts, compare the file's slicer metadata with the printer. Only facts that
// both sides report are compared; anything unknown (no Spoolman, no active spool, no weight, no metadata) is
// skipped, never guessed. Problems open a dialog (PreprintDialog.vue) with "Print anyway" and "Cancel".
// Every place that starts a print goes through startPrint().
import { state, S, toast } from './store';
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
  const go = await new Promise((resolve) => (state.preprint = { filename, issues, resolve }));
  state.preprint = null;
  return go ? start(filename) : false;
}
