// One backup file for every printer in the printer list. Each printer's part is what that printer stores: its
// shared settings (namespace voyager-ui, key settings) and every browser's own layout (namespace
// voyager-ui-layouts), read and written over Moonraker's HTTP JSON-RPC with that printer's own login, like the
// All printers page. Restoring writes each part back to the printer it came from, matched by its address.
import { APP } from './store';
import { LAYOUT_NAMESPACE } from './deviceLayoutStorage';
import { fleetList, base, token } from './fleet';

const NOT_FOUND = (e) => e?.code === 404 || /not found|does not exist|no such/i.test(e?.message || '');

// a JSON-RPC call to one printer; host '' is the printer this page came from
export async function rpc(host, method, params = {}, fetchFn = fetch) {
  const tok = token(host);
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetchFn(base(host) + '/server/jsonrpc', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      signal: ctl.signal,
    });
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('login needed'), { code: r.status });
    const j = await r.json();
    if (j.error) throw Object.assign(new Error(j.error.message || 'error'), { code: j.error.code });
    return j.result;
  } finally {
    clearTimeout(tm);
  }
}

const getItem = async (call, namespace, key) => {
  try {
    return (await call('server.database.get_item', key ? { namespace, key } : { namespace })).value;
  } catch (e) {
    if (NOT_FOUND(e)) return null;
    throw e;
  }
};

// one printer's part of the file
export async function readPrinter(call) {
  const settings = await getItem(call, APP, 'settings');
  const layouts = (await getItem(call, LAYOUT_NAMESPACE)) || {};
  return { settings: settings || {}, layouts };
}

// writes a part back; the printer's current settings become its "previous settings" (Settings > Backup > Go back)
export async function writePrinter(call, part) {
  const cur = await getItem(call, APP, 'settings');
  if (cur)
    await call('server.database.post_item', {
      namespace: APP,
      key: 'settings_prev',
      value: { date: new Date().toISOString(), settings: cur },
    });
  await call('server.database.post_item', { namespace: APP, key: 'settings', value: part.settings || {} });
  for (const [id, v] of Object.entries(part.layouts || {}))
    if (/^[a-zA-Z0-9_-]+$/.test(id) && v?.data)
      await call('server.database.post_item', { namespace: LAYOUT_NAMESPACE, key: id, value: v });
}

// the printers to back up: every address once (the page's own first), with the name the UI shows for it
export function printersToBackUp(list = fleetList(), here = location.host) {
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const host = p.host || here;
    if (seen.has(host)) continue;
    seen.add(host);
    out.push({ host, name: p.name || '', own: !p.host });
  }
  return out;
}

// the file: { app, version, date, printers: [{ name, host, settings, layouts }] } and the printers it could not read
export async function backupAll({ version, names = {}, here = location.host, call = rpc } = {}) {
  const printers = [];
  const failed = [];
  for (const p of printersToBackUp(undefined, here)) {
    try {
      const c = (m, prm) => call(p.own ? '' : p.host, m, prm);
      const part = await readPrinter(c);
      let name = p.name || names[p.host] || part.settings.printerName;
      if (!name) name = (await c('printer.info').catch(() => null))?.hostname || p.host;
      printers.push({ name, host: p.host, ...part });
    } catch {
      failed.push(p.name || names[p.host] || p.host);
    }
  }
  return { file: { app: APP, version, date: new Date().toISOString(), printers }, failed };
}

export const isAllPrinters = (d) => Array.isArray(d?.printers) && d.printers.every((p) => p && p.host && p.settings);

// which printer in the list each part of a file goes to: by address; '' for this page's printer, null if none
export function matchPrinters(file, list = fleetList(), here = location.host) {
  const known = printersToBackUp(list, here);
  return file.printers.map((p) => {
    const m = known.find((k) => k.host === p.host);
    return m ? (m.own ? '' : m.host) : null;
  });
}

// a file's device layouts to offer as "the layout on this device" (after a reinstall the browser is a new device,
// so its old layout sits in the file under another id): newest first, this device's own marked
export function layoutChoices(layouts, ownId) {
  return Object.entries(layouts || {})
    .filter(([, v]) => v && v.data)
    .map(([id, v]) => ({ id, name: String(v.name || 'Browser'), t: v.t || 0, own: id === ownId }))
    .sort((a, b) => b.t - a.t);
}
