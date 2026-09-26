// Checks for a Klipper config file. Only things that are certainly wrong or worth a look:
// options outside a section, repeated options, missing include files, unbalanced Jinja
// blocks in macros, and what Klipper itself reported (deprecated options, startup errors).
// ctx: { files: [paths in the config root], dir: folder of this file, warnings: configfile.warnings, klippyError: string }
const GCODE_KEY = /^(gcode|.*_gcode|on_[a-z_]+)$/i;

function globToRe(g) {
  return new RegExp(
    '^' +
      g
        .replace(/[.+^${}()|\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.') +
      '$',
  );
}
function normPath(p) {
  const out = [];
  for (const s of p.split('/')) {
    if (s === '..') out.pop();
    else if (s && s !== '.') out.push(s);
  }
  return out.join('/');
}

export function lintKlipper(doc, ctx = {}) {
  const diags = [];
  const lines = doc.split('\n');
  const pos = [];
  let acc = 0;
  for (const l of lines) {
    pos.push(acc);
    acc += l.length + 1;
  }
  const at = (i, sev, msg, col = 0, len) =>
    diags.push({
      from: pos[i] + col,
      to: pos[i] + (len != null ? col + len : lines[i].length),
      severity: sev,
      message: msg,
    });
  let section = null,
    secLine = -1,
    keys = {},
    block = null;
  const sectionLines = {}; // lowercase section -> line index
  const optionLines = {}; // "section|option" -> line index
  const closeBlock = () => {
    if (!block) return;
    for (const [open, close] of [
      ['if', 'endif'],
      ['for', 'endfor'],
    ]) {
      const o = (block.text.match(new RegExp('\\{%-?\\s*' + open + '\\b', 'g')) || []).length;
      const c = (block.text.match(new RegExp('\\{%-?\\s*' + close + '\\b', 'g')) || []).length;
      if (o !== c) at(block.line, 'error', `Macro code has ${o} "{% ${open} %}" but ${c} "{% ${close} %}"`);
    }
    block = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^#\*#/.test(l)) {
      closeBlock();
      break;
    } // SAVE_CONFIG block, written by Klipper
    const sm = l.match(/^\[([^\]]+)\]/);
    if (sm) {
      closeBlock();
      section = sm[1].trim();
      secLine = i;
      keys = {};
      const low = section.toLowerCase().replace(/\s+/g, ' ');
      if (sectionLines[low] != null && !low.startsWith('include '))
        at(i, 'info', `[${section}] is also on line ${sectionLines[low] + 1}. Klipper merges them, later values win.`);
      else sectionLines[low] = i;
      const inc = section.match(/^include\s+(.+)$/i);
      if (inc && ctx.files && !inc[1].trim().startsWith('/')) {
        // absolute includes point outside the config root, nothing to check
        const target = normPath((ctx.dir ? ctx.dir + '/' : '') + inc[1].trim());
        const re = globToRe(target);
        if (!ctx.files.some((f) => re.test(f))) at(i, 'warning', `No file matches "${inc[1].trim()}"`);
      }
      continue;
    }
    if (/^\s*([#;].*)?$/.test(l)) continue;
    const km = l.match(/^([A-Za-z0-9_.\-]+)\s*[:=]/);
    if (km) {
      closeBlock();
      const k = km[1].toLowerCase();
      if (!section) {
        at(i, 'error', 'Option outside of any [section]');
        continue;
      }
      if (keys[k] != null)
        at(i, 'warning', `"${km[1]}" is already set on line ${keys[k] + 1}, this one wins`, 0, km[1].length);
      keys[k] = i;
      optionLines[section.toLowerCase() + '|' + k] = i;
      if (GCODE_KEY.test(k)) block = { line: i, text: l.slice(km[0].length).replace(/#.*$/, '') + '\n' }; // Klipper drops # comments before Jinja sees the line
      continue;
    }
    if (/^\s/.test(l)) {
      if (block) block.text += l.replace(/#.*$/, '') + '\n';
      continue;
    }
    closeBlock();
    if (section) at(i, 'error', 'Unexpected text. Options look like "name: value", continued lines must be indented.');
  }
  closeBlock();

  // what Klipper reported about the whole config
  for (const w of ctx.warnings || []) {
    const i =
      optionLines[(w.section || '').toLowerCase() + '|' + (w.option || '').toLowerCase()] ??
      sectionLines[(w.section || '').toLowerCase()];
    if (i != null) at(i, 'warning', w.message || `${w.option} is deprecated`);
  }
  const e = ctx.klippyError || '';
  let m;
  if (
    (m = e.match(/Option '([^']+)' in section '([^']+)'/i)) ||
    (m = e.match(/option '([^']+)' is not valid in section '([^']+)'/i))
  ) {
    const i = optionLines[m[2].toLowerCase() + '|' + m[1].toLowerCase()] ?? sectionLines[m[2].toLowerCase()];
    if (i != null) at(i, 'error', e.split('\n')[0]);
  } else if ((m = e.match(/Section '([^']+)' is not a valid config section/i))) {
    const i = sectionLines[m[1].toLowerCase()];
    if (i != null) at(i, 'error', e.split('\n')[0]);
  }
  return diags;
}
