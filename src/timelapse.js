// moonraker-timelapse: settings, the frames of the running print, rendering and the finished clips.
// The component takes one snapshot per layer (or every N seconds in hyperlapse mode) from one camera and
// renders them with ffmpeg when the print ends. Clips land in the "timelapse" file root, frames of the
// current print in "timelapse_frames". It talks over machine.timelapse.* and sends notify_timelapse_event.
import { reactive, computed, watch } from 'vue';
import { api } from './api/moonraker';
import { state, toast, updateToast, closeToast, printState, layerInfo } from './store';
import { t } from './i18n';

export const tl = reactive({
  has: false, // the component is loaded in Moonraker
  settings: null, // last settings read (see FIELDS)
  saving: false,
  frames: 0, // frames taken so far for the current print
  lastFrame: '', // file name of the newest frame (timelapse_frames root)
  lastAt: 0, // when it arrived
  render: null, // { status: 'started'|'running'|'success'|'error', progress, msg, filename }
  files: [], // finished clips: { name, size, modified, preview, printfile, date }
  loading: false,
});

// a clip name is timelapse_<gcode file>_<date>.mp4; the date part follows time_format_code (%Y%m%d_%H%M by default)
export function clipInfo(name) {
  const m = /^(?:timelapse_)?(.*?)(?:_(\d{8}_\d{4,6}))?\.mp4$/i.exec(name);
  return { printfile: m ? m[1] : name.replace(/\.mp4$/i, ''), date: m?.[2] || '' };
}
export function clipDate(d) {
  if (!d) return '';
  const dt = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(9, 11) || 0, +d.slice(11, 13) || 0);
  return isNaN(dt)
    ? d
    : dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const frameUrl = (f) => (f ? api.fileUrl('timelapse_frames', f) : ''); // each frame has its own name
export const clipUrl = (f) => api.fileUrl('timelapse', f.name);
export const previewUrl = (f) => (f.preview ? api.fileUrl('timelapse', f.preview) : '');

export const available = computed(() => tl.has);
// seconds the finished clip will have with the current settings
export function clipLength(frames = tl.frames) {
  const s = tl.settings;
  if (!s || !frames) return 0;
  if (s.variable_fps) {
    const fps = Math.min(s.variable_fps_max || 60, Math.max(s.variable_fps_min || 5, frames / (s.targetlength || 10)));
    return frames / fps;
  }
  return frames / (s.output_framerate || 30);
}
// frames the print will end with: one per layer in layer mode, one per cycle in hyperlapse mode
export const framesAtEnd = computed(() => {
  const s = tl.settings;
  if (!s || !['printing', 'paused'].includes(printState.value)) return 0;
  if (s.mode === 'hyperlapse') {
    const est = state.currentMeta?.estimated_time; // needs the slicer's time estimate
    return est && s.hyperlapse_cycle ? Math.round(est / s.hyperlapse_cycle) : 0;
  }
  return layerInfo.value.total || 0;
});

