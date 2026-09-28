// Config history: the earlier versions of every config file, from the copies the UI makes before it writes a file
// (backups/<file>-klipperui-<date>.cfg, store.js backupBeforeWrite) and the ones Klipper makes on SAVE_CONFIG
// (printer-<date>.cfg). Pure functions; ConfigEditor.vue lists them, compares them and loads one back.

const STAMP = /(\d{8})_(\d{4,6})/;
const when = (f) => {
  const m = f.match(STAMP);
  return m ? `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)} ${m[2].slice(0, 2)}:${m[2].slice(2, 4)}` : f;
};
const stamp = (f) => (f.match(STAMP) || [''])[0];

// the config file a backup belongs to, or null when the name is not a backup
export function backupOf(f, files = []) {
  const k = f.match(/^(?:backups\/)?printer-\d{8}_\d{4,6}\.cfg$/);
  if (k) return 'printer.cfg';
  const m = f.match(/^backups\/(.+)-klipperui-\d{8}_\d{4,6}\.(cfg|conf)$/);
  if (!m) return null;
  const guess = m[1].split('__').join('/') + '.' + m[2];
  if (files.includes(guess)) return guess;
  // older backups kept only the file name: use it only when exactly one file has that name
  const same = files.filter((x) => x.split('/').pop() === m[1] + '.' + m[2]);
  return same.length === 1 ? same[0] : same.length ? null : guess;
}

// every backup, newest first: { f, file, when, klipper }. With `only` just that file's.
export function history(files, only = null) {
  return files
    .map((f) => ({ f, file: backupOf(f, files) }))
    .filter((x) => x.file && (!only || x.file === only))
    .map((x) => ({ ...x, when: when(x.f), klipper: !x.f.includes('-klipperui-'), stamp: stamp(x.f) }))
    .sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0));
}

// the sections of a config file: name -> its lines (comments and blank lines left out, so moving or
// commenting text does not count as a change). SAVE_CONFIG's block at the end is read like the rest.
function sections(text) {
  const out = new Map();
  let cur = '(top)';
  for (let line of String(text || '').split('\n')) {
    let l = line.replace(/^#\*#\s?/, ''); // SAVE_CONFIG block
    if (l === line) l = line.replace(/\s*[#;].*$/, '');
    l = l.trimEnd();
    if (!l.trim()) continue;
    const h = l.match(/^\[([^\]]+)\]/);
    if (h) {
      cur = h[1].trim();
      if (!out.has(cur)) out.set(cur, []);
      continue;
    }
    if (!out.has(cur)) out.set(cur, []);
    out.get(cur).push(l.trim());
  }
  return out;
}

// what differs between an old and a new text: lines added and removed, and the sections that changed
export function summarize(oldText, newText) {
  const a = String(oldText || '').split('\n'),
    b = String(newText || '').split('\n');
  const count = (arr) => arr.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map());
  const ca = count(a),
    cb = count(b);
  let added = 0,
    removed = 0;
  for (const [l, n] of cb) added += Math.max(0, n - (ca.get(l) || 0));
  for (const [l, n] of ca) removed += Math.max(0, n - (cb.get(l) || 0));
  const sa = sections(oldText),
    sb = sections(newText);
  const changed = [];
  for (const [name, lines] of sb) {
    if (!sa.has(name)) changed.push({ name, kind: 'added' });
    else if (sa.get(name).join('\n') !== lines.join('\n')) changed.push({ name, kind: 'changed' });
  }
  for (const name of sa.keys()) if (!sb.has(name)) changed.push({ name, kind: 'removed' });
  return { added, removed, changed, same: !added && !removed };
}
