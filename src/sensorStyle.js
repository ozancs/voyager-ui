// Colour and order of the temperature sensors, shared by the Temperatures card, the graph and the eye menu so
// a sensor looks the same everywhere. Both are kept per printer in the settings: sensorColors is
// name -> '#rrggbb', sensorOrder is the names in the order the user put them. Pure functions, no store import
// (the store sorts the sensor list with sortSensors, so it cannot import from a module that imports it back).
export const SENSOR_COLORS = [
  'var(--ac)',
  '#5aa9ff',
  '#3dd68c',
  '#f5c451',
  '#c38bff',
  '#ff7ab6',
  '#4fd1c5',
  '#a3a7ae',
  '#e8a87c',
  '#9bd5ff',
];
// the colour of a sensor: the one the user picked, otherwise the next one from the palette
export const sensorColor = (colors, name, i) => colors?.[name] || SENSOR_COLORS[i % SENSOR_COLORS.length];

// names in the user's order; anything not in it keeps Klipper's order, after them
export function sortSensors(names, order = []) {
  const pos = (n) => {
    const i = order.indexOf(n);
    return i < 0 ? order.length + names.indexOf(n) : i;
  };
  return [...names].sort((a, b) => pos(a) - pos(b));
}
// the full order with one sensor moved a place up (-1) or down (+1), or null when it cannot move
export function moveSensor(names, order, name, dir) {
  const list = sortSensors(names, order);
  const i = list.indexOf(name),
    j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return null;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}

// colour of a temperature reading: plain text up to 35 °C, warming to amber by 80 °C and to red by 230 °C
export function heatColor(temp) {
  if (temp == null || temp < 35) return '';
  const amber = Math.round(Math.min(1, (temp - 35) / 45) * 100);
  const red = Math.round(Math.max(0, Math.min(1, (temp - 80) / 150)) * 100);
  return `color-mix(in srgb, #ff4d3d ${red}%, color-mix(in srgb, #f5a524 ${amber}%, var(--tx)))`;
}
