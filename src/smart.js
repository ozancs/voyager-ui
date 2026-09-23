// "Smart" commands for the Ctrl+K box: "chamber 40", "bed off", "fan 50", "speed 120", "z offset -0.05", "home xy"...
// Every result is checked against the printer (heater exists, max_temp, homed axes, axis limits) before it is offered.
import { state, S, prettyName, shortName, gcode, setHeater, setFan, applyPreset } from './store'
import { t } from './i18n'
import { macroParams, mainParam } from './macros'

const norm = (s) => s.toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim()
const cfg = (obj) => S('configfile').settings?.[obj.toLowerCase()] || {}
const fmt = (v, d = 1) => (v == null || isNaN(v) ? '--' : (+v).toFixed(d).replace(/\.0+$/, ''))

const CHAMBER = ['chamber', 'enclosure', 'kabin', 'hazne', 'chamber temp']
const OFF = ['off', 'kapat', 'kapalı', 'stop', 'dur', 'none', 'zero']
const ON = ['on', 'aç', 'açık', 'max', 'full', 'tam', 'maksimum']
const COLORS = {
  red: '#ff0000', kırmızı: '#ff0000', green: '#00ff00', yeşil: '#00ff00', blue: '#0000ff', mavi: '#0000ff', white: '#ffffff', beyaz: '#ffffff',
  yellow: '#ffcc00', sarı: '#ffcc00', orange: '#ff6600', turuncu: '#ff6600', purple: '#8800ff', mor: '#8800ff', pink: '#ff3d7f', pembe: '#ff3d7f', cyan: '#00ffff', turkuaz: '#00ffff',
}

// ---------- targets the user can talk about ----------
function targets() {
  const out = []
  const heaters = S('heaters').available_heaters || []
  for (const h of heaters) {
    let al = [norm(shortName(h)), norm(prettyName(h))]
    if (h === 'extruder') al.push('nozzle', 'hotend', 'hot end', 'ext', 'nozul', 'nozzle temp', 'ekstruder', 'uç', 'tool', 't0')
    else if (/^extruder\d+$/.test(h)) { const n = h.slice(8); al.push('e' + n, 'tool' + n, 't' + n) }
    else if (h === 'heater_bed') al.push('bed', 'heater bed', 'heatbed', 'hotbed', 'plate', 'tabla', 'yatak', 'bed temp')
    if (/chamber|enclosure|kabin/i.test(h)) al.push(...CHAMBER)
    out.push({ kind: 'heater', obj: h, al, pri: 3 })
  }
  for (const o of state.objects) {
    const [type] = o.split(' ')
    if (type === 'temperature_fan') {
      const al = [norm(shortName(o)), norm(prettyName(o)), norm(shortName(o)) + ' fan']
      if (/chamber|enclosure|kabin/i.test(o)) al.push(...CHAMBER)
      out.push({ kind: 'tempfan', obj: o, al, pri: 2 })
    } else if (o === 'fan') out.push({ kind: 'fan', obj: o, al: ['fan', 'part fan', 'part', 'part cooling', 'cooling', 'print fan', 'parça fanı', 'parça fan', 'm106', norm(prettyName(o))], pri: 3 })
    else if (type === 'fan_generic') out.push({ kind: 'fan', obj: o, al: [norm(shortName(o)), norm(shortName(o)) + ' fan', norm(prettyName(o))], pri: 3 })
    else if (type === 'output_pin' && !o.startsWith('output_pin _')) out.push({ kind: 'pin', obj: o, al: [norm(shortName(o)), norm(prettyName(o))], pri: 2 })
    else if (['neopixel', 'led', 'dotstar', 'pca9533', 'pca9632'].includes(type)) out.push({ kind: 'led', obj: o, al: [norm(shortName(o)), norm(prettyName(o)), 'led', 'leds', 'light', 'lights', 'ışık'], pri: 2 })
  }
  out.push(
    { kind: 'speed', al: ['speed', 'speed factor', 'print speed', 'hız', 'baskı hızı', 'm220', 'feedrate'], pri: 3 },
    { kind: 'flow', al: ['flow', 'flow rate', 'extrusion', 'extrusion factor', 'akış', 'm221'], pri: 3 },
    { kind: 'pa', al: ['pa', 'pressure advance', 'pressure', 'advance'], pri: 3 },
    { kind: 'zoff', al: ['z offset', 'zoffset', 'offset', 'z ofset', 'babystep', 'baby step'], pri: 3 },
    { kind: 'accel', al: ['accel', 'acceleration', 'max accel', 'ivme'], pri: 3 },
    { kind: 'velocity', al: ['velocity', 'max velocity', 'max speed', 'speed limit'], pri: 3 },
    { kind: 'scv', al: ['scv', 'square corner', 'square corner velocity'], pri: 3 },
    { kind: 'mcr', al: ['mcr', 'minimum cruise ratio', 'cruise ratio', 'cruise'], pri: 3 },
    { kind: 'extrude', al: ['extrude', 'purge', 'ekstrüzyon', 'filament push'], pri: 3 },
    { kind: 'retract', al: ['retract', 'geri çek'], pri: 3 },
  )
  for (const a of ['x', 'y', 'z']) out.push({ kind: 'move', axis: a, al: [a, 'move ' + a, a + ' axis', 'go ' + a], pri: 1 })
  return out
}

