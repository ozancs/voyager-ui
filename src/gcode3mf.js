// Printable file names, and reading the G-code out of a .gcode.3mf (OrcaSlicer and Bambu Studio can send the
// sliced plate as a zip: Metadata/plate_1.gcode plus a thumbnail and an md5). Klipper runs the file through
// Moonraker as is; the viewer and the object map need the text inside, so the zip is opened in the browser.

// a plain .3mf is a model project, not sliced: only .gcode.3mf counts as printable
export const GCODE_RE = /\.(gcode|g|gco|ufp|nc|gcode\.3mf)$/i;
export const isGcodeFile = (name) => GCODE_RE.test(name || '');
export const is3mf = (name) => /\.gcode\.3mf$/i.test(name || '');
export const UPLOAD_ACCEPT = '.gcode,.g,.gco,.ufp,.nc,.3mf'; // the picker cannot filter on a double extension

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

// entries of a zip held in memory: { name, method, size, csize, offset(local header) }
function zipEntries(b) {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65536); i--)
    if (u32(b, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('not a zip file');
  const n = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out = [];
  const dec = new TextDecoder();
  for (let k = 0; k < n && u32(b, p) === 0x02014b50; k++) {
    const nl = u16(b, p + 28),
      el = u16(b, p + 30),
      cl = u16(b, p + 32);
    out.push({
      method: u16(b, p + 10),
      csize: u32(b, p + 20),
      size: u32(b, p + 24),
      name: dec.decode(b.subarray(p + 46, p + 46 + nl)),
      offset: u32(b, p + 42),
    });
    p += 46 + nl + el + cl;
  }
  return out;
}
async function zipRead(b, e) {
  const p = e.offset;
  if (u32(b, p) !== 0x04034b50) throw new Error('bad zip entry');
  const start = p + 30 + u16(b, p + 26) + u16(b, p + 28);
  const data = b.subarray(start, start + e.csize);
  if (e.method === 0) return data;
  if (e.method !== 8) throw new Error('unsupported zip compression');
  if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot unzip files');
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(data);
  w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

// G-code text of a 3mf buffer: the plate's gcode, or the first .gcode entry when the slicer names it differently
export async function gcodeFrom3mf(buf) {
  const b = new Uint8Array(buf);
  const es = zipEntries(b).filter((e) => /\.gcode$/i.test(e.name));
  if (!es.length) throw new Error('no G-code inside the 3mf');
  const e = es.find((x) => /^Metadata\/plate_\d+\.gcode$/i.test(x.name)) || es.sort((a, c) => c.size - a.size)[0];
  return new TextDecoder().decode(await zipRead(b, e));
}

// G-code text of a file in the gcodes root, whatever its format
export async function readGcodeText(api, fn) {
  const path = `/server/files/gcodes/${fn.split('/').map(encodeURIComponent).join('/')}`;
  if (!is3mf(fn)) return api.getText(path);
  const r = await api.fetch(path);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return gcodeFrom3mf(await r.arrayBuffer());
}
