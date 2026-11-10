// Distinct pitches, rhythms and timbres; IDs remain compatible with saved preferences.
const notifications = [
  { id: 'soft', label: 'Soft bell' },
  { id: 'chime', label: 'Ding dong' },
  { id: 'bright', label: 'Rising chimes' },
];
const warnings = [
  { id: 'attention', label: 'Double horn' },
  { id: 'knock', label: 'Three knocks' },
  { id: 'reminder', label: 'Reminder pulses' },
];
const errors = [
  { id: 'urgent', label: 'Sweeping alarm' },
  { id: 'alternating', label: 'Two-tone alarm' },
  { id: 'lowAlarm', label: 'Low warning horn' },
];
export function soundCategory(kind) {
  return kind === 'error' ? 'Error alarms' : kind === 'paused' ? 'Attention sounds' : 'Notification sounds';
}
export function soundStylesFor(kind) {
  return kind === 'error' ? errors : kind === 'paused' ? warnings : notifications;
}
export function resolveSoundStyle(kind, saved) {
  const styles = soundStylesFor(kind);
  return styles.some((s) => s.id === saved)
    ? saved
    : kind === 'error'
      ? 'urgent'
      : kind === 'paused'
        ? 'attention'
        : 'chime';
}
export function soundNotes(kind, styleId) {
  if (!['complete', 'paused', 'error', 'heated', 'partReady'].includes(kind)) return [];
  const note = (hz, at, length, gain, extra = {}) => ({ hz, at, length, gain, ...extra });
  switch (resolveSoundStyle(kind, styleId)) {
    case 'soft':
      return [note(880, 0, 1.4, 0.45), note(1763, 0, 0.7, 0.08)];
    case 'bright':
      return [659, 831, 988, 1319].flatMap((hz, i) => [
        note(hz, i * 0.17, 0.85, 0.5),
        note(hz * 2.01, i * 0.17, 0.4, 0.08),
      ]);
    case 'attention':
      return [0, 0.7].flatMap((at) => [
        note(330, at, 0.5, 0.65, { sustain: true, type: 'triangle' }),
        note(415, at, 0.5, 0.25, { sustain: true, type: 'triangle' }),
      ]);
    case 'knock':
      return [0, 0.22, 0.44].flatMap((at) => [
        note(220, at, 0.16, 0.65, { endHz: 100, type: 'triangle' }),
        note(440, at, 0.08, 0.15),
      ]);
    case 'reminder':
      return [0, 0.3, 0.9, 1.2].map((at) => note(660, at, 0.18, 0.5, { sustain: true }));
    case 'alternating':
      return [740, 440, 740, 440, 740, 440].map((hz, i) =>
        note(hz, i * 0.3, 0.26, 0.6, { sustain: true, type: 'triangle' }),
      );
    case 'lowAlarm':
      return [0, 0.9].flatMap((at) => [
        note(185, at, 0.7, 0.7, { sustain: true, type: 'triangle' }),
        note(233, at, 0.7, 0.3, { sustain: true, type: 'triangle' }),
      ]);
    case 'urgent':
      return [0, 0.8, 1.6].map((at) => note(520, at, 0.65, 0.65, { endHz: 1040, sustain: true, type: 'triangle' }));
    default:
      return [note(784, 0, 0.8, 0.6), note(1568, 0, 0.35, 0.1), note(587, 0.4, 1.25, 0.55), note(1174, 0.4, 0.6, 0.1)];
  }
}
