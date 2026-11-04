// Colouring the G-code viewer by feature type or by speed. gcode-preview colours by tool (T0, T1 …), so the file
// is rewritten before parsing: a T line is put in wherever the feature or the speed bucket changes, and the real
// tool changes are dropped for these two modes. The viewer then gets one colour per index.

// feature groups: slicer ;TYPE: comments (PrusaSlicer, OrcaSlicer, Bambu Studio, Cura, ideaMaker) -> group index
const FEATURES = [
  ['Outer wall', '#ff6b1a', /^(outer wall|external perimeter|wall-outer|overhang wall|overhang perimeter)/],
  ['Inner wall', '#f5b23a', /^(inner wall|perimeter|wall-inner)/],
  ['Top / bottom', '#e0e4ea', /^(top surface|bottom surface|top solid infill|solid infill|internal solid infill|skin)/],
  ['Infill', '#8b6cff', /^(sparse infill|internal infill|fill|infill)/],
  ['Bridge', '#38d6ff', /^(bridge|internal bridge)/],
  ['Support', '#3dd68c', /^(support|support interface|support material)/],
  ['Skirt / brim', '#7a8290', /^(skirt|brim|skirt\/brim|prime tower|wipe tower)/],
  ['Other', '#9aa3ad', /./],
];
const SPEED_COLORS = ['#3a4bd1', '#2f7fe0', '#2fb6c9', '#3dd68c', '#b9d64a', '#f5c451', '#ff8f3a', '#ff3d4f'];
const T_LINE = /^\s*T\d+\s*(;.*)?$/i;

// `map[k]` is the line of the original file that line k of the rewritten text came from (an inserted T line
// maps to the line after it), so following the print by file position still works.
export function colorByFeature(text) {
  const used = new Set();
  let cur = -1;
  const out = [],
    map = [];
  const lines = text.split('\n');
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const m = /^;\s*(?:TYPE|FEATURE):\s*(.+?)\s*$/i.exec(line); // PrusaSlicer/Cura ;TYPE:, Orca/Bambu ; FEATURE:
    if (m) {
      const key = m[1].toLowerCase();
      const i = FEATURES.findIndex(([, , re]) => re.test(key));
      if (i !== cur) {
        cur = i;
        used.add(i);
        out.push('T' + i);
        map.push(k);
      }
      out.push(line);
      map.push(k);
      continue;
    }
    out.push(T_LINE.test(line) ? ';' + line : line);
    map.push(k);
  }
  return {
    text: out.join('\n'),
    map,
    colors: FEATURES.map(([, c]) => c),
    legend: FEATURES.map(([l, c], i) => ({ label: l, color: c, used: used.has(i) })),
  };
}

// speed of every extruding move (G1 with X or Y and a positive E), bucketed into 8 steps between the slowest
// and the fastest (ignoring the 2% fastest, which are usually a few travel-like moves)
export function colorBySpeed(text, { flow = false, diameter = 1.75 } = {}) {
  const lines = text.split('\n');
  const speeds = [];
  let f = 0,
    x = 0,
    y = 0,
    e = 0;
  let relative = false,
    relativeE = false;
  const area = Math.PI * (diameter / 2) ** 2;
  const moves = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].split(';', 1)[0].trim().toUpperCase();
    const cmd = /^[GM]\d+/.exec(l)?.[0];
    if (cmd === 'G90' || cmd === 'G91') relative = cmd === 'G91';
    if (cmd === 'M82' || cmd === 'M83') relativeE = cmd === 'M83';
    if (!['G0', 'G00', 'G1', 'G01', 'G92'].includes(cmd)) continue;
    const p = Object.fromEntries(
      [...l.matchAll(/([XYEF])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g)].map(([, k, v]) => [k, Number(v)]),
    );
    if (cmd === 'G92') {
      x = p.X ?? x;
      y = p.Y ?? y;
      e = p.E ?? e;
      continue;
    }
    f = p.F ?? f;
    const nx = p.X === undefined ? x : relative ? x + p.X : p.X;
    const ny = p.Y === undefined ? y : relative ? y + p.Y : p.Y;
    const ne = p.E === undefined ? e : relativeE || relative ? e + p.E : p.E;
    const distance = Math.hypot(nx - x, ny - y);
    if (distance > 0 && ne > e && f > 0) {
      const value = flow ? ((ne - e) * area * (f / 60)) / distance : f;
      speeds.push(value);
      moves.push([i, value]);
    }
    x = nx;
    y = ny;
    e = ne;
  }
  if (!speeds.length) return { text, map: null, colors: SPEED_COLORS, legend: [] };
  const sorted = [...speeds].sort((a, b) => a - b);
  const lo = sorted[0],
    clipped = sorted[Math.floor((sorted.length - 1) * 0.98)],
    hi = clipped > lo ? clipped : sorted[sorted.length - 1];
  const n = SPEED_COLORS.length;
  const bucket = (v) => (hi <= lo ? 0 : Math.min(n - 1, Math.floor(((v - lo) / (hi - lo)) * n)));
  const marks = new Map();
  let cur = -1;
  for (const [i, v] of moves) {
    const b = bucket(v);
    if (b !== cur) {
      cur = b;
      marks.set(i, b);
    }
  }
  const out = [],
    map = [];
  for (let i = 0; i < lines.length; i++) {
    if (marks.has(i)) {
      out.push('T' + marks.get(i));
      map.push(i);
    }
    out.push(T_LINE.test(lines[i]) ? ';' + lines[i] : lines[i]);
    map.push(i);
  }
  const mm = (v) => (flow ? Number(v.toFixed(1)) : Math.round(v / 60));
  return {
    text: out.join('\n'),
    map,
    colors: SPEED_COLORS,
    legend: SPEED_COLORS.map((c, i) => ({
      color: c,
      label: `${mm(lo + ((hi - lo) * i) / n)}–${mm(lo + ((hi - lo) * (i + 1)) / n)} ${flow ? 'mm³/s' : 'mm/s'}`,
      used: true,
    })),
  };
}

// point in polygon (ray casting), polygon as [[x, y], ...]
export function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}
// the object under a bed point: inside its polygon, or the closest centre within 15 mm
export function objectAt(x, y, objects) {
  for (const o of objects || []) if (o.polygon?.length > 2 && inPolygon(x, y, o.polygon)) return o.name;
  let best = null,
    bd = 15;
  for (const o of objects || []) {
    if (!o.center) continue;
    const d = Math.hypot(o.center[0] - x, o.center[1] - y);
    if (d < bd) {
      bd = d;
      best = o.name;
    }
  }
  return best;
}
