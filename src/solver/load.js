// Problem Solver: reading a file for facts.js. Moonraker's metadata, and the slicer's settings block from the end
// of the file (a Range request, so a large file is not downloaded whole; without Range support only files up to
// 8 MB are read). Nothing is written or sent to the printer.
import { api } from '../api/moonraker';
import { parseSlicerConfig } from './facts';
import { is3mf, readGcodeText } from '../gcode3mf';

const TAIL = 256 * 1024,
  WHOLE = 8 * 1024 * 1024;
async function tail(path, size) {
  if (is3mf(path)) return size && size <= WHOLE ? (await readGcodeText(api, path)).slice(-TAIL) : '';
  const url = `/server/files/gcodes/${path.split('/').map(encodeURIComponent).join('/')}`;
  const r = await api.fetch(url, { headers: { Range: `bytes=-${TAIL}` } });
  if (r.status === 206) return r.text();
  if (!r.ok) return '';
  const len = +r.headers.get('content-length') || size || 0;
  if (len > WHOLE) {
    r.body?.cancel?.();
    return '';
  }
  return (await r.text()).slice(-TAIL);
}
// { meta, cfg, modified } for a file in gcodes/, meta null when the file is not there
export async function readFile(path) {
  let meta = null;
  try {
    meta = await api.call('server.files.metadata', { filename: path });
  } catch {
    return { meta: null, cfg: {}, modified: null };
  }
  let cfg = {};
  try {
    cfg = parseSlicerConfig(await tail(path, meta.size));
  } catch {}
  return { meta, cfg, modified: meta.modified ?? null };
}
