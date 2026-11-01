// Problem Solver knowledge: each print problem with the words people search for (English and Turkish), up to three
// questions that depend on the answers before them, and the causes that fit. A cause scores itself from the
// answers and the facts (facts.js), from 0 (does not fit) to 3 (most likely), and says what it rests on: the
// answer, the file, the print's history record or the printer today, plus what is missing. Each cause ends in
// one test or one change to try. General material ranges are guidance, never this printer's numbers.
import { RANGES, flowOf } from './facts';

const has = (v) => v != null && v !== '';
const deg = (v) => `${Math.round(v)}°`;
const range = (r) => `${r[0]}–${r[1]}°`;
// "Nozzle 250° (PETG usually 225–250°)"
function tempLine(f, kind) {
  const v = kind === 'nozzle' ? f.file.nozzleTemp : f.file.bedTemp;
  if (!has(v)) return null;
  const r = f.range?.[kind];
  return `${kind === 'nozzle' ? 'Nozzle' : 'Bed'} ${deg(v)}${r ? ` (${f.mat} usually ${range(r)})` : ''}`;
}
const above = (f, kind, slack = 0) => {
  const v = kind === 'nozzle' ? f.file.nozzleTemp : f.file.bedTemp;
  return has(v) && f.range ? v > f.range[kind][1] - slack : false;
};
const below = (f, kind) => {
  const v = kind === 'nozzle' ? f.file.nozzleTemp : f.file.bedTemp;
  return has(v) && f.range ? v < f.range[kind][0] : false;
};
const pick = (...xs) => xs.filter(Boolean);
const shaperText = (s) => (s ? `${s.type} ${s.freq} Hz` : 'not set');

