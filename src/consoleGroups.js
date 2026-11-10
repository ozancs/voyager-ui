// Sensei lifecycle messages are plain text in Mainsail too. They are not
// protocol acknowledgements: only Klipper may emit an actual `ok`.
const lifecycle =
  /^\/\/\s*PA Sensei (tap|PA|mesh|tilt|home test|max flow|retraction|temperature scan|bundle): (starting|finished\b|stopped\b)/;

export function consoleGroups(lines, enabled) {
  const out = [];
  let group = null;
  for (const line of lines) {
    if (!enabled) {
      out.push({ key: line.id, lines: [line], grp: false });
      continue;
    }
    const event = line.type !== 'command' && line.message.match(lifecycle);
    if (line.type === 'command') {
      group = { key: line.id, lines: [line], last: line.time };
      out.push(group);
    } else if (event && event[2] === 'starting') {
      // Attach to a freshly sent command, or start a block inside PRINT_START.
      if (!group || group.lines.length !== 1 || group.lines[0].type !== 'command' || line.time - group.last > 10) {
        group = { key: line.id, lines: [], last: line.time };
        out.push(group);
      }
      group.operation = event[1];
      group.started = line.time;
      group.lines.push(line);
      group.last = line.time;
    } else if (group && (group.operation ? line.time - group.started < 1800 : line.time - group.last <= 10)) {
      group.lines.push(line);
      group.last = line.time;
      // A stopped notice precedes Klipper's error. Keep that error in the block.
      if (/^!!/.test(line.message) || (event && event[1] === group.operation && event[2] === 'finished')) group = null;
    } else {
      group = null;
      out.push({ key: line.id, lines: [line] });
    }
  }
  for (const block of out)
    block.grp = block.lines.length > 1 && (Boolean(block.operation) || block.lines[0].type === 'command');
  return out;
}
