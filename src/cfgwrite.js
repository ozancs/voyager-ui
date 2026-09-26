// Writing option values into the printer's .cfg files: finds the file that has the section (printer.cfg first,
// then the other .cfg files), changes the line with setOption (the SAVE_CONFIG block wins when the option is
// there), saves a backup of each file first and uploads it. Klipper needs a restart to use the new values.
import { api } from './api/moonraker';
import { backupBeforeWrite } from './store';
import { setOption, hasSection } from './cfgedit';

async function cfgFiles() {
  const r = await api.call('server.files.list', { root: 'config' });
  const all = r
    .map((f) => f.path)
    .filter((p) => /\.cfg$/.test(p) && !/^printer-\d{8}_\d{6}\.cfg$/.test(p) && !/(backup|bak|pre_|pre-)/i.test(p));
  return ['printer.cfg', ...all.filter((p) => p !== 'printer.cfg')];
}

// changes: [{ section, key, value }]. Returns [{ section, key, value, file, where } or { ..., error }]
export async function writeOptions(changes) {
  const files = await cfgFiles();
  const texts = {},
    dirty = new Set(),
    log = [];
  for (const c of changes) {
    let done = false;
    for (const fn of files) {
      if (texts[fn] === undefined)
        texts[fn] = await api.getText(`/server/files/config/${fn.split('/').map(encodeURIComponent).join('/')}`);
      if (!hasSection(texts[fn], c.section)) continue;
      const r = setOption(texts[fn], c.section, c.key, c.value);
      if (r) {
        texts[fn] = r.text;
        dirty.add(fn);
        log.push({ ...c, file: fn, where: r.where });
        done = true;
        break;
      }
    }
    if (!done) log.push({ ...c, error: 'section not found in any .cfg' });
  }
  for (const fn of dirty) {
    await backupBeforeWrite('config', fn);
    await api.upload(new Blob([texts[fn]], { type: 'text/plain' }), {
      root: 'config',
      path: fn.split('/').slice(0, -1).join('/'),
      name: fn.split('/').pop(),
    });
  }
  return log;
}
