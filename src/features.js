// Things that run in the background for the whole app:
// macro prompts, error toasts, sounds, job queue, config index (for search), health sampling.
import { reactive, watch, computed, markRaw } from 'vue';
import { api } from './api/moonraker';
import {
  state,
  S,
  toast,
  printState,
  pushConsole,
  gcode,
  backupBeforeWrite,
  saveSettings,
  VERSION,
  printerName,
  prettyName,
  notify,
  unnotify,
} from './store';
import { holdFindings, heatFinding, COLD } from './heaterHealth';
import { t } from './i18n';
import { cmpVer } from './firmware';
import { startBackupWatch } from './backup';
import { expandPaths } from './paths';
import { go } from './router';
import { startEndShots } from './endShot';
import { counterGrowth } from './calc';
export { counterGrowth };

// ---------------------------------------------------------------- macro prompts
// Klipper macros can open dialogs with "// action:prompt_*" lines (same protocol Mainsail uses).
let draft = null;
function parsePrompt(line) {
  const m = line.match(/^\/\/ action:prompt_(\w+)\s?(.*)$/);
  if (!m) return false;
  const [, cmd, arg] = m;
  const btn = (a) => {
    const [label, gc, color] = a.split('|');
    return { label: label.trim(), gcode: (gc ?? label).trim(), color: (color || '').trim() };
  };
  switch (cmd) {
    case 'begin':
      draft = { title: arg || t('Prompt'), items: [], footer: [] };
      break;
    case 'text':
      draft?.items.push({ type: 'text', text: arg });
      break;
    case 'button': {
      const b = btn(arg);
      const g = draft?.items[draft.items.length - 1];
      if (g?.type === 'group' && g.open) g.buttons.push(b);
      else draft?.items.push({ type: 'buttons', buttons: [b] });
      break;
    }
    case 'button_group_start':
      draft?.items.push({ type: 'group', open: true, buttons: [] });
      break;
    case 'button_group_end': {
      const g = draft?.items.findLast((i) => i.type === 'group' && i.open);
      if (g) g.open = false;
      break;
    }
    case 'footer_button':
      draft?.footer.push(btn(arg));
      break;
    case 'show':
      if (draft) state.prompt = JSON.parse(JSON.stringify(draft));
      break;
    case 'end':
      state.prompt = null;
      draft = null;
      break;
  }
  return true;
}
export function promptRun(b) {
  gcode(b.gcode).catch(() => {});
}
export function promptClose() {
  state.prompt = null;
  gcode('RESPOND TYPE=command MSG=action:prompt_end', { quiet: true }).catch(() => {});
}

// ---------------------------------------------------------------- error toasts
const HINTS = [
  [/Must home axis first|must home/i, 'Home the printer (G28) before moving.'],
  [/Move out of range/i, 'The move goes past the axis limits (position_min / position_max).'],
  [
    /Timer too close|Rescheduled timer in the past|Stepper too far in past/i,
    'Host or MCU could not keep up. Usually an overloaded Pi, a busy USB/CAN bus or a slow SD card.',
  ],
  [
    /Lost communication with MCU/i,
    'Check the USB/CAN cable, board power and CAN termination. The Health page shows link errors.',
  ],
  [
    /not heating at expected rate/i,
    'verify_heater tripped. Check the thermistor seating, heater wiring and fans blowing on the block.',
  ],
  [/ADC out of range/i, 'Thermistor reads outside min_temp / max_temp. Check the thermistor and its wiring.'],
  [/Extrude below minimum temp/i, 'Heat the hotend first (min_extrude_temp).'],
  [/Extrude only move too long/i, 'Extrude less at once or raise max_extrude_only_distance.'],
  [/Unknown command/i, 'This command or macro does not exist. Check the spelling or your config.'],
  [/Probe triggered prior to movement/i, 'The probe was already triggered. Raise Z and check the probe.'],
  [/No trigger on probe after full movement/i, 'The probe never triggered. Check the probe and the Z position.'],
  [
    /is not valid in section|Section .* is not a valid config section|Unable to parse option/i,
    'Config error. Open the file from the search (Ctrl+K) and fix the option.',
  ],
  [/Option .* must have minimum|must have maximum/i, 'A config value is outside its allowed range.'],
];
export const hintFor = (msg) => {
  const h = HINTS.find(([re]) => re.test(msg))?.[1];
  return h ? t(h) : '';
};
function onErrorLine(line) {
  if (!state.settings.errorToasts) return;
  const msg = line.replace(/^!!\s*/, '').trim();
  if (!msg || msg.startsWith('action:')) return;
  toast(msg, 'error', { hint: hintFor(msg), console: true });
}

