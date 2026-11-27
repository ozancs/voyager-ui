// iframe webcams with a printer path load from the printer's port 80, not Voyager's own port
import { describe, it, expect } from 'vitest';
import { iframePageUrl } from '../src/camUrl.js';

const api = (host) => ({
  host,
  isMoonrakerPath: (p) => /^\/(server|printer|machine|access|api)\//.test(p),
  url: (p) => 'API' + p,
});
const loc = { protocol: 'http:', host: '192.168.0.243:1977' };

describe('iframePageUrl', () => {
  it('loads a page path from the printer, port 80', () => {
    expect(iframePageUrl('/belay-gauge', api(''), loc)).toBe('http://192.168.0.243/belay-gauge');
    expect(iframePageUrl('belay-gauge/?x=1', api(''), loc)).toBe('http://192.168.0.243/belay-gauge/?x=1');
    expect(iframePageUrl('/belay-gauge', api('192.168.0.208:7125'), loc)).toBe('http://192.168.0.208/belay-gauge');
  });
  it('leaves full addresses, webcam streams and Moonraker paths alone', () => {
    expect(iframePageUrl('http://10.0.0.5:8080/x', api(''), loc)).toBe('APIhttp://10.0.0.5:8080/x');
    expect(iframePageUrl('/webcam2/?action=stream', api(''), loc)).toBe('API/webcam2/?action=stream');
    expect(iframePageUrl('/server/files/x.html', api(''), loc)).toBe('API/server/files/x.html');
  });
});
