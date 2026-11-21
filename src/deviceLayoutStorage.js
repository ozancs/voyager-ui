// Each browser owns a separate Moonraker database key. Saving shared settings cannot overwrite it.
export const LAYOUT_NAMESPACE = 'voyager-ui-layouts';
async function readRecord(api, query) {
  try {
    return (await api.call('server.database.get_item', query)).value;
  } catch (e) {
    if (isMissingRecord(e)) return null;
    throw e;
  }
}
function isMissingRecord(e) {
  if (e.code === 404) return true;
  return (
    !(e.code >= 400) &&
    /\b(namespace|key|item|record)\b/i.test(e.message || '') &&
    /not found|does not exist|no such/i.test(e.message || '')
  );
}
export async function readDeviceLayouts(api) {
  return (await readRecord(api, { namespace: LAYOUT_NAMESPACE })) || {};
}
// Read all required records before the store can mark its settings writable. A fresh database can
// be seeded from the cache; a failed read (including of a legacy record) must never seed defaults.
export async function readStoredSettings(api, namespace, legacyNamespaces, cached) {
  let shared = await readRecord(api, { namespace, key: 'settings' });
  if (!shared?.migratedCarbon) {
    for (const legacy of legacyNamespaces) {
      const old = await readRecord(api, { namespace: legacy, key: 'settings' });
      if (old && typeof old === 'object') {
        shared = { ...old, ...shared };
        break;
      }
    }
  }
  shared ??= cached() || {};
  const layouts = await readDeviceLayouts(api);
  return { ...shared, migratedCarbon: true, deviceLayouts: { ...shared.deviceLayouts, ...layouts } };
}
export function writeDeviceLayout(api, id, value) {
  return api.call('server.database.post_item', { namespace: LAYOUT_NAMESPACE, key: id, value });
}
// A missing record before import is recorded explicitly so Undo removes just that new record.
export async function previousDeviceLayouts(api, changes) {
  const ids = Object.keys(changes);
  if (!ids.length) return {};
  const current = await readDeviceLayouts(api);
  return Object.fromEntries(ids.map((id) => [id, current[id] ?? null]));
}
export async function applyDeviceLayouts(api, changes) {
  for (const [id, entry] of Object.entries(changes)) {
    if (entry !== null) await writeDeviceLayout(api, id, entry);
    else {
      try {
        await api.call('server.database.delete_item', { namespace: LAYOUT_NAMESPACE, key: id });
      } catch (e) {
        if (!isMissingRecord(e)) throw e;
      }
    }
  }
}
