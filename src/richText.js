// Console lines may carry a little HTML (Happy Hare colours its gate map and logo with <span style="color:..">,
// RatOS sends its messages as a <div> with a coloured title <p> and message <p>, like Mainsail renders them).
// Everything is escaped first; then only these come back to life:
//   <span>, <div>, <p>, bare or with style="..." made of colour, background, weight, style, decoration, opacity
//   and margin only, and their end tags
//   <b> <i> <u> <strong> <em> and their end tags, <br>, and character entities (&nbsp; &#9632; ...)
//   <a href="http(s)://..."> (nothing else on it): opens in a new tab without access to this page, and its real
//   address shows on hover, so a link's text cannot pass off another site as something else unseen
// Anything else, attributes included, stays visible as text. The result goes into v-html.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STYLE_OK =
  /^(\s*(color|background|background-color|font-weight|font-style|text-decoration|opacity|margin|margin-top|margin-bottom|margin-left|margin-right)\s*:\s*[#\w\s(),.%-]+;?)+\s*$/i;
const styleOk = (st) => STYLE_OK.test(st) && !/url|expression/i.test(st);
export function richHtml(text) {
  const s = esc(String(text ?? ''));
  if (!s.includes('&lt;') && !s.includes('&amp;')) return s;
  return s
    .replace(/&lt;(span|div|p)(?:\s+style=&quot;([^&<>]*)&quot;)?\s*&gt;/gi, (m, tag, st) =>
      st === undefined ? `<${tag}>` : styleOk(st) ? `<${tag} style="${st}">` : m,
    )
    .replace(/&lt;\/(span|div|p)&gt;/gi, '</$1>')
    .replace(
      /&lt;a\s+href=&quot;(https?:\/\/(?:[^\s&<>]|&amp;)+)&quot;(?:\s+target=&quot;_blank&quot;)?\s*&gt;/gi,
      '<a href="$1" target="_blank" rel="noopener noreferrer" title="$1">',
    )
    .replace(/&lt;\/a&gt;/gi, '</a>')
    .replace(/&lt;(\/?)(b|i|u|strong|em)&gt;/gi, '<$1$2>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&amp;(#\d{1,6}|#x[0-9a-f]{1,6}|[a-z]{2,8});/gi, '&$1;');
}
export const hasMarkup = (text) =>
  /<(span|div|p|a|b|i|u|strong|em|br)\b|&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(String(text ?? ''));

// What a line shows, as text: for copying and searching, so they see the message and not its markup. A block
// (<div>, <p>, <br>) starts a new line, as on screen.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function plainText(text) {
  const s = String(text ?? '');
  if (!hasMarkup(s)) return s;
  return richHtml(s)
    .replace(/<\/(div|p)>\s*<(div|p)\b/gi, '\n<$2')
    .replace(/<br>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d{1,6}|#x[0-9a-f]{1,6}|[a-z]{2,8});/gi, (m, e) =>
      e[0] === '#'
        ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1))
        : (ENT[e.toLowerCase()] ?? m),
    )
    .trim();
}
