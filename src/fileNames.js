// Moonraker's move, copy and upload put a file over one that is already there without asking: a new file, a
// duplicate or a rename under a name in use would wipe the other file. So the folder is looked at first.
import { api } from './api/moonraker';

// true when the folder `dir` (a full path: 'config', 'gcodes/parts') already has a file or a folder called `name`
export async function nameTaken(dir, name) {
  try {
    const r = await api.call('server.files.get_directory', { path: dir, extended: false });
    return (r?.files || []).some((f) => f.filename === name) || (r?.dirs || []).some((d) => d.dirname === name);
  } catch {
    return false; // the folder could not be read: nothing to compare with, Moonraker decides
  }
}
