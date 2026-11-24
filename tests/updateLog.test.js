import { describe, it, expect } from 'vitest';
import { isUpdateError } from '../src/updateLog.js';

describe('Moonraker update output', () => {
  it('finishes cleanly when git lists files with error or failed in their names', () => {
    const lines = [
      'test/stream_bus_errors.py | 76 ++',
      'create mode 100644 test/stream_bus_errors.py',
      'rename failed.txt => error.txt (100%)',
      '0 errors found',
      'Git Repo pa_sensei: Restarting service klipper...',
      'Git Repo pa_sensei: Update Finished...',
    ];
    expect(lines.some(isUpdateError)).toBe(false);
  });

  it.each([
    '!! connection lost',
    'Error updating pa_sensei: Service restart failed',
    'Error Recovering klipper',
    'Error Rolling Back moonraker',
    'Transaction Update packages: Exit Failed',
    'Failed to restart klipper.service',
    'remote: error: rejected update',
    'normal status\nfatal: could not read from remote repository',
    'error: unable to unlink test/stream_bus_errors.py',
    'E: Could not get lock',
    'dpkg: error processing package example',
  ])('marks the actual failure: %s', (line) => expect(isUpdateError(line)).toBe(true));
});
