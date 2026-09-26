// Heater health: each heater is compared with its own first measurement at the same target, never with a fixed
// number, because the power a heater needs depends on fans, enclosure and room. Two things are learned per
// heater and target and kept in the settings (heaterBase, per printer):
//   power  - average power while holding the target steadily for a minute (extruder: with the part fan speed)
//   heat   - seconds to heat up from a cold start (below 45°) to the target
// A later measurement is only compared when the conditions match (same target, similar part fan, similar start
// temperature). The findings are shown on the Health page.

export const COLD = 45; // a heat-up counts as a cold start below this
const FAN_TOL = 0.1,
  FROM_TOL = 8;

// base: { power, fan, t, heat, from }, cur: { power, fan, std }. Returns [{ kind, ... }]
export function holdFindings(base, cur) {
  const out = [];
  if (cur.std != null && cur.std > 1) out.push({ kind: 'swing', std: cur.std });
  if (!base?.power || cur.power == null) return out;
  const sameFan = base.fan == null || cur.fan == null || Math.abs(base.fan - cur.fan) <= FAN_TOL;
  if (sameFan && cur.power - base.power > 0.08 && cur.power / base.power > 1.3)
    out.push({
      kind: 'power',
      pct: Math.round((cur.power / base.power - 1) * 100),
      since: base.t,
      fan: base.fan != null,
    });
  return out;
}
export function heatFinding(base, secs, from) {
  if (!base?.heat || Math.abs((base.from ?? from) - from) > FROM_TOL) return null;
  return secs > base.heat * 1.3 && secs - base.heat > 20
    ? { kind: 'heat', secs, base: base.heat, since: base.t }
    : null;
}
