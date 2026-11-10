import { describe, it, expect } from 'vitest';
import { consoleGroups } from '../src/consoleGroups';
const line = (id, time, message, type = 'response') => ({ id, time, message, type });
describe('console operation grouping', () => {
  it('keeps a long tap together and releases later messages', () => {
    const blocks = consoleGroups(
      [
        line(1, 0, 'SENSEI_TAP', 'command'),
        line(2, 1, '// PA Sensei tap: starting'),
        line(3, 65, '// PA Sensei tap: nozzle offset applied'),
        line(4, 66, '// PA Sensei tap: finished (65 s)'),
        line(5, 67, '// unrelated'),
      ],
      true,
    );
    expect(blocks.map((b) => b.lines.length)).toEqual([4, 1]);
    expect(blocks[0].grp).toBe(true);
  });
  it('groups operations inside a print without an echoed command', () => {
    expect(
      consoleGroups(
        [line(1, 0, '// PA Sensei mesh: starting'), line(2, 200, '// PA Sensei mesh: finished (200 s)')],
        true,
      )[0].grp,
    ).toBe(true);
  });
  it('closes on an error or a new command', () => {
    const start = line(1, 0, '// PA Sensei tap: starting');
    expect(
      consoleGroups([start, line(2, 1, '!! no contact'), line(3, 2, '// unrelated')], true).map((b) => b.lines.length),
    ).toEqual([2, 1]);
    expect(
      consoleGroups([start, line(2, 1, 'M105', 'command'), line(3, 2, 'ok')], true).map((b) => b.lines.length),
    ).toEqual([1, 2]);
  });
  it('retains ordinary gap grouping and the off setting', () => {
    const lines = [line(1, 0, 'G28', 'command'), line(2, 1, 'ok'), line(3, 20, '// idle')];
    expect(consoleGroups(lines, true).map((b) => b.lines.length)).toEqual([2, 1]);
    expect(consoleGroups(lines, false).every((b) => !b.grp && b.lines.length === 1)).toBe(true);
  });
  it('keeps the original error after a stopped notice', () => {
    const blocks = consoleGroups(
      [
        line(1, 0, '// PA Sensei tap: starting'),
        line(2, 30, '// PA Sensei tap: stopped; see the error below'),
        line(3, 30, '!! no contact'),
        line(4, 31, '// unrelated'),
      ],
      true,
    );
    expect(blocks.map((b) => b.lines.length)).toEqual([3, 1]);
  });
});