export const PROBLEMS = [
  // ------------------------------------------------------------------ ringing
  {
    id: 'ringing',
    icon: 'wave',
    name: 'Ringing / ghosting',
    desc: 'Ripples that repeat after corners and holes',
    words: ['ringing', 'ghosting', 'echo', 'ripples', 'yansıma', 'dalgalanma', 'gölgelenme', 'hayalet'],
    questions: [
      {
        id: 'dir',
        q: 'Which way do the ripples run?',
        hint: 'Look at the wall right after a sharp corner.',
        opts: [
          { v: 'x', label: 'On walls along X', sub: 'left to right' },
          { v: 'y', label: 'On walls along Y', sub: 'front to back' },
          { v: 'both', label: 'Both, or not sure' },
        ],
      },
      {
        id: 'since',
        q: 'Since when?',
        opts: [
          { v: 'always', label: 'Always had it' },
          { v: 'change', label: 'Since I changed something', sub: 'parts, belts, settings' },
          { v: 'sudden', label: 'Suddenly, nothing changed' },
        ],
      },
    ],
    causes: [
      {
        id: 'noshaper',
        title: 'No input shaper set up',
        why: 'Without input shaping, the frame and toolhead ring after every sharp change of direction.',
        score: ({ f }) => (f.today.shaper ? 0 : 3),
        evidence: () => [['today', 'No [input_shaper] section in the config']],
        test: {
          label: 'Measure the input shaper',
          how: 'It needs an accelerometer. The result goes into [input_shaper] with SAVE_CONFIG.',
          calib: 'shaper',
          change: 'Set up only the shaper, then print the same file again.',
        },
      },
      {
        id: 'stale',
        title: 'The input shaper no longer fits the printer',
        why: 'A different toolhead, belt tension or frame moves the resonance away from what the shaper was set for.',
        score: ({ a, f }) => (!f.today.shaper ? 0 : a.since === 'change' ? 3 : a.since === 'always' ? 2 : 1),
        evidence: ({ a, f }) =>
          pick(
            a.since === 'change' && ['answer', 'It started after a change'],
            a.dir !== 'both' && ['answer', `Ripples along ${a.dir.toUpperCase()}`],
            ['today', `Shaper X ${shaperText(f.today.shaper?.x)} · Y ${shaperText(f.today.shaper?.y)}`],
          ),
        missing: () => ['When the shaper was last measured'],
        test: {
          label: 'Measure the input shaper again',
          how: 'Its result also gives the highest acceleration that still looks clean.',
          calib: 'shaper',
          change: 'Apply only the new shaper, then print the same file again.',
        },
      },
      {
        id: 'accel',
        title: 'Walls printed faster than the shaper can smooth',
        why: 'Above the acceleration the shaper result recommends, ripples come back even with a good shaper.',
        score: ({ f }) => {
          const acc = f.file.outerAccel || f.file.accel;
          if (!has(acc)) return 1;
          return acc >= 8000 ? 2 : acc >= 4000 ? 1 : 0;
        },
        evidence: ({ f }) =>
          pick(
            has(f.file.outerAccel) && ['file', `Outer wall acceleration ${f.file.outerAccel} mm/s²`],
            !has(f.file.outerAccel) && has(f.file.accel) && ['file', `Acceleration ${f.file.accel} mm/s²`],
            has(f.file.outerSpeed) && ['file', `Outer wall speed ${f.file.outerSpeed} mm/s`],
            has(f.today.maxAccel) && ['today', `max_accel ${f.today.maxAccel}`],
          ),
        missing: ({ f }) => (has(f.file.outerAccel) || has(f.file.accel) ? [] : ['The acceleration the file used']),
        test: {
          label: 'Print with half the outer wall acceleration',
          how: 'Set the outer wall acceleration in the slicer to about half and slice again.',
          change: 'Change only the outer wall acceleration.',
        },
      },
      {
        id: 'belts',
        title: 'Belt tension on one axis',
        why: 'Loose or uneven belts move the resonance of one axis and let it ring more.',
        score: ({ a }) => (a.dir === 'both' ? 0 : 2),
        evidence: ({ a }) => [['answer', `Only along ${a.dir?.toUpperCase()}`]],
        missing: () => ['Belt tension was not measured'],
        test: {
          label: 'Compare the belts',
          how: 'Shake&Tune compares both belt paths; otherwise check that both belts sound and feel alike.',
          tab: 'shaketune',
          change: 'Adjust only the belts, then measure the shaper again.',
        },
      },
      {
        id: 'loose',
        title: 'Something came loose',
        why: 'Ringing that appears out of nowhere is often a loose screw on the toolhead, a pulley grub screw or an idler.',
        score: ({ a }) => (a.since === 'sudden' ? 3 : 0),
        evidence: () => [['answer', 'It started suddenly']],
        test: {
          label: 'Check the toolhead and pulleys by hand',
          how: 'With the motors off, wiggle the toolhead and nozzle, and check the grub screws on the motor pulleys.',
          change: 'Tighten only what is loose, then print the same file again.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ stringing
  {
    id: 'stringing',
    icon: 'l:spline',
    name: 'Stringing',
    desc: 'Thin strands between parts or across gaps',
    words: ['stringing', 'oozing', 'hairs', 'cobweb', 'saçaklanma', 'saçak', 'örümcek ağı', 'ipliklenme'],
    questions: [
      {
        id: 'where',
        q: 'What do the strings look like?',
        opts: [
          { v: 'travel', label: 'Strands where the nozzle crossed a gap' },
          { v: 'hairs', label: 'Fine hairs all over' },
          { v: 'seam', label: 'Strings and blobs at the seam' },
        ],
      },
      {
        id: 'spool',
        q: 'How long has this spool been open?',
        opts: [
          { v: 'days', label: 'A few days' },
          { v: 'weeks', label: 'Weeks or more' },
          { v: 'dried', label: 'It was just dried' },
        ],
      },
    ],
    causes: [
      {
        id: 'temp',
        title: 'Nozzle temperature on the high side',
        why: 'Hotter plastic is runnier and keeps oozing while the nozzle travels.',
        score: ({ f }) => (above(f, 'nozzle') ? 3 : above(f, 'nozzle', 10) ? 2 : has(f.file.nozzleTemp) ? 0 : 1),
        evidence: ({ f }) => pick(tempLine(f, 'nozzle') && ['file', tempLine(f, 'nozzle')]),
        missing: ({ f }) => (has(f.file.nozzleTemp) ? [] : ['The nozzle temperature of the print']),
        test: {
          label: 'Print a temperature tower',
          how: 'Most slicers have one under Calibration. Pick the lowest temperature that still bonds well.',
          change: 'Change only the nozzle temperature.',
        },
      },
      {
        id: 'wet',
        title: 'Moist filament',
        why: 'Water in the filament boils in the nozzle and pushes plastic out while travelling.',
        score: ({ a, f }) =>
          a.spool === 'dried' ? 0 : (a.spool === 'weeks' ? 2 : 1) + (f.mat && RANGES[f.mat].wet ? 1 : 0),
        evidence: ({ a, f }) =>
          pick(
            a.spool === 'weeks' && ['answer', 'The spool has been open for weeks'],
            f.mat && RANGES[f.mat].wet && ['file', `${f.mat} takes up moisture quickly`],
          ),
        missing: () => ['Whether it pops or hisses while extruding'],
        test: {
          label: 'Dry the spool and print again',
          how: 'Dry it (PLA about 50°, PETG 65°, TPU and nylon higher) for a few hours, then print the same file.',
          change: 'Change only the filament dryness.',
        },
      },
      {
        id: 'retract',
        title: 'Retraction too short or too slow',
        why: 'Too little retraction leaves pressure in the nozzle while it crosses a gap.',
        score: ({ a, f }) => {
          const r = f.file.fwRetract ? f.today.fwRetract?.len : f.file.retract;
          const base = a.where === 'travel' ? 2 : 1;
          return has(r) && r >= 2 ? base - 1 : base;
        },
        evidence: ({ a, f }) =>
          pick(
            a.where === 'travel' && ['answer', 'Strands where the nozzle crossed a gap'],
            f.file.fwRetract
              ? ['today', `Firmware retraction ${f.today.fwRetract?.len ?? '?'} mm (the file uses G10)`]
              : has(f.file.retract) && [
                  'file',
                  `Retraction ${f.file.retract} mm${has(f.file.retractSpeed) ? ` at ${f.file.retractSpeed} mm/s` : ''}`,
                ],
          ),
        missing: () => ['Direct drive or Bowden (the usual length differs a lot)'],
        test: {
          label: 'Print a retraction test',
          how: 'Most slicers have one under Calibration. Direct drive usually needs 0.5–2 mm, Bowden 3–6 mm.',
          change: 'Change only the retraction length.',
        },
      },
      {
        id: 'travel',
        title: 'Slow travel moves',
        why: 'The longer the nozzle hangs over a gap, the more it oozes.',
        score: ({ a, f }) =>
          a.where !== 'travel' ? 0 : !has(f.file.travelSpeed) ? 1 : f.file.travelSpeed < 150 ? 2 : 0,
        evidence: ({ f }) => pick(has(f.file.travelSpeed) && ['file', `Travel speed ${f.file.travelSpeed} mm/s`]),
        test: {
          label: 'Raise the travel speed',
          how: 'Faster travel and "avoid crossing walls" in the slicer shorten the time over gaps.',
          change: 'Change only the travel speed.',
        },
      },
      {
        id: 'seampa',
        title: 'Pressure at the seam',
        why: 'Pressure left in the nozzle at the end of a loop comes out as a blob and a string.',
        score: ({ a }) => (a.where === 'seam' ? 2 : 0),
        evidence: ({ a, f }) =>
          pick(['answer', 'At the seam'], has(f.today.pa) && ['today', `Pressure advance ${f.today.pa}`]),
        test: {
          label: 'Tune pressure advance for this filament',
          how: 'A pressure advance test (PA Sensei or the slicer test) sets how much pressure is taken off before stops.',
          pa: true,
          change: 'Change only pressure advance.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ first layer
  {
    id: 'firstlayer',
    icon: 'layers2',
    name: 'Bad first layer',
    desc: 'Lines do not stick, gaps or ridges on the bed',
    words: ['first layer', 'adhesion', 'not sticking', 'bed adhesion', 'ilk katman', 'yapışmama', 'tutmuyor'],
    questions: [
      {
        id: 'look',
        q: 'What does the first layer look like?',
        opts: [
          { v: 'loose', label: 'Lines are round and do not stick', sub: 'they drag or lift' },
          { v: 'squish', label: 'Too flat, rough or with ridges' },
          { v: 'gaps', label: 'Gaps between the lines' },
        ],
      },
      {
        id: 'area',
        q: 'Is it the same everywhere on the bed?',
        opts: [
          { v: 'same', label: 'Yes, the same everywhere' },
          { v: 'area', label: 'No, good in some places, bad in others' },
        ],
      },
    ],
    causes: [
      {
        id: 'zoff',
        title: 'Z offset',
        why: 'Too high and the lines stay round and do not stick; too low and they are crushed into ridges.',
        score: ({ a }) => (a.area === 'area' ? 1 : 3),
        evidence: ({ a, f }) =>
          pick(
            a.look === 'loose' && ['answer', 'Round lines that do not stick: the nozzle is likely too high'],
            a.look === 'gaps' && ['answer', 'Gaps between lines: the nozzle is likely too high'],
            a.look === 'squish' && ['answer', 'Flat, rough lines: the nozzle is likely too low'],
            has(f.today.probeOffset) && ['today', `Probe z_offset ${f.today.probeOffset}`],
            has(f.today.zAdjust) &&
              f.today.zAdjust !== 0 && ['today', `Live Z adjust ${f.today.zAdjust.toFixed(3)} mm`],
          ),
        test: {
          label: 'Set the Z offset again',
          how: 'The paper test, then fine-tune with Live Z on a first-layer test print.',
          calib: 'zoffset',
          change: 'Change only the Z offset.',
        },
      },
      {
        id: 'mesh',
        title: 'The bed is not flat or the mesh is not used',
        why: 'An uneven bed puts the nozzle at a different height in different places.',
        score: ({ a }) => (a.area === 'area' ? 3 : 0),
        evidence: ({ f }) =>
          pick(
            ['answer', 'Good in some places, bad in others'],
            f.today.hasMesh
              ? ['today', f.today.mesh ? `Mesh "${f.today.mesh}" is loaded now` : 'No mesh is loaded right now']
              : ['today', 'No [bed_mesh] in the config'],
          ),
        missing: () => ['Whether the start G-code loads a mesh for the print'],
        test: {
          label: 'Measure the bed mesh',
          how: 'Then check that the start G-code or PRINT_START loads it (BED_MESH_PROFILE LOAD or a fresh mesh).',
          calib: 'mesh',
          change: 'Change only the mesh.',
        },
      },
      {
        id: 'bedtemp',
        title: 'Bed temperature low for this material',
        why: 'A bed that is too cool lets the first layer shrink and let go.',
        score: ({ a, f }) => (below(f, 'bed') ? (a.look === 'loose' ? 3 : 2) : 0),
        evidence: ({ f }) => pick(tempLine(f, 'bed') && ['file', tempLine(f, 'bed')]),
        test: {
          label: 'Raise the bed temperature 5–10°',
          how: 'In the filament settings of the slicer.',
          change: 'Change only the bed temperature.',
        },
      },
      {
        id: 'clean',
        title: 'Grease on the build plate',
        why: 'Fingerprints and oil stop the first layer from bonding, whatever the settings.',
        score: ({ a }) => (a.look === 'loose' ? 1 : 0),
        evidence: () => [['answer', 'Lines do not stick']],
        test: {
          label: 'Wash the plate',
          how: 'Dish soap and warm water, or isopropyl alcohol; then do not touch the print surface.',
          change: 'Change only the plate cleanliness.',
        },
      },
      {
        id: 'firstspeed',
        title: 'First layer printed fast',
        why: 'A fast first layer has less time to bond.',
        score: ({ f }) => (has(f.file.firstSpeed) && f.file.firstSpeed > 60 ? 1 : 0),
        evidence: ({ f }) => [['file', `First layer speed ${f.file.firstSpeed} mm/s`]],
        test: {
          label: 'Slow the first layer to 30–50 mm/s',
          how: 'In the slicer speed settings.',
          change: 'Change only the first layer speed.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ layer shift
  {
    id: 'shift',
    icon: 'l:move-horizontal',
    name: 'Layer shift',
    desc: 'Part of the print moved sideways',
    words: ['layer shift', 'shifted layers', 'skipped steps', 'katman kayması', 'kayma'],
    questions: [
      {
        id: 'axis',
        q: 'Which way did it move?',
        opts: [
          { v: 'x', label: 'Along X', sub: 'left or right' },
          { v: 'y', label: 'Along Y', sub: 'front or back' },
          { v: 'both', label: 'Both, or not sure' },
        ],
      },
      {
        id: 'when',
        q: 'Does it happen at the same height?',
        opts: [
          { v: 'same', label: 'Yes, at the same height each time' },
          { v: 'random', label: 'No, at different heights' },
          { v: 'crash', label: 'I heard the nozzle hit the print' },
        ],
      },
    ],
    causes: [
      {
        id: 'hit',
        title: 'The nozzle hit the print',
        why: 'Curled-up edges or overhangs catch the nozzle and push the head off its steps.',
        score: ({ a }) => (a.when === 'crash' ? 3 : 1),
        evidence: ({ a, f }) =>
          pick(
            a.when === 'crash' && ['answer', 'The nozzle was heard hitting the print'],
            has(f.file.zhop) && ['file', `Z hop ${f.file.zhop} mm`],
          ),
        test: {
          label: 'Turn on Z hop and check for curling',
          how: 'Z hop of about 0.2–0.4 mm in the slicer; more part cooling if edges curl up.',
          change: 'Change only Z hop.',
        },
      },
      {
        id: 'speed',
        title: 'Moves faster than the motors can follow',
        why: 'High travel acceleration or speed makes a motor skip steps, mostly with heavy toolheads.',
        score: ({ a, f }) => {
          const acc = f.file.travelAccel || f.file.accel;
          return a.when === 'crash' ? 0 : has(acc) && has(f.today.maxAccel) && acc >= f.today.maxAccel ? 2 : 1;
        },
        evidence: ({ f }) =>
          pick(
            has(f.file.travelAccel) && ['file', `Travel acceleration ${f.file.travelAccel} mm/s²`],
            has(f.file.travelSpeed) && ['file', `Travel speed ${f.file.travelSpeed} mm/s`],
            has(f.today.maxAccel) && ['today', `max_accel ${f.today.maxAccel}`],
          ),
        test: {
          label: 'Print with lower travel acceleration',
          how: 'Lower the travel acceleration in the slicer by about a third.',
          change: 'Change only the travel acceleration.',
        },
      },
      {
        id: 'pulley',
        title: 'Loose pulley or belt on that axis',
        why: 'A slipping grub screw or a loose belt loses position on one axis only.',
        score: ({ a }) => (a.axis === 'both' ? 0 : 2),
        evidence: ({ a }) => [['answer', `Only along ${a.axis?.toUpperCase()}`]],
        test: {
          label: 'Check the pulley grub screws and belt',
          how: 'With the motors off, hold the pulley and turn the motor shaft; nothing may slip.',
          change: 'Fix only what is loose.',
        },
      },
      {
        id: 'file',
        title: 'Something in the file at that height',
        why: 'A move through the part or a sudden speed change at one layer shifts every print of it the same way.',
        score: ({ a }) => (a.when === 'same' ? 3 : 0),
        evidence: () => [['answer', 'At the same height each time']],
        test: {
          label: 'Look at that layer in the G-code viewer',
          how: 'Turn on travel moves and look for a move that cuts through the part.',
          page: 'viewer',
          change: 'Re-slice only that part of the plate.',
        },
      },
      {
        id: 'current',
        title: 'Motor current or a hot driver',
        why: 'Drivers that get too hot cut out for a moment; too little current loses steps under load.',
        score: ({ a }) => (a.when === 'random' ? 1 : 0),
        evidence: ({ f }) =>
          pick(
            ['answer', 'At different heights'],
            (has(f.today.current.x) || has(f.today.current.y)) && [
              'today',
              `run_current X ${f.today.current.x ?? '?'} A · Y ${f.today.current.y ?? '?'} A`,
            ],
          ),
        test: {
          label: 'Check driver cooling and run_current',
          how: 'The Machine page shows driver warnings; the motor datasheet gives the rated current.',
          change: 'Change only the driver cooling or the current.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ under-extrusion
  {
    id: 'under',
    icon: 'drop',
    name: 'Under-extrusion',
    desc: 'Gaps between lines, thin or weak walls',
    words: ['under extrusion', 'underextrusion', 'gaps', 'weak walls', 'eksik ekstrüzyon', 'az akış', 'boşluk'],
    questions: [
      {
        id: 'where',
        q: 'Where is it worst?',
        opts: [
          { v: 'everywhere', label: 'Everywhere, from the start' },
          { v: 'fast', label: 'On fast parts like infill' },
          { v: 'later', label: 'It gets worse during the print' },
        ],
      },
      {
        id: 'click',
        q: 'Does the extruder click or grind?',
        opts: [
          { v: 'yes', label: 'Yes' },
          { v: 'no', label: 'No' },
          { v: 'unsure', label: 'Not sure' },
        ],
      },
    ],
    causes: [
      {
        id: 'flow',
        title: 'More flow than the hotend can melt',
        why: 'Above its melting limit the hotend lets through less plastic than the slicer asks for.',
        score: ({ a, f }) => {
          const q = flowOf(f.file.infillSpeed || f.file.innerSpeed, f.file.layer, f.file.lineWidth);
          return Math.min(3, (a.where === 'fast' ? 2 : 0) + (q > 15 ? 1 : 0) + (a.click === 'yes' ? 1 : 0));
        },
        evidence: ({ a, f }) => {
          const sp = f.file.infillSpeed || f.file.innerSpeed;
          const q = flowOf(sp, f.file.layer, f.file.lineWidth);
          return pick(
            a.where === 'fast' && ['answer', 'Worst on fast parts'],
            a.click === 'yes' && ['answer', 'The extruder clicks'],
            q && ['file', `${sp} mm/s × ${f.file.layer} mm × ${f.file.lineWidth} mm ≈ ${q} mm³/s`],
            has(f.file.maxFlow) && ['file', `Slicer flow limit ${f.file.maxFlow} mm³/s`],
          );
        },
        missing: () => ['The melting limit of this hotend'],
        test: {
          label: 'Print a max flow test',
          how: 'OrcaSlicer has one under Calibration; set the slicer flow limit a little under the result.',
          change: 'Change only the volumetric flow limit.',
        },
      },
      {
        id: 'cold',
        title: 'Nozzle temperature low for this material',
        why: 'Cooler plastic is thicker and needs more force to push through.',
        score: ({ f }) => (below(f, 'nozzle') ? 3 : 0),
        evidence: ({ f }) => [['file', tempLine(f, 'nozzle')]],
        test: {
          label: 'Raise the nozzle temperature 10°',
          how: 'In the filament settings of the slicer.',
          change: 'Change only the nozzle temperature.',
        },
      },
      {
        id: 'clog',
        title: 'Partial clog or heat creep',
        why: 'Plastic softening above the melt zone or debris in the nozzle chokes the flow as the print goes on.',
        score: ({ a }) => (a.where === 'later' ? 3 : a.click === 'yes' ? 1 : 0),
        evidence: ({ a }) =>
          pick(
            a.where === 'later' && ['answer', 'It gets worse during the print'],
            a.click === 'yes' && ['answer', 'The extruder clicks'],
          ),
        missing: () => ['Whether the hotend fan runs at full speed'],
        test: {
          label: 'Cold pull and check the hotend fan',
          how: 'A cold pull clears the nozzle; the hotend fan must run whenever the hotend is hot.',
          change: 'Change only the nozzle condition.',
        },
      },
      {
        id: 'esteps',
        title: 'Extruder not calibrated',
        why: 'If rotation_distance is off, every line gets the same too-small amount.',
        score: ({ a }) => (a.where === 'everywhere' ? 2 : 0),
        evidence: ({ f }) =>
          pick(
            ['answer', 'Everywhere, from the start'],
            has(f.today.rotation) && ['today', `rotation_distance ${f.today.rotation}`],
          ),
        test: {
          label: 'Measure 100 mm of extrusion',
          how: 'Mark the filament 120 mm above the extruder, extrude 100 mm slowly, measure what is left and correct rotation_distance.',
          change: 'Change only rotation_distance.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ corners
  {
    id: 'corners',
    icon: 'square',
    name: 'Bulging corners',
    desc: 'Corners stick out, edges are uneven',
    words: ['bulging corners', 'corner bulge', 'pressure advance', 'köşelerde şişme', 'köşe şişmesi'],
    questions: [
      {
        id: 'look',
        q: 'What do the corners look like?',
        opts: [
          { v: 'bulge', label: 'Corners bulge, the walls between are thinner' },
          { v: 'round', label: 'Corners are rounded off' },
        ],
      },
    ],
    causes: [
      {
        id: 'pa0',
        title: 'Pressure advance is off',
        why: 'Without it, pressure built up on straight lines pushes extra plastic out where the head slows for a corner.',
        score: ({ f }) => (f.today.pa === 0 && !has(f.file.pa) ? 3 : 0),
        evidence: () => [['today', 'pressure_advance is 0']],
        test: {
          label: 'Tune pressure advance',
          how: 'PA Sensei or a pressure advance test in the slicer.',
          pa: true,
          change: 'Change only pressure advance.',
        },
      },
      {
        id: 'patune',
        title: 'Pressure advance not tuned for this filament',
        why: 'Each filament and temperature needs its own value; a value from another filament leaves bulges or gaps.',
        score: ({ a, f }) => (f.today.pa > 0 || has(f.file.pa) ? (a.look === 'bulge' ? 2 : 1) : 0),
        evidence: ({ f }) =>
          pick(
            has(f.file.pa) && ['file', `The file sets pressure advance ${f.file.pa}`],
            f.today.pa > 0 && ['today', `Pressure advance ${f.today.pa}`],
            f.mat && ['file', `Filament ${f.mat}`],
          ),
        missing: () => ['Which filament the current value was tuned with'],
        test: {
          label: 'Tune pressure advance with this filament',
          how: 'PA Sensei or a pressure advance test, at the temperature you print with.',
          pa: true,
          change: 'Change only pressure advance.',
        },
      },
      {
        id: 'scv',
        title: 'Cornering too fast',
        why: 'A high square_corner_velocity or acceleration leaves less time to take pressure off before a corner.',
        score: ({ a, f }) => (a.look === 'round' ? 2 : has(f.today.scv) && f.today.scv > 8 ? 1 : 0),
        evidence: ({ f }) =>
          pick(
            has(f.today.scv) && ['today', `square_corner_velocity ${f.today.scv}`],
            has(f.file.outerAccel) && ['file', `Outer wall acceleration ${f.file.outerAccel} mm/s²`],
          ),
        test: {
          label: 'Lower the outer wall acceleration',
          how: 'About a third lower in the slicer, then compare the corners.',
          change: 'Change only the outer wall acceleration.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ zits
  {
    id: 'zits',
    icon: 'circle',
    name: 'Zits / blobs',
    desc: 'Small bumps on walls, often at the seam',
    words: ['zits', 'blobs', 'seam', 'pimples', 'sivilce', 'kabarcık', 'dikiş izi'],
    questions: [
      {
        id: 'where',
        q: 'Where are they?',
        opts: [
          { v: 'seam', label: 'Lined up on one line', sub: 'the seam' },
          { v: 'random', label: 'Scattered over the walls' },
        ],
      },
    ],
    causes: [
      {
        id: 'seam',
        title: 'Seam pressure',
        why: 'Each loop starts and ends at the seam; extra pressure there leaves a bump.',
        score: ({ a }) => (a.where === 'seam' ? 3 : 0),
        evidence: ({ f }) =>
          pick(
            ['answer', 'Lined up on the seam'],
            has(f.file.seam) && ['file', `Seam position: ${f.file.seam}`],
            has(f.today.pa) && ['today', `Pressure advance ${f.today.pa}`],
          ),
        test: {
          label: 'Tune pressure advance, then try a scarf seam',
          how: 'PA first; OrcaSlicer also has scarf seams and wipe on loops.',
          pa: true,
          change: 'Change only pressure advance first.',
        },
      },
      {
        id: 'retractrandom',
        title: 'Retraction and wipe on random spots',
        why: 'Bumps scattered over walls are often where the head stopped, retracted or changed layer.',
        score: ({ a }) => (a.where === 'random' ? 2 : 0),
        evidence: ({ f }) =>
          pick(
            ['answer', 'Scattered over the walls'],
            has(f.file.retract) && ['file', `Retraction ${f.file.retract} mm`],
            has(f.file.wipe) && ['file', `Wipe ${f.file.wipe ? 'on' : 'off'}`],
          ),
        test: {
          label: 'Turn on wipe while retracting',
          how: 'In the slicer, so the nozzle moves along the wall while it retracts instead of stopping on it.',
          change: 'Change only the wipe setting.',
        },
      },
      {
        id: 'wetzit',
        title: 'Moist filament',
        why: 'Steam bursts in the nozzle leave small random bumps and rough patches.',
        score: ({ a, f }) => (a.where === 'random' ? (f.mat && RANGES[f.mat].wet ? 2 : 1) : 0),
        evidence: ({ f }) => pick(f.mat && ['file', `Filament ${f.mat}`]),
        missing: () => ['How long the spool has been open'],
        test: {
          label: 'Dry the spool and print again',
          how: 'A few hours in a filament dryer at the temperature for the material.',
          change: 'Change only the filament dryness.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ warping
  {
    id: 'warping',
    icon: 'triangle',
    name: 'Warping',
    desc: 'Corners lift off the bed while printing',
    words: ['warping', 'lifting', 'curling', 'çarpılma', 'kalkma', 'eğilme'],
    questions: [
      {
        id: 'box',
        q: 'Is the printer enclosed?',
        opts: [
          { v: 'closed', label: 'Yes, enclosed' },
          { v: 'open', label: 'No, open frame' },
        ],
      },
      {
        id: 'how',
        q: 'How does it lift?',
        opts: [
          { v: 'corners', label: 'Corners of large parts curl up' },
          { v: 'whole', label: 'The whole part comes loose' },
        ],
      },
    ],
    causes: [
      {
        id: 'shrink',
        title: 'A material that shrinks, printed in open air',
        why: 'ABS, ASA, nylon and PC shrink as they cool; drafts and cool air pull the corners up.',
        score: ({ a, f }) => (f.mat && RANGES[f.mat].shrinks ? (a.box === 'open' ? 3 : 1) : 0),
        evidence: ({ a, f }) =>
          pick(['file', `Filament ${f.mat}`], a.box === 'open' && ['answer', 'Open frame printer']),
        missing: ({ a }) => (a.box === 'closed' ? ['Chamber temperature during the print'] : []),
        test: {
          label: 'Enclose the printer and let it warm up',
          how: 'An enclosure and 10–15 minutes of heat soak before printing.',
          change: 'Change only the enclosure and heat soak.',
        },
      },
      {
        id: 'bed',
        title: 'Bed temperature low for this material',
        why: 'The first layers need to stay warm enough to hold on while the part above shrinks.',
        score: ({ f }) => (below(f, 'bed') ? 3 : 0),
        evidence: ({ f }) => [['file', tempLine(f, 'bed')]],
        test: {
          label: 'Raise the bed temperature 5–10°',
          how: 'In the filament settings of the slicer.',
          change: 'Change only the bed temperature.',
        },
      },
      {
        id: 'brim',
        title: 'No brim on a large part',
        why: 'A brim gives the corners more area to hold on with.',
        score: ({ a, f }) => (a.how === 'corners' && has(f.file.brim) && f.file.brim === 0 ? 2 : 0),
        evidence: ({ f }) => [['file', `Brim width ${f.file.brim} mm`]],
        test: {
          label: 'Add a 5 mm brim',
          how: 'In the slicer, or mouse ears on the corners.',
          change: 'Change only the brim.',
        },
      },
      {
        id: 'fan',
        title: 'Part cooling too strong for this material',
        why: 'ABS and ASA cool too fast with a lot of fan and pull the layers below up.',
        score: ({ f }) => (f.mat && RANGES[f.mat].shrinks && has(f.file.fanMax) && f.file.fanMax > 40 ? 2 : 0),
        evidence: ({ f }) => [['file', `Part fan up to ${f.file.fanMax}%`]],
        test: {
          label: 'Lower the part fan',
          how: 'For ABS and ASA, 0–30% on walls is common.',
          change: 'Change only the fan speed.',
        },
      },
      {
        id: 'grip',
        title: 'First layer not holding',
        why: 'When the whole part lets go, the first layer itself is not bonded well.',
        score: ({ a }) => (a.how === 'whole' ? 3 : 0),
        evidence: () => [['answer', 'The whole part comes loose']],
        test: {
          label: 'Set the Z offset and clean the plate',
          how: 'A slightly lower nozzle and a clean plate; the Bad first layer guide goes deeper.',
          calib: 'zoffset',
          change: 'Change only the Z offset.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ elephant foot
  {
    id: 'foot',
    icon: 'layers',
    name: 'Elephant foot',
    desc: 'The bottom layers flare out',
    words: ['elephant foot', 'flare', 'bottom bulge', 'fil ayağı', 'taban şişmesi'],
    questions: [
      {
        id: 'look',
        q: 'How far up does it go?',
        opts: [
          { v: 'one', label: 'Only the first layer is wider' },
          { v: 'few', label: 'The first few millimetres flare out' },
        ],
      },
    ],
    causes: [
      {
        id: 'low',
        title: 'Nozzle a little too low on the first layer',
        why: 'A first layer pressed too hard spreads out wider than the walls.',
        score: ({ a }) => (a.look === 'one' ? 3 : 1),
        evidence: ({ f }) =>
          pick(
            has(f.today.zAdjust) &&
              f.today.zAdjust !== 0 && ['today', `Live Z adjust ${f.today.zAdjust.toFixed(3)} mm`],
            has(f.today.probeOffset) && ['today', `Probe z_offset ${f.today.probeOffset}`],
          ),
        test: {
          label: 'Raise the Z offset a little',
          how: 'About 0.02–0.05 mm with Live Z, on a first-layer test.',
          calib: 'zoffset',
          change: 'Change only the Z offset.',
        },
      },
      {
        id: 'hot',
        title: 'Bed hot enough to keep the bottom soft',
        why: 'On a hot bed the lower layers stay soft and sag under the weight above.',
        score: ({ a, f }) => (above(f, 'bed') ? (a.look === 'few' ? 3 : 2) : 0),
        evidence: ({ f }) => [['file', tempLine(f, 'bed')]],
        test: {
          label: 'Lower the bed 5–10° after the first layer',
          how: 'Most slicers take a separate temperature for the other layers.',
          change: 'Change only the bed temperature.',
        },
      },
      {
        id: 'comp',
        title: 'No elephant foot compensation in the slicer',
        why: 'The slicer can shrink the first layer a little to make up for the squish.',
        score: ({ f }) => (has(f.file.footComp) && f.file.footComp === 0 ? 2 : 0),
        evidence: ({ f }) => [['file', 'Elephant foot compensation 0 mm']],
        test: {
          label: 'Set elephant foot compensation to 0.1–0.2 mm',
          how: 'In the slicer quality settings.',
          change: 'Change only the compensation.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ overhangs
  {
    id: 'overhang',
    icon: 'l:layers-2',
    name: 'Droopy overhangs',
    desc: 'Overhangs and bridges sag or curl',
    words: ['overhang', 'bridging', 'sagging', 'curling', 'sarkma', 'köprü', 'çıkıntı'],
    questions: [
      {
        id: 'what',
        q: 'What goes wrong?',
        opts: [
          { v: 'sag', label: 'Bridges and overhangs sag' },
          { v: 'curl', label: 'Overhang edges curl up' },
        ],
      },
    ],
    causes: [
      {
        id: 'cool',
        title: 'Not enough part cooling',
        why: 'Overhangs need to freeze quickly; a weak fan or a low fan setting lets them droop or curl.',
        score: ({ f }) =>
          f.mat && RANGES[f.mat].shrinks ? 1 : has(f.file.overhangFan) && f.file.overhangFan < 80 ? 3 : 2,
        evidence: ({ f }) =>
          pick(
            has(f.file.overhangFan) && ['file', `Overhang fan ${f.file.overhangFan}%`],
            has(f.file.fanMax) && ['file', `Part fan up to ${f.file.fanMax}%`],
            !f.today.hasFan && ['today', 'No [fan] section for a part fan'],
          ),
        missing: () => ['Whether the fan really reaches the nozzle'],
        test: {
          label: 'Run an overhang test with the fan at 100%',
          how: 'Check the fan spins at full speed from the Devices card, then print an overhang test.',
          change: 'Change only the overhang fan speed.',
        },
      },
      {
        id: 'hotoh',
        title: 'Nozzle temperature on the high side',
        why: 'Hotter plastic stays soft longer and sags.',
        score: ({ f }) => (above(f, 'nozzle', 5) ? 2 : 0),
        evidence: ({ f }) => [['file', tempLine(f, 'nozzle')]],
        test: {
          label: 'Print 10° cooler',
          how: 'In the filament settings, or a temperature tower.',
          change: 'Change only the nozzle temperature.',
        },
      },
      {
        id: 'fastoh',
        title: 'Overhangs printed fast',
        why: 'Fast overhangs have no time to cool before the next line lands on them.',
        score: ({ f }) => (has(f.file.overhangSpeed) && f.file.overhangSpeed > 40 ? 2 : 1),
        evidence: ({ f }) => pick(has(f.file.overhangSpeed) && ['file', `Overhang speed ${f.file.overhangSpeed} mm/s`]),
        test: {
          label: 'Slow the overhangs down',
          how: 'Overhang and bridge speed of 15–30 mm/s in the slicer.',
          change: 'Change only the overhang speed.',
        },
      },
    ],
  },
];

// accents and dotless i do not matter: "sacak" finds "saçaklanma", "yapisma" finds "yapışmama"
export const fold = (s) => String(s).toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
export function findProblems(q, list = PROBLEMS) {
  const f = fold(q).trim();
  if (!f) return list.map((p) => ({ p, hit: null }));
  return list.map((p) => ({ p, hit: [p.name, ...p.words].find((w) => fold(w).includes(f)) })).filter((x) => x.hit);
}

// the next question for these answers (in order, at most three), null when all are answered
export function nextQuestion(p, a) {
  return p.questions.find((q) => !(q.id in a) && (!q.when || q.when(a))) || null;
}
// the causes that fit, most likely first; level 3 likely, 2 possible, 1 less likely
export function rankCauses(p, a, f) {
  const ctx = { a, f };
  return p.causes
    .map((c, i) => ({ c, i, score: Math.max(0, Math.min(3, c.score(ctx))) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.i - y.i)
    .map(({ c, score }) => ({
      id: c.id,
      title: c.title,
      why: c.why,
      level: score,
      evidence: (c.evidence?.(ctx) || []).filter((e) => e && e[1]),
      missing: c.missing?.(ctx) || [],
      test: c.test,
    }));
}
