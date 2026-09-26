// Minimal hash router: #/<page>/<argument>. route.name picks the page in App.vue, route.arg is
// for example the config file open in the editor.
import { reactive } from 'vue';
export const route = reactive({ name: 'dashboard', arg: '' });
function parse() {
  let h = location.hash.replace(/^#\/?/, '');
  try {
    h = decodeURIComponent(h);
  } catch {} // a malformed % escape must not take the whole app down
  const [name, ...rest] = h.split('/');
  route.name = name || 'dashboard';
  route.arg = rest.join('/');
  // Shake&Tune used to be its own page, it is a tab of Calibrations now
  if (route.name === 'shaketune') [route.name, route.arg] = ['calibrations', 'shaketune'];
}
window.addEventListener('hashchange', parse);
parse();
export const go = (name, arg = '') => {
  location.hash = '/' + name + (arg ? '/' + encodeURIComponent(arg) : '');
};