function nameScore(q, al) {
  let best = -1
  for (const a of al) {
    if (!a) continue
    let s = -1
    if (a === q) s = 100
    else if (q.length >= 2 && a.startsWith(q)) s = 70 - (a.length - q.length)
    else if (q.length >= 3 && a.split(' ').some((w) => w.startsWith(q))) s = 55
    else if (q.length >= 3 && q.split(' ').every((w) => a.includes(w))) s = 50
    else if (q.length >= 4 && a.includes(q)) s = 40
    best = Math.max(best, s)
  }
  return best
}

// ---------- parse ----------
function parse(raw) {
  let q = raw.toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ').trim()
  q = q.replace(/^(set|ayarla|make|put)\s+/, '').replace(/\s+(ayarla|yap)$/, '')
  let m
  // "<name> [to|=|:] <number><unit>"
  if ((m = q.match(/^(.+?)\s*(?:\bto\b|=|:|->)?\s*([-+]?\d*\.?\d+)\s*(%|°c|°|c|mm\/s²|mm\/s2|mm\/s|mm|s)?$/))) {
    return { name: m[1].trim(), num: parseFloat(m[2]), signed: /^[-+]/.test(m[2]), unit: m[3] || '' }
  }
  // "<number><unit> <name>"
  if ((m = q.match(/^([-+]?\d*\.?\d+)\s*(%|°c|°|c)?\s+(.+)$/))) return { name: m[3].trim(), num: parseFloat(m[1]), signed: /^[-+]/.test(m[1]), unit: m[2] || '' }
  // "<name> off|on|max|<color>"
  const words = q.split(' ')
  const last = words[words.length - 1]
  if (words.length >= 2 && (OFF.includes(last) || ON.includes(last) || COLORS[last])) return { name: words.slice(0, -1).join(' '), word: last }
  return { name: q }
}

