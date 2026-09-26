// Tiny i18n: the English text is the key. Missing translations fall back to English.
// t('Save') -> 'Kaydet' in Turkish. Placeholders: t('{n} files', { n: 3 }).
// Each language is its own file in locales/ and is only downloaded when it is used.
import { reactive, markRaw } from 'vue';

export const LANGS = [
  ['en', 'English'],
  ['de', 'Deutsch'],
  ['es', 'Español'],
  ['fr', 'Français'],
  ['it', 'Italiano'],
  ['nl', 'Nederlands'],
  ['pl', 'Polski'],
  ['pt', 'Português (Brasil)'],
  ['tr', 'Türkçe'],
  ['ru', 'Русский'],
  ['uk', 'Українська'],
  ['zh', '简体中文'],
  ['ja', '日本語'],
  ['ko', '한국어'],
];
const CODES = LANGS.map(([k]) => k);
const loaders = import.meta.glob('./locales/*.js');
const DICT = {};

function initial() {
  try {
    const l = localStorage.getItem('voyager-ui-lang');
    if (l && CODES.includes(l)) return l;
  } catch {}
  for (const n of navigator.languages || [navigator.language || 'en']) {
    const c = String(n).toLowerCase().split('-')[0];
    if (CODES.includes(c)) return c;
  }
  return 'en';
}
export const i18n = reactive({ lang: initial(), ver: 0 });
document.documentElement.lang = i18n.lang;

export async function loadLang(l) {
  if (l === 'en' || DICT[l] || !loaders[`./locales/${l}.js`]) return;
  try {
    DICT[l] = markRaw((await loaders[`./locales/${l}.js`]()).default);
    i18n.ver++;
  } catch (e) {
    console.warn('language', l, e);
  }
}
export async function setLang(l) {
  if (!CODES.includes(l)) l = 'en';
  await loadLang(l);
  i18n.lang = l;
  document.documentElement.lang = l;
  try {
    localStorage.setItem('voyager-ui-lang', l);
  } catch {}
}

export function t(s, vars) {
  i18n.ver; // re-render once a language file arrives
  let out = (i18n.lang !== 'en' && DICT[i18n.lang]?.[s]) || s;
  if (out === s && i18n.lang !== 'en' && DICT[i18n.lang] && window.__i18nMiss) window.__i18nMiss.add(s);
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return out;
}
// plural helper: tn(n, '{n} file', '{n} files')
export const tn = (n, one, many) => t(n === 1 ? one : many, { n });
