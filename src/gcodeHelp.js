// What a console command does, for the tooltip on command lines in the console. Standard G-codes that
// Klipper supports come from the list below (translated); Klipper's own commands and macros use the help text
// Klipper reports (printer.gcode.help, in English) or the macro's description.
import { state } from './store';
import { t } from './i18n';

export const STD = {
  G0: 'Move (travel)',
  G1: 'Move, extruding when E is given',
  G2: 'Arc move, clockwise',
  G3: 'Arc move, counter-clockwise',
  G4: 'Wait (P = milliseconds)',
  G10: 'Retract (firmware retraction)',
  G11: 'Unretract (firmware retraction)',
  G17: 'Arcs on the XY plane',
  G28: 'Home the axes (all, or the ones given)',
  G90: 'Absolute positions for moves',
  G91: 'Relative positions for moves',
  G92: 'Set the current position without moving',
  M18: 'Motors off',
  M82: 'Absolute extrusion',
  M83: 'Relative extrusion',
  M84: 'Motors off',
  M104: 'Set the hotend temperature (does not wait)',
  M105: 'Report temperatures',
  M106: 'Part cooling fan speed (S0-255)',
  M107: 'Part cooling fan off',
  M109: 'Set the hotend temperature and wait for it',
  M110: 'Set the line number',
  M112: 'Emergency stop',
  M114: 'Report the current position',
  M115: 'Report the firmware version',
  M117: 'Show a message on the display',
  M118: 'Send a message to the console',
  M140: 'Set the bed temperature (does not wait)',
  M190: 'Set the bed temperature and wait for it',
  M204: 'Set the acceleration',
  M220: 'Speed factor in percent',
  M221: 'Extrusion factor (flow) in percent',
  M400: 'Wait until all moves are done',
};

// tooltip text for a command line, or '' when nothing is known about it
export function describe(line) {
  const word = String(line || '')
    .trim()
    .split(/\s+/)[0]
    .toUpperCase();
  if (!word) return '';
  if (STD[word]) return word + ': ' + t(STD[word]);
  const cmds = state.commands || {};
  const key = Object.keys(cmds).find((k) => k.toUpperCase() === word);
  const help = key && cmds[key];
  if (help && !/^G-Code macro$/i.test(help)) return word + ': ' + help;
  const macro = state.status['gcode_macro ' + (key || word)] || state.status['gcode_macro ' + word.toLowerCase()];
  if (macro?.description && !/^G-Code macro$/i.test(macro.description)) return word + ': ' + macro.description;
  return help ? word + ': ' + t('Macro') : '';
}