// ---------------------------------------------------------------- sounds
let ctx = null;
function audio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// browsers only allow audio after a click or key press
const unlock = () => {
  if (state.settings.sound?.enabled) audio();
};
window.addEventListener('pointerdown', unlock, { once: false, passive: true });
window.addEventListener('keydown', unlock, { passive: true });

// each event has its own character so it is known without looking: finished rises and resolves, paused is
// two soft low knocks, heated is one short bell, an error is a loud falling siren played three times
const TONES = {
  complete: [
    [523, 0, 0.16, 'triangle'],
    [659, 0.13, 0.16, 'triangle'],
    [784, 0.26, 0.16, 'triangle'],
    [1047, 0.39, 0.5, 'triangle'],
  ],
  error: [0, 0.5, 1].flatMap((d) => [
    [880, d, 0.2, 'sawtooth', 1.4],
    [587, d + 0.2, 0.26, 'sawtooth', 1.4],
  ]),
  paused: [
    [392, 0, 0.22],
    [294, 0.3, 0.34],
  ],
  heated: [
    [1319, 0, 0.6],
    [2637, 0, 0.25, 'sine', 0.3],
  ],
};
export function playSound(kind) {
  const cfg = state.settings.sound || {};
  const a = audio();
  if (!a) return;
  const vol = (cfg.volume ?? 0.6) * 0.25;
  const t0 = a.currentTime + 0.02;
  for (const [f, at, len, type, gain = 1] of TONES[kind] || []) {
    const o = a.createOscillator(),
      g = a.createGain();
    o.type = type || 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t0 + at);
    g.gain.linearRampToValueAtTime(Math.min(0.5, vol * gain), t0 + at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
    o.connect(g).connect(a.destination);
    o.start(t0 + at);
    o.stop(t0 + at + len + 0.05);
  }
}

