// Config fallback also supports older LED Effect builds without exported status objects.
export function effectNames(objects = [], config = {}) {
  return [...new Set([...objects, ...Object.keys(config)].filter((n) => /^led_effect\s+\S+$/i.test(n)))].sort();
}
export function hasLedEffects(objects, config, commands = {}) {
  return (
    effectNames(objects, config).length > 0 || Object.keys(commands).some((k) => k.toUpperCase() === 'SET_LED_EFFECT')
  );
}
