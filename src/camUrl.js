// An iframe webcam with an address on the printer (one of Mainsail's / Fluidd's pages, e.g. a plugin's gauge at
// /belay-gauge) is a page of the printer's main web server. Voyager's own port only serves Voyager, its webcams and
// Moonraker, so the same path there answers with Voyager's start page: Voyager inside the card.
// Full addresses, webcam streams (/webcam/, /webcam2/ ...) and Moonraker paths go through api.url as before.
import { ref } from 'vue';

// The main web server is usually on port 80, but can be elsewhere (81 for a second UI, 4408/4409 on Creality K1,
// ...). Voyager asks each likely port once per printer and keeps the first that answers, in this order. Its own
// address is left out: it answers, but with Voyager.
const PORTS = ['80', '81', '4408', '4409', '8080', '8081'];
const found = ref({}); // printer host -> origin of its main web server
const asked = new Set();

function answers(origin) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 2500);
  // an opaque answer is enough: only a closed port or no server fails
  return fetch(origin + '/', { mode: 'no-cors', cache: 'no-store', signal: ctl.signal })
    .then(() => true)
    .catch(() => false)
    .finally(() => clearTimeout(timer));
}

export function findWebServer(host, loc = globalThis.location) {
  if (asked.has(host)) return;
  asked.add(host);
  const own = loc.protocol + '//' + loc.host;
  const bases = [];
  for (const port of PORTS) {
    const u = new URL(loc.protocol + '//' + host);
    u.port = port;
    if (u.origin !== new URL(own).origin && !bases.includes(u.origin)) bases.push(u.origin);
  }
  return Promise.all(bases.map(answers)).then((hits) => {
    const first = hits.indexOf(true);
    if (first >= 0) found.value = { ...found.value, [host]: bases[first] };
  });
}

export function iframePageUrl(u, api, loc = globalThis.location) {
  if (!u || /^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return api.url(u);
  const p = u.startsWith('/') ? u : '/' + u;
  if (/^\/webcam\d*\//.test(p) || api.isMoonrakerPath(p)) return api.url(p);
  const host = (api.host || loc.host).replace(/:\d+$/, '');
  findWebServer(host, loc);
  // until a port answers (or if none does), port 80
  return (found.value[host] || `${loc.protocol}//${host}`) + p;
}
