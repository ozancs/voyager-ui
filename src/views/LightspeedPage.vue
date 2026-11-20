<script setup>
// The Lightspeed designer page, inside Voyager, like the PA Sensei page. Lightspeed's install.sh links its page
// into Mainsail's / Fluidd's folder, so it is on the printer's port 80 (pageUrl in lightspeed.js, or the address
// set in the settings): Voyager keeps no copy, and a plugin update brings its new page with it. The side menu shows
// this page only when Klipper has the lightspeed module.
import Icon from '../components/Icon.vue';
import { pageUrl } from '../lightspeed';
import { t } from '../i18n';
</script>
<template>
  <div class="lsp">
    <div class="row note">
      <a class="btn clear sm" :href="pageUrl" target="_blank" rel="noopener"
        ><Icon name="ext" :size="14" />{{ t('Open in a new tab') }}</a
      >
    </div>
    <iframe :src="pageUrl" title="Lightspeed" class="frame" allow="clipboard-write"></iframe>
  </div>
</template>
<style scoped>
.lsp {
  flex: 1 1 0;
  min-height: 420px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.note {
  gap: 10px;
  justify-content: flex-end;
  font-size: 12.5px;
  padding: 0 4px;
}
.frame {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: 0;
  border-radius: var(--r);
  background: #17191a;
}
</style>
