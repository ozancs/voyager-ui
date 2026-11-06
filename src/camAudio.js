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