// System notification (only while this tab is in the background; in front the toast says it) and spoken text.
// Both need the page open somewhere: a closed tab gets nothing, for that the phone notifications (Moonraker's
// notifier) are there.
export function desktopPermission() {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}
export async function askDesktop() {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}
function desktop(title, body, kind) {
  if (!state.settings.sound?.desktop || desktopPermission() !== 'granted' || !document.hidden) return;
  try {
    const n = new Notification(title, {
      body,
      tag: 'voyager-' + kind,
      icon: 'favicon.svg',
      requireInteraction: kind === 'error',
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {}
}
const SPEECH_LANG = { zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', uk: 'uk-UA', pt: 'pt-BR' };
export function speak(text) {
  if (typeof speechSynthesis === 'undefined' || !text) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const lang = state.settings.lang || document.documentElement.lang || 'en';
    u.lang = SPEECH_LANG[lang] || lang;
    u.volume = Math.min(1, (state.settings.sound?.volume ?? 0.6) + 0.2);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {}
}
// one event, every channel the user turned on
export function alertEvent(kind, text) {
  const snd = state.settings.sound || {};
  if (!snd[kind]) return;
  if (snd.enabled) playSound(kind);
  desktop(printerName.value || 'Voyager', text, kind);
  if (snd.speak) setTimeout(() => speak(text), snd.enabled ? (kind === 'error' ? 1600 : 900) : 0);
}
const shortFile = () =>
  (S('print_stats').filename || '')
    .split('/')
    .pop()
    .replace(/\.gcode$/i, '');
watch(printState, (now, before) => {
  if (!state.booted) return;
  if (now === 'complete' && before === 'printing')
    alertEvent('complete', t('Print finished: {file}', { file: shortFile() }));
  else if (now === 'error')
    alertEvent('error', t('Print stopped with an error: {msg}', { msg: S('print_stats').message || '' }));
  else if (now === 'paused' && before === 'printing')
    alertEvent('paused', t('Print paused: {file}', { file: shortFile() }));
});
watch(
  () => state.klippy,
  (k, b) => {
    if (b === 'ready' && (k === 'shutdown' || k === 'error'))
      alertEvent(
        'error',
        t('Klipper stopped: {msg}', { msg: String(S('webhooks').state_message || '').split('\n')[0] }),
      );
  },
);
const reached = {};
function checkHeated() {
  for (const n of S('heaters').available_heaters || []) {
    const s = S(n);
    if (!s.target) {
      reached[n] = 0;
      continue;
    }
    if (reached[n] === s.target) continue;
    if (!(n in reached)) {
      reached[n] = Math.abs(s.temperature - s.target) < 1 ? s.target : -1;
      continue;
    } // first sample after connecting: no sound for heaters that were already there
    if (Math.abs(s.temperature - s.target) < 1) {
      reached[n] = s.target;
      alertEvent('heated', t('{heater} reached {temp}°', { heater: prettyName(n), temp: Math.round(s.target) }));
    }
  }
}

// ---------------------------------------------------------------- heaters left on
// Heaters with a target while nothing prints, for longer than Settings > Control > "Heaters left on" (minutes):
// a notification and a toast with Cool down. Klipper's idle_timeout already turns heaters off when its gcode has
// TURN_OFF_HEATERS; when that comes first nothing is said. Changing a target starts the count again, and
// dismissing the notification keeps quiet until the heaters are turned off. With "Turn them off" set
// (idleHeatOff) the heaters go off a minute after the warning unless Keep them on is pressed.
let idleSince = 0,
  idleSig = '',
  idleSaid = 0, // idleSince of the stretch already reported
  idleToast = null,
  idleOffTm = null;
function stopIdleOff() {
  clearTimeout(idleOffTm);
  idleOffTm = null;
}
const idleKey = () => 'idleheat:' + idleSince;
const ZERO = (p) => new RegExp('\\b' + p + '0+(?:\\.0+)?(?![\\d.])', 'i');
// heaters the idle_timeout gcode turns off ({all} for TURN_OFF_HEATERS or Klipper's default); comments skipped
function idleOffs(it) {
  const offs = new Set();
  if (!it || it.gcode == null) return Object.assign(offs, { all: true }); // Klipper's default gcode turns all off
  for (const raw of String(it.gcode).split('\n')) {
    const l = raw.replace(/[#;].*/, '').trim();
    if (/^TURN_OFF_HEATERS\b/i.test(l)) offs.all = true;
    else if (/^M104\b/i.test(l) && ZERO('S').test(l) && !/\bT[1-9]/i.test(l))
      offs.add(S('toolhead').extruder || 'extruder');
    else if (/^M140\b/i.test(l) && ZERO('S').test(l)) offs.add('heater_bed');
    else {
      const m = /^SET_HEATER_TEMPERATURE\b.*\bHEATER=(\S+)/i.exec(l);
      if (m && ZERO('TARGET=').test(l)) offs.add(m[1].toLowerCase());
    }
  }
  return offs;
}
function checkIdleHeat() {
  const mins = state.settings.idleHeatMin ?? 20;
  const st = S('print_stats').state;
  const on = (S('heaters').available_heaters || []).filter((n) => S(n).target > 0);
  if (!mins || st === 'printing' || st === 'paused' || !on.length) {
    if (idleSince) unnotify('idleheat');
    if (idleToast) closeToast(idleToast);
    stopIdleOff();
    idleSince = 0;
    idleSig = '';
    idleToast = null;
    return;
  }
  const sig = on.map((n) => n + ':' + S(n).target).join(',');
  if (sig !== idleSig) {
    unnotify('idleheat');
    stopIdleOff();
    idleSig = sig;
    idleSince = Date.now();
    return;
  }
  // idle_timeout turns them off before we would speak up: Klipper takes care of it (only when it turns off every
  // heater that is on; M104 S0 and M140 S0 leave a chamber running)
  const it = S('configfile').settings?.idle_timeout;
  const offs = idleOffs(it);
  if (on.every((n) => offs.all || offs.has(n) || offs.has(n.split(' ').pop())) && (it?.timeout ?? 600) / 60 < mins)
    return;
  if (Date.now() - idleSince < mins * 60e3) return;
  if (idleSaid === idleSince) return; // said once for this stretch (dismissing it keeps it quiet)
  idleSaid = idleSince;
  const list = on.map((n) => `${prettyName(n)} ${Math.round(S(n).target)}°`).join(', ');
  const msg = t('{list}: on for {n} min with no print', { list, n: mins });
  notify(idleKey(), msg, 'warn');
  alertEvent('error', msg);
  if (state.settings.idleHeatOff) {
    idleToast = toast(msg + ' ' + t('Turning them off in a minute.'), 'warn', {
      ms: 0,
      action: { label: t('Keep them on'), run: stopIdleOff },
    });
    idleOffTm = setTimeout(() => {
      idleOffTm = null;
      const ps = S('print_stats').state;
      if (ps === 'printing' || ps === 'paused') return;
      Promise.resolve(gcode('TURN_OFF_HEATERS')).catch(() => {});
      if (idleToast) closeToast(idleToast);
      toast(t('Heaters turned off: {n} min with no print', { n: mins }), 'info');
    }, 60e3);
    return;
  }
  idleToast = toast(msg, 'warn', {
    ms: 0,
    action: { label: t('Cooldown'), run: () => gcode('TURN_OFF_HEATERS') },
  });
}

// ---------------------------------------------------------------- MCU firmware behind Klipper
// After a Klipper update, boards still running older firmware get one notification (per Klipper version);
// Health > MCU & CAN links shows which and how to flash them.
function checkFirmware() {
  const host = state.versions.klipper;
  if (!host) return;
  const behind = state.objects
    .filter((o) => o === 'mcu' || o.startsWith('mcu '))
    .filter((o) => cmpVer(S(o).mcu_version, host) < 0)
    .map((o) => (o === 'mcu' ? 'mcu' : o.slice(4)));
  if (!behind.length) return unnotify('fw:');
  notify(
    'fw:' + host + ':' + behind.join(','),
    t('{boards}: firmware older than Klipper {host}. Health shows how to flash.', { boards: behind.join(', '), host }),
    'info',
  );
}

// ---------------------------------------------------------------- job queue
export async function loadQueue() {
  try {
    const r = await api.call('server.job_queue.status');
    state.queue = { enabled: true, state: r.queue_state, jobs: r.queued_jobs || [] };
  } catch (e) {
    // method not found = [job_queue] missing in moonraker.conf
    state.queue = { enabled: false, state: '', jobs: [] };
  }
}
export const queueApi = {
  add: (filenames) =>
    api
      .call('server.job_queue.post_job', { filenames, reset: false })
      .then(() => toast(filenames.length > 1 ? t('{n} files queued', { n: filenames.length }) : t('Added to queue'))),
  remove: (ids) => api.call('server.job_queue.delete_job', { job_ids: ids }),
  clear: () => api.call('server.job_queue.delete_job', { all: true }),
  start: () => api.call('server.job_queue.start'),
  pause: () => api.call('server.job_queue.pause'),
  jump: (id) => api.call('server.job_queue.jump', { job_id: id }),
};
// adds [job_queue] to moonraker.conf (backup first) and restarts moonraker
export async function enableQueue() {
  const txt = await api.getText('/server/files/config/moonraker.conf');
  if (/^\[job_queue\]/m.test(txt)) {
    toast(t('[job_queue] is already in moonraker.conf, restarting Moonraker'));
    await api.call('server.restart');
    return;
  }
  await backupBeforeWrite('config', 'moonraker.conf');
  const out = txt.replace(/\s*$/, '\n') + '\n[job_queue]\nload_on_startup: False\n';
  await api.upload(new Blob([out], { type: 'text/plain' }), { root: 'config', name: 'moonraker.conf' });
  toast(t('Job queue enabled, restarting Moonraker'));
  await api.call('server.restart');
}

// ---------------------------------------------------------------- config index (for Ctrl+K)
export const cfgIndex = reactive({ items: [], loaded: false, loading: false });
let cfgStale = true;
export async function loadConfigIndex() {
  if (cfgIndex.loading || (cfgIndex.loaded && !cfgStale)) return;
  cfgIndex.loading = true;
  try {
    const list = await api.call('server.files.list', { root: 'config' });
    const okPath = (p) =>
      !p.startsWith('backups/') &&
      !p.startsWith('.') &&
      !p.includes('/.') &&
      !p.includes('::TMPNAME') &&
      !/ShakeTune_results\//i.test(p);
    const cfgs = list
      .filter((f) => /\.(cfg|conf)$/i.test(f.path) && okPath(f.path) && !/^printer-\d{8}_\d{6}\.cfg$/.test(f.path))
      .map((f) => f.path)
      .slice(0, 60);
    // scripts and notes: .py .sh .txt (not huge ones)
    const code =
      state.settings.searchContent === false
        ? []
        : list
            .filter((f) => /\.(py|sh|txt)$/i.test(f.path) && okPath(f.path) && (f.size || 0) < 400000)
            .map((f) => f.path)
            .slice(0, 40);
    const items = [];
    await Promise.all(
      code.map(async (file) => {
        let txt = '';
        try {
          txt = await api.getText('/server/files/config/' + file.split('/').map(encodeURIComponent).join('/'));
        } catch {
          return;
        }
        const py = /\.py$/i.test(file),
          sh = /\.sh$/i.test(file);
        txt
          .replace(/\r/g, '')
          .split('\n')
          .forEach((l, i) => {
            const tl = l.trim();
            if (!tl || tl.length < 3) return;
            let m;
            if (py && (m = tl.match(/^(async\s+)?(def|class)\s+([A-Za-z_]\w*)/)))
              items.push({ kind: 'symbol', file, line: i + 1, key: m[3], text: `${m[2]} ${m[3]}` });
            else if (sh && (m = tl.match(/^(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{?/)))
              items.push({ kind: 'symbol', file, line: i + 1, key: m[1], text: `${m[1]}()` });
            else items.push({ kind: 'line', file, line: i + 1, text: tl.slice(0, 90) });
          });
      }),
    );
    await Promise.all(
      cfgs.map(async (file) => {
        let txt = '';
        try {
          txt = await api.getText('/server/files/config/' + file.split('/').map(encodeURIComponent).join('/'));
        } catch {
          return;
        }
        let sec = '';
        txt.split('\n').forEach((l, i) => {
          let m;
          if ((m = l.match(/^\[([^\]]+)\]/))) {
            sec = m[1];
            items.push({ kind: 'section', file, line: i + 1, section: sec, text: `[${sec}]` });
          } else if (sec && (m = l.match(/^([A-Za-z0-9_]+)\s*[:=]\s*(.*?)\s*(?:[#;].*)?$/)) && !l.startsWith('#'))
            items.push({
              kind: 'option',
              file,
              line: i + 1,
              section: sec,
              key: m[1],
              value: m[2].slice(0, 60),
              text: m[1],
            });
        });
      }),
    );
    cfgIndex.items = markRaw(items);
    cfgIndex.loaded = true;
    cfgStale = false;
  } catch {}
  cfgIndex.loading = false;
}

// ---------------------------------------------------------------- macro definitions and variables
const secName = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
// where [gcode_macro NAME] is written (the last one read wins in Klipper, so the last one found here), or one of
// its variable_ lines
export async function findMacroDef(name, variable) {
  await loadConfigIndex();
  const sec = 'gcode_macro ' + name.toLowerCase();
  const hits = cfgIndex.items.filter(
    (c) =>
      secName(c.section || '') === sec &&
      (variable
        ? c.kind === 'option' && c.key.toLowerCase() === 'variable_' + variable.toLowerCase()
        : c.kind === 'section'),
  );
  return hits[hits.length - 1] || null;
}
export function openCfgLine(file, line) {
  state.jump = { file, line, t: Date.now() };
  go('config', file);
}
export async function openMacroDef(name, variable) {
  const d = (await findMacroDef(name, variable)) || (variable && (await findMacroDef(name)));
  if (d) openCfgLine(d.file, d.line);
  else toast(t('{name} was not found in the config files', { name }), 'warn');
}
export { pyLiteral, typedLiteral, setVarCommand } from './macros';
// a macro's variables as Klipper reports them ({} for a macro without any)
export const macroVars = (name) => {
  const o = S('gcode_macro ' + name) || {};
  return Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'description'));
};

// ---------------------------------------------------------------- health sampling
// kept outside Vue reactivity, the page reads it through `healthTick`
export const health = reactive({ tick: 0 });
export const mcuHist = markRaw({}); // name -> [{t, re, inv}]
export const heaterWin = markRaw({}); // name -> [{t, temp, target, power}]
export const heaterLive = reactive({}); // name -> { target, power, std, holding }
export const heaterTrend = reactive({}); // name -> [{ kind: 'power' | 'swing' | 'heat', ... }] (heaterHealth.js)
const heatRun = {}; // name -> { tg, t0, from, skip, done }
const baseKey = (n, tg) => n + '@' + Math.round(tg);
export function resetHeaterBase(n) {
  const b = state.settings.heaterBase || {};
  for (const k of Object.keys(b)) if (k.startsWith(n + '@')) delete b[k];
  delete heaterTrend[n];
  saveSettings();
}
function learnHeater(n, s, tg, now, live) {
  const bases = (state.settings.heaterBase ||= {});
  const key = baseKey(n, tg);
  const fan = n === 'extruder' && state.objects.includes('fan') ? S('fan').speed || 0 : null;
  const found = (heaterTrend[n] || []).filter((f) => f.kind === 'heat');
  // heat-up from a cold start
  let run = heatRun[n];
  if (!tg) delete heatRun[n];
  else if (!run || run.tg !== tg)
    run = heatRun[n] =
      s.temperature < COLD && s.temperature < tg - 30 ? { tg, t0: now, from: s.temperature } : { tg, skip: true };
  if (run && !run.skip && !run.done && s.temperature >= tg - 2) {
    run.done = true;
    const secs = Math.round(now - run.t0);
    const b = (bases[key] ||= { t: now });
    if (!b.heat) {
      Object.assign(b, { heat: secs, from: Math.round(run.from) });
      saveSettings();
    } else {
      const f = heatFinding(b, secs, run.from);
      found.splice(0, found.length, ...(f ? [f] : []));
    }
  }
  // holding steadily
  if (live.holding) {
    const b = (bases[key] ||= { t: now });
    if (!b.power && live.power < 0.95) {
      Object.assign(b, { power: +live.power.toFixed(3), fan });
      saveSettings();
    }
    heaterTrend[n] = [...holdFindings(b, { power: live.power, fan, std: live.std }), ...found];
  } else heaterTrend[n] = found;
}
function sampleHealth() {
  const now = Date.now() / 1000;
  for (const o of state.objects) {
    if (o !== 'mcu' && !o.startsWith('mcu ')) continue;
    const st = S(o).last_stats;
    if (!st) continue;
    const h = (mcuHist[o] ||= []);
    h.push({
      t: now,
      re: st.bytes_retransmit || 0,
      inv: st.bytes_invalid || 0,
      load: (st.mcu_task_avg + 3 * st.mcu_task_stddev) / 0.0025,
      srtt: st.srtt || 0,
    });
    while (h.length && now - h[0].t > 900) h.shift();
  }
  for (const n of S('heaters').available_heaters || []) {
    const s = S(n);
    if (s.temperature == null) continue;
    const w = (heaterWin[n] ||= []);
    w.push({ t: now, temp: s.temperature, target: s.target || 0, power: s.power || 0 });
    while (w.length && now - w[0].t > 120) w.shift();
    const tg = s.target || 0;
    const hold =
      tg > 0 && w.length > 20 && w.every((x) => x.target === tg && Math.abs(x.temp - tg) < 1.5) && now - w[0].t > 60;
    if (hold) {
      const avg = w.reduce((a, x) => a + x.power, 0) / w.length;
      const mean = w.reduce((a, x) => a + x.temp, 0) / w.length;
      const std = Math.sqrt(w.reduce((a, x) => a + (x.temp - mean) ** 2, 0) / w.length);
      heaterLive[n] = { target: tg, power: avg, std, holding: true };
    } else heaterLive[n] = { target: tg, power: s.power || 0, std: null, holding: false };
    learnHeater(n, s, tg, now, heaterLive[n]);
  }
  health.tick++;
}

export function heaterFindingText(n, f) {
  const name = n.split(' ').pop();
  const since = f.since ? new Date(f.since * 1000).toLocaleDateString() : '';
  if (f.kind === 'swing')
    return t('{name} swings ±{s}° while holding its target. PID tuning usually fixes this.', {
      name,
      s: f.std.toFixed(1),
    });
  if (f.kind === 'power')
    return f.fan
      ? t(
          '{name} needs {p}% more power to hold this temperature than on {date} (same target and fan). A fan blowing on it, a missing sock or an ageing heater can cause this.',
          { name, p: f.pct, date: since },
        )
      : t(
          '{name} needs {p}% more power to hold this temperature than on {date} (same target). A colder room, an open enclosure or an ageing heater can cause this.',
          { name, p: f.pct, date: since },
        );
  return t(
    '{name} took {s} s to heat up, on {date} it took {b} s. Check the heater wiring and the thermistor, or run PID tuning.',
    { name, s: f.secs, b: f.base, date: since },
  );
}
export const healthIssues = computed(() => {
  health.tick; // re-evaluate on samples
  const out = [];
  for (const [n, h] of Object.entries(mcuHist)) {
    if (h.length < 2) continue;
    // Only facts that point at a real problem. A few retransmits happen on every healthy CAN bus,
    // so warn on a sustained rate, and always on invalid bytes (corrupted data).
    const first = h[0],
      last = h[h.length - 1];
    const mins = Math.max(1, (last.t - first.t) / 60);
    const d = counterGrowth(h, 're'),
      inv = counterGrowth(h, 'inv');
    if (mins >= 3 && d / mins > 150)
      out.push({
        area: 'mcu',
        key: n,
        level: d / mins > 1500 ? 'error' : 'warn',
        msg: t('{name}: {d} bytes retransmitted in the last {m} min', { name: n, d, m: Math.round(mins) }),
      });
    if (inv > 0)
      out.push({
        area: 'mcu',
        key: n,
        level: 'error',
        msg: t('{name}: {d} invalid bytes received, check the wiring', { name: n, d: inv }),
      });
  }
  for (const o of state.objects) {
    if (!o.startsWith('tmc')) continue;
    const ds = S(o).drv_status || {};
    // real driver faults only: over temperature, short to ground / supply. The pre-warning (otpw) is not listed.
    const bad = ['ot', 's2ga', 's2gb', 's2vsa', 's2vsb'].filter((k) => ds[k]);
    if (bad.length)
      out.push({
        area: 'tmc',
        key: o,
        level: 'error',
        msg: t('{name}: driver flags {flags}', { name: o.split(' ').pop(), flags: bad.join(', ') }),
      });
  }
  for (const [n, list] of Object.entries(heaterTrend))
    for (const f of list) out.push({ area: 'heat', key: n + f.kind, level: 'warn', msg: heaterFindingText(n, f) });
  for (const mt of dueMaintenance.value)
    out.push({ area: 'maint', key: mt.id, level: 'info', msg: t('Maintenance due: {name}', { name: t(mt.name) }) });
  return out;
});

// ---------------------------------------------------------------- maintenance
// totalMeters: filament through the extruder, for tasks counted in metres (nozzle, extruder gears)
export const printStats = reactive({ totalHours: null, hoursPerDay: null, totalMeters: null, metersPerDay: null });
export const MAINT_DEFAULTS = () => [
  { id: 'm1', name: 'Clean the bed / build plate', hours: 50 },
  { id: 'm2', name: 'Clean extruder gears and filament path', hours: 150 },
  { id: 'm3', name: 'Check belt tension', hours: 200 },
  { id: 'm4', name: 'Check frame and gantry screws', hours: 250 },
  { id: 'm5', name: 'Lubricate linear rails / rods', hours: 300 },
  { id: 'm6', name: 'Replace nozzle', hours: 500 },
];
export async function loadPrintStats() {
  try {
    const t = await api.call('server.history.totals');
    printStats.totalHours = (t.job_totals?.total_print_time || 0) / 3600;
    printStats.totalMeters = (t.job_totals?.total_filament_used || 0) / 1000;
  } catch {}
  try {
    const since = Date.now() / 1000 - 30 * 86400;
    const r = await api.call('server.history.list', { since, limit: 500, order: 'desc' });
    const sec = (r.jobs || []).reduce((a, j) => a + (j.print_duration || 0), 0);
    printStats.hoursPerDay = sec / 3600 / 30;
    const mm = (r.jobs || []).reduce((a, j) => a + (j.filament_used || 0), 0);
    printStats.metersPerDay = mm / 1000 / 30;
  } catch {}
  // learn how far real print times drift from the slicer estimate
  try {
    const r = await api.call('server.history.list', { limit: 60, order: 'desc' });
    // the same file printed before: its real time beats any correction of the slicer's guess
    const byFile = {};
    for (const j of r.jobs || [])
      if (j.status === 'completed' && j.print_duration > 60 && !byFile[j.filename])
        byFile[j.filename] = { dur: j.print_duration, est: j.metadata?.estimated_time || 0 };
    state.etaLearn.byFile = byFile;
    const ratios = (r.jobs || [])
      .filter((j) => j.status === 'completed' && j.metadata?.estimated_time > 300 && j.print_duration > 60)
      .map((j) => j.print_duration / j.metadata.estimated_time)
      .filter((x) => x > 0.4 && x < 2.5)
      .sort((a, b) => a - b);
    if (ratios.length >= 3)
      Object.assign(state.etaLearn, {
        k: Math.min(1.8, Math.max(0.6, ratios[Math.floor(ratios.length / 2)])),
        n: ratios.length,
      });
  } catch {}
  if (!state.settings.maintenance && printStats.totalHours != null) {
    state.settings.maintenance = MAINT_DEFAULTS().map((t) => ({
      ...t,
      doneAt: printStats.totalHours,
      doneDate: Date.now(),
    }));
  }
}
// a task counts print hours (default) or metres of filament (unit 'm'); `hours` is the interval in that unit
export const maintTotal = (t) => (t.unit === 'm' ? printStats.totalMeters : printStats.totalHours);
export function maintUsed(t) {
  const total = maintTotal(t);
  return total == null ? 0 : Math.max(0, total - (t.doneAt ?? total));
}
export function maintDueDays(t) {
  const left = t.hours - maintUsed(t);
  if (left <= 0) return 0;
  const rate = t.unit === 'm' ? printStats.metersPerDay : printStats.hoursPerDay;
  if (!rate) return null;
  return left / rate;
}
export const dueMaintenance = computed(() => (state.settings.maintenance || []).filter((t) => maintUsed(t) >= t.hours));

// ---------------------------------------------------------------- wiring
let started = false;
export function initFeatures() {
  startEndShots();
  if (started) return;
  started = true;
  startBackupWatch();
  api.on('notify_gcode_response', ([line]) => {
    if (typeof line !== 'string') return;
    if (line.startsWith('// action:prompt_')) {
      parsePrompt(line);
      return;
    }
    if (line.startsWith('!! ')) onErrorLine(line);
  });
  api.on('notify_job_queue_changed', ([p]) => {
    if (p?.updated_queue) state.queue.jobs = p.updated_queue;
    if (p?.queue_state) state.queue.state = p.queue_state;
    if (p?.action === 'job_loaded') toast(t('Queue: starting next print'));
  });
  api.on('notify_filelist_changed', ([p]) => {
    if (p?.item?.root === 'config') cfgStale = true;
  });
  watch(
    () => state.settings.searchContent,
    () => {
      cfgStale = true;
      cfgIndex.items = [];
    },
  );
  api.on('notify_history_changed', ([p]) => {
    if (p?.action === 'finished') loadPrintStats();
  });
  watch(
    () => state.booted,
    (b) => {
      if (b) {
        loadQueue();
        loadPrintStats();
      }
    },
    { immediate: true },
  );
  // after an update, show what changed once (not on a fresh install, that would be the whole history)
  watch(
    () => state.settingsLoaded,
    (ok) => {
      if (!ok) return;
      const seen = state.settings.seenVersion;
      if (!seen) {
        state.settings.seenVersion = VERSION;
        saveSettings();
      } else if (seen !== VERSION)
        // only when this version has notes of its own; a release without any just counts as seen
        import('../CHANGELOG.md?raw')
          .then(({ default: md }) => {
            if (new RegExp('^## ' + VERSION.replace(/\./g, '\\.') + '\\s*$', 'm').test(md)) state.whatsNew = true;
            else {
              state.settings.seenVersion = VERSION;
              saveSettings();
            }
          })
          .catch(() => (state.whatsNew = true));
    },
    { immediate: true },
  );
  setInterval(() => {
    if (state.klippy === 'ready') {
      sampleHealth();
      checkHeated();
      checkIdleHeat();
      checkFirmware();
    }
  }, 2000);
  // global Ctrl/Cmd+K
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      state.spotlight = !state.spotlight;
    }
  });
}
export { pushConsole };

// Download several files at once. Moonraker packs them into one zip (server.files.zip), we fetch it
// and remove the temporary zip again. Older Moonraker without zip: files are downloaded one by one.
export async function downloadMany(root, items, base = 'files') {
  const save = (href, name) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  // Folders are expanded to every file inside them, however deep. Handing Moonraker the folder itself left out
  // sub-folders that are symlinks (Happy Hare links config/mmu/base etc. into its repo), so a config backup
  // was missing them. server.files.list follows those links, and a file path zips fine through a link.
  let paths = items.map((i) => i.path);
  if (items.some((i) => i.dir)) {
    try {
      paths = expandPaths(items, await api.call('server.files.list', { root }));
    } catch {} // could not list: let Moonraker handle the folders
  }
  toast(t('Preparing {n} files…', { n: paths.length }));
  try {
    const r = await api.call('server.files.zip', {
      items: paths.map((p) => `${root}/${p}`),
      dest: `${root}/${base}-${stamp}.zip`,
      store_only: false,
    });
    const d = r.destination || {};
    const p = `${d.root || root}/${d.path || `${base}-${stamp}.zip`}`;
    const res = await api.fetch(`/server/files/${p.split('/').map(encodeURIComponent).join('/')}`);
    if (!res.ok) throw new Error(res.statusText);
    const url = URL.createObjectURL(await res.blob());
    save(url, p.split('/').pop());
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    api.call('server.files.delete_file', { path: p }).catch(() => {});
  } catch {
    const files = items.filter((i) => !i.dir);
    for (const f of files) {
      save(
        api.url(`/server/files/${root}/${f.path.split('/').map(encodeURIComponent).join('/')}`),
        f.path.split('/').pop(),
      );
      await new Promise((r) => setTimeout(r, 350));
    }
    if (files.length < items.length) toast(t('Folders are skipped, this Moonraker cannot zip them.'), 'error');
  }
}
