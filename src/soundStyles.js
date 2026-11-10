// Smooth layered bell tones, ordered from gentle to prominent; no sampled assets or square waves.
export const SOUND_STYLES = [
  { id: 'soft', label: 'Soft bell', gain: 0.35, repeats: 1, length: 0.7 },
  { id: 'chime', label: 'Clear chime', gain: 0.55, repeats: 1, length: 1 },
  { id: 'bright', label: 'Bright bells', gain: 0.7, repeats: 2, length: 0.8 },
  { id: 'attention', label: 'Attention', gain: 0.85, repeats: 3, length: 0.65 },
  { id: 'urgent', label: 'Urgent alert', gain: 1, repeats: 4, length: 0.5 },
];
export function soundNotes(kind, styleId) {
  const style = SOUND_STYLES.find((s) => s.id === styleId) || SOUND_STYLES[1];
  const melody = {
    complete: [523, 659, 784],
    paused: [659, 523],
    error: [880, 587],
    heated: [1047],
    partReady: [784, 1047],
  }[kind];
  if (!melody) return [];
  return Array.from({ length: style.repeats }, (_, repeat) =>
    melody.flatMap((hz, i) =>
      [
        [1, 1],
        [2, 0.22],
        [3.01, 0.06],
      ].map(([ratio, weight]) => ({
        hz: hz * ratio,
        at: repeat * (melody.length * 0.22 + 0.35) + i * 0.22,
        length: style.length / Math.sqrt(ratio),
        gain: style.gain * weight,
      })),
    ),
  ).flat();
}
