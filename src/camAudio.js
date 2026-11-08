// Camera sound through go2rtc (a sound-only stream next to the MJPEG picture). Found by itself, nothing to set up:
// go2rtc.yaml in the config folder gives the API port (api.listen) and the sound stream (a source reading ALSA or
// with "audio" in it, or a stream named mic / audio), then go2rtc's /api/streams has to list that stream. If any
// step does not hold, there is no sound button and nothing is said.
import { api } from './api/moonraker';

// the streams section of go2rtc.yaml, as { name: all its sources joined }. A small reader for the shapes go2rtc's
// config uses (`name: source`, `name:` with `- source` items under it); not a full YAML parser.
export function parseGo2rtc(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n');
  const out = { port: 0, streams: {} };
  let sect = '';
  let indent = -1;
  let cur = null;
  for (const raw of lines) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const ind = raw.length - raw.trimStart().length;
    const line = raw.trim();
    if (ind === 0) {
      sect = (line.match(/^([\w-]+):/) || [])[1] || '';
      indent = -1;
      cur = null;
      continue;
    }
    if (sect === 'api') {
      const m = line.match(/^listen:\s*["']?([^"'\s]*)/);
      if (m) out.port = +(m[1].match(/:(\d+)$/) || [])[1] || 0;
    } else if (sect === 'streams') {
      const m = line.match(/^["']?([\w.-]+)["']?:\s*(.*)$/);
      if (m && (indent < 0 || ind <= indent)) {
        indent = ind;
        cur = m[1];
        out.streams[cur] = m[2] || '';
      } else if (cur) out.streams[cur] += ' ' + line.replace(/^-\s*/, '');
    }
  }
  return out;
}
// the stream that carries the sound: by its source first, by its name next
export function soundStream(streams) {
  const names = Object.keys(streams || {});
  return (
    names.find((n) => /-f\s+alsa\b|\baudio\b/i.test(streams[n])) || names.find((n) => /^(mic|audio)$/i.test(n)) || null
  );
}

const cache = new Map(); // printer address -> Promise<{ base, name } | null>
export function findCamAudio() {
  const key = api.host || location.host;
  if (!cache.has(key))
    cache.set(
      key,
      detect().catch(() => {
        cache.delete(key); // not connected yet or a hiccup: the next view asks again
        return null;
      }),
    );
  return cache.get(key);
}
async function detect() {
  // listed first, so a printer without go2rtc does not get a "not found" request every time the page opens
  const dir = await api.call('server.files.get_directory', { path: 'config', extended: false });
  if (!(dir?.files || []).some((f) => f.filename === 'go2rtc.yaml')) return null;
  const r = await api.fetch('/server/files/config/go2rtc.yaml');
  if (!r.ok) return null;
  const cfg = parseGo2rtc(await r.text());
  const name = soundStream(cfg.streams);
  if (!name) return null;
  const host = (api.host || location.host).replace(/:\d+$/, '') || location.hostname;
  const base = `http://${host}:${cfg.port || 1984}`;
  const res = await fetch(base + '/api/streams', { signal: AbortSignal.timeout?.(4000) });
  if (!res.ok) return null;
  const list = await res.json();
  return list && Object.prototype.hasOwnProperty.call(list, name) ? { base, name } : null;
}

// ---- noise filter on the sound stream (Settings > Cameras) ----
// ffmpeg's own filters on the microphone line: a high-pass takes out the hum of fans and motors, a low-pass the hiss
// above speech, and afftdn learns the steady noise and takes it out (tn=1: keeps learning, so a fan that changes
// speed is followed). nr says how hard afftdn works.
export const NOISE_LEVELS = { off: 0, light: 12, normal: 20, strong: 30 };
const AF_RE = /\s-af\s+("[^"]*"|'[^']*'|\S+)/;
export const noiseFilter = (nr) => `highpass=f=200,lowpass=f=6000,afftdn=nr=${nr}:nf=-30:tn=1`;
// the microphone line of go2rtc.yaml: its start (up to and including the line's name and the colon) and the source
function micLine(text, name) {
  const re = new RegExp(`^([ \\t]+["']?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?:[ \\t]*)(.*)$`, 'm');
  return text.match(re);
}
// what the line has now: a level name, 'custom' for a filter that is not one of ours, 'off' for none
export function readNoise(text, name) {
  const m = micLine(text, name);
  if (!m) return null;
  const af = m[2].match(AF_RE)?.[1]?.replace(/^["']|["']$/g, '') || '';
  if (!af) return 'off';
  for (const [k, nr] of Object.entries(NOISE_LEVELS)) if (nr && af === noiseFilter(nr)) return k;
  return 'custom';
}
// the text with the line's filter set to a level (off: no -af at all); null when the line is not there
export function writeNoise(text, name, level) {
  const m = micLine(text, name);
  if (!m) return null;
  const nr = NOISE_LEVELS[level] ?? 0;
  let src = m[2].replace(AF_RE, '');
  if (nr) {
    // after the input and in front of the encoder, where ffmpeg expects a filter: `-c:a`, or the output `-f`
    // when there is no encoder (`-f alsa` before `-i` is the input's format, not that)
    const inAt = src.search(/\s-i\s+\S+/);
    const from = inAt >= 0 ? inAt + src.slice(inAt).match(/\s-i\s+\S+/)[0].length : 0;
    const rel = src.slice(from).search(/\s-(c:a|codec:a|acodec|f)\s/);
    const at = rel >= 0 ? from + rel : -1;
    const ins = ` -af ${noiseFilter(nr)}`;
    src = at >= 0 ? src.slice(0, at) + ins + src.slice(at) : src + ins;
  }
  return text.replace(m[0], m[1] + src);
}
// Settings > Cameras: read the level, or set one. Setting writes go2rtc.yaml (a copy of the old file stays as
// go2rtc.yaml.bak) and restarts go2rtc through its own API, so the new filter is used from the next listen on.
export async function getNoise() {
  const s = await findCamAudio();
  if (!s) return null;
  const r = await api.fetch('/server/files/config/go2rtc.yaml');
  if (!r.ok) return null;
  const level = readNoise(await r.text(), s.name);
  return level ? { level, name: s.name } : null;
}
export async function setNoise(level) {
  const s = await findCamAudio();
  if (!s) throw new Error('no sound stream');
  const r = await api.fetch('/server/files/config/go2rtc.yaml');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const before = await r.text();
  const after = writeNoise(before, s.name, level);
  if (after == null) throw new Error('stream line not found');
  if (after === before) return;
  const up = (name, text) => api.upload(new Blob([text], { type: 'text/plain' }), { root: 'config', name });
  await up('go2rtc.yaml.bak', before);
  await up('go2rtc.yaml', after);
  await fetch(s.base + '/api/restart', { method: 'POST' }).catch(() => {});
}
