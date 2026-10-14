// Layout sweep: opens every page of the demo build (dist-demo, run `npm run build:demo` first) at phone, tablet
// and desktop widths, while printing and idle, and reports what a person would notice: the page scrolling
// sideways, a card's content spilling onto another card, buttons on top of each other, top bar items past the
// window edge, and errors in the browser console. Exits with 1 when anything is found, so CI fails.
//   node scripts/layout-sweep.mjs            all pages, widths 390 768 1024 1400
//   R=dashboard,console W=390 node scripts/layout-sweep.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve('dist-demo');
const ROUTES = (
  process.env.R ||
  'dashboard,webcam,console,heightmap,calibrations,fleet,files,viewer,history,machine,health,quick,config'
).split(',');
const WIDTHS = (process.env.W || '390,768,1024,1400').split(',').map(Number);
const PROFILES = (process.env.P || 'print,idle').split(',');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

// a small static server for dist-demo
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rsp.writeHead(404);
        return rsp.end();
      }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function check(p) {
  return p.evaluate(() => {
    const out = [];
    const vw = innerWidth;
    const de = document.documentElement;
    if (de.scrollWidth > vw + 1) out.push(`page scrolls sideways: ${de.scrollWidth} > ${vw}`);
    const main = document.querySelector('.main');
    if (main && main.scrollWidth > main.clientWidth + 1) {
      // find the widest offender
      let worst = null;
      for (const el of main.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > main.getBoundingClientRect().right + 2 && (!worst || r.right > worst.r))
          worst = { r: r.right, d: desc(el) };
      }
      out.push(
        `main scrolls sideways (${main.scrollWidth} > ${main.clientWidth})${worst ? ' widest: ' + worst.d : ''}`,
      );
    }
    function desc(el) {
      let s = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string')
        s += '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.');
      const card = el.closest('.card');
      const h = card?.querySelector('h2')?.textContent?.trim();
      const t = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30);
      return `${s}${t ? ' "' + t + '"' : ''}${h ? ' in [' + h + ']' : ''}`;
    }
    const hidden = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return true;
      }
      return false;
    };
    // visible rect: clipped by every ancestor that clips its overflow
    function vis(el) {
      let r = el.getBoundingClientRect();
      let x1 = r.left,
        y1 = r.top,
        x2 = r.right,
        y2 = r.bottom;
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.contain.includes('paint')) {
          const a = e.getBoundingClientRect();
          if (cs.overflowX !== 'visible') {
            x1 = Math.max(x1, a.left);
            x2 = Math.min(x2, a.right);
          }
          if (cs.overflowY !== 'visible') {
            y1 = Math.max(y1, a.top);
            y2 = Math.min(y2, a.bottom);
          }
        }
        if (cs.position === 'fixed') break;
      }
      x1 = Math.max(x1, 0);
      y1 = Math.max(y1, 0);
      x2 = Math.min(x2, innerWidth);
      y2 = Math.min(y2, innerHeight);
      return x2 - x1 > 1 && y2 - y1 > 1 ? { x1, y1, x2, y2 } : null;
    }
    const inter = (a, b, m = 3) =>
      Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > m && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > m;
    // content of one card drawn on top of another card
    const cards = [...document.querySelectorAll('.main .card')].filter(
      (c) => !hidden(c) && !c.closest('.modal, .ov, .dd'),
    );
    const cardR = cards.map((c) => ({ c, r: c.getBoundingClientRect() }));
    const seen = new Set();
    for (const { c } of cardR) {
      for (const el of c.querySelectorAll(
        'button, input, select, textarea, pre, canvas, svg, img, video, .out, h2, p, span',
      )) {
        if (el.closest('.card') !== c || hidden(el)) continue;
        const v = vis(el);
        if (!v) continue;
        for (const o of cardR) {
          if (o.c === c || o.c.contains(c) || c.contains(o.c)) continue;
          const b = { x1: o.r.left, y1: o.r.top, x2: o.r.right, y2: o.r.bottom };
          if (inter(v, b, 4)) {
            const k = desc(c) + '|' + desc(o.c);
            if (!seen.has(k)) {
              seen.add(k);
              out.push(
                `spills onto another card: ${desc(el)} -> over [${o.c.querySelector('h2')?.textContent?.trim() || desc(o.c)}]`,
              );
            }
          }
        }
      }
    }
    // interactive elements on top of each other (outside dialogs and menus)
    const ia = [...document.querySelectorAll('button, input, select, textarea, a[href]')].filter(
      (e) => !hidden(e) && !e.closest('.modal, .ov, .dd, .pop, [role=dialog], .tip'),
    );
    const vr = ia.map((e) => ({ e, v: vis(e) })).filter((x) => x.v);
    for (let i = 0; i < vr.length; i++)
      for (let j = i + 1; j < vr.length; j++) {
        const a = vr[i],
          b = vr[j];
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        if (inter(a.v, b.v, 4)) out.push(`controls overlap: ${desc(a.e)}  <>  ${desc(b.e)}`);
      }
    // something sticks out of the right edge of the window
    for (const el of document.querySelectorAll('.tb *, .pbar *, .fb *, .bnav *')) {
      if (hidden(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > innerWidth + 1 && vis(el)) {
        out.push(`bar item past the right edge: ${desc(el)}`);
        break;
      }
    }
    return out;
  });
}

const IGNORE = [/ERR_CONNECTION_REFUSED/, /Failed to load resource/]; // the demo probes Mainsail logos on port 80

const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch();
const report = {};
for (const prof of PROFILES)
  for (const w of WIDTHS) {
    const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    p.on(
      'console',
      (m) => m.type() === 'error' && !IGNORE.some((r) => r.test(m.text())) && errs.push('console: ' + m.text()),
    );
    await p.goto(base);
    await p.evaluate((prof) => {
      if (prof === 'idle') {
        localStorage.setItem(
          'voyager-ui-printers',
          JSON.stringify([{ id: 'demo-voron', name: 'Voron 2.4', host: 'voron24.local' }]),
        );
        localStorage.setItem('voyager-ui-printer', JSON.stringify('demo-voron'));
      }
    }, prof);
    await p.reload();
    await p.waitForTimeout(2500);
    for (const r of ROUTES) {
      await p.goto(base + '#/' + r);
      await p.waitForTimeout(r === 'viewer' ? 2500 : 1100);
      const found = await check(p);
      if (found.length) report[`${prof}/${w}/${r}`] = found;
    }
    if (errs.length) report[`${prof}/${w}/errors`] = [...new Set(errs)];
    await ctx.close();
  }
await b.close();
srv.close();
const n = Object.keys(report).length;
if (n) {
  console.log(JSON.stringify(report, null, 1));
  console.log(`layout sweep: ${n} page(s) with problems`);
  process.exit(1);
}
console.log(`layout sweep: ${PROFILES.length * WIDTHS.length * ROUTES.length} page views, no problems`);
