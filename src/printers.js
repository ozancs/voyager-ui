// Several printers from one Voyager UI. The list lives in this browser (localStorage), not on a printer:
// it is what this copy of the UI can connect to. Each entry is { id, name, host }, host being "address" or
// "address:port" (Moonraker's own port, usually 7125, or the port of an nginx that proxies it).
// The entry with id '' is the printer this page was loaded from (no host: same address as the page).
// Switching printers reloads the page, so nothing from the previous printer stays in memory.
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

export function savePrinters(list) {
  try {
    localStorage.setItem(LIST, JSON.stringify(list.map(({ id, name, host }) => ({ id, name, host }))));
  } catch {}
}

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

export const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
