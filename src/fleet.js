// All printers overview: reads the state of every saved printer over plain HTTP (no second websocket), every few
// seconds while the page is open. Each printer is asked with its own login token (the same one the UI keeps per
// address), never with another printer's. The printer this page is connected to comes from the live state.
import { printerList, currentHost } from './printers';

const Q =
  '/printer/objects/query?webhooks&print_stats=state,filename,print_duration&virtual_sdcard=progress&display_status=progress' +
  '&extruder=temperature,target&heater_bed=temperature,target';

const base = (host) => (host ? `${location.protocol}//${host}` : '');
// nginx serves webcams next to Moonraker; an address with Moonraker's own port (71xx) has them on port 80
export function webBase(host) {
  if (!host) return '';
  const [h, port] = host.split(':');
  return `${location.protocol}//${port && /^71\d\d$/.test(port) ? h : host}`;
}
function token(host) {
  try {
    return JSON.parse(localStorage.getItem('voyager-ui-auth' + (host ? '@' + host : '')) || '{}').token || '';
  } catch {
    return '';
  }
}
async function get(host, path) {
  const tok = token(host);
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(base(host) + path, {
      cache: 'no-store',
      headers: tok ? { Authorization: 'Bearer ' + tok } : {},
      signal: ctl.signal,
    });
    if (r.status === 401 || r.status === 403) return { login: true };
    if (!r.ok) return { error: r.status };
    return { result: (await r.json()).result };
  } finally {
    clearTimeout(tm);
  }
}

// the printers to show: this page's own address first, then the saved list. cur: the one connected now.
export function fleetList() {
  const cur = currentHost();
  return [{ id: '', name: '', host: '' }, ...printerList.value].map((p) => ({ ...p, cur: p.host === cur }));
}

// one printer's state: { state: 'offline' | 'login' | klippy state, status, name, cam }
export async function pollPrinter(p, known = {}) {
  try {
    const r = await get(p.host, Q);
    if (r.login) return { state: 'login' };
    if (!r.result) return { state: 'offline' };
    const out = { status: r.result.status || {} };
    out.state = out.status.webhooks?.state || 'unknown';
    // the name and the camera change rarely: asked once
    if (known.hostname === undefined) {
      const i = await get(p.host, '/printer/info').catch(() => ({}));
      out.hostname = i.result?.hostname || '';
    }
    if (known.cam === undefined) {
      const w = await get(p.host, '/server/webcams/list').catch(() => ({}));
      const c = (w.result?.webcams || []).find((x) => x.enabled !== false && x.snapshot_url);
      out.cam = c ? (/^https?:\/\//.test(c.snapshot_url) ? c.snapshot_url : webBase(p.host) + c.snapshot_url) : null;
    }
    return out;
  } catch {
    return { state: 'offline' };
  }
}

// "Test" in the printer list: can this page reach the address? The browser does not say why a request failed
// (printer off, wrong address or a cors_domains block all look the same), so the message lists all three.
export async function testPrinter(host) {
  const steps = [{ label: 'Printer address', status: 'Accepted' }];
  const result = await probePrinter(host);
  steps.push({ label: 'Moonraker', status: result.reached ? 'Reached' : 'Unreachable' });
  steps.push({ label: 'Browser access / CORS', status: result.reached ? 'Passed' : 'Could not verify' });
  steps.push({
    label: 'Authorization',
    status: result.login ? 'Login required' : result.ok ? 'Passed' : 'Could not verify',
  });
  let camera = 'Could not verify';
  if (result.ok && !result.login) {
    const response = await get(host, '/server/webcams/list').catch(() => null);
    if (Array.isArray(response?.result?.webcams)) {
      camera = response.result.webcams.some((c) => c.enabled !== false) ? 'Configured' : 'No camera configured';
    }
  }
  steps.push({ label: 'Camera', status: camera });
  return { ...result, steps };
}
async function probePrinter(host) {
  try {
    const r = await get(host, '/printer/info');
    if (r.login)
      return {
        ok: true,
        reached: true,
        login: true,
        level: 'wn',
        text: 'Reached, but it needs a login. Open it to log in.',
      };
    if (!r.result)
      return {
        ok: false,
        reached: true,
        level: 'dg',
        text: 'Moonraker answered with an error ({code}).',
        params: { code: r.error },
      };
    const st = r.result.state || '';
    return {
      ok: true,
      reached: true,
      level: st === 'ready' ? 'ok' : 'wn',
      text: st === 'ready' ? 'Connected: {name}, Klipper ready.' : 'Connected: {name}, Klipper {state}.',
      params: { name: r.result.hostname || host, state: st },
    };
  } catch {
    return {
      ok: false,
      level: 'dg',
      text: 'No answer. Check the address, that the printer is on, and cors_domains in its moonraker.conf.',
    };
  }
}
// an IP address with fewer than four parts is almost always a typo
export const looksIncomplete = (host) => /^\d+(\.\d+){0,2}(:\d+)?$/.test(String(host || '').trim());

// time left from the file progress: elapsed print time / progress - elapsed
export function timeLeft(st) {
  const p = st.display_status?.progress || st.virtual_sdcard?.progress || 0;
  const d = st.print_stats?.print_duration || 0;
  return p > 0.01 && d > 0 ? d / p - d : null;
}

// Scan the printer's own network for other printers: every address of its /24 (from Moonraker's network info),
// asking /server/info on port 80 with a short timeout. Only printers whose moonraker.conf lets this page in
// (cors_domains) can answer, the same as adding one by hand. onProgress(done, total); returns the ones found:
// [{ host, name }]. skip: addresses already known.
export async function scanNetwork(ips, { skip = [], onProgress, signal } = {}) {
  const own = new Set(ips);
  const nets = [...new Set(ips.map((ip) => ip.split('.').slice(0, 3).join('.')))];
  const targets = [];
  for (const n of nets) for (let i = 1; i < 255; i++) if (!own.has(n + '.' + i)) targets.push(n + '.' + i);
  const known = new Set(skip.map((h) => h.toLowerCase()));
  const found = [];
  let done = 0,
    k = 0;
  const one = async (ip) => {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), 1800);
    const stop = () => ctl.abort();
    signal?.addEventListener('abort', stop);
    try {
      const r = await fetch(`${location.protocol}//${ip}/server/info`, { cache: 'no-store', signal: ctl.signal });
      const login = r.status === 401 || r.status === 403;
      const j = login ? null : r.ok ? await r.json().catch(() => null) : null;
      if (login || j?.result?.klippy_state !== undefined) {
        let name = '';
        if (!login) {
          const i = await fetch(`${location.protocol}//${ip}/printer/info`, { cache: 'no-store' })
            .then((x) => x.json())
            .catch(() => null);
          name = i?.result?.hostname || '';
        }
        if (!known.has(ip)) found.push({ host: ip, name: name || ip, login });
      }
    } catch {
      // nothing there, or a printer that does not let this page in
    } finally {
      clearTimeout(tm);
      signal?.removeEventListener('abort', stop);
      onProgress?.(++done, targets.length);
    }
  };
  const worker = async () => {
    while (k < targets.length && !signal?.aborted) await one(targets[k++]);
  };
  await Promise.all(Array.from({ length: 32 }, worker));
  return found.sort((a, b) => a.host.localeCompare(b.host, undefined, { numeric: true }));
}
