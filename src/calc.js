// small pure helpers, unit tested in tests/utils.test.js
// increase of a counter over the samples. Klipper resets the MCU counters on a restart, so a drop is a new
// start and not a negative change: only the steps up are added
export function counterGrowth(h, key) {
  let sum = 0
  for (let i = 1; i < h.length; i++) { const d = h[i][key] - h[i - 1][key]; sum += d > 0 ? d : 0 }
  return sum
}

