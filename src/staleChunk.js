// A page left open while the UI files are replaced (an update, or a reinstall of the same version that the
// version check does not reload for) still runs the old code, and the pieces it loads later (pages, the
// changelog) have file names that no longer exist. Loading the page again picks up the new files. The
// session timestamp keeps a real outage (printer offline) from turning into a reload loop.
const KEY = 'voyager-ui-chunk-reload';
export function reloadForStaleChunk() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 60000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}
