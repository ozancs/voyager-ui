// The larger icon set for the pickers (src/icons-extra.js, Lucide) is its own chunk: it loads the first time a
// picker opens or a button that uses one of its icons is shown. Its names are stored with an 'l:' prefix.
import { shallowRef } from 'vue';
export const extra = shallowRef(null);
let p = null;
export function loadExtra() {
  return (p ||= import('./icons-extra.js').then((m) => (extra.value = m.default)));
}
export const isExtra = (n) => typeof n === 'string' && n.startsWith('l:');
