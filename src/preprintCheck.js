// The checks of the pre-print check (preprint.js), without any browser or store code so they can be tested.
// Messages are English keys with {params}; the dialog translates them.
const msg = (text, params) => ({ text, params });

// material names are compared loosely: PLA and PLA+ match, ABS and ASA do not
const norm = (m) =>
  String(m || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
export function sameMaterial(a, b) {
  const x = norm(a),
    y = norm(b);
  if (!x || !y) return true;
  return x.includes(y) || y.includes(x);
}

// grams of filament for a length in mm, from the filament's diameter and density
export const gramsFor = (mm, diameter = 1.75, density = 1.24) =>
  ((Math.PI * (diameter / 2) ** 2 * mm) / 1000) * density;

// ctx: { meta, spool, settings (configfile.settings), toolhead, sensors: [{name, enabled, detected}], multiMaterial }
// returns [{ level: 'error' | 'warn', text }]
export function checkPrint(ctx) {
  const out = [];
  const m = ctx.meta || {};
  const types = String(m.filament_type || '')
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const oneMaterial = !ctx.multiMaterial && new Set(types.map(norm)).size <= 1;

  // filament sensors that say "empty" (skipped with an MMU: it loads the filament at print start)
  if (!ctx.multiMaterial)
    for (const s of ctx.sensors || [])
      if (s.enabled && s.detected === false)
        out.push({ level: 'warn', ...msg('{name} does not detect filament.', { name: s.name }) });

  // active Spoolman spool (only when Spoolman is set up and a spool is active)
  const sp = ctx.spool;
  if (sp && oneMaterial) {
    const fl = sp.filament || {};
    if (types[0] && fl.material && !sameMaterial(types[0], fl.material))
      out.push({
        level: 'warn',
        ...msg('The file is sliced for {file}, the active spool (#{id}) is {spool}.', {
          file: types[0],
          id: sp.id,
          spool: fl.material,
        }),
      });
    let need = +m.filament_weight_total || 0;
    if (!need && +m.filament_total > 0 && +fl.density > 0)
      need = gramsFor(+m.filament_total, +fl.diameter || 1.75, +fl.density);
    const left = sp.remaining_weight;
    if (need > 0 && typeof left === 'number' && left >= 0 && need > left)
      out.push({
        level: 'warn',
        ...msg('The print needs about {need} g, the active spool (#{id}) has {left} g left.', {
          need: Math.round(need),
          id: sp.id,
          left: Math.round(left),
        }),
      });
  }

  // nozzle and temperatures from the slicer against the config
  const ex = ctx.settings?.extruder || {};
  const nz = +m.nozzle_diameter,
    cnz = +ex.nozzle_diameter;
  if (nz > 0 && cnz > 0 && Math.abs(nz - cnz) > 0.01)
    out.push({
      level: 'warn',
      ...msg('The file is sliced for a {file} mm nozzle, the config says {cfg} mm.', { file: nz, cfg: cnz }),
    });
  const et = +m.first_layer_extr_temp,
    emax = +ex.max_temp;
  if (et > 0 && emax > 0 && et > emax)
    out.push({
      level: 'error',
      ...msg('The file heats the nozzle to {temp}°, max_temp is {max}°.', { temp: et, max: emax }),
    });
  const bt = +m.first_layer_bed_temp,
    bmax = +ctx.settings?.heater_bed?.max_temp;
  if (bt > 0 && bmax > 0 && bt > bmax)
    out.push({
      level: 'error',
      ...msg('The file heats the bed to {temp}°, max_temp is {max}°.', { temp: bt, max: bmax }),
    });
  const h = +m.object_height,
    zmax = +ctx.toolhead?.axis_maximum?.[2];
  if (h > 0 && zmax > 0 && h > zmax)
    out.push({ level: 'error', ...msg('The print is {h} mm tall, Z only goes to {max} mm.', { h, max: zmax }) });
  return out;
}
