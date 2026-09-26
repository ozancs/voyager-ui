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
  const re = /params\.([A-Za-z_][A-Za-z0-9_]*)|params\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g;
  let m;
  while ((m = re.exec(g))) {
    const p = (m[1] || m[2]).toUpperCase();
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
