import { describe, it, expect } from 'vitest';
import { gcodeFrom3mf, isGcodeFile } from '../src/gcode3mf.js';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
describe('3mf', () => {
  it('names', () => {
    expect(isGcodeFile('a.gcode.3mf')).toBe(true);
    expect(isGcodeFile('a.3mf')).toBe(true);
    expect(isGcodeFile('a.png')).toBe(false);
  });
  it('reads deflated plate gcode', async () => {
    execSync(
      'rm -rf /tmp/z && mkdir -p /tmp/z/Metadata && printf "G28\\nG1 X1\\n" > /tmp/z/Metadata/plate_1.gcode && echo x > /tmp/z/Metadata/plate_1.gcode.md5 && cd /tmp/z && zip -q -r ../z.3mf .',
    );
    const buf = readFileSync('/tmp/z.3mf');
    const txt = await gcodeFrom3mf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(txt).toBe('G28\nG1 X1\n');
  });
});
