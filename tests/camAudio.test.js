import { describe, it, expect } from 'vitest';
import { parseGo2rtc, soundStream } from '../src/camAudio';

const CFG = `# go2rtc for the camera sound
api:
  listen: ":1984"
  origin: "*"
streams:
  mic: exec:ffmpeg -hide_banner -f alsa -ac 1 -ar 48000 -i hw:1,0 -c:a libopus -b:a 32k -f rtsp {output}
webrtc:
  candidates:
    - stun:8555
`;

describe('go2rtc.yaml', () => {
  it('finds the API port and the sound stream', () => {
    const c = parseGo2rtc(CFG);
    expect(c.port).toBe(1984);
    expect(Object.keys(c.streams)).toEqual(['mic']);
    expect(soundStream(c.streams)).toBe('mic');
  });
  it('reads list sources and picks the stream by its source', () => {
    const c = parseGo2rtc(`api:
  listen: 0.0.0.0:1990
streams:
  cam1:
    - rtsp://127.0.0.1:8554/cam
  room:
    - "exec:ffmpeg -f alsa -i default -c:a libopus -f rtsp {output}"
`);
    expect(c.port).toBe(1990);
    expect(soundStream(c.streams)).toBe('room');
  });
  it('falls back to the name, and to nothing', () => {
    expect(soundStream(parseGo2rtc('streams:\n  audio: rtsp://x/y\n').streams)).toBe('audio');
    expect(soundStream(parseGo2rtc('streams:\n  cam: rtsp://x/y\n').streams)).toBe(null);
    expect(soundStream({})).toBe(null);
  });
});

import { readNoise, writeNoise, noiseFilter } from '../src/camAudio';
describe('noise filter on the mic line', () => {
  const base = `streams:\n  mic: exec:ffmpeg -hide_banner -f alsa -ac 1 -ar 16000 -i plughw:CARD=WEBCAM -c:a libopus -b:a 32k -f rtsp {output}\n`;
  it('reads off, sets a level in front of the encoder, reads it back', () => {
    expect(readNoise(base, 'mic')).toBe('off');
    const on = writeNoise(base, 'mic', 'normal');
    expect(on).toContain(`-i plughw:CARD=WEBCAM -af ${noiseFilter(20)} -c:a libopus`);
    expect(readNoise(on, 'mic')).toBe('normal');
    expect(readNoise(writeNoise(on, 'mic', 'strong'), 'mic')).toBe('strong');
    expect(writeNoise(on, 'mic', 'off')).toBe(base);
  });
  it('leaves other lines alone and reports a filter of someone else as custom', () => {
    const two = `streams:\n  cam: rtsp://x/y\n${base.slice(9)}`;
    expect(writeNoise(two, 'mic', 'light')).toContain('  cam: rtsp://x/y\n');
    expect(readNoise(base.replace('-c:a', '-af volume=2 -c:a'), 'mic')).toBe('custom');
    expect(readNoise(base, 'nope')).toBe(null);
  });
});
