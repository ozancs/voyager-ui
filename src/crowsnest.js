// crowsnest.conf as a form: the [cam N] sections with the options people change (mode, port, device, resolution,
// fps, flags). Only the lines of the keys shown are touched; everything else in the file, comments included, stays
// as written. Values in the file: "key: value" or "key = value".
// crowsnest refuses to start when one of these is missing from a [cam] section
export const REQUIRED_KEYS = ['mode', 'port', 'device', 'resolution', 'max_fps'];
export const CAM_KEYS = [
  'mode',
  'port',
  'device',
  'resolution',
  'max_fps',
  'custom_flags',
  'v4l2ctl',
  'enable_rtsp',
  'rtsp_port',
];
export const MODES = ['ustreamer', 'camera-streamer'];

export function parseCrowsnest(text) {
  const cams = [];
  const lines = text.split('\n');
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const sec = /^\s*\[(.+?)\]\s*(?:[#;].*)?$/.exec(l);
    if (sec) {
      const m = /^cam\s+(.+)$/i.exec(sec[1].trim());
      cur = m ? { name: m[1].trim(), line: i, opts: {}, lines: {} } : null;
      if (cur) cams.push(cur);
      continue;
    }
    if (!cur) continue;
    const kv = /^([A-Za-z_][\w]*)\s*[:=]\s*(.*?)(?:\s+[#;].*)?$/.exec(l);
    if (kv && !/^\s*[#;]/.test(l)) {
      cur.opts[kv[1].toLowerCase()] = kv[2].trim();
      cur.lines[kv[1].toLowerCase()] = i;
    }
  }
  return cams;
}
// the file with the given cams' options written back (a value that is '' removes the line; a new key is added
// right after the section header)
export function writeCrowsnest(text, cams) {
  const lines = text.split('\n');
  const parsed = parseCrowsnest(text);
  // work from the bottom so line numbers above stay valid
  const edits = [];
  for (const cam of cams) {
    const p = parsed.find((x) => x.name === cam.name);
    if (!p) continue;
    for (const k of CAM_KEYS) {
      const v = String(cam.opts[k] ?? '').trim();
      const has = k in p.lines;
      if (has && v === '' && p.opts[k] !== '')
        edits.push({ at: p.lines[k], del: true }); // an empty line stays
      else if (has && v !== p.opts[k])
        edits.push({
          at: p.lines[k],
          set: lines[p.lines[k]].replace(
            /^([A-Za-z_]\w*\s*[:=]\s*)(.*?)(\s+[#;].*)?$/,
            (_, a, __, c) => a + v + (c || ''),
          ),
        });
      else if (!has && v !== '') edits.push({ at: p.line, add: `${k}: ${v}` });
    }
  }
  edits.sort((a, b) => b.at - a.at);
  for (const e of edits) {
    if (e.del) lines.splice(e.at, 1);
    else if (e.set !== undefined) lines[e.at] = e.set;
    else lines.splice(e.at + 1, 0, e.add);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- camera image controls
// crowsnest writes each camera's controls into crowsnest.log at start (log_level verbose or debug):
//   [10/27/26 14:03:12] crowsnest: /dev/v4l/by-id/usb-Cam-video-index0 -> /dev/video0
//   [10/27/26 14:03:12] crowsnest: Supported Controls:
//   [10/27/26 14:03:12] crowsnest:		 brightness 0x00980900 (int)    : min=-64 max=64 step=1 default=0 value=0
//   ...                 crowsnest:				1: Manual Mode        (an entry of the menu above)
// Returns { devicePath: [{ name, type, min, max, step, def, value, inactive, menu: [{ v, label }] }] }; both the
// by-id path and the /dev/videoN it points to are keys. A later start replaces what an earlier one wrote.
export function parseCamControls(log) {
  const out = {};
  let devs = [],
    list = null,
    last = null;
  for (const raw of String(log || '').split('\n')) {
    const l = raw.replace(/^\[[^\]]*\]\s*crowsnest:\s?/, '');
    let m;
    if ((m = /^(\/dev\/\S+)\s+->\s+(\/dev\/\S+)\s*$/.exec(l.trim()))) {
      devs = [m[1], m[2]];
      list = null;
    } else if (/^Supported Controls:/i.test(l.trim())) {
      if (!devs.length) continue;
      list = [];
      for (const d of devs) out[d] = list;
    } else if (list && (m = /^\s*([a-z0-9_]+)\s+0x[0-9a-f]+\s+\((\w+)\)\s*:\s*(.*)$/i.exec(l))) {
      const kv = Object.fromEntries([...m[3].matchAll(/(\w+)=(\S+)/g)].map((x) => [x[1], x[2]]));
      const num = (k) => (kv[k] !== undefined && !isNaN(+kv[k]) ? +kv[k] : null);
      last = {
        name: m[1],
        type: m[2].toLowerCase(),
        min: num('min'),
        max: num('max'),
        step: num('step') || 1,
        def: num('default'),
        value: num('value'),
        inactive: /inactive/.test(kv.flags || ''),
        menu: [],
      };
      if (['int', 'bool', 'menu', 'intmenu'].includes(last.type)) list.push(last);
    } else if (list && last && (m = /^\s*(-?\d+):\s*(.+?)\s*$/.exec(l)) && /menu/.test(last.type)) {
      last.menu.push({ v: +m[1], label: m[2] });
    } else if (list && l.trim() && !/^\s/.test(l)) {
      list = null; // the next log message: the controls block has ended
      last = null;
    }
  }
  return out;
}
// "a=1, b=2" <-> { a: '1', b: '2' }, the order kept
export function parseV4l2ctl(s) {
  const o = {};
  for (const part of String(s || '').split(',')) {
    const m = /^\s*([a-z0-9_]+)\s*=\s*(-?[\w.]+)\s*$/i.exec(part);
    if (m) o[m[1]] = m[2];
  }
  return o;
}
export const v4l2ctlString = (o) =>
  Object.entries(o)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
