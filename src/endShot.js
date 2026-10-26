// The last picture of each print: when a print ends (done, cancelled or stopped by an error) the first webcam's
// picture is saved with the job, so a failed print can be looked at later from History. It is taken by the
// Voyager page that is open at that moment (none open, no picture), turned like the camera is set to be, made
// small (640 px wide JPEG) and kept in Moonraker's database, so every device sees it. The last KEEP jobs are kept.
import { reactive } from 'vue';
import { api } from './api/moonraker';
import { state } from './store';

export const NS = 'voyager-ui-shots';
const KEEP = 60;
const W = 640;
export const shots = reactive({ ids: [], loaded: false }); // job ids that have a picture, oldest first

export async function loadShots() {
  try {
    const r = await api.call('server.database.get_item', { namespace: NS, key: 'index' });
    shots.ids = Array.isArray(r.value) ? r.value.map(String) : [];
  } catch {
    shots.ids = []; // no namespace yet
  }
  shots.loaded = true;
}
async function saveIndex(ids) {
  shots.ids = ids;
  await api.call('server.database.post_item', { namespace: NS, key: 'index', value: ids });
}

// one frame of the camera, from its snapshot address or else its stream, drawn turned and mirrored like the
// camera is set up; null when it does not answer in time or the browser may not read it (another address
// without CORS)
function frame(cam) {
  const src = cam.snapshot_url || cam.stream_url;
  if (!src) return Promise.resolve(null);
  const url = api.url(src);
  return new Promise((resolve) => {
    const img = new Image();
    if (/^https?:\/\//.test(url) && new URL(url).origin !== location.origin) img.crossOrigin = 'anonymous';
    const done = (v) => {
      clearTimeout(tm);
      img.onload = img.onerror = null;
      img.src = ''; // a stream keeps sending until its image goes
      resolve(v);
    };
    const tm = setTimeout(() => done(null), 8000);
    img.onerror = () => done(null);
    img.onload = () => {
      try {
        const rot = (((Number(cam.rotation) || 0) % 360) + 360) % 360;
        const side = rot === 90 || rot === 270;
        const k = Math.min(1, W / (side ? img.naturalHeight : img.naturalWidth));
        const w = Math.round(img.naturalWidth * k),
          h = Math.round(img.naturalHeight * k);
        const c = document.createElement('canvas');
        c.width = side ? h : w;
        c.height = side ? w : h;
        const g = c.getContext('2d');
        g.translate(c.width / 2, c.height / 2);
        g.rotate((rot * Math.PI) / 180);
        g.scale(cam.flip_horizontal ? -1 : 1, cam.flip_vertical ? -1 : 1);
        g.drawImage(img, -w / 2, -h / 2, w, h);
        done(c.toDataURL('image/jpeg', 0.78));
      } catch {
        done(null);
      }
    };
    img.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
  });
}

let busy = false;
export async function takeShot(job) {
  if (busy || state.settings.endShot === false || !job?.job_id) return;
  const cam = state.webcams.find((w) => w.enabled !== false);
  if (!cam) return;
  busy = true;
  try {
    // several open pages see the same end: one picture is enough
    await new Promise((r) => setTimeout(r, Math.random() * 1500));
    await loadShots();
    const id = String(job.job_id);
    if (shots.ids.includes(id)) return;
    const img = await frame(cam);
    if (!img) return;
    await api.call('server.database.post_item', {
      namespace: NS,
      key: id,
      value: { img, cam: cam.name, time: Date.now() / 1000, status: job.status },
    });
    const ids = [...shots.ids.filter((x) => x !== id), id];
    const old = ids.splice(0, Math.max(0, ids.length - KEEP));
    await saveIndex(ids);
    for (const k of old) api.call('server.database.delete_item', { namespace: NS, key: k }).catch(() => {});
  } catch {
    // no picture this time; the print itself is not affected
  } finally {
    busy = false;
  }
}

export async function getShot(id) {
  const r = await api.call('server.database.get_item', { namespace: NS, key: String(id) });
  return r.value;
}
export async function dropShots(ids) {
  const drop = ids.map(String).filter((x) => shots.ids.includes(x));
  if (!drop.length) return;
  for (const k of drop) await api.call('server.database.delete_item', { namespace: NS, key: k }).catch(() => {});
  await saveIndex(shots.ids.filter((x) => !drop.includes(x))).catch(() => {});
}

export function startEndShots() {
  api.on('notify_history_changed', ([p]) => {
    if (p?.action === 'finished' && p.job) takeShot(p.job);
  });
}
