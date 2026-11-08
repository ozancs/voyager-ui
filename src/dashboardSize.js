// A stable logical canvas preserves card positions and proportions on resize.
// Below 65%, switch to the independent stacked layout rather than tiny controls.
export function dashboardSize(available, savedWidth) {
  const reference = Number.isFinite(savedWidth) && savedWidth >= 600 && savedWidth <= 6000 ? savedWidth : 1200;
  const room = Math.max(0, Number(available) || 0);
  const width = Math.max(reference, room);
  const scale = room ? Math.min(1, room / width) : 1;
  return { width, scale, grid: room >= 700 && scale >= 0.65 };
}
