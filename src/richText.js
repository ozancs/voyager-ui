// Console lines may carry a little HTML (Happy Hare colours its gate map and logo with <span style="color:..">,
// RatOS sends its messages as a <div> with a coloured title <p> and message <p>, like Mainsail renders them).
// Everything is escaped first; then only these come back to life:
//   <span>, <div>, <p>, bare or with style="..." made of colour, background, weight, style, decoration, opacity,
//   margin and padding only, and their end tags
//   <b> <i> <u> <strong> <em> and their end tags, <br>, and character entities (&nbsp; &#9632; ...)
//   <a href="http(s)://..."> (nothing else on it): opens in a new tab without access to this page, and its real
//   address shows on hover, so a link's text cannot pass off another site as something else unseen
//   <img src="..."> of a file on the printer (RatOS's welcome logo: src="../server/files/config/RatOS/Logo.png"),
//   with width, height, alt and a style as above. The address is the printer's own, through imgUrl (the page may
//   be served from elsewhere); an image from any other site stays text, so a line cannot load one from outside
// Anything else, attributes included, stays visible as text. The result goes into v-html.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STYLE_OK =
  /^(\s*(color|background|background-color|font-weight|font-style|text-decoration|opacity|margin|margin-top|margin-bottom|margin-left|margin-right|padding|padding-top|padding-bottom|padding-left|padding-right)\s*:\s*[#\w\s(),.%-]+;?)+\s*$/i;
const styleOk = (st) => STYLE_OK.test(st) && !/url|expression/i.test(st);
// an image's attributes, escaped: name="value" pairs. The printer file it shows, as a path from the server root,
// or '' when it is not one (another site, a data: address, a path climbing out of /server/files/).
const IMG_ATTR = /\s+([a-z]+)=&quot;([^&<>]*)&quot;/gi;
const printerFile = (src) => {
  const p = src.replace(/^(\.\.?\/)+|^\//, '');
  return /^server\/files\/[\w./ -]+$/i.test(p) && !p.split('/').includes('..') ? '/' + p : '';
};
function img(m, attrs, imgUrl) {
  const a = {};
  for (const [, k, v] of attrs.matchAll(IMG_ATTR)) a[k.toLowerCase()] = v;
  const path = a.src && printerFile(a.src);
  if (!path || Object.keys(a).some((k) => !['src', 'width', 'height', 'alt', 'style'].includes(k))) return m;
  if (a.style && !styleOk(a.style)) return m;
  const size = (k) => (/^\d{1,4}(px)?$/.test(a[k] || '') ? ` ${k}="${parseInt(a[k])}"` : '');
  const url = esc(imgUrl(encodeURI(path)));
  return `<img src="${url}" alt="${a.alt || ''}"${size('width')}${size('height')}${a.style ? ` style="${a.style}"` : ''} loading="lazy" class="cimg">`;
}
export function richHtml(text, imgUrl = (p) => p) {
  const s = esc(String(text ?? ''));
  if (!s.includes('&lt;') && !s.includes('&amp;')) return s;
  return s
    .replace(/&lt;img((?:\s+[a-z]+=&quot;[^&<>]*&quot;)*)\s*\/?&gt;/gi, (m, attrs) => img(m, attrs, imgUrl))
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
  /<(span|div|p|a|b|i|u|strong|em|br|img)\b|&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(String(text ?? ''));

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
