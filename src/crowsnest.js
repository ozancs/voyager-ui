// crowsnest.conf as a form: the [cam N] sections with the options people change (mode, port, device, resolution,
// fps, flags). Only the lines of the keys shown are touched; everything else in the file, comments included, stays
// as written. Values in the file: "key: value" or "key = value".
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
      cur.opts[kv[1].toLowerCase()] = kv[2];
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
      if (has && v === '') edits.push({ at: p.lines[k], del: true });
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
