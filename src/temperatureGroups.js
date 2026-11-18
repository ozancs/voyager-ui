// Group each displayed section separately, so mixed heater/sensor groups retain their headings.
export function groupTemperatures(list, groups = {}) {
  const order = [''];
  for (const s of list) if (!order.includes(groups[s.name] || '')) order.push(groups[s.name]);
  return order.flatMap((name) =>
    list
      .filter((s) => (groups[s.name] || '') === name)
      .map((s, i) => ({ ...s, head: i === 0 && name ? name : undefined })),
  );
}