export async function loadSettings() {
  try {
    tl.settings = await api.call('machine.timelapse.get_settings', {});
    tl.has = true;
  } catch (e) {
    if (e.code === -32601 || /method not found/i.test(e.message || '')) tl.has = false;
  }
}
export async function saveSettings(patch) {
  tl.saving = true;
  try {
    const r = await api.call('machine.timelapse.post_settings', patch);
    tl.settings = r && typeof r === 'object' && 'enabled' in r ? r : { ...tl.settings, ...patch };
  } catch (e) {
    toast(t('Timelapse: {err}', { err: e.message }), 'error');
  }
  tl.saving = false;
}
export async function loadFrames() {
  try {
    const r = await api.call('machine.timelapse.lastframeinfo', {});
    tl.frames = r.framecount || 0;
    tl.lastFrame = r.lastframefile || '';
    tl.lastAt = Date.now();
  } catch {}
}
export async function loadFiles() {
  tl.loading = true;
  try {
    const all = await api.call('server.files.list', { root: 'timelapse' });
    const imgs = new Set(all.filter((f) => /\.jpg$/i.test(f.path)).map((f) => f.path));
    tl.files = all
      .filter((f) => /\.mp4$/i.test(f.path))
      .map((f) => ({
        name: f.path,
        size: f.size,
        modified: f.modified,
        preview: imgs.has(f.path + '.jpg') ? f.path + '.jpg' : '',
        ...clipInfo(f.path.split('/').pop()),
      }))
      .sort((a, b) => b.modified - a.modified);
  } catch {
    tl.files = [];
  }
  tl.loading = false;
}
export async function render() {
  try {
    await api.call('machine.timelapse.render', {});
  } catch (e) {
    toast(t('Timelapse: {err}', { err: e.message }), 'error');
  }
}
export async function saveFrames() {
  try {
    await api.call('machine.timelapse.saveframes', {});
    toast(t('Frames are being packed into a zip in the timelapse folder'), 'info');
  } catch (e) {
    toast(t('Timelapse: {err}', { err: e.message }), 'error');
  }
}
export async function deleteClip(f) {
  await api.call('server.files.delete_file', { path: 'timelapse/' + f.name });
  if (f.preview) api.call('server.files.delete_file', { path: 'timelapse/' + f.preview }).catch(() => {});
  tl.files = tl.files.filter((x) => x !== f);
}

let renderToast = null;
function onEvent(p) {
  if (!p || typeof p !== 'object') return;
  if (p.action === 'newframe') {
    tl.frames = p.framecount ?? (p.frame != null ? +p.frame : tl.frames + 1);
    if (p.framefile) tl.lastFrame = p.framefile;
    tl.lastAt = Date.now();
    tl.has = true;
  } else if (p.action === 'render') {
    tl.render = { status: p.status, progress: p.progress ?? 0, msg: p.msg || '', filename: p.filename || '' };
    if (p.status === 'started' || p.status === 'running') {
      const txt = t('Rendering timelapse…');
      if (!renderToast)
        renderToast = toast(txt, 'info', {
          sticky: true,
          bar: p.progress ? p.progress / 100 : true,
          hint: p.msg || '',
        });
      else updateToast(renderToast, { bar: p.progress ? p.progress / 100 : true, hint: p.msg || '' });
    } else {
      if (renderToast) closeToast(renderToast);
      renderToast = null;
      if (p.status === 'success') {
        toast(t('Timelapse ready: {file}', { file: (p.filename || '').split('/').pop() }), 'ok', {
          ms: 12000,
          action: { label: t('Open'), run: () => (state.anchor = 'timelapse:' + (p.filename || '')) },
        });
        tl.frames = 0;
        tl.lastFrame = '';
        loadFiles();
      } else if (p.status === 'error') toast(t('Timelapse render failed: {msg}', { msg: p.msg || '' }), 'error');
      else if (p.status === 'skipped') toast(t('Timelapse: nothing to render ({msg})', { msg: p.msg || '' }), 'info');
    }
  } else if (p.action === 'saveframes' && p.status === 'success') {
    toast(t('Frames saved: {file}', { file: (p.filename || '').split('/').pop() }), 'info');
    loadFiles();
  }
}

let wired = false;
export function initTimelapse() {
  if (wired) return;
  wired = true;
  api.on('notify_timelapse_event', ([p]) => onEvent(p));
  // the component shows up in server.info once Moonraker has it loaded
  watch(
    () => state.components,
    (c) => {
      const has = (c || []).includes('timelapse');
      if (has && !tl.has) {
        loadSettings().then(() => {
          loadFrames();
          loadFiles();
        });
      } else if (!has) tl.has = false;
    },
    { immediate: true },
  );
  // a print that ends with autorender off still has its frames: refresh the count when the state changes
  watch(printState, () => tl.has && loadFrames());
}