// ---------- build results ----------
export function smartResults(raw) {
  const p = parse(raw)
  if (!p.name) return []
  const name = norm(p.name)
  const out = []
  const res = (o) => out.push({ icon: 'bolt', cat: t('Quick action'), dest: t('Runs command'), ...o })
  const homed = S('toolhead').homed_axes || ''

  // presets and home work without a number
  if (p.num == null && !p.word) {
    for (const pr of state.settings.presets || []) {
      const pn = norm(pr.name)
      if (name === pn || name === 'preheat ' + pn || name === pn + ' preheat' || name === pn + ' ısıt') {
        const txt = Object.entries(pr.temps || {}).filter(([h, v]) => v && state.objects.includes(h)).map(([h, v]) => `${prettyName(h)} ${v}°`).join(', ')
        res({ t: t('Preheat {name}', { name: pr.name }), s: txt, icon: 'flame', run: () => applyPreset(pr), sc: 990 })
      }
    }
    let m
    if ((m = name.match(/^(home|g28|homing)(?: (all|[xyz]{1,3}|[xyz](?: [xyz]){0,2}))?$/))) {
      const ax = (m[2] && m[2] !== 'all' ? m[2].replace(/ /g, '') : '').toUpperCase()
      res({ t: ax ? t('Home {axes}', { axes: ax.split('').join(', ') }) : t('Home all axes'), s: 'G28' + (ax ? ' ' + ax.split('').join(' ') : ''), icon: 'home', run: () => gcode('G28' + (ax ? ' ' + ax.split('').join(' ') : '')), sc: 990 })
    }
    return out
  }

  const cands = targets().map((tg) => ({ tg, sc: nameScore(name, tg.al) })).filter((c) => c.sc >= 40)
  cands.sort((a, b) => b.sc - a.sc || b.tg.pri - a.tg.pri)
  const seen = new Set()
  for (const { tg, sc } of cands.slice(0, 4)) {
    const key = tg.kind + (tg.obj || tg.axis || '')
    if (seen.has(key)) continue
    seen.add(key)
    const r = build(tg, p, homed)
    if (r) res({ ...r, sc: 900 + sc })
  }
  // a macro with that name and a number: "chamber 40" -> CHAMBER TEMP=40
  if (p.num != null) {
    const mname = name.replace(/ /g, '_').toUpperCase()
    if (state.objects.includes('gcode_macro ' + mname)) {
      const mp = mainParam(macroParams(mname))
      if (mp) {
        const cmd = `${mname} ${mp.name}=${p.num}`
        res({ t: t('Run {cmd}', { cmd }), s: t('Macro {name}', { name: mname }), icon: 'play', run: () => gcode(cmd), sc: 880 })
      }
    }
  }
  return out
}

