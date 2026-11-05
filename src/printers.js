// Several printers from one Voyager UI. The list lives in this browser (localStorage), not on a printer:
// it is what this copy of the UI can connect to. Each entry is { id, name, host }, host being "address" or
// "address:port" (Moonraker's own port, usually 7125, or the port of an nginx that proxies it).
// The entry with id '' is the printer this page was loaded from (no host: same address as the page).
// Switching printers reloads the page, so nothing from the previous printer stays in memory.
import { ref } from 'vue';

const LIST = 'voyager-ui-printers';
const CUR = 'voyager-ui-printer';

export const HOST_RE = /^[A-Za-z0-9.-]+(:\d{1,5})?$/; // host[:port] only, never a path or credentials

function read(k, d) {
  try {
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    return v ?? d;
  } catch {
    return d;
  }
}

export function loadPrinters() {
  const l = read(LIST, []);
  return Array.isArray(l) ? l.filter((p) => p && p.id && HOST_RE.test(p.host || '')) : [];
}

// the saved list as reactive state: the printer menu and the All printers page follow it without a reload
export const printerList = ref(loadPrinters());
export function savePrinters(list) {
  try {
    localStorage.setItem(LIST, JSON.stringify(list.map(({ id, name, host }) => ({ id, name, host }))));
  } catch {}
  printerList.value = loadPrinters();
}
// changed in another tab of this browser
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === LIST) printerList.value = loadPrinters();
  });

// the printer this page talks to: an entry of the list, or null for the page's own address
export function currentPrinter() {
  const id = read(CUR, '');
  return (id && loadPrinters().find((p) => p.id === id)) || null;
}
export const currentHost = () => currentPrinter()?.host || '';

export function selectPrinter(id) {
  try {
    if (id) localStorage.setItem(CUR, JSON.stringify(id));
    else localStorage.removeItem(CUR);
  } catch {}
  location.reload();
}

// browser storage keys that belong to one printer (cached settings, objects...) get the printer's address
// appended, so switching printers never shows or seeds data from another one
export const perPrinterKey = (k) => (currentHost() ? k + '@' + currentHost() : k);

// the list a printer keeps for every browser (state.settings.printers, written when the list is saved): the ones
// this browser does not have yet are added. Never removes: a printer taken off here goes from the printer's list
// the next time the list is saved.
export function mergePrinters(remote) {
  if (!Array.isArray(remote) || !remote.length) return 0;
  const list = loadPrinters();
  const have = new Set([...list.map((p) => p.host.toLowerCase()), location.host.toLowerCase()]);
  let n = 0;
  for (const p of remote) {
    const host = String(p?.host || '').trim();
    if (!HOST_RE.test(host) || have.has(host.toLowerCase())) continue;
    list.push({ id: newId(), name: String(p.name || host).slice(0, 60), host });
    have.add(host.toLowerCase());
    n++;
  }
  if (n) savePrinters(list);
  return n;
}

export const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
