// Moving files between folders and uploading whole folders, for every file list (G-code files, the config file
// browser): dragging rows onto a folder, "Move to…" with a folder picker, and folders dropped or picked from the
// computer with everything inside.
import { api } from './api/moonraker';
import { toast } from './store';
import { t } from './i18n';
import { nameTaken } from './fileNames';

// the files a drop brings, folders opened up: [{ file, dir }] where dir is the folder inside the dropped one
// ('' for a file dropped on its own). Falls back to the flat file list when the browser cannot open folders.
export async function droppedFiles(dt) {
  const items = [...(dt?.items || [])];
  const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...(dt?.files || [])].map((file) => ({ file, dir: '' }));
  const out = [];
  const readAll = (reader) =>
    new Promise((res) => {
      const all = [];
      const next = () =>
        reader.readEntries(
          (batch) => (batch.length ? (all.push(...batch), next()) : res(all)),
          () => res(all),
        );
      next();
    });
  async function walk(entry, dir) {
    if (entry.isFile) {
      const file = await new Promise((res) => entry.file(res, () => res(null)));
      if (file) out.push({ file, dir });
    } else if (entry.isDirectory) {
      const sub = dir ? dir + '/' + entry.name : entry.name;
      for (const e of await readAll(entry.createReader())) await walk(e, sub);
    }
  }
  for (const e of entries) await walk(e, '');
  return out;
}
// files picked with the folder picker (<input webkitdirectory>): their folder comes with each of them
export const pickedFolderFiles = (list) =>
  [...(list || [])].map((file) => ({
    file,
    dir: (file.webkitRelativePath || '').split('/').slice(0, -1).join('/'),
  }));

// move `names` (files or folders) from the folder `from` to the folder `to` (both full paths, 'gcodes/parts').
// A name already in the target is left where it is and said so. Returns how many moved.
export async function moveItems(from, names, to) {
  if (!names.length || from === to) return 0;
  let moved = 0;
  for (const n of names) {
    // a folder cannot go into itself or a folder inside it
    if (to === from + '/' + n || to.startsWith(from + '/' + n + '/')) {
      toast(t('{name} cannot be moved into itself.', { name: n }), 'error');
      continue;
    }
    if (await nameTaken(to, n)) {
      toast(t('{name} already exists in this folder.', { name: n }), 'error');
      continue;
    }
    try {
      await api.call('server.files.move', { source: `${from}/${n}`, dest: `${to}/${n}` });
      moved++;
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  if (moved) toast(t('{n} moved to /{dir}', { n: moved, dir: to }));
  return moved;
}

// rows dragged inside the page carry this type (a drag from the computer carries 'Files' instead)
export const DRAG_TYPE = 'application/x-voyager-files';
export const isRowDrag = (e) => [...(e.dataTransfer?.types || [])].includes(DRAG_TYPE);
