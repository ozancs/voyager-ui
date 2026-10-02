// Pre-print check: before a print starts, compare the file's slicer metadata with the printer. Only facts that
// both sides report are compared; anything unknown (no Spoolman, no active spool, no weight, no metadata) is
// skipped, never guessed. Problems open a dialog (PreprintDialog.vue) with "Print anyway" and "Cancel".
// Every place that starts a print goes through startPrint().
import { state, S, toast, askConfirm } from './store';
import { api } from './api/moonraker';
import { t } from './i18n';
import { checkPrint } from './preprintCheck';
import { is3mf, isGcodeFile } from './gcode3mf';

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

// a .gcode.3mf is a zip: only firmware that unpacks it (QIDI and similar) can print it. Stock Moonraker does not
// read metadata from it, so no metadata means Klipper would get the zip bytes as G-code: refuse instead.
async function zipPrintable(filename) {
  if (!isGcodeFile(filename)) {
    // a model .3mf picked in Upload & Print: it is uploaded, but there is nothing to print in it
    toast(t('{name} is not sliced G-code, so it was not started.', { name: filename.split('/').pop() }), 'warn');
    return false;
  }
  if (!is3mf(filename)) return true;
  try {
    const m = await api.call('server.files.metadata', { filename });
    if (m && (m.estimated_time != null || m.slicer || m.layer_height != null)) return true;
  } catch {}
  toast(t('This printer does not read .gcode.3mf files. Send plain G-code from the slicer instead.'), 'warn', {
    ms: 9000,
  });
  return false;
}
async function start(filename) {
  if (!(await zipPrintable(filename))) return false;
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
