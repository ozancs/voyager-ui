// MCU firmware compared with Klipper on the host. After a Klipper update the boards still run the code they were
// flashed with; when the protocol changed in between, Klipper refuses to start ("MCU Protocol error"). Spotting a
// board that is behind before that happens, and saying how to flash it, saves the usual hunt through the docs.
//
// Versions look like v0.13.0-628-g373f200c(-dirty): a release tag, then the number of commits since it.
export function parseVer(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-(\d+))?/.exec(String(v || '').trim());
  return m ? { tag: [+m[1], +m[2], +m[3]], n: +(m[4] || 0) } : null;
}
// < 0 when a is older than b, 0 the same, > 0 newer; null when either cannot be read
export function cmpVer(a, b) {
  const x = parseVer(a),
    y = parseVer(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x.tag[i] !== y.tag[i]) return x.tag[i] - y.tag[i];
  return x.n - y.n;
}
// how the board is connected, from its [mcu] section: 'host' (Linux process on the Pi), 'can' or 'serial'
export function linkOf(cfg = {}) {
  if (cfg.canbus_uuid) return { kind: 'can', uuid: cfg.canbus_uuid, iface: cfg.canbus_interface || 'can0' };
  const s = cfg.serial || '';
  if (/klipper_host_mcu/.test(s)) return { kind: 'host' };
  return { kind: 'serial', path: s };
}
// The commands to rebuild and flash one board. menuconfig has to be set the way the board was flashed the first
// time (processor, bootloader offset, how it talks); that cannot be read from here, so it is a step to check.
export function flashSteps(link, chip) {
  const steps = [{ text: 'Stop Klipper', cmd: 'sudo service klipper stop' }];
  if (link.kind === 'host')
    steps.push(
      {
        text: 'Build for the Pi itself: in menuconfig pick "Linux process"',
        cmd: 'cd ~/klipper && make clean && make menuconfig',
      },
      { text: 'Build and install', cmd: 'make && make flash' },
    );
  else {
    steps.push({
      text: chip
        ? 'Pick the same settings as when this board was first flashed (processor {chip}, bootloader, connection)'
        : 'Pick the same settings as when this board was first flashed (processor, bootloader, connection)',
      chip,
      cmd: 'cd ~/klipper && make clean && make menuconfig',
    });
    steps.push({ text: 'Build', cmd: 'make' });
    if (link.kind === 'can')
      steps.push({
        text: 'Flash over CAN with Katapult',
        cmd: `python3 ~/katapult/scripts/flashtool.py -i ${link.iface} -u ${link.uuid} -f ~/klipper/out/klipper.bin`,
      });
    else steps.push({ text: 'Flash over USB', cmd: `make flash FLASH_DEVICE=${link.path || 'xxx'}` });
  }
  steps.push({ text: 'Start Klipper', cmd: 'sudo service klipper start' });
  return steps;
}
