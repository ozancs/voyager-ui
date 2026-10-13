// The curve fit behind heatEta.js, kept free of the store so it can be tested on its own.
export const WIN = 180; // at most this many seconds of samples are used (slow chambers need a long look)
const MIN = 15; // seconds of data needed since the target was set

// raw estimate from the samples: { secs } or { levels: asymptote } or null (not heating / not enough data yet)
export function fit(t, g) {
  const n = t.length;
  if (n < MIN + 6) return null;
  const target = g[n - 1];
  const cur = t[n - 1];
  if (!(target > 0) || cur >= target - 1) return null;
  // samples since the target was last changed (a new target is a new heat-up)
  let k0 = n - 1;
  while (k0 > 0 && n - k0 < WIN && g[k0 - 1] === target) k0--;
  if (n - k0 < MIN) return { wait: true };
  // rates from 5-second differences, fitted against the temperature
  const xs = [],
    ys = [];
  for (let k = k0 + 5; k < n; k++) {
    xs.push((t[k] + t[k - 5]) / 2);
    ys.push((t[k] - t[k - 5]) / 5);
  }
  const m = xs.length;
  const mx = xs.reduce((a, v) => a + v, 0) / m,
    my = ys.reduce((a, v) => a + v, 0) / m;
  let sxx = 0,
    sxy = 0;
  for (let i = 0; i < m; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const recent = ys.slice(-8).reduce((a, v) => a + v, 0) / Math.min(8, ys.length);
  const spread = Math.max(...xs) - Math.min(...xs);
  const b = sxx > 0 ? sxy / sxx : 0;
  // enough temperature change in the window for the slope to mean something, and clearly slowing down
  if (spread > 1.5 && b < -0.002) {
    const a = my - b * mx;
    const asym = -a / b,
      tau = -1 / b;
    // short of the target: only said once at least one time constant has been watched, before that the fitted
    // asymptote still moves a lot (it starts low and climbs as the curve shows itself)
    if (asym < target - 0.8) {
      if (n - k0 >= Math.min(tau, WIN)) return { levels: asym };
      return recent > 0.003 ? { secs: (target - 0.5 - cur) / recent } : { wait: true };
    }
    const secs = tau * Math.log((asym - cur) / Math.max(0.05, asym - (target - 0.5)));
    if (Number.isFinite(secs) && secs > 0) return { secs };
  }
  if (recent < 0.003) return n - k0 >= 60 ? { levels: cur } : { wait: true }; // flat for a minute: stuck there
  return { secs: (target - 0.5 - cur) / recent };
}
