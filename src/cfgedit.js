// Helpers to find and replace an option inside Klipper config text (used by the Printer settings page).
// setOption returns the new text, or null when the section is not in this file.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function setOption(text, section, key, value) {
  const lines = text.split('\n');
  const sec = section.trim().toLowerCase();
  // 1) SAVE_CONFIG autosave block takes precedence
  const autoStart = lines.findIndex((l) => l.startsWith('#*# <---------------------- SAVE_CONFIG'));
  if (autoStart >= 0) {
    let cur = null;
    for (let i = autoStart; i < lines.length; i++) {
      const m = lines[i].match(/^#\*#\s*\[([^\]]+)\]/);
      if (m) {
        cur = m[1].trim().toLowerCase();
        continue;
      }
      if (cur === sec) {
        const km = lines[i].match(new RegExp('^#\\*#\\s*' + esc(key) + '\\s*[:=]\\s*(.*)$', 'i'));
        if (km) {
          lines[i] = `#*# ${key} = ${value}`;
          return { text: lines.join('\n'), where: 'autosave' };
        }
      }
    }
  }
  // 2) normal sections
  let cur = null,
    secLine = -1;
  const end = autoStart >= 0 ? autoStart : lines.length;
  for (let i = 0; i < end; i++) {
    const l = lines[i];
    const m = l.match(/^\[([^\]]+)\]/);
    if (m) {
      if (cur === sec && secLine >= 0) break;
      cur = m[1].trim().toLowerCase();
      if (cur === sec) secLine = i;
      continue;
    }
    if (cur !== sec) continue;
    const km = l.match(new RegExp('^(' + esc(key) + ')(\\s*[:=]\\s*)([^#;\\n]*?)(\\s*[#;].*)?$', 'i'));
    if (km) {
      lines[i] = km[1] + km[2] + value + (km[4] || '');
      return { text: lines.join('\n'), where: 'line ' + (i + 1) };
    }
  }
  if (secLine >= 0) {
    lines.splice(secLine + 1, 0, `${key}: ${value}`);
    return { text: lines.join('\n'), where: 'added after line ' + (secLine + 1) };
  }
  return null;
}

export function hasSection(text, section) {
  const sec = section.trim().toLowerCase();
  return text.split('\n').some((l) => {
    const m = l.match(/^(?:#\*#\s*)?\[([^\]]+)\]/);
    return m && m[1].trim().toLowerCase() === sec;
  });
}

// Klipper's own file order: printer.cfg, then every [include] in the order it meets them (globs sorted,
// paths relative to the including file). texts is filled with what was read on the way.
export async function includedFiles(all, read, texts = {}, children = {}) {
  const set = new Set(all);
  const order = [],
    seen = new Set();
  const glob = (pat) =>
    new RegExp(
      '^' +
        pat
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '\u0000')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '[^/]')
          .replace(/\u0000/g, '.*') +
        '$',
    );
  async function visit(fn) {
    if (seen.has(fn) || !set.has(fn)) return;
    seen.add(fn);
    order.push(fn);
    if (texts[fn] === undefined) texts[fn] = await read(fn);
    const dir = fn.includes('/') ? fn.slice(0, fn.lastIndexOf('/') + 1) : '';
    children[fn] = [];
    const lines = String(texts[fn]).split('\n');
    for (let li = 0; li < lines.length; li++) {
      const m = lines[li].match(/^\[include\s+([^\]]+)\]/);
      if (!m) continue;
      // relative to the including file; "./" and "../" resolved like a path
      const parts = [];
      for (const seg of (dir + m[1].trim()).split('/'))
        if (seg === '..') parts.pop();
        else if (seg !== '.' && seg !== '') parts.push(seg);
      const pat = parts.join('/');
      const re = glob(pat);
      const hit = all.filter((x) => re.test(x)).sort();
      children[fn].push({ line: li, files: hit });
      for (const f of hit) await visit(f);
    }
  }
  await visit('printer.cfg');
  return order;
}

// Where Klipper takes a section's option from: the files read in load order (an include is read where its
// line is), the last definition wins, and printer.cfg's SAVE_CONFIG block comes after everything.
// Returns { key: file with the last definition of the option or null, section: last file with the section }.
export function lastDefinition(texts, children, section, key) {
  const sec = section.trim().toLowerCase();
  const kre = new RegExp('^' + esc(key) + '\\s*[:=]', 'i');
  const out = { key: null, section: null };
  const seen = new Set();
  function walk(fn) {
    if (seen.has(fn) || texts[fn] == null) return;
    seen.add(fn);
    const lines = String(texts[fn]).split('\n');
    const kids = new Map((children[fn] || []).map((c) => [c.line, c.files]));
    let cur = null;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('#*#')) break; // the SAVE_CONFIG block, handled last
      if (kids.has(i)) {
        cur = null;
        for (const f of kids.get(i)) walk(f);
        continue;
      }
      const m = l.match(/^\[([^\]]+)\]/);
      if (m) {
        cur = m[1].trim().toLowerCase();
        if (cur === sec) out.section = fn;
        continue;
      }
      if (cur === sec && kre.test(l)) out.key = fn;
    }
  }
  walk('printer.cfg');
  // SAVE_CONFIG block of printer.cfg
  let cur = null;
  for (const l of String(texts['printer.cfg'] || '').split('\n')) {
    const m = l.match(/^#\*#\s*\[([^\]]+)\]/);
    if (m) cur = m[1].trim().toLowerCase();
    else if (cur === sec && new RegExp('^#\\*#\\s*' + esc(key) + '\\s*[:=]', 'i').test(l)) out.key = 'printer.cfg';
  }
  return out;
}
