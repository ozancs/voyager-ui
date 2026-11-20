// The pages of the main menu (History is not one: its statistics head the G-code Files page, which links to it), shared by the side menu (SideNav) and the top tabs (TopTabs):
// [route, icon, label, short label for the tabs]
import { computed } from 'vue';
import { state } from './store';
import { route } from './router';
import { healthIssues } from './features';
import { orderKeys } from './calc';

export const NAV = [
  ['dashboard', 'dash', 'Dashboard'],
  ['webcam', 'cam', 'Camera'],
  ['console', 'term', 'Console'],
  ['heightmap', 'hmap', 'Heightmap'],
  ['calibrations', 'target', 'Calibrations'],
  ['oznlab', 'sensor', 'PA Sensei'],
  ['lightspeed', 'sparkle', 'Lightspeed'],
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
// the same for the Lightspeed page: only with the plugin's [lightspeed] section
const PLUGIN_PAGE = {
  oznlab: () => hasOznlab.value,
  lightspeed: () => state.objects.includes('lightspeed'),
};
const pageThere = (k) => !PLUGIN_PAGE[k] || PLUGIN_PAGE[k]();
export const navItems = computed(() => NAV.filter(([k]) => route.name === k || pageThere(k)));
// the number of health issues on the Health page's entry, coloured by the worst of them
export const healthBadge = computed(() => {
  const l = healthIssues.value;
  if (!l.length) return null;
  return {
    n: l.length,
    c: l.some((i) => i.level === 'error') ? 'var(--dg)' : l.some((i) => i.level === 'warn') ? 'var(--wn)' : 'var(--s3)',
  };
});

// Phone: the bottom bar shows the first four pages of this list, More holds the rest in the same order. The order
// is set in Customize > Phone (settings.bottomNavOrder); until then the bar is Dashboard, Camera, Console, Files.
export const PHONE_BAR = ['dashboard', 'webcam', 'console', 'files'];
const phonePageList = computed(() => [...NAV, ...NAV2].filter(([k]) => pageThere(k)));
export const phonePages = computed(() => {
  const all = phonePageList.value;
  return orderKeys(
    all.map((x) => x[0]),
    state.settings.bottomNavOrder,
    PHONE_BAR,
  ).map((k) => all.find((x) => x[0] === k));
});
export const isSetupPage = (k) => NAV2.some((x) => x[0] === k);
