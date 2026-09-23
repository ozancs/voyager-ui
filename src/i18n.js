// Tiny i18n: the English text is the key. Missing translations fall back to English.
// t('Save') -> 'Kaydet' in Turkish. Placeholders: t('{n} files', { n: 3 }).
import { reactive } from 'vue'
import tr from './locales/tr.js'

export const LANGS = [
  ['en', 'English'],
  ['tr', 'Türkçe'],
]
const DICT = { tr }

function initial() {
  try { const l = localStorage.getItem('oznlab_klipperui-lang'); if (l && (l === 'en' || DICT[l])) return l } catch {}
  return (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en'
}
export const i18n = reactive({ lang: initial() })
document.documentElement.lang = i18n.lang

export function setLang(l) {
  i18n.lang = l
  document.documentElement.lang = l
  try { localStorage.setItem('oznlab_klipperui-lang', l) } catch {}
}

export function t(s, vars) {
  let out = (i18n.lang !== 'en' && DICT[i18n.lang]?.[s]) || s
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''))
  return out
}
// plural helper: tn(n, '{n} file', '{n} files')
export const tn = (n, one, many) => t(n === 1 ? one : many, { n })
