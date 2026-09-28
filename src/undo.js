// Undo for deletes: the item disappears from the list at once, the real delete runs 10 seconds later. The toast in
// the corner shows the time left and an Undo button. Things that cannot be brought back (files, history jobs) are
// only hidden until then (hideKeys + isHidden); things that can (a saved printer, a webcam) are removed at once and
// put back by `undo`. Closing the page within the 10 seconds leaves the files as they were.
import { reactive } from 'vue';
import { toast, closeToast } from './store';
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
