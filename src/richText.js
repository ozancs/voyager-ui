// Console lines may carry a little HTML (Happy Hare colours its gate map and logo with <span style="color:..">,
// <b> etc., like Mainsail renders them). Everything is escaped first; then only these come back to life:
//   <span style="..."> with colour, background, weight, style or decoration only, </span>
//   <b> <i> <u> <strong> <em> and their end tags, <br>, and character entities (&nbsp; &#9632; ...)
// Anything else, attributes included, stays visible as text. The result goes into v-html.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STYLE_OK =
  /^(\s*(color|background|background-color|font-weight|font-style|text-decoration)\s*:\s*[#\w\s(),.%-]+;?)+\s*$/i;
export function richHtml(text) {
  const s = esc(String(text ?? ''));
  if (!s.includes('&lt;') && !s.includes('&amp;')) return s;
  return s
    .replace(/&lt;span\s+style=&quot;([^&<>]*)&quot;\s*&gt;/gi, (m, st) =>
      STYLE_OK.test(st) && !/url|expression/i.test(st) ? `<span style="${st}">` : m,
    )
    .replace(/&lt;\/span&gt;/gi, '</span>')
    .replace(/&lt;(\/?)(b|i|u|strong|em)&gt;/gi, '<$1$2>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&amp;(#\d{1,6}|#x[0-9a-f]{1,6}|[a-z]{2,8});/gi, '&$1;');
}
export const hasMarkup = (text) => /<(span|b|i|u|strong|em|br)\b|&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(String(text ?? ''));
