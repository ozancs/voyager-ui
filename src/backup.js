// Config backup to GitHub with Klipper-Backup (https://klipperbackup.xyz). Voyager does not push anything itself:
// it finds the macro from Klipper-Backup's manual page (UPDATE_GIT, which runs ~/klipper-backup/script.sh through
// gcode_shell_command), runs it on request, remembers the last result, and can run it a little after a config file
// changed (an edit in any UI, SAVE_CONFIG). A shell command holds Klipper's G-code queue while it runs, so it never
// runs during a print: a backup asked for then waits until the print is over.
import { reactive, watch } from 'vue';
import { api } from './api/moonraker';
import { state, S, gcode, toast, saveSettings } from './store';
import { t } from './i18n';

export const backup = reactive({ running: false, waiting: false, lines: [] });

// the command that starts a backup: the UPDATE_GIT macro, or a shell command that runs klipper-backup directly
export function backupCommand() {
  const st = S('configfile').settings || {};
  if (st['gcode_macro update_git']) return 'UPDATE_GIT';
  for (const [k, v] of Object.entries(st))
    if (k.startsWith('gcode_shell_command ') && /klipper-backup/i.test(v?.command || ''))
      return 'RUN_SHELL_COMMAND CMD=' + k.slice(20);
  return null;
}
const busyPrinting = () => ['printing', 'paused'].includes(S('print_stats').state);
const BAD = /error|fatal|failed|denied|rejected|timed out|could not|not found/i;

export async function runBackup(why = '') {
  const cmd = backupCommand();
  if (!cmd || backup.running) return;
  if (busyPrinting()) {
    backup.waiting = true; // runs when the print is over
    return;
  }
  if (state.klippy !== 'ready') {
    // Klipper still restarting (right after SAVE_CONFIG): try again a little later
    if (why === 'auto') setTimeout(() => runBackup(why), 30e3);
    return;
  }
  backup.waiting = false;
  backup.running = true;
  backup.lines = [];
  const grab = ([line]) => {
    if (typeof line === 'string' && backup.running) backup.lines.push(line.replace(/^\/\/ ?/, ''));
  };
  api.on('notify_gcode_response', grab);
  let ok = true,
    err = '';
  try {
    await gcode(cmd);
  } catch (e) {
    ok = false;
    err = e.message;
  }
  api.off('notify_gcode_response', grab);
  backup.running = false;
  if (backup.lines.some((l) => l.startsWith('!!') || BAD.test(l))) ok = false;
  state.settings.backupLast = {
    t: Date.now(),
    ok,
    why,
    lines: [...backup.lines.slice(-8), ...(err ? ['!! ' + err] : [])],
  };
  saveSettings();
  toast(
    ok ? t('Config backed up to GitHub') : t('Backup failed, see the log on the Machine page'),
    ok ? 'info' : 'error',
  );
}

// after a config file changes: wait for more changes to settle (a SAVE_CONFIG writes, Klipper restarts), then once
let timer = null;
export function startBackupWatch() {
  api.on('notify_filelist_changed', ([p]) => {
    const it = p?.item;
    if (!state.settings.backupAuto || it?.root !== 'config' || !backupCommand()) return;
    if (!/\.(cfg|conf)$/i.test(it.path || '') || /^backups?\//i.test(it.path)) return; // our own backup copies
    clearTimeout(timer);
    timer = setTimeout(() => runBackup('auto'), 60e3);
  });
  watch(
    () => S('print_stats').state,
    (s) => {
      if (backup.waiting && !['printing', 'paused'].includes(s)) setTimeout(() => runBackup('auto'), 5000);
    },
  );
}
