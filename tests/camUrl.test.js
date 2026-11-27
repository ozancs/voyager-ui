// iframe webcams with a printer path load from the printer's main web server, not Voyager's own port
import { describe, it, expect, vi, afterEach } from 'vitest';
import { iframePageUrl, findWebServer } from '../src/camUrl.js';

const api = (host) => ({
  host,
  isMoonrakerPath: (p) => /^\/(server|printer|machine|access|api)\//.test(p),
  url: (p) => 'API' + p,
});
const loc = { protocol: 'http:', host: '192.168.0.243:1977' };
// a web server only on the given ports of that printer
const serveOn = (...origins) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => (origins.some((o) => url.startsWith(o + '/')) ? Promise.resolve({}) : Promise.reject(new Error()))),
  );
afterEach(() => vi.unstubAllGlobals());

describe('iframePageUrl', () => {
  it('loads a page path from the printer, port 80 until another port answers', () => {
    serveOn();
    expect(iframePageUrl('/belay-gauge', api(''), loc)).toBe('http://192.168.0.243/belay-gauge');
    expect(iframePageUrl('belay-gauge/?x=1', api(''), loc)).toBe('http://192.168.0.243/belay-gauge/?x=1');
    expect(iframePageUrl('/belay-gauge', api('192.168.0.208:7125'), loc)).toBe('http://192.168.0.208/belay-gauge');
  });
  it('leaves full addresses, webcam streams and Moonraker paths alone', () => {
    expect(iframePageUrl('http://10.0.0.5:8080/x', api(''), loc)).toBe('APIhttp://10.0.0.5:8080/x');
    expect(iframePageUrl('/webcam2/?action=stream', api(''), loc)).toBe('API/webcam2/?action=stream');
    expect(iframePageUrl('/server/files/x.html', api(''), loc)).toBe('API/server/files/x.html');
  });
  it('uses the port the main web server answers on', async () => {
    serveOn('http://10.0.0.9:4408', 'http://10.0.0.9:8080');
    await findWebServer('10.0.0.9', loc);
    expect(iframePageUrl('/belay-gauge', api('10.0.0.9:7125'), loc)).toBe('http://10.0.0.9:4408/belay-gauge');
  });
  it("skips Voyager's own address", async () => {
    const own = { protocol: 'http:', host: '10.0.0.7' };
    serveOn('http://10.0.0.7', 'http://10.0.0.7:81');
    await findWebServer('10.0.0.7', own);
    expect(iframePageUrl('/belay-gauge', api(''), own)).toBe('http://10.0.0.7:81/belay-gauge');
  });
});
