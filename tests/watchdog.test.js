// A printer switched off at the plug leaves the socket open: the watchdog has to notice the silence.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let sockets = [];
class FakeWS {
  static OPEN = 1;
  constructor() {
    this.readyState = 0;
    this.sent = [];
    sockets.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 10);
  }
  send(d) {
    this.sent.push(JSON.parse(d));
    if (this.alive) {
      const { id } = JSON.parse(d);
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id, result: {} }) }), 50);
    }
  }
  close() {
    this.readyState = 3; // a dead connection: no close event comes
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  sockets = [];
  globalThis.WebSocket = FakeWS;
  globalThis.location = { protocol: 'http:', host: 'printer' };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({ result: {} }) });
});
afterEach(() => vi.useRealTimers());

async function connected() {
  const { Moonraker } = await import('../src/api/moonraker.js');
  const api = new Moonraker();
  const closes = [];
  api.on('close', () => closes.push(Date.now()));
  await api.connect('');
  await vi.advanceTimersByTimeAsync(20);
  return { api, closes, ws: sockets[0] };
}

describe('silent socket watchdog', () => {
  it('a socket that goes quiet and does not answer counts as closed', async () => {
    const { closes, ws } = await connected();
    expect(ws.readyState).toBe(1);
    await vi.advanceTimersByTimeAsync(9000);
    expect(closes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(9000); // 10 s silence, probe, 5 s without an answer
    expect(ws.sent.some((m) => m.method === 'server.info')).toBe(true);
    expect(closes).toHaveLength(1);
  });
  it('a quiet socket that still answers stays', async () => {
    const { closes, ws } = await connected();
    ws.alive = true;
    await vi.advanceTimersByTimeAsync(60000);
    expect(closes).toHaveLength(0);
  });
  it('regular messages keep it alive without probing', async () => {
    const { closes, ws } = await connected();
    for (let i = 0; i < 30; i++) {
      ws.onmessage({ data: JSON.stringify({ method: 'notify_proc_stat_update', params: [{}] }) });
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(ws.sent).toHaveLength(0);
    expect(closes).toHaveLength(0);
  });
});
