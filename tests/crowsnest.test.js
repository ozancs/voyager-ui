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

import { parseCamControls, parseV4l2ctl, v4l2ctlString } from '../src/crowsnest.js';
describe('camera controls from crowsnest.log', () => {
  const log = [
    '[10/27/26 14:03:12] crowsnest: INFO: Detect available Devices',
    '[10/27/26 14:03:12] crowsnest: /dev/v4l/by-id/usb-Cam-video-index0 -> /dev/video0',
    '[10/27/26 14:03:12] crowsnest: Supported Formats:',
    "[10/27/26 14:03:12] crowsnest:\t\t[0]: 'MJPG' (Motion-JPEG, compressed)",
    '[10/27/26 14:03:12] crowsnest: Supported Controls:',
    '[10/27/26 14:03:12] crowsnest:\t\t                     brightness 0x00980900 (int)    : min=-64 max=64 step=1 default=0 value=10',
    '[10/27/26 14:03:12] crowsnest:\t\t  white_balance_automatic 0x0098090c (bool)   : default=1 value=1',
    '[10/27/26 14:03:12] crowsnest:\t\t                  auto_exposure 0x009a0901 (menu)   : min=0 max=3 default=3 value=3 (Aperture Priority Mode)',
    '[10/27/26 14:03:12] crowsnest:\t\t\t\t1: Manual Mode',
    '[10/27/26 14:03:12] crowsnest:\t\t\t\t3: Aperture Priority Mode',
    '[10/27/26 14:03:12] crowsnest:\t\t         exposure_time_absolute 0x009a0902 (int)    : min=1 max=5000 step=1 default=157 value=157 flags=inactive',
    '[10/27/26 14:03:13] crowsnest: INFO: No usable CSI Devices found.',
  ].join('\n');
  it('reads each control with its range, value and menu', () => {
    const c = parseCamControls(log);
    expect(c['/dev/video0']).toBe(c['/dev/v4l/by-id/usb-Cam-video-index0']);
    const [b, wb, ae, ex] = c['/dev/video0'];
    expect(b).toMatchObject({ name: 'brightness', type: 'int', min: -64, max: 64, def: 0, value: 10 });
    expect(wb).toMatchObject({ name: 'white_balance_automatic', type: 'bool', value: 1 });
    expect(ae.menu).toEqual([
      { v: 1, label: 'Manual Mode' },
      { v: 3, label: 'Aperture Priority Mode' },
    ]);
    expect(ex.inactive).toBe(true);
    expect(c['/dev/video0']).toHaveLength(4);
  });
  it('keeps v4l2ctl in order', () => {
    const o = parseV4l2ctl('focus_automatic_continuous=0, focus_absolute=30');
    o.brightness = '5';
    expect(v4l2ctlString(o)).toBe('focus_automatic_continuous=0,focus_absolute=30,brightness=5');
  });
});
