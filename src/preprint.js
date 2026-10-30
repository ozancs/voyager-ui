// Starting a print: every place that starts one goes through startPrint(), which asks in the start dialog
// (PreprintDialog.vue). The pre-print check compares the file's slicer metadata with the printer; only facts that
// both sides report are compared, anything unknown (no Spoolman, no active spool, no weight, no metadata) is
// skipped, never guessed.
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

// Every start opens the start dialog (PreprintDialog.vue, like Mainsail's): the thumbnail and the file's numbers,
// the timelapse switch when moonraker-timelapse is installed, and whatever the check found that does not fit. A
// reprint also says to clear the bed. `confirm: false` (Upload & Print, like Mainsail) skips the dialog unless the
// check found something. Resolves to true when the print started.
export async function startPrint(filename, { reprint = false, confirm = true } = {}) {
  if (!filename) return false;
  let meta = null;
  try {
    meta = await api.call('server.files.metadata', { filename });
  } catch {
    // no metadata (file not scanned yet): nothing to show or compare
  }
  const issues = meta && state.settings.preprintCheck !== false ? checkPrint(context(meta)) : [];
  if (!confirm && !issues.length) return start(filename);
  state.preprint?.resolve(false); // an older question still open counts as "no"
  const go = await new Promise((resolve) => {
    const q = {
      id: Math.random(),
      filename,
      meta,
      reprint,
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

// Uploading over a file that is already there: ask first, or give the new one a numbered name. Returns the name
// to upload under, or null when the user cancelled. `dir` is the folder inside gcodes ('' for the root).
export async function uploadName(name, dir = '') {
  let list;
  try {
    list = (await api.call('server.files.get_directory', { path: 'gcodes' + (dir ? '/' + dir : '') })).files || [];
  } catch {
    return name; // no listing: upload as before
  }
  const names = new Set(list.map((f) => f.filename));
  if (!names.has(name)) return name;
  const m = /^(.*?)(\.[^.]+(?:\.3mf)?)$/.exec(name) || [null, name, ''];
  let k = 2,
    alt = `${m[1]} (${k})${m[2]}`;
  while (names.has(alt)) alt = `${m[1]} (${++k})${m[2]}`;
  const choice = await askConfirm({
    title: t('File exists'),
    text: t('{name} is already on the printer. Replace it, or keep both as {alt}?', { name, alt }),
    ok: t('Replace'),
    alt: t('Keep both'),
  });
  return choice === 'alt' ? alt : choice ? name : null;
}