function build(tg, p, homed) {
  const n = p.num, off = OFF.includes(p.word), on = ON.includes(p.word)
  const nm = tg.obj ? prettyName(tg.obj) : ''
  switch (tg.kind) {
    case 'heater':
    case 'tempfan': {
      if (p.unit === '%' || p.word && !off) return null
      const v = off ? 0 : n
      if (v == null || v < 0) return null
      const s = S(tg.obj), max = cfg(tg.obj).max_temp, min = cfg(tg.obj).min_temp
      const cmd = tg.kind === 'tempfan' ? `SET_TEMPERATURE_FAN_TARGET TEMPERATURE_FAN=${shortName(tg.obj)} TARGET=${v}` : `SET_HEATER_TEMPERATURE HEATER=${shortName(tg.obj)} TARGET=${v}`
      const bad = max != null && v > max ? t('Above max_temp ({max}°)', { max }) : v > 0 && min != null && v < min ? t('Below min_temp ({min}°)', { min }) : ''
      return { t: v === 0 ? t('Turn off {name}', { name: nm }) : t('Set {name} to {v}°', { name: nm, v: fmt(v) }), s: `${t('now')} ${fmt(s.temperature)}° → ${v}°  ·  ${cmd}`, icon: 'flame', run: () => setHeater(tg.obj, v), warn: bad, disabled: !!bad }
    }
    case 'fan': {
      if (p.word && !off && !on) return null
      let v = off ? 0 : on ? 100 : n <= 1 && !p.unit && String(n).includes('.') ? n * 100 : n
      if (v == null || v < 0 || v > 100) return { t: t('Set {name} to {v}%', { name: nm, v: fmt(v, 0) }), s: '', icon: 'fan', warn: t('Fan speed is 0-100%'), disabled: true, run: () => {} }
      return { t: v === 0 ? t('Turn off {name}', { name: nm }) : t('Set {name} to {v}%', { name: nm, v: fmt(v, 0) }), s: `${t('now')} ${Math.round((S(tg.obj).speed || 0) * 100)}% → ${fmt(v, 0)}%`, icon: 'fan', run: () => setFan(tg.obj, v) }
    }
    case 'pin': {
      const c = cfg(tg.obj), scale = c.scale || 1, pwm = !!c.pwm
      let v
      if (off) v = 0
      else if (on) v = scale
      else if (n == null) return null
      else if (pwm) v = p.unit === '%' || n > 1 ? (Math.min(100, n) / 100) * scale : n * scale
      else v = n ? scale : 0
      const shown = pwm ? Math.round((v / scale) * 100) + '%' : v ? t('on') : t('off')
      return { t: t('Set {name} to {v}', { name: nm, v: shown }), s: `SET_PIN PIN=${shortName(tg.obj)} VALUE=${+v.toFixed(3)}`, icon: 'bulb', run: () => gcode(`SET_PIN PIN=${shortName(tg.obj)} VALUE=${+v.toFixed(3)}`) }
    }
    case 'led': {
      let hex = off ? '#000000' : on ? '#ffffff' : COLORS[p.word]
      if (!hex && n != null) { const g = Math.max(0, Math.min(100, n)) / 100; const h = Math.round(g * 255).toString(16).padStart(2, '0'); hex = '#' + h + h + h }
      if (!hex) return null
      const [r, g, b] = [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3))
      const cmd = `SET_LED LED=${shortName(tg.obj)} RED=${r} GREEN=${g} BLUE=${b} SYNC=0 TRANSMIT=1`
      return { t: off ? t('Turn off {name}', { name: nm }) : t('Set {name} to {v}', { name: nm, v: p.word || (n != null ? n + '%' : hex) }), s: cmd, icon: 'bulb', swatch: hex, run: () => gcode(cmd) }
    }
    case 'speed':
    case 'flow': {
      if (n == null || p.word) return null
      const cur = tg.kind === 'speed' ? S('gcode_move').speed_factor : S('gcode_move').extrude_factor
      const ok = n >= 1 && n <= 500
      return { t: t(tg.kind === 'speed' ? 'Set speed factor to {v}%' : 'Set flow to {v}%', { v: fmt(n, 0) }), s: `${t('now')} ${Math.round((cur || 1) * 100)}%  ·  ${tg.kind === 'speed' ? 'M220' : 'M221'} S${Math.round(n)}`, icon: tg.kind === 'speed' ? 'bolt' : 'drop', run: () => gcode(`${tg.kind === 'speed' ? 'M220' : 'M221'} S${Math.round(n)}`), disabled: !ok, warn: ok ? '' : '1-500%' }
    }
    case 'pa': {
      if (n == null || n < 0 || n > 2) return null
      return { t: t('Set pressure advance to {v}', { v: n }), s: `${t('now')} ${fmt(S('extruder').pressure_advance, 4)}  ·  SET_PRESSURE_ADVANCE ADVANCE=${n}`, icon: 'load', run: () => gcode(`SET_PRESSURE_ADVANCE ADVANCE=${n}`) }
    }
    case 'zoff': {
      if (n == null || Math.abs(n) > 5) return null
      const cur = S('gcode_move').homing_origin?.[2] ?? 0
      const adjust = p.signed && /baby/.test(p.name)
      const cmd = adjust ? `SET_GCODE_OFFSET Z_ADJUST=${n} MOVE=1` : `SET_GCODE_OFFSET Z=${n} MOVE=1`
      return { t: adjust ? t('Adjust Z offset by {v} mm', { v: (n > 0 ? '+' : '') + n }) : t('Set Z offset to {v} mm', { v: n }), s: `${t('now')} ${fmt(cur, 3)} → ${fmt(adjust ? cur + n : n, 3)}  ·  ${cmd}`, icon: 'target', run: () => gcode(cmd), warn: homed.includes('z') ? '' : t('Home Z first'), disabled: !homed.includes('z') }
    }
    case 'accel':
    case 'velocity':
    case 'scv':
    case 'mcr': {
      if (n == null || n <= 0) return null
      const K = { accel: ['ACCEL', 'max_accel', 'mm/s²', 'Set max acceleration to {v}'], velocity: ['VELOCITY', 'max_velocity', 'mm/s', 'Set max velocity to {v}'], scv: ['SQUARE_CORNER_VELOCITY', 'square_corner_velocity', 'mm/s', 'Set square corner velocity to {v}'], mcr: ['MINIMUM_CRUISE_RATIO', 'minimum_cruise_ratio', '', 'Set minimum cruise ratio to {v}'] }[tg.kind]
      if (tg.kind === 'mcr' && n >= 1) return null
      const cur = S('toolhead')[K[1]]
      return { t: t(K[3], { v: n + (K[2] ? ' ' + K[2] : '') }), s: `${t('now')} ${fmt(cur, 2)}  ·  SET_VELOCITY_LIMIT ${K[0]}=${n}`, icon: 'bolt', run: () => gcode(`SET_VELOCITY_LIMIT ${K[0]}=${n}`) }
    }
    case 'extrude':
    case 'retract': {
      if (n == null || n <= 0 || n > 200) return null
      const d = tg.kind === 'extrude' ? n : -n
      const hot = S('extruder').can_extrude
      return { t: t(tg.kind === 'extrude' ? 'Extrude {v} mm' : 'Retract {v} mm', { v: n }), s: `M83 · G1 E${d} F300`, icon: tg.kind === 'extrude' ? 'load' : 'unload', run: () => gcode(`M83\nG1 E${d} F300`), warn: hot ? '' : t('Hotend is too cold'), disabled: !hot }
    }
    case 'move': {
      if (n == null || p.word) return null
      const i = 'xyz'.indexOf(tg.axis), A = tg.axis.toUpperCase()
      const pos = S('toolhead').position?.[i], min = S('toolhead').axis_minimum?.[i], max = S('toolhead').axis_maximum?.[i]
      const rel = p.signed
      const target = rel ? (pos ?? 0) + n : n
      const F = tg.axis === 'z' ? 600 : 6000
      const bad = !homed.includes(tg.axis) ? t('Home {axes} first', { axes: A }) : (min != null && target < min) || (max != null && target > max) ? t('Outside {a} limits ({min} to {max})', { a: A, min: fmt(min), max: fmt(max) }) : ''
      const cmd = rel ? `G91\nG1 ${A}${n} F${F}\nG90` : `G90\nG1 ${A}${n} F${F}`
      return { t: rel ? t('Move {a} by {v} mm', { a: A, v: (n > 0 ? '+' : '') + n }) : t('Move {a} to {v} mm', { a: A, v: n }), s: `${t('now')} ${fmt(pos, 2)} → ${fmt(target, 2)}`, icon: 'move', run: () => gcode(cmd), warn: bad, disabled: !!bad }
    }
  }
  return null
}

// typed raw g-code ("CHAMBER TEMP=50", "G28 X") -> offer to run it as is
export function rawCommand(raw) {
  const q = raw.trim()
  const first = q.split(/\s+/)[0]?.toUpperCase()
  if (!first || q.length < 2) return null
  const known = Object.keys(state.commands).some((k) => k.toUpperCase() === first) || state.objects.includes('gcode_macro ' + first) || /^[GM]\d+$/.test(first)
  if (!known || !/\s/.test(q) && !/^[GM]\d+$/.test(first)) return null
  const cmd = first + q.slice(first.length)
  return { t: t('Run {cmd}', { cmd }), s: t('Sends this line as typed'), icon: 'term', cat: t('Quick action'), dest: t('Runs command'), run: () => gcode(cmd), sc: 950 }
}
