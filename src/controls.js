// Helpers of the Controls card: reading a value out of a printer object and testing a switch condition.
import { S } from './store';

// value of `obj`.`field`; "info.current_layer" walks into nested objects
export function readState(obj, field) {
  if (!obj) return undefined;
  let v = S(obj);
  for (const k of String(field || '').split('.')) {
    if (!k) continue;
    v = v?.[k];
  }
  return v;
}
const norm = (x) => {
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (typeof x === 'number') return x;
  const s = String(x).trim().toLowerCase();
  if (s === 'true' || s === 'on') return 1;
  if (s === 'false' || s === 'off') return 0;
  return s !== '' && !isNaN(Number(s)) ? Number(s) : s;
};
// a switch is on when the state passes `when`: "> 0" (default), "= on", "!= 0", ">= 50", "= standby"
export function isOn(raw, when) {
  if (raw === undefined || raw === null) return false;
  const m = /^\s*(>=|<=|!=|=|>|<)?\s*(.*?)\s*$/.exec(String(when || '> 0'));
  const op = m[1] || '=';
  const a = norm(raw),
    b = norm(m[2]);
  if (op === '=') return a === b;
  if (op === '!=') return a !== b;
  if (typeof a !== 'number' || typeof b !== 'number') return false;
  return op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b;
}
