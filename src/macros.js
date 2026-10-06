// Macro parameters, read from the macro's gcode template (params.X / params.X|default(...)).
import { S } from './store';

const cache = new Map();
export function macroSection(name) {
  const cfg = S('configfile').config || {};
  const want = 'gcode_macro ' + name.toLowerCase();
  const key = Object.keys(cfg).find((k) => k.toLowerCase() === want);
  return key ? cfg[key] : null;
}
export function macroParams(name) {
  const sec = macroSection(name);
  const g = sec?.gcode || '';
  if (cache.has(g)) return cache.get(g);
  const out = [],
    seen = new Set();
  // params.X, params['X'] and params.get('X', default); "params.get(" itself is not a parameter called GET
  const re =
    /params\.([A-Za-z_][A-Za-z0-9_]*)(?!\s*\()|params\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]|params\.get\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g;
  let m;
  while ((m = re.exec(g))) {
    const p = (m[1] || m[2] || m[3]).toUpperCase();
    if (seen.has(p)) continue;
    seen.add(p);
    // default value right after the param: |default(...)
    const tail = g.slice(m.index + m[0].length, m.index + m[0].length + 80);
    const d = tail.match(/^\s*\|\s*default\(\s*([^)]*?)\s*\)/);
    let def = d ? d[1].replace(/^['"]|['"]$/g, '') : '';
    if (/^(printer|params)\b/.test(def)) def = '';
    out.push({ name: p, def });
  }
  cache.set(g, out);
  return out;
}
// the parameter a single number most likely means ("CHAMBER 40" -> TEMP=40)
export function mainParam(params) {
  if (!params.length) return null;
  const pref = ['TEMP', 'TARGET', 'TEMPERATURE', 'T', 'S', 'VALUE', 'SPEED', 'AMOUNT', 'LENGTH', 'DISTANCE'];
  return params.find((p) => pref.includes(p.name)) || (params.length === 1 ? params[0] : null);
}

// Macros in the order the user set on the Macros card: the ones in `order` first, in that order, then the rest
// alphabetically (a macro added to the config later shows up at the end).
export function orderMacros(list, order) {
  const pos = new Map((order || []).map((m, i) => [m, i]));
  return [...list].sort((a, b) => {
    const pa = pos.has(a) ? pos.get(a) : Infinity,
      pb = pos.has(b) ? pos.get(b) : Infinity;
    return pa !== pb ? pa - pb : a.localeCompare(b);
  });
}
// the name shown for a macro: the user's own label, or the macro name with spaces for underscores
export const macroLabel = (m, labels) => (labels?.[m] || '').trim() || m.replace(/_/g, ' ');

// A one-line command split the way Klipper does (shell-like: quotes group words, ; or # starts a comment).
// Every token keeps its exact text, so changing one parameter leaves the rest of the command as it was written.
function tokenize(line) {
  const tokens = [];
  let i = 0,
    tail = '';
  const n = line.length;
  while (i < n) {
    while (i < n && /\s/.test(line[i])) i++;
    if (i >= n) break;
    if (line[i] === ';' || line[i] === '#') {
      tail = line.slice(i);
      break;
    }
    let raw = '',
      val = '',
      q = '';
    while (i < n && (q || !/\s/.test(line[i]))) {
      const c = line[i];
      if (q) {
        if (c === q) q = '';
        else val += c;
      } else if (c === '"' || c === "'") q = c;
      else val += c;
      raw += c;
      i++;
    }
    const eq = raw.indexOf('=');
    const key = eq > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(raw.slice(0, eq)) ? raw.slice(0, eq) : '';
    tokens.push(key ? { raw, key, k: key.toUpperCase(), v: val.slice(val.indexOf('=') + 1) } : { raw });
  }
  return { tokens, tail };
}
// "MY_MACRO VALUE=50 NAME='a b'" -> { word: 'MY_MACRO', args: { VALUE: '50', NAME: 'a b' } }. A command over several
// lines, or one with Jinja in it, is not split (word is empty) so nothing offers to edit it.
export function parseCmd(line) {
  const s = String(line || '').trim();
  if (!s || /[\n\r]|\{[{%]/.test(s)) return { word: '', args: {} };
  const { tokens } = tokenize(s);
  const word = tokens[0] && !tokens[0].k ? tokens[0].raw : '';
  const args = {};
  for (const t of tokens.slice(1)) if (t.k) args[t.k] = t.v;
  return { word, args };
}
// characters Klipper cuts a command at (or that break it): such a value cannot be sent
export const badParamValue = (v) => /[#;*"\n\r]/.test(String(v ?? ''));
const quote = (v) => (/^[^\s'"]*$/.test(v) ? v : !v.includes("'") ? `'${v}'` : `"${v}"`);
// The same command with some parameters changed: an empty value removes the parameter (the macro's default
// applies), a new one is added at the end, before any comment. Everything else stays as written.
export function withArgs(line, updates) {
  const s = String(line || '').trim();
  if (!parseCmd(s).word) return s;
  const { tokens, tail } = tokenize(s);
  for (const [K, v0] of Object.entries(updates || {})) {
    const v = String(v0 ?? '').trim();
    const i = tokens.findIndex((t) => t.k === K.toUpperCase());
    if (i > 0) {
      if (v === '') tokens.splice(i, 1);
      else tokens[i] = { ...tokens[i], raw: `${tokens[i].key}=${quote(v)}`, v };
    } else if (v !== '') tokens.push({ raw: `${K}=${quote(v)}`, k: K.toUpperCase(), v });
  }
  return [...tokens.map((t) => t.raw), tail].filter(Boolean).join(' ');
}
