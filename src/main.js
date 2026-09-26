import './legacy.js';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import { createApp } from 'vue';
import './style.css';
import './panel.css';
import App from './App.vue';
import { start } from './store';
import { startTabIcon } from './printerIcon';
import { i18n, loadLang } from './i18n';
import { away } from './away';
import { vfit } from './fit';
// the chosen language is fetched first so the UI does not flash in English
async function boot() {
  // the live demo build runs against a fake Moonraker inside the page
  if (import.meta.env.VITE_DEMO) (await import('./demo/mock.js')).installDemo();
  await loadLang(i18n.lang).catch(() => {});
  start();
  startTabIcon();
  createApp(App).directive('away', away).directive('fit', vfit).mount('#app');
}
boot();
