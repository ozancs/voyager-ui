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

// time left from the file progress: elapsed print time / progress - elapsed
export function timeLeft(st) {
  const p = st.display_status?.progress || st.virtual_sdcard?.progress || 0;
  const d = st.print_stats?.print_duration || 0;
  return p > 0.01 && d > 0 ? d / p - d : null;
}
