// Undo for deletes: the item disappears from the list at once, the real delete runs 10 seconds later. The toast in
// the corner shows the time left and an Undo button. Things that cannot be brought back (files, history jobs) are
// only hidden until then (hideKeys + isHidden); things that can (a saved printer, a webcam) are removed at once and
// put back by `undo`. Closing the page within the 10 seconds leaves the files as they were.
import { reactive } from 'vue';
import { toast, closeToast } from './store';
import { api } from './api/moonraker';
import { t } from './i18n';

export const UNDO_MS = 10000;
const hidden = reactive(new Set());
export const isHidden = (key) => hidden.has(key);

export function undoable(label, { commit, undo, hideKeys = [] } = {}) {
  hideKeys.forEach((k) => hidden.add(k));
  let settled = false;
  const unhide = () => hideKeys.forEach((k) => hidden.delete(k));
  const timer = setTimeout(async () => {
    if (settled) return;
    settled = true;
    closeToast(id);
    try {
      await commit?.();
    } catch (e) {
      toast(e.message, 'error');
    }
    unhide();
  }, UNDO_MS);
  const id = toast(label, 'info', {
    ms: 0,
    until: Date.now() + UNDO_MS,
    undo: () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeToast(id);
      unhide();
      undo?.();
      toast(t('Undone'));
    },
  });
  return id;
}

// the files of a folder that are still the ones the user deleted: a file uploaded again under the same name
// within the undo time (a re-slice from the slicer) has another modified time or size and is kept
export async function stillSame(dir, items) {
  try {
    const r = await api.call('server.files.get_directory', { path: dir, extended: false });
    const now = new Map([...(r.files || []).map((f) => [f.filename, f]), ...(r.dirs || []).map((d) => [d.dirname, d])]);
    return items.filter((it) => {
      const cur = now.get(it.name);
      if (!cur) return false; // already gone
      if (it.dir) return true;
      return cur.modified === it.modified && (it.size == null || cur.size === it.size);
    });
  } catch {
    return items;
  }
}
