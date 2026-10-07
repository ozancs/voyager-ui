import { describe, it, expect } from 'vitest';
import { parseCrowsnest, writeCrowsnest } from '../src/crowsnest.js';
const CONF = `[crowsnest]
log_path: ~/printer_data/logs/crowsnest.log

[cam 1]
mode: ustreamer                         # ustreamer - Provides mjpg and snapshots.
port: 8080                              # HTTP/MJPG Stream/Snapshot Port
device: /dev/video0                     # See Log for available ...
resolution: 640x480                     # widthxheight format
max_fps: 15                             # If Hardware Supports this it will be forced, otherwise ignored/coerced.
#custom_flags:                          # You can run the Stream Services with custom flags.
`;
describe('crowsnest.conf', () => {
  it('parses cams', () => {
    const c = parseCrowsnest(CONF);
    expect(c.length).toBe(1);
    expect(c[0].opts).toEqual({
      mode: 'ustreamer',
      port: '8080',
      device: '/dev/video0',
      resolution: '640x480',
      max_fps: '15',
    });
  });
  it('writes only what changed and keeps comments', () => {
    const c = parseCrowsnest(CONF);
    c[0].opts.resolution = '1280x720';
    c[0].opts.max_fps = '';
    c[0].opts.custom_flags = '--format=MJPEG';
    const out = writeCrowsnest(CONF, c);
    expect(out).toMatch(/resolution: 1280x720\s+# widthxheight format/);
    expect(out).not.toContain('max_fps: 15');
    expect(out).toContain('[cam 1]\ncustom_flags: --format=MJPEG');
    expect(out).toContain('log_path: ~/printer_data/logs/crowsnest.log');
  });
});
