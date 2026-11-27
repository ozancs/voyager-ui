// An iframe webcam with an address on the printer (one of Mainsail's / Fluidd's pages, e.g. a plugin's gauge at
// /belay-gauge) is a page of the printer's main web server, port 80. Voyager's own port only serves Voyager, its
// webcams and Moonraker, so the same path there answers with Voyager's start page: Voyager inside the card.
// Full addresses, webcam streams (/webcam/, /webcam2/ ...) and Moonraker paths go through api.url as before.
export function iframePageUrl(u, api, loc = globalThis.location) {
  if (!u || /^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return api.url(u);
  const p = u.startsWith('/') ? u : '/' + u;
  if (/^\/webcam\d*\//.test(p) || api.isMoonrakerPath(p)) return api.url(p);
  const host = (api.host || loc.host).replace(/:\d+$/, '');
  return `${loc.protocol}//${host}${p}`;
}
