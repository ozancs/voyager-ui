// Writing option values into the printer's .cfg files: finds the file that has the section (printer.cfg first,
// then the files it includes, in Klipper's order; files Klipper does not load are never touched), changes the line with setOption (the SAVE_CONFIG block wins when the option is
// there), saves a backup of each file first and uploads it. Klipper needs a restart to use the new values.
import { api } from './api/moonraker';
import { backupBeforeWrite } from './store';
import { setOption, hasSection, includedFiles } from './cfgedit';

const url = (fn) => `/server/files/config/${fn.split('/').map(encodeURIComponent).join('/')}`;

async function cfgFiles(texts) {
  const r = await api.call('server.files.list', { root: 'config' });
  const all = r.map((f) => f.path).filter((p) => /\.cfg$/.test(p));
  return includedFiles(all, (fn) => api.getText(url(fn)), texts);
}

// changes: [{ section, key, value }]. Returns [{ section, key, value, file, where } or { ..., error }]
export async function writeOptions(changes) {
  const texts = {},
    dirty = new Set(),
    log = [];
  const files = await cfgFiles(texts);
  for (const c of changes) {
    // an emptied field would write "key:" and Klipper would not start
    if (c.value == null || String(c.value).trim() === '') {
      log.push({ ...c, error: 'empty value, not written' });
      continue;
    }
    let done = false;
    for (const fn of files) {
      if (texts[fn] === undefined) texts[fn] = await api.getText(url(fn));
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
    if (!done) log.push({ ...c, error: 'section not found in printer.cfg or the files it includes' });
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
