import { describe, it, expect } from 'vitest';
import { gcodeFrom3mf, isGcodeFile } from '../src/gcode3mf.js';
import { readFileSync } from 'fs';
describe('3mf', () => {
  it('names', () => {
    expect(isGcodeFile('a.gcode.3mf')).toBe(true);
    expect(isGcodeFile('a.3mf')).toBe(false);
    expect(isGcodeFile('a.png')).toBe(false);
  });
  it('reads deflated plate gcode', async () => {
    const buf = readFileSync(new URL('./fixtures/plate.3mf', import.meta.url));
    const txt = await gcodeFrom3mf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(txt).toBe('G28\nG1 X1\n');
  });
});
