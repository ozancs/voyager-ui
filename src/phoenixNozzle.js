// Read-only readiness shared by the guide and its action guards. Never guess a material temperature.
export function recoveryNozzle(savedTarget, heater = {}, maxTemp) {
  const target =
    typeof savedTarget === 'number' &&
    Number.isFinite(savedTarget) &&
    savedTarget > 0 &&
    !(Number.isFinite(maxTemp) && savedTarget > maxTemp)
      ? savedTarget
      : null;
  const ready =
    target !== null &&
    Number.isFinite(heater.temperature) &&
    heater.temperature >= target - 2 &&
    heater.can_extrude === true;
  const holding = target !== null && heater.target === target;
  return { target, ready, heating: holding && !ready, holding };
}
