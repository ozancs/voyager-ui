// Each browser owns a separate Moonraker database key. Saving shared settings cannot overwrite it.
export const LAYOUT_NAMESPACE = 'voyager-ui-layouts';
export async function readDeviceLayouts(api) {
  try {
    return (await api.call('server.database.get_item', { namespace: LAYOUT_NAMESPACE })).value || {};
  } catch (e) {
    if (e.code === 404 || /not found|does not exist|no such/i.test(e.message || '')) return {};
    throw e;
  }
}
export function writeDeviceLayout(api, id, value) {
  return api.call('server.database.post_item', { namespace: LAYOUT_NAMESPACE, key: id, value });
}
