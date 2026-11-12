// The pages of the main menu (History is not one: its statistics head the G-code Files page, which links to it), shared by the side menu (SideNav) and the top tabs (TopTabs):
// [route, icon, label, short label for the tabs]
import { computed } from 'vue';
import { state } from './store';
import { route } from './router';
import { healthIssues } from './features';

export const NAV = [
  ['dashboard', 'dash', 'Dashboard'],
  ['webcam', 'cam', 'Camera'],
  ['console', 'term', 'Console'],
  ['heightmap', 'hmap', 'Heightmap'],
  ['calibrations', 'target', 'Calibrations'],
  ['oznlab', 'sensor', 'PA Sensei'],
  ['files', 'file', 'G-code Files', 'Files'],
  ['viewer', 'cube', 'G-code Viewer', 'Viewer'],
  ['machine', 'cpu', 'Machine'],
  ['health', 'heart', 'Health'],
];
// the setup group, apart from the pages
export const NAV2 = [
  ['quick', 'sliders', 'Printer settings'],
  ['config', 'code', 'Config files'],
];
// the PA Sensei page only on printers that have the sensor's Klipper module: [pa_sensei ...], or [oznlab_sensor ...]
// from before the rename
const hasOznlab = computed(() => state.objects.some((o) => /^(pa_sensei|oznlab_sensor)( |$)/.test(o)));
export const navItems = computed(() =>
  NAV.filter(([k]) => route.name === k || (k === 'oznlab' ? hasOznlab.value : true)),
);
// the number of health issues on the Health page's entry, coloured by the worst of them
export const healthBadge = computed(() => {
  const l = healthIssues.value;
  if (!l.length) return null;
  return {
    n: l.length,
    c: l.some((i) => i.level === 'error') ? 'var(--dg)' : l.some((i) => i.level === 'warn') ? 'var(--wn)' : 'var(--s3)',
  };
});
