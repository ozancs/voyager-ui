<script setup>
// The Lightspeed designer page, inside Voyager, like the PA Sensei page. Lightspeed's install.sh links its page
// into Mainsail's / Fluidd's folder. Voyager looks for it on the selected printer (pageUrl in lightspeed.js),
// so a plugin update brings its new page with it. The side menu shows
// this page only when Klipper has the lightspeed module.
import { pageUrl } from '../lightspeed';
</script>
<template>
  <div class="lsp">
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
.frame {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: 0;
  border-radius: var(--r);
  background: #17191a;
}
</style>
